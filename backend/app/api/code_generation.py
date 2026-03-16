"""
Code generation API endpoints.
RESTful API for generating modern code from approved YAML.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import json

from app.core.database import get_db
from app.core.enums import TargetLanguage, ReviewDecision, JobState
from app.services.code_generation_service import CodeGenerationService
from app.services.code_review_service import CodeReviewService
from app.services.job_manager import JobManager
from app.models.code import GeneratedCode


router = APIRouter()
code_service = CodeGenerationService()
review_service = CodeReviewService()


# Request/Response Schemas

class CodeGenerationRequest(BaseModel):
    """Request to generate code for a job."""
    target_language: TargetLanguage = Field(..., description="Target programming language")
    performed_by: str = Field(..., min_length=1, max_length=255, description="User/system performing the action")
    use_llm: bool = Field(default=True, description="Use LLM (True) or pure mapper (False)")
    llm_provider: str = Field(default='OPENAI', description="LLM provider to use: OPENAI or ANTHROPIC")


class GeneratedCodeResponse(BaseModel):
    """Response schema for generated code."""
    id: int
    job_id: int
    yaml_version_id: Optional[int]
    code_content: str
    target_language: str
    llm_model_used: Optional[str]
    estimated_lines_of_code: Optional[int]
    generated_at: datetime
    # Phase 2 — syntax validation results (one-shot auto-fix already ran at generation time)
    validation_tool_available: Optional[bool] = None
    validation_errors: Optional[List[str]] = None
    # Acceptance / version tracking
    is_accepted: bool = False
    version_number: Optional[int] = None
    is_current: Optional[bool] = None

    model_config = {"from_attributes": True}

    @field_validator("validation_errors", mode="before")
    @classmethod
    def _parse_validation_errors(cls, v):
        """Deserialise the JSON string stored in the Text column to a Python list."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None
        return v


class GeneratedCodeSummary(BaseModel):
    """Summary of generated code without full content."""
    id: int
    job_id: int
    target_language: str
    estimated_lines_of_code: Optional[int]
    llm_model_used: Optional[str]
    generated_at: datetime
    
    model_config = {"from_attributes": True}


# API Endpoints

@router.post(
    "/{job_id}/code/generate",
    response_model=GeneratedCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate code from approved YAML",
    description="Generate modern code from approved YAML. Job must be in APPROVED or APPROVED_WITH_COMMENTS state."
)
def generate_code(
    job_id: int,
    request: CodeGenerationRequest,
    db: Session = Depends(get_db)
):
    """
    Generate modern code from approved YAML.
    
    - **job_id**: The job ID
    - **target_language**: Target programming language (PYTHON, TYPESCRIPT, etc.)
    - **performed_by**: Who is generating the code
    - **use_llm**: Whether to use LLM (recommended) or pure mapper
    """
    generated_code = code_service.generate_code_for_job(
        db=db,
        job_id=job_id,
        target_language=request.target_language.value,
        performed_by=request.performed_by,
        use_llm=request.use_llm,
        llm_provider=request.llm_provider
    )
    
    return GeneratedCodeResponse.model_validate(generated_code)


@router.get(
    "/{job_id}/code",
    response_model=GeneratedCodeResponse,
    summary="Get generated code for a job",
    description="Retrieve the most recent generated code for a job"
)
def get_generated_code(
    job_id: int,
    code_id: Optional[int] = Query(None, description="Specific code ID (optional, gets latest if not provided)"),
    db: Session = Depends(get_db)
):
    """
    Get generated code for a job.
    
    - **job_id**: The job ID
    - **code_id**: Optional specific code ID (gets latest if not provided)
    """
    code = code_service.get_generated_code(db=db, job_id=job_id, code_id=code_id)
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No generated code found for job {job_id}"
        )
    
    return GeneratedCodeResponse.model_validate(code)


class CodeEditRequest(BaseModel):
    """Request to manually edit generated code content."""
    code_content: str = Field(..., min_length=1, description="Updated code content")
    edited_by: str = Field(..., min_length=1, max_length=255, description="User making the edit")
    edit_reason: Optional[str] = Field(None, max_length=2000, description="Optional reason for manual edit")


