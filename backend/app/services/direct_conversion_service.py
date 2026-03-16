"""
Direct Conversion Service — Pick Basic → Target Language in a single LLM call.

Unlike the two-step pipeline (Pick Basic → YAML → Code) this service sends
the raw Pick Basic source directly to the LLM and receives ready-to-use target
language code.  It is used exclusively by DIRECT_CONVERSION jobs.
"""

from typing import Optional, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime
import json
import logging

from app.models.job import MigrationJob
from app.models.code import GeneratedCode
from app.core.enums import JobState, JobType, LLMProvider
from app.llm.llm_router import get_llm_client
from app.llm.prompts import (
    build_direct_conversion_prompt,
    build_direct_conversion_regeneration_prompt,
    build_syntax_error_fix_prompt,
)
from app.services.code_output_parser import CodeOutputParser
from app.services.job_manager import JobManager
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService
from app.services.syntax_validator import SyntaxValidator, ValidationResult
from app.core.enums import AuditAction

logger = logging.getLogger(__name__)


class DirectConversionResult:
    """Result of a direct Pick Basic → target language conversion attempt."""

    def __init__(
        self,
        success: bool,
        generated_code: Optional[str] = None,
        error_message: Optional[str] = None,
        llm_metadata: Optional[Dict[str, Any]] = None,
    ):
        self.success = success
        self.generated_code = generated_code
        self.error_message = error_message
        self.llm_metadata = llm_metadata or {}
        self.timestamp = datetime.now()


