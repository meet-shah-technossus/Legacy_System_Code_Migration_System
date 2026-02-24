"""
Code generation API endpoints.
RESTful API for generating modern code from approved YAML.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

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
    
    model_config = {"from_attributes": True}


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
        use_llm=request.use_llm
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

    class Config:
        from_attributes = True


class CodeVersionDetail(CodeVersionSummary):
    """Full detail for a code version, including content."""
    code_content: str
    generation_prompt: Optional[str]
    reviewer_constraints: Optional[str]
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
    )


def _detail_from_orm(code: GeneratedCode) -> CodeVersionDetail:
    return CodeVersionDetail(
        **_summary_from_orm(code).model_dump(),
        code_content=code.code_content,
        generation_prompt=code.generation_prompt,
        reviewer_constraints=code.reviewer_constraints,
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