@router.patch(
    "/{job_id}/code",
    response_model=GeneratedCodeResponse,
    summary="Manually edit generated code",
    description="Replace the content of the latest generated code (manual editing). "
                "This resets code acceptance so it requires re-review."
)
def edit_generated_code(
    job_id: int,
    request: CodeEditRequest,
    db: Session = Depends(get_db)
):
    """Manually update generated code content and reset for re-review."""
    code = code_service.get_generated_code(db=db, job_id=job_id)
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No generated code found for job {job_id}"
        )

    # Update content
    code.code_content = request.code_content

    # Reset acceptance so it must be reviewed again
    code.is_accepted = False

    db.commit()
    db.refresh(code)
    return GeneratedCodeResponse.model_validate(code)


@router.get(
    "/{job_id}/code/download",
    summary="Download generated code as file",
    description="Download generated code with appropriate file extension"
)
def download_generated_code(
    job_id: int,
    code_id: Optional[int] = Query(None, description="Specific code ID (optional)"),
    db: Session = Depends(get_db)
):
    """
    Download generated code as a file.
    
    - **job_id**: The job ID
    - **code_id**: Optional specific code ID
    """
    from fastapi.responses import Response
    from app.mapping.base_mapper import MappingLoader
    

    code = code_service.get_generated_code(db=db, job_id=job_id, code_id=code_id)

    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No generated code found for job {job_id}"
        )

    # If the requested code is not accepted, check if any accepted version exists for this job
    if not code.is_accepted:
        accepted_code = db.query(code.__class__).filter(
            code.__class__.job_id == job_id,
            code.__class__.is_accepted == True
        ).order_by(code.__class__.version_number.desc()).first()
        if not accepted_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Code download is disabled until at least one version is accepted by review."
            )
        code = accepted_code

    # Determine file extension
    try:
        mapper = MappingLoader.get_mapper(code.target_language)
        file_extension = mapper.get_file_extension()
    except ValueError:
        file_extension = ".txt"

    # Generate filename
    from app.services.job_manager import JobManager
    job = JobManager.get_job_or_404(db, job_id)
    base_name = job.source_filename.replace(".bp", "") if job.source_filename else f"job_{job_id}"
    filename = f"{base_name}_migrated{file_extension}"

    return Response(
        content=code.code_content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get(
    "/{job_id}/code/history",
    response_model=list[GeneratedCodeSummary],
    summary="Get code generation history",
    description="List all code generations for a job"
)
def get_code_generation_history(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get code generation history for a job.
    
    - **job_id**: The job ID
    """
    codes = db.query(GeneratedCode).filter(
        GeneratedCode.job_id == job_id
    ).order_by(GeneratedCode.generated_at.desc()).all()
    
    return [GeneratedCodeSummary.model_validate(code) for code in codes]


@router.get(
    "/{job_id}/code/statistics",
    summary="Get code generation statistics",
    description="Get statistics about generated code for a job"
)
def get_code_statistics(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get statistics about generated code.
    
    - **job_id**: The job ID
    """
    codes = db.query(GeneratedCode).filter(
        GeneratedCode.job_id == job_id
    ).all()
    
    if not codes:
        return {
            "job_id": job_id,
            "total_generations": 0,
            "languages_used": [],
            "latest_generation": None
        }
    
    latest = max(codes, key=lambda c: c.generated_at)
    languages = list(set(code.target_language for code in codes))
    
    return {
        "job_id": job_id,
        "total_generations": len(codes),
        "languages_used": languages,
        "latest_generation": {
            "id": latest.id,
            "language": latest.target_language,
            "lines_of_code": latest.estimated_lines_of_code,
            "generated_at": latest.generated_at.isoformat()
        }
    }


# ─── Code Review Endpoints ────────────────────────────────────────────────────

class CodeReviewRequest(BaseModel):
    """Request body for submitting a code review decision."""
    decision: ReviewDecision = Field(
        ...,
        description="CODE_APPROVE to accept, CODE_REJECT_REGENERATE to reject and trigger regeneration",
    )
    general_comment: Optional[str] = Field(
        None,
        max_length=4000,
        description="Feedback (required when rejecting)",
    )
    reviewed_by: Optional[str] = Field(None, max_length=100, description="Reviewer identifier")


class CodeReviewResponse(BaseModel):
    """Response after submitting a code review."""
    id: int
    job_id: int
    generated_code_id: int
    decision: str
    general_comment: Optional[str]
    reviewed_by: Optional[str]
    triggered_regeneration: bool
    reviewed_at: datetime

    model_config = {"from_attributes": True}


@router.post(
    "/{job_id}/code/review",
    response_model=CodeReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a code review decision",
    description=(
        "Accept or reject the generated code. "
        "Job must be in CODE_UNDER_REVIEW state.\n\n"
        "- **CODE_APPROVE**: Marks code as accepted → job transitions to COMPLETED.\n"
        "- **CODE_REJECT_REGENERATE**: Saves rejection + comment, triggers LLM "
        "regeneration, loops back to CODE_UNDER_REVIEW."
    ),
)
def submit_code_review(
    job_id: int,
    request: CodeReviewRequest,
    db: Session = Depends(get_db),
):
    """
    Submit a reviewer decision on the generated code.

    - **job_id**: The job ID (must be in CODE_UNDER_REVIEW state)
    - **decision**: CODE_APPROVE or CODE_REJECT_REGENERATE
    - **general_comment**: Required when rejecting; optional when accepting
    - **reviewed_by**: Reviewer identifier
    """
    code_review = review_service.submit_code_review(
        db=db,
        job_id=job_id,
        decision=request.decision,
        general_comment=request.general_comment,
        reviewed_by=request.reviewed_by,
    )
    return CodeReviewResponse.model_validate(code_review)


@router.get(
    "/{job_id}/code/reviews",
    response_model=List[CodeReviewResponse],
    summary="List code review history",
    description="Get all past code review decisions for a job, newest first.",
)
def list_code_reviews(
    job_id: int,
    db: Session = Depends(get_db),
):
    """
    Get the full code review history for a job.

    - **job_id**: The job ID
    """
    reviews = review_service.get_code_reviews(db=db, job_id=job_id)
    return [CodeReviewResponse.model_validate(r) for r in reviews]


# ─── Phase 3: Code Version Control Endpoints ─────────────────────────────────

class CodeVersionSummary(BaseModel):
    """Version-aware summary of a generated code entry."""
    id: int
    job_id: int
    version_number: Optional[int]
    target_language: str
    estimated_lines_of_code: Optional[int]
    llm_model_used: Optional[str]
    is_accepted: bool
    is_current: Optional[bool]
    # Phase 1
    sections_covered: Optional[List[str]]
    generation_warnings: Optional[List[str]]
    llm_envelope_used: Optional[bool]
    # Phase 2
    validation_tool_available: Optional[bool]
    validation_errors: Optional[List[str]]
    generated_at: datetime
    # Edit source/reason label (populated on manual/diff-apply versions)
    reviewer_constraints: Optional[str]

    class Config:
        from_attributes = True


class CodeVersionDetail(CodeVersionSummary):
    """Full detail for a code version, including content."""
    code_content: str
    generation_prompt: Optional[str]
    # reviewer_constraints is inherited from CodeVersionSummary — do NOT re-declare here
    external_stubs_included: Optional[List[str]]


def _to_json_list(raw: Optional[str]) -> Optional[List[str]]:
    """Deserialise a JSON-encoded list[str] column, returning None on failure."""
    import json as _json
    if raw is None:
        return None
    try:
        parsed = _json.loads(raw)
        return parsed if isinstance(parsed, list) else None
    except Exception:
        return None


def _summary_from_orm(code: GeneratedCode) -> CodeVersionSummary:
    return CodeVersionSummary(
        id=code.id,
        job_id=code.job_id,
        version_number=code.version_number,
        target_language=code.target_language,
        estimated_lines_of_code=code.estimated_lines_of_code,
        llm_model_used=code.llm_model_used,
        is_accepted=code.is_accepted,
        is_current=code.is_current,
        sections_covered=_to_json_list(code.sections_covered),
        generation_warnings=_to_json_list(code.generation_warnings),
        llm_envelope_used=code.llm_envelope_used,
        validation_tool_available=code.validation_tool_available,
        validation_errors=_to_json_list(code.validation_errors),
        generated_at=code.generated_at,
        reviewer_constraints=code.reviewer_constraints,
    )


def _detail_from_orm(code: GeneratedCode) -> CodeVersionDetail:
    return CodeVersionDetail(
        **_summary_from_orm(code).model_dump(),
        code_content=code.code_content,
        generation_prompt=code.generation_prompt,
        # reviewer_constraints comes from _summary_from_orm; do NOT pass again
        external_stubs_included=_to_json_list(code.external_stubs_included),
    )


@router.get(
    "/{job_id}/code/versions",
    response_model=List[CodeVersionSummary],
    summary="List all code versions for a job",
    description=(
        "Returns all generated-code versions for a Job 2, newest first.\n\n"
        "Each entry includes version_number, is_current, Phase 1 envelope and Phase 2 validation metadata."
    ),
)
def list_code_versions(
    job_id: int,
    db: Session = Depends(get_db),
):
    codes = (
        db.query(GeneratedCode)
        .filter(GeneratedCode.job_id == job_id)
        .order_by(GeneratedCode.version_number.desc().nullslast())
        .all()
    )
    return [_summary_from_orm(c) for c in codes]


@router.get(
    "/{job_id}/code/versions/{version_number}",
    response_model=CodeVersionDetail,
    summary="Get a specific code version",
    description="Retrieve full content and metadata for a particular version number.",
)
def get_code_version(
    job_id: int,
    version_number: int,
    db: Session = Depends(get_db),
):
    code = (
        db.query(GeneratedCode)
        .filter(GeneratedCode.job_id == job_id, GeneratedCode.version_number == version_number)
        .first()
    )
    if not code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Code version {version_number} not found for job {job_id}",
        )
    return _detail_from_orm(code)


class RestoreVersionResponse(BaseModel):
    """Response after restoring a previous code version."""
    restored_version_number: int
    job_state: str
    message: str


@router.post(
    "/{job_id}/code/versions/{version_number}/restore",
    response_model=RestoreVersionResponse,
    summary="Restore a previous code version",
    description=(
        "Make a previous code version the active one for review.\n\n"
        "- Marks the target version as `is_current=True` and all others `is_current=False`.\n"
        "- Resets `is_accepted` to False — the restored version requires fresh review.\n"
        "- Transitions the job back to `CODE_UNDER_REVIEW` if it is in COMPLETED or CODE_ACCEPTED.\n\n"
        "Only valid for Job 2 jobs that have at least one generated code version."
    ),
)
def restore_code_version(
    job_id: int,
    version_number: int,
    db: Session = Depends(get_db),
):
    job_manager = JobManager()
    job = job_manager.get_job_or_404(db, job_id)

    # Locate the target version
    target = (
        db.query(GeneratedCode)
        .filter(GeneratedCode.job_id == job_id, GeneratedCode.version_number == version_number)
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Code version {version_number} not found for job {job_id}",
        )

    # Un-mark all versions as current, then mark the target
    db.query(GeneratedCode).filter(GeneratedCode.job_id == job_id).update(
        {"is_current": False}, synchronize_session="fetch"
    )
    target.is_current = True
    target.is_accepted = False

    # Transition job back to CODE_UNDER_REVIEW if currently in a post-review state
    restorable_states = {
        JobState.COMPLETED,
        JobState.CODE_ACCEPTED,
        JobState.CODE_GENERATED,
    }
    if job.current_state in restorable_states:
        job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_UNDER_REVIEW,
            performed_by="SYSTEM",
            reason=f"Code version {version_number} restored — awaiting re-review",
        )

    db.commit()

    return RestoreVersionResponse(
        restored_version_number=version_number,
        job_state=job.current_state.value,
        message=f"Version {version_number} restored as current. Job is now CODE_UNDER_REVIEW.",
    )