class DirectConversionService:
    """
    Service that converts Pick Basic source code directly into a modern target
    language without an intermediate YAML representation.

    Differences from CodeGenerationService:
    - Takes ``source_code`` (raw Pick Basic string) instead of a YAML document
    - Uses ``build_direct_conversion_prompt`` (single-step prompt)
    - Stores ``GeneratedCode`` with ``yaml_version_id = None``
    - Transitions through the DIRECT_* job states
    - Supports the LLM provider selector via ``llm_router``
    """

    def __init__(self):
        self.job_manager = JobManager()

    # ------------------------------------------------------------------ #
    #  Public API                                                           #
    # ------------------------------------------------------------------ #

    def generate_code_for_job(
        self,
        db: Session,
        job_id: int,
        target_language: str,
        performed_by: str,
        llm_provider: LLMProvider = LLMProvider.OPENAI,
        llm_model_override: Optional[str] = None,
    ) -> GeneratedCode:
        """
        Generate modern code from raw Pick Basic source (first conversion or
        initial generation after job creation).

        Args:
            db: Database session
            job_id: DIRECT_CONVERSION migration job ID
            target_language: Target language string (e.g. "Python")
            performed_by: Username / system identifier
            llm_provider: Which LLM provider to use (defaults to OPENAI)
            llm_model_override: Optional model name that overrides the provider default

        Returns:
            Persisted :class:`GeneratedCode` record

        Raises:
            HTTPException 400: Job not in a valid state for code generation
            HTTPException 404: Job not found
            HTTPException 500: LLM generation failed
        """
        job = self.job_manager.get_job_or_404(db, job_id)

        if job.job_type != JobType.DIRECT_CONVERSION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Job {job_id} is of type {job.job_type.value}; "
                    "DirectConversionService only handles DIRECT_CONVERSION jobs."
                ),
            )

        allowed_states = [
            JobState.CREATED,
            JobState.DIRECT_CODE_REGENERATE_REQUESTED,
        ]
        if job.current_state not in allowed_states:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot generate code. Job is in state {job.current_state.value}. "
                    f"Must be in: {[s.value for s in allowed_states]}."
                ),
            )

        source_code = job.original_source_code
        if not source_code or not source_code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job {job_id} has no source code to convert.",
            )

        logger.info(
            "Starting direct conversion for job %d, target: %s, provider: %s",
            job_id,
            target_language,
            llm_provider.value,
        )

        start_time = datetime.now()
        result = self._generate_with_llm(
            source_code=source_code,
            target_language=target_language,
            llm_provider=llm_provider,
            llm_model_override=llm_model_override,
        )
        generation_time = (datetime.now() - start_time).total_seconds()

        if not result.success:
            # Metrics & audit for failure
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.CODE_GENERATION_FAILURE,
                job_id=job_id,
                tags={"target_language": target_language, "provider": llm_provider.value},
            )
            AuditService._create_log(
                db=db,
                job_id=job_id,
                action=AuditAction.DIRECT_CODE_GENERATION_FAILED,
                description=f"Direct conversion failed for {target_language}: {result.error_message}",
                performed_by="LLM_DIRECT",
                metadata={
                    "target_language": target_language,
                    "error": result.error_message,
                    "llm_provider": llm_provider.value,
                    "llm_model": result.llm_metadata.get("model"),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Direct conversion failed: {result.error_message}",
            )

        # Versioning — bump version_number, demote previous current
        max_ver = (
            db.query(func.max(GeneratedCode.version_number))
            .filter(GeneratedCode.job_id == job_id)
            .scalar()
            or 0
        )
        new_version_number = max_ver + 1
        db.query(GeneratedCode).filter(
            GeneratedCode.job_id == job_id, GeneratedCode.is_current.is_(True)
        ).update({"is_current": False}, synchronize_session="fetch")

        # Persist generated code (no yaml_version_id — direct conversion)
        generated_code = GeneratedCode(
            job_id=job_id,
            yaml_version_id=None,
            code_content=result.generated_code,
            target_language=target_language.upper(),
            generation_prompt=result.llm_metadata.get("prompt"),
            llm_model_used=result.llm_metadata.get("model"),
            llm_provider=llm_provider.value,
            llm_tokens_used=result.llm_metadata.get("tokens_used"),
            estimated_lines_of_code=len(result.generated_code.split("\n")),
            generated_at=datetime.now(),
            sections_covered=json.dumps(result.llm_metadata.get("sections_covered") or []),
            external_stubs_included=json.dumps(result.llm_metadata.get("external_stubs_included") or []),
            generation_warnings=json.dumps(result.llm_metadata.get("generation_warnings") or []),
            llm_envelope_used=result.llm_metadata.get("envelope_used"),
            validation_tool_available=result.llm_metadata.get("validation_tool_available"),
            validation_errors=json.dumps(result.llm_metadata.get("validation_errors") or []),
            version_number=new_version_number,
            is_current=True,
        )
        db.add(generated_code)

        # Persist LLM provider tracking on the job itself
        job.code_llm_provider = llm_provider
        job.code_llm_model = result.llm_metadata.get("model")

        # State transitions: CREATED → DIRECT_CODE_GENERATED → DIRECT_CODE_UNDER_REVIEW
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.DIRECT_CODE_GENERATED,
            performed_by=performed_by,
            reason=f"Direct conversion to {target_language} completed",
        )
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.DIRECT_CODE_UNDER_REVIEW,
            performed_by="SYSTEM",
            reason="Awaiting reviewer acceptance of directly converted code",
        )

        # Audit success
        AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.DIRECT_CODE_GENERATED,
            description=f"Direct conversion to {target_language} succeeded",
            performed_by="LLM_DIRECT",
            metadata={
                "code_id": None,  # filled after flush below
                "target_language": target_language,
                "llm_provider": llm_provider.value,
                "llm_model": result.llm_metadata.get("model"),
                "generation_time_seconds": generation_time,
            },
        )

        # Metrics
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.CODE_GENERATION_SUCCESS,
            job_id=job_id,
            tags={"target_language": target_language, "provider": llm_provider.value},
        )
        MetricsService.record_timer(
            db=db,
            metric_name=MetricsService.CODE_GENERATION_TIME,
            duration_seconds=generation_time,
            job_id=job_id,
            tags={"target_language": target_language, "direct": "true"},
        )

        db.commit()
        db.refresh(generated_code)

        logger.info(
            "Direct conversion successful for job %d — %d lines of %s",
            job_id,
            generated_code.estimated_lines_of_code,
            target_language,
        )
        return generated_code

    def regenerate_code_for_job(
        self,
        db: Session,
        job_id: int,
        target_language: str,
        performed_by: str,
        general_feedback: str = "",
        line_comment_context: str = "",
        llm_provider: LLMProvider = LLMProvider.OPENAI,
        llm_model_override: Optional[str] = None,
    ) -> GeneratedCode:
        """
        Regenerate code after a reviewer rejection on a DIRECT_CONVERSION job.

        Args:
            db: Database session
            job_id: DIRECT_CONVERSION migration job ID
            target_language: Target language string
            performed_by: Username / system identifier
            general_feedback: Cumulative textual rejection feedback
            line_comment_context: Formatted inline line comments
            llm_provider: Which LLM provider to use
            llm_model_override: Optional model name override

        Returns:
            Persisted :class:`GeneratedCode` record
        """
        job = self.job_manager.get_job_or_404(db, job_id)

        if job.current_state != JobState.DIRECT_CODE_REGENERATE_REQUESTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Job {job_id} is in state {job.current_state.value}; "
                    "must be DIRECT_CODE_REGENERATE_REQUESTED to regenerate."
                ),
            )

        source_code = job.original_source_code
        if not source_code or not source_code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job {job_id} has no source code for regeneration.",
            )

        # Count previous versions to number the regeneration attempt
        regen_count = (
            db.query(func.count(GeneratedCode.id))
            .filter(GeneratedCode.job_id == job_id)
            .scalar()
            or 0
        )

        # Fetch previous code for context
        previous = (
            db.query(GeneratedCode)
            .filter(GeneratedCode.job_id == job_id, GeneratedCode.is_current.is_(True))
            .first()
        )
        previous_code = previous.code_content if previous else ""

        logger.info(
            "Regenerating direct conversion for job %d (attempt #%d), provider: %s",
            job_id,
            regen_count + 1,
            llm_provider.value,
        )

        start_time = datetime.now()
        result = self._regenerate_with_llm(
            source_code=source_code,
            target_language=target_language,
            general_feedback=general_feedback,
            line_comment_context=line_comment_context,
            previous_code=previous_code,
            regeneration_count=regen_count + 1,
            llm_provider=llm_provider,
            llm_model_override=llm_model_override,
        )
        generation_time = (datetime.now() - start_time).total_seconds()

        if not result.success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Direct conversion regeneration failed: {result.error_message}",
            )

        # Versioning
        max_ver = (
            db.query(func.max(GeneratedCode.version_number))
            .filter(GeneratedCode.job_id == job_id)
            .scalar()
            or 0
        )
        db.query(GeneratedCode).filter(
            GeneratedCode.job_id == job_id, GeneratedCode.is_current.is_(True)
        ).update({"is_current": False}, synchronize_session="fetch")

        generated_code = GeneratedCode(
            job_id=job_id,
            yaml_version_id=None,
            code_content=result.generated_code,
            target_language=target_language.upper(),
            generation_prompt=result.llm_metadata.get("prompt"),
            llm_model_used=result.llm_metadata.get("model"),
            llm_provider=llm_provider.value,
            llm_tokens_used=result.llm_metadata.get("tokens_used"),
            estimated_lines_of_code=len(result.generated_code.split("\n")),
            generated_at=datetime.now(),
            sections_covered=json.dumps(result.llm_metadata.get("sections_covered") or []),
            external_stubs_included=json.dumps(result.llm_metadata.get("external_stubs_included") or []),
            generation_warnings=json.dumps(result.llm_metadata.get("generation_warnings") or []),
            llm_envelope_used=result.llm_metadata.get("envelope_used"),
            validation_tool_available=result.llm_metadata.get("validation_tool_available"),
            validation_errors=json.dumps(result.llm_metadata.get("validation_errors") or []),
            version_number=max_ver + 1,
            is_current=True,
        )
        db.add(generated_code)

        # Update job provider tracking
        job.code_llm_provider = llm_provider
        job.code_llm_model = result.llm_metadata.get("model")

        # State transitions
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.DIRECT_CODE_GENERATED,
            performed_by=performed_by,
            reason=f"Direct conversion regeneration #{regen_count + 1} completed",
        )
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.DIRECT_CODE_UNDER_REVIEW,
            performed_by="SYSTEM",
            reason="Awaiting reviewer acceptance of regenerated direct conversion code",
        )

        # Audit
        AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.DIRECT_CODE_GENERATED,
            description=f"Direct conversion regeneration #{regen_count + 1} succeeded",
            performed_by="LLM_DIRECT",
            metadata={
                "target_language": target_language,
                "llm_provider": llm_provider.value,
                "llm_model": result.llm_metadata.get("model"),
                "regeneration_count": regen_count + 1,
                "generation_time_seconds": generation_time,
            },
        )

        db.commit()
        db.refresh(generated_code)
        return generated_code

    # ------------------------------------------------------------------ #
    #  Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _generate_with_llm(
        self,
        source_code: str,
        target_language: str,
        llm_provider: LLMProvider,
        llm_model_override: Optional[str] = None,
    ) -> DirectConversionResult:
        """Call the LLM once for the initial direct conversion."""
        try:
            client = get_llm_client(llm_provider)
            if llm_model_override:
                client.model_name = llm_model_override

            prompt = build_direct_conversion_prompt(
                source_code=source_code,
                target_language=target_language,
            )

            response = client.generate_content(prompt)
            if not response or not response.get("text"):
                return DirectConversionResult(
                    success=False,
                    error_message="LLM returned empty response",
                )

            parsed = CodeOutputParser.parse(response["text"].strip(), target_language)
            code = parsed.code

            # One-shot syntax-fix retry
            val: ValidationResult = SyntaxValidator.validate_detailed(code, target_language)
            syntax_retry_attempted = False
            if not val.valid:
                logger.warning(
                    "Syntax error in direct conversion for %s — retrying once: %s",
                    target_language,
                    val.error_message,
                )
                syntax_retry_attempted = True
                # The syntax-fix prompt still references YAML; pass source_code as placeholder
                fix_prompt = build_syntax_error_fix_prompt(
                    yaml_content=f"# Original Pick Basic source\n{source_code[:3000]}",
                    target_language=target_language,
                    broken_code=code,
                    syntax_error=val.error_message or "",
                )
                retry_response = client.generate_content(fix_prompt)
                if retry_response and retry_response.get("text"):
                    retry_parsed = CodeOutputParser.parse(
                        retry_response["text"].strip(), target_language
                    )
                    retry_code = retry_parsed.code
                    retry_val = SyntaxValidator.validate_detailed(retry_code, target_language)
                    if not retry_val.valid:
                        logger.warning(
                            "Syntax-fix retry still has errors (%s) — using anyway",
                            retry_val.error_message,
                        )
                    code = retry_code
                    val = retry_val

            return DirectConversionResult(
                success=True,
                generated_code=code,
                llm_metadata={
                    "model": getattr(client, "model_name", None),
                    "prompt": prompt,
                    "prompt_length": len(prompt),
                    "response_length": len(code),
                    "tokens_used": response.get("usage", {}).get("total_tokens"),
                    "syntax_validated": val.valid,
                    "syntax_retry_attempted": syntax_retry_attempted,
                    "sections_covered": parsed.sections_covered,
                    "external_stubs_included": parsed.external_stubs_included,
                    "generation_warnings": parsed.warnings,
                    "envelope_used": parsed.envelope_used,
                    "validation_tool_available": val.tool_available,
                    "validation_errors": val.errors,
                },
            )

        except Exception as e:
            logger.error("LLM direct conversion failed: %s", str(e))
            return DirectConversionResult(success=False, error_message=str(e))

    def _regenerate_with_llm(
        self,
        source_code: str,
        target_language: str,
        general_feedback: str,
        line_comment_context: str,
        previous_code: str,
        regeneration_count: int,
        llm_provider: LLMProvider,
        llm_model_override: Optional[str] = None,
    ) -> DirectConversionResult:
        """Call the LLM for a regeneration pass after reviewer rejection."""
        try:
            client = get_llm_client(llm_provider)
            if llm_model_override:
                client.model_name = llm_model_override

            prompt = build_direct_conversion_regeneration_prompt(
                source_code=source_code,
                target_language=target_language,
                general_feedback=general_feedback,
                line_comment_context=line_comment_context,
                previous_code=previous_code,
                regeneration_count=regeneration_count,
            )

            response = client.generate_content(prompt)
            if not response or not response.get("text"):
                return DirectConversionResult(
                    success=False,
                    error_message="LLM returned empty response during regeneration",
                )

            parsed = CodeOutputParser.parse(response["text"].strip(), target_language)
            code = parsed.code
            val: ValidationResult = SyntaxValidator.validate_detailed(code, target_language)

            return DirectConversionResult(
                success=True,
                generated_code=code,
                llm_metadata={
                    "model": getattr(client, "model_name", None),
                    "prompt": prompt,
                    "prompt_length": len(prompt),
                    "response_length": len(code),
                    "tokens_used": response.get("usage", {}).get("total_tokens"),
                    "syntax_validated": val.valid,
                    "syntax_retry_attempted": False,
                    "sections_covered": parsed.sections_covered,
                    "external_stubs_included": parsed.external_stubs_included,
                    "generation_warnings": parsed.warnings,
                    "envelope_used": parsed.envelope_used,
                    "validation_tool_available": val.tool_available,
                    "validation_errors": val.errors,
                },
            )

        except Exception as e:
            logger.error("LLM direct regeneration failed: %s", str(e))
            return DirectConversionResult(success=False, error_message=str(e))

    def get_generated_code(
        self,
        db: Session,
        job_id: int,
        code_id: Optional[int] = None,
    ) -> Optional[GeneratedCode]:
        """Get the current (or a specific) generated code record for the job."""
        query = db.query(GeneratedCode).filter(GeneratedCode.job_id == job_id)
        if code_id:
            return query.filter(GeneratedCode.id == code_id).first()
        return query.order_by(GeneratedCode.generated_at.desc()).first()
