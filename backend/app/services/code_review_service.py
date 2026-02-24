"""
Code Review Service.
Handles reviewer accept/reject decisions on Agent-2 generated code.

Flow:
    CODE_UNDER_REVIEW
        → CODE_ACCEPTED  → COMPLETED          (reviewer accepts)
        → CODE_REGENERATE_REQUESTED            (reviewer rejects)
            → CODE_GENERATED → CODE_UNDER_REVIEW  (LLM regenerates, loop)
"""

from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime
import logging

from app.models.code import GeneratedCode
from app.models.code_review import CodeReview
from app.core.enums import JobState, ReviewDecision
from app.services.job_manager import JobManager
from app.services.audit_service import AuditService
from app.llm.openai_client import OpenAIClient
import json

from app.llm.prompts import build_code_generation_prompt, build_code_regeneration_prompt, build_syntax_error_fix_prompt
from app.services.code_output_parser import CodeOutputParser
from app.services.line_comment_service import LineCommentService
from app.services.syntax_validator import SyntaxValidator, ValidationResult

logger = logging.getLogger(__name__)


class CodeReviewService:
    """Orchestrates the human review loop for generated code."""

    def __init__(self):
        self.job_manager = JobManager()
        self.llm_client = OpenAIClient()

    # ─── Public API ───────────────────────────────────────────────────────────

    def submit_code_review(
        self,
        db: Session,
        job_id: int,
        decision: ReviewDecision,
        general_comment: Optional[str],
        reviewed_by: Optional[str],
    ) -> CodeReview:
        """
        Submit a reviewer decision on the currently pending generated code.

        - CODE_APPROVE            → mark code accepted, transition to COMPLETED
        - CODE_REJECT_REGENERATE  → save rejection comment, trigger LLM regen,
                                    loop back to CODE_UNDER_REVIEW
        """
        # 1. Validate job exists and is in the right state
        job = self.job_manager.get_job_or_404(db, job_id)
        if job.current_state != JobState.CODE_UNDER_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot submit code review. Job is in state "
                    f"{job.current_state.value}. Must be CODE_UNDER_REVIEW."
                ),
            )

        # 2. Validate decision value is a code-review decision
        if decision not in (ReviewDecision.CODE_APPROVE, ReviewDecision.CODE_REJECT_REGENERATE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid decision for code review. "
                    "Use CODE_APPROVE or CODE_REJECT_REGENERATE."
                ),
            )

        # 3. Rejection requires a comment so the LLM knows what to fix
        if decision == ReviewDecision.CODE_REJECT_REGENERATE and not general_comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A comment is required when rejecting generated code.",
            )

        # 4. Get the latest generated code for this job
        latest_code = self._get_latest_code_or_404(db, job_id)

        # 5. Persist the review record
        triggered_regen = decision == ReviewDecision.CODE_REJECT_REGENERATE
        code_review = CodeReview(
            job_id=job_id,
            generated_code_id=latest_code.id,
            decision=decision.value,
            general_comment=general_comment,
            reviewed_by=reviewed_by,
            triggered_regeneration=triggered_regen,
            reviewed_at=datetime.utcnow(),
        )
        db.add(code_review)
        db.flush()  # get code_review.id without full commit

        # 6. Audit
        AuditService.log_code_review_submitted(
            db=db,
            job_id=job_id,
            review_id=code_review.id,
            decision=decision.value,
            reviewed_by=reviewed_by,
        )

        # 7. Branch: accept or reject
        if decision == ReviewDecision.CODE_APPROVE:
            self._accept_code(db, job_id, latest_code, reviewed_by)
        else:
            db.commit()  # commit review record before triggering regen
            self._reject_and_regenerate(db, job_id, general_comment, reviewed_by)

        db.commit()
        db.refresh(code_review)
        return code_review

    def get_code_reviews(self, db: Session, job_id: int) -> List[CodeReview]:
        """Return all code reviews for a job, newest first."""
        # Ensure job exists
        self.job_manager.get_job_or_404(db, job_id)
        return (
            db.query(CodeReview)
            .filter(CodeReview.job_id == job_id)
            .order_by(CodeReview.reviewed_at.desc())
            .all()
        )

    # ─── Private helpers ─────────────────────────────────────────────────────

    def _accept_code(
        self,
        db: Session,
        job_id: int,
        code: GeneratedCode,
        accepted_by: Optional[str],
    ) -> None:
        """Mark code as accepted and complete the job."""
        # Flag the code record as accepted
        code.is_accepted = True
        db.flush()

        # Audit
        AuditService.log_code_accepted(
            db=db,
            job_id=job_id,
            code_id=code.id,
            accepted_by=accepted_by,
        )

        # State: CODE_UNDER_REVIEW → CODE_ACCEPTED → COMPLETED
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_ACCEPTED,
            performed_by=accepted_by or "REVIEWER",
            reason="Reviewer accepted the generated code",
        )
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.COMPLETED,
            performed_by="SYSTEM",
            reason="Migration complete — code accepted",
        )

    def _reject_and_regenerate(
        self,
        db: Session,
        job_id: int,
        reviewer_comment: str,
        reviewer: Optional[str],
    ) -> None:
        """Reject current code, trigger LLM regeneration, loop back to review."""
        # State: CODE_UNDER_REVIEW → CODE_REGENERATE_REQUESTED
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_REGENERATE_REQUESTED,
            performed_by=reviewer or "REVIEWER",
            reason=f"Reviewer rejected code: {reviewer_comment[:200]}",
        )

        AuditService.log_code_regeneration_requested(
            db=db,
            job_id=job_id,
            requested_by=reviewer,
            reason=reviewer_comment,
        )

        # Gather all previous rejection comments (general feedback, all rounds)
        all_comments = self._collect_rejection_comments(db, job_id)

        # Phase 1: Collect inline line comments pinned by reviewer on generated code
        line_comment_context = LineCommentService.build_line_comment_context(
            db, job_id, code_type="generated_code"
        )

        # Count regeneration rounds so the prompt can label this attempt
        regen_count = (
            db.query(CodeReview)
            .filter(
                CodeReview.job_id == job_id,
                CodeReview.decision == ReviewDecision.CODE_REJECT_REGENERATE.value,
            )
            .count()
        )

        # Regenerate via LLM with full feedback context (general + inline line comments)
        new_code = self._regenerate_with_llm(
            db,
            job_id,
            all_comments,
            reviewer,
            line_comment_context=line_comment_context,
            regen_count=regen_count,
        )

        # Phase 1: Mark all inline comments as included in this regeneration round
        LineCommentService.mark_comments_included(db, job_id)

        # State: CODE_REGENERATE_REQUESTED → CODE_GENERATED → CODE_UNDER_REVIEW
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_GENERATED,
            performed_by="LLM_AGENT_2",
            reason="Code regenerated after reviewer feedback",
        )
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_UNDER_REVIEW,
            performed_by="SYSTEM",
            reason="Regenerated code ready for review",
        )

        logger.info(f"Code regenerated for job {job_id}, id={new_code.id}")

    def _regenerate_with_llm(
        self,
        db: Session,
        job_id: int,
        reviewer_comments: str,
        performed_by: Optional[str],
        line_comment_context: str = "",
        regen_count: int = 1,
    ) -> GeneratedCode:
        """Call LLM with full reviewer feedback (general + inline line comments) and save new GeneratedCode row."""
        from app.models.yaml_version import YAMLVersion
        from app.models.job import MigrationJob
        from app.services.audit_service import AuditService

        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()

        # Get the approved YAML
        yaml_version = (
            db.query(YAMLVersion)
            .filter(
                YAMLVersion.job_id == job_id,
                YAMLVersion.is_approved == True,
                YAMLVersion.is_valid == True,
            )
            .order_by(YAMLVersion.created_at.desc())
            .first()
        )
        if not yaml_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No approved YAML found for job {job_id} — cannot regenerate code.",
            )

        target_language = job.target_language.value

        # Fetch previous generated code to show the LLM what already exists
        previous_code = ""
        latest_code = self._get_latest_code_or_404(db, job_id)
        if latest_code:
            previous_code = latest_code.code_content

        # Phase 1: Build dedicated regeneration prompt with full feedback context
        prompt = build_code_regeneration_prompt(
            yaml_content=yaml_version.yaml_content,
            target_language=target_language,
            general_feedback=reviewer_comments,
            line_comment_context=line_comment_context,
            previous_code=previous_code,
            regeneration_count=regen_count,
        )

        parsed = None  # set inside try block; always defined when new_code is reached
        start = datetime.utcnow()
        try:
            response = self.llm_client.generate_content(prompt)
            if not response or not response.get("text"):
                raise ValueError("LLM returned empty response")

            # Phase 1 (Structured Output): parse envelope; falls back to legacy extraction
            parsed = CodeOutputParser.parse(response["text"].strip(), target_language)
            code_text = parsed.code

            # Phase 2 + 4: detailed multi-language validation + one-shot auto-retry on error
            val: ValidationResult = SyntaxValidator.validate_detailed(code_text, target_language)
            if not val.valid:
                logger.warning(
                    "Syntax error in regenerated code for job %s (%s) — retrying once: %s",
                    job_id, target_language, val.error_message,
                )
                fix_prompt = build_syntax_error_fix_prompt(
                    yaml_content=yaml_version.yaml_content,
                    target_language=target_language,
                    broken_code=code_text,
                    syntax_error=val.error_message or "",
                )
                fix_response = self.llm_client.generate_content(fix_prompt)
                if fix_response and fix_response.get("text"):
                    fix_parsed = CodeOutputParser.parse(fix_response["text"].strip(), target_language)
                    fixed_code = fix_parsed.code
                    fix_val = SyntaxValidator.validate_detailed(fixed_code, target_language)
                    if fix_val.valid:
                        logger.info("Syntax-fix retry succeeded for job %s", job_id)
                    else:
                        logger.warning(
                            "Syntax-fix retry still has errors for job %s (%s) — using anyway",
                            job_id, fix_val.error_message,
                        )
                    code_text = fixed_code
                    val = fix_val

        except Exception as exc:
            logger.error(f"LLM regen failed for job {job_id}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM code regeneration failed: {exc}",
            )

        generation_time = (datetime.utcnow() - start).total_seconds()

        # Phase 3: assign version_number and set is_current
        max_ver = db.query(func.max(GeneratedCode.version_number)).filter(
            GeneratedCode.job_id == job_id
        ).scalar() or 0
        new_version_number = max_ver + 1
        db.query(GeneratedCode).filter(
            GeneratedCode.job_id == job_id, GeneratedCode.is_current.is_(True)
        ).update({"is_current": False}, synchronize_session="fetch")

        new_code = GeneratedCode(
            job_id=job_id,
            yaml_version_id=yaml_version.id,
            code_content=code_text,
            target_language=target_language.upper(),
            generation_prompt=prompt,
            reviewer_constraints=reviewer_comments,
            llm_model_used=response.get("model"),
            llm_tokens_used=response.get("usage", {}).get("total_tokens"),
            estimated_lines_of_code=len(code_text.split("\n")),
            generated_at=datetime.utcnow(),
            is_accepted=False,
            # Phase 1 (Structured Output) metadata
            sections_covered=json.dumps(parsed.sections_covered if parsed else []),
            external_stubs_included=json.dumps(parsed.external_stubs_included if parsed else []),
            generation_warnings=json.dumps(parsed.warnings if parsed else []),
            llm_envelope_used=parsed.envelope_used if parsed else None,
            # Phase 2 (Language-Specific Validation) metadata
            validation_tool_available=val.tool_available if locals().get("val") is not None else None,
            validation_errors=json.dumps(val.errors if locals().get("val") is not None else []),
            # Phase 3 (Code Version Control)
            version_number=new_version_number,
            is_current=True,
        )
        db.add(new_code)
        db.flush()

        AuditService.log_code_generated(
            db=db,
            job_id=job_id,
            code_id=new_code.id,
            target_language=target_language,
            llm_model=response.get("model"),
            generation_time=generation_time,
        )

        return new_code

    def _collect_rejection_comments(self, db: Session, job_id: int) -> str:
        """Concatenate all past rejection comments for this job."""
        rejections = (
            db.query(CodeReview)
            .filter(
                CodeReview.job_id == job_id,
                CodeReview.decision == ReviewDecision.CODE_REJECT_REGENERATE.value,
            )
            .order_by(CodeReview.reviewed_at.asc())
            .all()
        )
        if not rejections:
            return ""
        parts = []
        for i, r in enumerate(rejections, 1):
            by = r.reviewed_by or "reviewer"
            parts.append(f"Rejection {i} (by {by}): {r.general_comment}")
        return "\n".join(parts)

    def _get_latest_code_or_404(self, db: Session, job_id: int) -> GeneratedCode:
        code = (
            db.query(GeneratedCode)
            .filter(GeneratedCode.job_id == job_id)
            .order_by(GeneratedCode.generated_at.desc())
            .first()
        )
        if not code:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No generated code found for job {job_id}.",
            )
        return code

    @staticmethod
    def _clean_code(code: str, target_language: str) -> str:
        """Strip markdown fences from LLM output."""
        lang = target_language.lower()
        for fence in (f"```{lang}", "```python", "```"):
            if code.startswith(fence):
                code = code[len(fence):].lstrip("\n")
                break
        if code.endswith("```"):
            code = code[:-3].rstrip("\n")
        return code.strip()