# ─── Manual Create Version (new row, never overwrites) ────────────────────────

class CodeCreateVersionRequest(BaseModel):
    """Request to save editor content as a brand-new code version."""
    code_content: str = Field(..., min_length=1, description="Updated code content")
    edited_by: str = Field(..., min_length=1, max_length=255, description="User creating the version")
    edit_reason: Optional[str] = Field(
        None, max_length=2000,
        description="Auto-label for this version (e.g. 'Manual edit', 'Applied diff v1→v2')"
    )


@router.post(
    "/{job_id}/code/versions",
    response_model=CodeVersionDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new code version manually",
    description=(
        "Save editor content as a brand-new code version (auto-increments version_number). "
        "Marks all previous versions as is_current=False and the new version as is_current=True. "
        "Sets is_accepted=False so the new version requires re-review."
    ),
)
def create_code_version(
    job_id: int,
    request: CodeCreateVersionRequest,
    db: Session = Depends(get_db),
):
    """Manually create a new code version from edited content."""
    from datetime import datetime as _dt

    # Require at least one pre-existing version to copy metadata from
    latest = (
        db.query(GeneratedCode)
        .filter(GeneratedCode.job_id == job_id)
        .order_by(GeneratedCode.version_number.desc().nullslast())
        .first()
    )
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No generated code found for job {job_id}. Generate code first.",
        )

    new_vn = (latest.version_number or 0) + 1

    # Un-mark all existing versions as current
    db.query(GeneratedCode).filter(GeneratedCode.job_id == job_id).update(
        {"is_current": False}, synchronize_session="fetch"
    )

    new_code = GeneratedCode(
        job_id=job_id,
        version_number=new_vn,
        code_content=request.code_content,
        target_language=latest.target_language,
        # Store the edit label in reviewer_constraints (re-used as label field)
        reviewer_constraints=request.edit_reason or "Manual edit",
        is_current=True,
        is_accepted=False,
        generated_at=_dt.now(),
    )
    db.add(new_code)
    db.commit()
    db.refresh(new_code)
    return _detail_from_orm(new_code)


# ============================================================================
# DIRECT CONVERSION endpoints  (DIRECT_CONVERSION job type)
# Pick Basic → Target Language in a single LLM call — no YAML intermediate.
# ============================================================================

from app.services.direct_conversion_service import DirectConversionService
from app.core.enums import LLMProvider as _LLMProvider

_direct_service = DirectConversionService()


class DirectCodeGenerationRequest(BaseModel):
    """Request to trigger the first (initial) direct conversion for a job."""
    target_language: TargetLanguage = Field(..., description="Target programming language")
    performed_by: str = Field(..., min_length=1, max_length=255)
    llm_provider: _LLMProvider = Field(_LLMProvider.OPENAI, description="LLM provider to use")
    llm_model_override: Optional[str] = Field(
        None,
        description="Optional model name override (e.g. 'gpt-4o', 'claude-opus-4-5')"
    )


class DirectCodeRegenerationRequest(BaseModel):
    """Request to regenerate code after a reviewer rejection on a direct conversion job."""
    target_language: TargetLanguage = Field(..., description="Target programming language")
    performed_by: str = Field(..., min_length=1, max_length=255)
    general_feedback: str = Field("", description="Cumulative reviewer comments")
    line_comment_context: str = Field("", description="Formatted inline line comments from reviewer")
    llm_provider: _LLMProvider = Field(_LLMProvider.OPENAI, description="LLM provider to use")
    llm_model_override: Optional[str] = Field(None, description="Optional model name override")


class DirectCodeReviewRequest(BaseModel):
    """Request to submit a review (accept / reject-and-regenerate) on a direct conversion job."""
    decision: ReviewDecision = Field(
        ...,
        description="DIRECT_APPROVE to accept, DIRECT_REJECT_REGENERATE to reject and request regeneration"
    )
    general_feedback: Optional[str] = Field(None, description="Optional review notes")
    reviewed_by: Optional[str] = Field(None, max_length=255)
    version_number: Optional[int] = Field(
        None,
        description="Specific version to accept. If omitted the current version is used."
    )


@router.post(
    "/{job_id}/direct/generate",
    response_model=GeneratedCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate code via direct conversion",
    description=(
        "Trigger Pick Basic → target language conversion for a DIRECT_CONVERSION job "
        "using a single LLM call (no YAML intermediate step). "
        "Job must be in CREATED or DIRECT_CODE_REGENERATE_REQUESTED state."
    ),
)
def direct_generate_code(
    job_id: int,
    request: DirectCodeGenerationRequest,
    db: Session = Depends(get_db),
):
    """Generate code for a DIRECT_CONVERSION job."""
    generated = _direct_service.generate_code_for_job(
        db=db,
        job_id=job_id,
        target_language=request.target_language.value,
        performed_by=request.performed_by,
        llm_provider=request.llm_provider,
        llm_model_override=request.llm_model_override,
    )
    return GeneratedCodeResponse.model_validate(generated)


@router.post(
    "/{job_id}/direct/regenerate",
    response_model=GeneratedCodeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Regenerate code after reviewer rejection (direct conversion)",
    description=(
        "Regenerate code for a DIRECT_CONVERSION job after a reviewer rejection. "
        "Job must be in DIRECT_CODE_REGENERATE_REQUESTED state."
    ),
)
def direct_regenerate_code(
    job_id: int,
    request: DirectCodeRegenerationRequest,
    db: Session = Depends(get_db),
):
    """Regenerate code for a DIRECT_CONVERSION job after rejection."""
    generated = _direct_service.regenerate_code_for_job(
        db=db,
        job_id=job_id,
        target_language=request.target_language.value,
        performed_by=request.performed_by,
        general_feedback=request.general_feedback,
        line_comment_context=request.line_comment_context,
        llm_provider=request.llm_provider,
        llm_model_override=request.llm_model_override,
    )
    return GeneratedCodeResponse.model_validate(generated)


@router.post(
    "/{job_id}/direct/review",
    summary="Submit a review for a direct conversion job",
    description=(
        "Accept or reject the current code version for a DIRECT_CONVERSION job. "
        "DIRECT_APPROVE transitions to DIRECT_CODE_ACCEPTED → DIRECT_COMPLETED. "
        "DIRECT_REJECT_REGENERATE transitions to DIRECT_CODE_REGENERATE_REQUESTED."
    ),
)
def direct_submit_review(
    job_id: int,
    request: DirectCodeReviewRequest,
    db: Session = Depends(get_db),
):
    """Submit accept/reject review for a DIRECT_CONVERSION job."""
    from app.services.job_manager import JobManager as _JM
    from app.core.enums import ReviewDecision as _RD, AuditAction as _AA
    from app.services.audit_service import AuditService as _AS
    from app.models.code import GeneratedCode as _GC

    jm = _JM()
    job = jm.get_job_or_404(db, job_id)

    if job.current_state != JobState.DIRECT_CODE_UNDER_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Job {job_id} is not under review (state: {job.current_state.value}). "
                "Cannot submit a review."
            ),
        )

    if request.decision == _RD.DIRECT_APPROVE:
        # Resolve which version to accept: use the explicitly requested version_number
        # (i.e. the one the reviewer was looking at) or fall back to is_current.
        if request.version_number is not None:
            target_code = (
                db.query(_GC)
                .filter(_GC.job_id == job_id, _GC.version_number == request.version_number)
                .first()
            )
            if not target_code:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Version {request.version_number} not found for job {job_id}."
                )
        else:
            target_code = (
                db.query(_GC)
                .filter(_GC.job_id == job_id, _GC.is_current.is_(True))
                .first()
            )

        if target_code:
            # Demote all versions from is_current, then promote the accepted one
            db.query(_GC).filter(_GC.job_id == job_id).update(
                {"is_current": False}, synchronize_session="fetch"
            )
            target_code.is_current = True
            target_code.is_accepted = True

        jm.transition_state(db, job_id, JobState.DIRECT_CODE_ACCEPTED, request.reviewed_by or "REVIEWER",
                            "Reviewer accepted direct conversion code")
        jm.transition_state(db, job_id, JobState.DIRECT_COMPLETED, "SYSTEM",
                            "Direct conversion job completed")

        _AS._create_log(
            db=db, job_id=job_id, action=_AA.DIRECT_CODE_ACCEPTED,
            description="Reviewer accepted direct conversion code",
            performed_by=request.reviewed_by or "REVIEWER",
            metadata={"decision": request.decision.value, "feedback": request.general_feedback},
        )
        _AS._create_log(
            db=db, job_id=job_id, action=_AA.DIRECT_JOB_COMPLETED,
            description="Direct conversion job completed",
            performed_by="SYSTEM", metadata={},
        )
        db.commit()
        return {"message": "Code accepted. Direct conversion job completed.", "job_id": job_id}

    elif request.decision == _RD.DIRECT_REJECT_REGENERATE:
        jm.transition_state(db, job_id, JobState.DIRECT_CODE_REGENERATE_REQUESTED,
                            request.reviewed_by or "REVIEWER",
                            "Reviewer rejected code — regeneration requested")
        _AS._create_log(
            db=db, job_id=job_id, action=_AA.DIRECT_CODE_REVIEW_SUBMITTED,
            description="Reviewer rejected direct conversion code — regeneration requested",
            performed_by=request.reviewed_by or "REVIEWER",
            metadata={"decision": request.decision.value, "feedback": request.general_feedback},
        )
        db.commit()
        return {
            "message": "Code rejected. Use POST /{job_id}/direct/regenerate to regenerate.",
            "job_id": job_id,
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"Unsupported decision {request.decision.value!r} for direct conversion review. "
            "Use DIRECT_APPROVE or DIRECT_REJECT_REGENERATE."
        ),
    )

