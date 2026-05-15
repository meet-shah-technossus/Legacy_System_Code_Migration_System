"""API endpoints for YAML generation and version management."""

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.enums import LLMProvider
from app.services.yaml_service import YAMLService
from app.services.auth_service import get_current_active_user
from app.models.yaml_version import YAMLVersion
from app.models.job import MigrationJob
from app.models.user import User


router = APIRouter()
yaml_service = YAMLService()


# Request/Response Schemas
class YAMLGenerationRequest(BaseModel):
    """Request to generate YAML for a job."""
    performed_by: str = Field(..., min_length=1, max_length=255, description="User/system performing the action")
    force_regenerate: bool = Field(default=False, description="Force regeneration even if YAML exists")
    llm_provider: str = Field(default='OPENAI', description="LLM provider to use: OPENAI or ANTHROPIC")


class YAMLVersionResponse(BaseModel):
    """Response schema for YAML version."""
    id: int
    job_id: int
    version_number: int
    yaml_content: str
    is_valid: bool
    validation_errors: Optional[str]
    generated_at: str
    is_approved: bool
    approved_by: Optional[str]
    approved_at: Optional[str]
    llm_model_used: Optional[str]
    llm_tokens_used: Optional[int]
    generation_time_seconds: Optional[int]
    regeneration_reason: Optional[str]
    reviewer_comments_context: Optional[str]
    parent_version_id: Optional[int]

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, version: YAMLVersion):
        """Convert ORM object to response schema."""
        return cls(
            id=version.id,
            job_id=version.job_id,
            version_number=version.version_number,
            yaml_content=version.yaml_content,
            is_valid=version.is_valid,
            validation_errors=version.validation_errors,
            generated_at=version.generated_at.isoformat() if version.generated_at else "",
            is_approved=version.is_approved,
            approved_by=version.approved_by,
            approved_at=version.approved_at.isoformat() if version.approved_at else None,
            llm_model_used=version.llm_model_used,
            llm_tokens_used=version.llm_tokens_used,
            generation_time_seconds=version.generation_time_seconds,
            regeneration_reason=version.regeneration_reason,
            reviewer_comments_context=version.reviewer_comments_context,
            parent_version_id=version.parent_version_id
        )


class YAMLVersionSummary(BaseModel):
    """Summary schema for YAML version (without full content)."""
    id: int
    version_number: int
    is_valid: bool
    generated_at: str
    is_approved: bool
    approved_by: Optional[str]
    has_errors: bool
    llm_model_used: Optional[str]
    regeneration_reason: Optional[str]
    parent_version_id: Optional[int]

    @classmethod
    def from_orm(cls, version: YAMLVersion):
        """Convert ORM object to summary schema."""
        return cls(
            id=version.id,
            version_number=version.version_number,
            is_valid=version.is_valid,
            generated_at=version.generated_at.isoformat() if version.generated_at else "",
            is_approved=version.is_approved,
            approved_by=version.approved_by,
            has_errors=bool(version.validation_errors),
            llm_model_used=version.llm_model_used,
            regeneration_reason=version.regeneration_reason,
            parent_version_id=version.parent_version_id
        )


class YAMLApprovalRequest(BaseModel):
    """Request to approve a YAML version."""
    approved_by: str = Field(..., min_length=1, max_length=255)
    comments: Optional[str] = Field(None, max_length=2000)


# Endpoints
@router.post(
    "/jobs/{job_id}/yaml/generate",
    response_model=YAMLVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate YAML for a job",
    description="Generate YAML representation from Pick Basic source code using LLM"
)
def generate_yaml(
    job_id: int,
    request: YAMLGenerationRequest,
    db: Session = Depends(get_db)
):
    """Generate YAML for a migration job."""
    try:
        provider = LLMProvider(request.llm_provider.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid llm_provider '{request.llm_provider}'. Use 'OPENAI' or 'ANTHROPIC'."
        )
    yaml_version = yaml_service.generate_yaml_for_job(
        db=db,
        job_id=job_id,
        performed_by=request.performed_by,
        force_regenerate=request.force_regenerate,
        llm_provider=provider
    )
    return YAMLVersionResponse.from_orm(yaml_version)


@router.get(
    "/jobs/{job_id}/yaml/versions",
    response_model=List[YAMLVersionSummary],
    summary="List YAML versions for a job",
    description="Get all YAML versions for a migration job"
)
def list_yaml_versions(
    job_id: int,
    include_invalid: bool = False,
    db: Session = Depends(get_db)
):
    """List all YAML versions for a job."""
    versions = yaml_service.get_yaml_versions(
        db=db,
        job_id=job_id,
        include_invalid=include_invalid
    )
    return [YAMLVersionSummary.from_orm(v) for v in versions]


@router.get(
    "/jobs/{job_id}/yaml/versions/{version_number}",
    response_model=YAMLVersionResponse,
    summary="Get specific YAML version",
    description="Retrieve a specific YAML version by version number"
)
def get_yaml_version(
    job_id: int,
    version_number: int,
    db: Session = Depends(get_db)
):
    """Get a specific YAML version."""
    version = yaml_service.get_yaml_version(
        db=db,
        job_id=job_id,
        version_number=version_number
    )
    return YAMLVersionResponse.from_orm(version)


@router.get(
    "/jobs/{job_id}/yaml/latest",
    response_model=YAMLVersionResponse,
    summary="Get latest YAML version",
    description="Get the most recent YAML version for a job"
)
def get_latest_yaml(
    job_id: int,
    only_valid: bool = True,
    db: Session = Depends(get_db)
):
    """Get the latest YAML version for a job."""
    version = yaml_service.get_latest_yaml_version(
        db=db,
        job_id=job_id,
        only_valid=only_valid
    )
    
    if not version:
        raise HTTPException(
            status_code=404,
            detail=f"No YAML versions found for job {job_id}"
        )
    
    return YAMLVersionResponse.from_orm(version)


class YAMLEditRequest(BaseModel):
    """Request to manually edit YAML content."""
    yaml_content: str = Field(..., min_length=1, description="Updated YAML content")
    edited_by: str = Field(..., min_length=1, max_length=255, description="User making the edit")
    edit_reason: Optional[str] = Field(None, max_length=2000, description="Optional reason for manual edit")


@router.patch(
    "/jobs/{job_id}/yaml/versions/{version_number}",
    response_model=YAMLVersionResponse,
    summary="Manually edit YAML version content",
    description="Replace the raw YAML content of a specific version. "
                "Resets approval so the version requires re-review."
)
def edit_yaml_version(
    job_id: int,
    version_number: int,
    request: YAMLEditRequest,
    db: Session = Depends(get_db)
):
    """Manually edit a specific YAML version's content."""
    from datetime import datetime as _dt
    version = yaml_service.get_yaml_version(db, job_id, version_number)

    version.yaml_content = request.yaml_content
    # Re-validate (simple heuristic — presence of required top-level keys)
    try:
        from app.services.yaml_validator import YAMLValidator
        validator = YAMLValidator()
        is_valid, errors = validator.validate_yaml_content(request.yaml_content)
    except Exception:
        is_valid = True
        errors = None

    version.is_valid = is_valid
    version.validation_errors = errors if not is_valid else None
    # Reset approval — requires re-review after manual edit
    version.is_approved = False
    version.approved_by = None
    version.approved_at = None

    db.commit()
    db.refresh(version)
    return YAMLVersionResponse.from_orm(version)


class YAMLCreateVersionRequest(BaseModel):
    """Request to manually create a new YAML version (saves as new row, never overwrites)."""
    yaml_content: str = Field(..., min_length=1, description="YAML content for the new version")
    edited_by: str = Field(..., min_length=1, max_length=255, description="User creating the version")
    edit_reason: Optional[str] = Field(None, max_length=2000, description="Label/reason for this version (e.g. 'Manual edit', 'Applied diff v1→v2')")


@router.post(
    "/jobs/{job_id}/yaml/versions",
    response_model=YAMLVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new YAML version manually",
    description=(
        "Save the current editor content as a brand-new version (auto-increments version_number). "
        "Never overwrites an existing version. Sets is_approved=False so the new version requires re-review."
    )
)
def create_yaml_version(
    job_id: int,
    request: YAMLCreateVersionRequest,
    db: Session = Depends(get_db)
):
    """Create a new YAML version from manually-edited content."""
    from datetime import datetime as _dt

    # Determine next version number
    existing = yaml_service.get_yaml_versions(db, job_id, include_invalid=True)
    new_version_number = max((v.version_number for v in existing), default=0) + 1
    parent = max(existing, key=lambda v: v.version_number) if existing else None

    # Re-validate content
    try:
        from app.services.yaml_validator import YAMLValidator
        validator = YAMLValidator()
        is_valid, errors = validator.validate_yaml_content(request.yaml_content)
    except Exception:
        is_valid = True
        errors = None

    new_version = YAMLVersion(
        job_id=job_id,
        version_number=new_version_number,
        yaml_content=request.yaml_content,
        regeneration_reason=request.edit_reason or "Manual edit",
        is_valid=is_valid,
        validation_errors=errors if not is_valid else None,
        is_approved=False,
        parent_version_id=parent.id if parent else None,
        generated_at=_dt.now(),
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return YAMLVersionResponse.from_orm(new_version)


@router.post(
    "/jobs/{job_id}/yaml/versions/{version_number}/approve",
    response_model=YAMLVersionResponse,
    summary="Approve YAML version",
    description="Approve a YAML version after review"
)
def approve_yaml_version(
    job_id: int,
    version_number: int,
    request: YAMLApprovalRequest,
    db: Session = Depends(get_db)
):
    """Approve a YAML version."""
    version = yaml_service.approve_yaml_version(
        db=db,
        job_id=job_id,
        version_number=version_number,
        approved_by=request.approved_by,
        comments=request.comments
    )
    return YAMLVersionResponse.from_orm(version)


@router.get(
    "/jobs/{job_id}/yaml/versions/{version_number}/lineage",
    response_model=List[YAMLVersionSummary],
    summary="Get YAML version lineage",
    description="Get the lineage (parent chain) of a YAML version"
)
def get_yaml_lineage(
    job_id: int,
    version_number: int,
    db: Session = Depends(get_db)
):
    """Get the lineage of a YAML version."""
    lineage = yaml_service.get_version_lineage(
        db=db,
        job_id=job_id,
        version_number=version_number
    )
    return [YAMLVersionSummary.from_orm(v) for v in lineage]


@router.get(
    "/jobs/{job_id}/yaml/statistics",
    summary="Get YAML statistics for a job",
    description="Get statistics about YAML versions for a job"
)
def get_yaml_statistics(
    job_id: int,
    db: Session = Depends(get_db)
):
    """Get statistics about YAML versions."""
    versions = yaml_service.get_yaml_versions(
        db=db,
        job_id=job_id,
        include_invalid=True
    )
    
    valid_count = sum(1 for v in versions if v.is_valid)
    approved_count = sum(1 for v in versions if v.is_approved)
    
    return {
        "job_id": job_id,
        "total_versions": len(versions),
        "valid_versions": valid_count,
        "invalid_versions": len(versions) - valid_count,
        "approved_versions": approved_count,
        "latest_version_number": max((v.version_number for v in versions), default=0),
        "has_approved_version": approved_count > 0
    }


class YAMLRegenerationRequest(BaseModel):
    """Request to regenerate YAML with review feedback."""
    performed_by: str = Field(..., min_length=1, max_length=255, description="User/system performing the action")
    include_previous_comments: bool = Field(default=True, description="Include comments from last review")
    additional_instructions: Optional[str] = Field(None, description="Additional guidance for regeneration")
    llm_provider: Optional[LLMProvider] = Field(
        None,
        description="LLM provider override for this regeneration. "
                    "Omit to re-use the provider from the original YAML generation."
    )


@router.post(
    "/jobs/{job_id}/yaml/regenerate",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Regenerate YAML with review feedback",
    description="Generate a new YAML version incorporating feedback from previous review. Job must be in REGENERATE_REQUESTED state."
)
def regenerate_yaml_with_feedback(
    job_id: int,
    request: YAMLRegenerationRequest,
    db: Session = Depends(get_db)
):
    """Regenerate YAML incorporating review feedback."""
    yaml_version = yaml_service.regenerate_yaml_with_feedback(
        db=db,
        job_id=job_id,
        performed_by=request.performed_by,
        include_previous_comments=request.include_previous_comments,
        additional_instructions=request.additional_instructions,
        llm_provider=request.llm_provider,
    )

    return YAMLVersionResponse.from_orm(yaml_version)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers shared by description endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _get_job_or_404(db: Session, job_id: int) -> MigrationJob:
    """Load a MigrationJob or raise 404."""
    job = db.get(MigrationJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found.",
        )
    return job


def _require_job_access(job: MigrationJob, current_user: User) -> None:
    """Raise 403 if a non-admin user tries to access a job they do not own."""
    if current_user.role.value == "admin":
        return
    if job.created_by != current_user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this job.",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Description generation & download endpoints
# ─────────────────────────────────────────────────────────────────────────────

class YAMLDescriptionGenerateRequest(BaseModel):
    """Request body for description generation."""
    force_regenerate: bool = Field(
        default=False,
        description="Re-generate even if a cached description already exists.",
    )


@router.post(
    "/jobs/{job_id}/yaml/description/generate",
    summary="Generate plain-English description of approved YAML",
    description=(
        "Uses the same LLM that produced the job's approved YAML to generate a "
        "detailed, Markdown-formatted description covering all variables, subroutines, "
        "business rules, data flow, and migration considerations. "
        "The result is cached; pass force_regenerate=true to overwrite it."
    ),
    status_code=status.HTTP_200_OK,
)
def generate_yaml_description(
    job_id: int,
    request: YAMLDescriptionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate (or regenerate) the plain-English description for a job's approved YAML."""
    from app.services.description_generator import DescriptionGenerator
    from app.schemas.yaml_schema import YAMLDescriptionResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = DescriptionGenerator().generate_description(
        db=db,
        job_id=job_id,
        performed_by=current_user.username,
        force_regenerate=request.force_regenerate,
    )
    return YAMLDescriptionResponse.model_validate(description)


@router.get(
    "/jobs/{job_id}/yaml/description",
    summary="Get cached YAML description",
    description=(
        "Returns the previously generated plain-English description for the job's "
        "approved YAML. Returns 404 if the description has not been generated yet — "
        "call POST /description/generate first."
    ),
)
def get_yaml_description(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return the cached description for a job's approved YAML."""
    from app.services.description_generator import DescriptionGenerator
    from app.schemas.yaml_schema import YAMLDescriptionResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = DescriptionGenerator().get_existing_description(db, job_id)
    if not description:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No description found for job {job_id}. "
                "Call POST /jobs/{job_id}/yaml/description/generate first."
            ),
        )
    return YAMLDescriptionResponse.model_validate(description)


@router.get(
    "/jobs/{job_id}/yaml/description/download",
    summary="Download YAML description as DOCX or PDF",
    description=(
        "Streams the cached plain-English description as a formatted Word document "
        "(.docx) or PDF file. Pass ?format=docx or ?format=pdf. "
        "Returns 404 if the description has not been generated yet."
    ),
    response_class=StreamingResponse,
)
def download_yaml_description(
    job_id: int,
    format: Literal["docx", "pdf", "md"] = Query(
        default="docx",
        description="Output format: 'docx' (Word), 'pdf', or 'md' (Markdown).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Stream the description document as a DOCX or PDF download."""
    from app.services.description_generator import DescriptionGenerator
    from app.services.document_exporter import export_to_docx, export_to_pdf

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = DescriptionGenerator().get_existing_description(db, job_id)
    if not description:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No description found for job {job_id}. "
                "Call POST /jobs/{job_id}/yaml/description/generate first."
            ),
        )

    metadata = {
        "job_id": job_id,
        "generated_at": description.generated_at.strftime("%Y-%m-%d %H:%M UTC")
        if description.generated_at
        else "",
        "llm_model": description.llm_model or "",
    }
    job_name = (
        getattr(job, "name", None)
        or getattr(job, "source_filename", None)
        or f"job_{job_id}"
    )

    if format == "docx":
        buf = export_to_docx(
            description_text=description.description_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"yaml_description_job{job_id}.docx"
    elif format == "pdf":
        buf = export_to_pdf(
            description_text=description.description_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/pdf"
        filename = f"yaml_description_job{job_id}.pdf"
    else:
        # Markdown — return raw text
        buf = BytesIO(description.description_text.encode("utf-8"))
        media_type = "text/markdown"
        filename = f"yaml_description_job{job_id}.md"

    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Source (Pick Basic) description generation & download endpoints
# ─────────────────────────────────────────────────────────────────────────────

class SourceDescriptionGenerateRequest(BaseModel):
    """Request body for source description generation."""
    force_regenerate: bool = Field(
        default=False,
        description="Re-generate even if a cached description already exists.",
    )


@router.post(
    "/jobs/{job_id}/source/description/generate",
    summary="Generate plain-English description from Pick Basic source code",
    description=(
        "Uses the LLM to generate a detailed, Markdown-formatted description "
        "directly from the job's original Pick Basic source code. "
        "The result is cached; pass force_regenerate=true to overwrite it."
    ),
    status_code=status.HTTP_200_OK,
)
def generate_source_description(
    job_id: int,
    request: SourceDescriptionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate (or regenerate) the plain-English description from source code."""
    from app.services.source_description_generator import SourceDescriptionGenerator
    from app.schemas.yaml_schema import SourceDescriptionResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = SourceDescriptionGenerator().generate_description(
        db=db,
        job_id=job_id,
        performed_by=current_user.username,
        force_regenerate=request.force_regenerate,
    )
    return SourceDescriptionResponse.model_validate(description)


@router.get(
    "/jobs/{job_id}/source/description",
    summary="Get cached source code description",
    description=(
        "Returns the previously generated plain-English description for the job's "
        "Pick Basic source code. Returns 404 if the description has not been "
        "generated yet — call POST /source/description/generate first."
    ),
)
def get_source_description(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return the cached source description for a job."""
    from app.services.source_description_generator import SourceDescriptionGenerator
    from app.schemas.yaml_schema import SourceDescriptionResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = SourceDescriptionGenerator().get_existing_description(db, job_id)
    if not description:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No source description found for job {job_id}. "
                "Call POST /jobs/{job_id}/source/description/generate first."
            ),
        )
    return SourceDescriptionResponse.model_validate(description)


@router.get(
    "/jobs/{job_id}/source/description/download",
    summary="Download source description as DOCX, PDF, or Markdown",
    description=(
        "Streams the cached Pick Basic source description as a formatted Word "
        "document (.docx), PDF file, or Markdown (.md) file. "
        "Returns 404 if the description has not been generated yet."
    ),
    response_class=StreamingResponse,
)
def download_source_description(
    job_id: int,
    format: Literal["docx", "pdf", "md"] = Query(
        default="docx",
        description="Output format: 'docx' (Word), 'pdf', or 'md' (Markdown).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Stream the source description document as a DOCX, PDF, or Markdown download."""
    from app.services.source_description_generator import SourceDescriptionGenerator
    from app.services.document_exporter import export_to_docx, export_to_pdf

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    description = SourceDescriptionGenerator().get_existing_description(db, job_id)
    if not description:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No source description found for job {job_id}. "
                "Call POST /jobs/{job_id}/source/description/generate first."
            ),
        )

    metadata = {
        "job_id": job_id,
        "generated_at": description.generated_at.strftime("%Y-%m-%d %H:%M UTC")
        if description.generated_at
        else "",
        "llm_model": description.llm_model or "",
    }
    job_name = (
        getattr(job, "name", None)
        or getattr(job, "source_filename", None)
        or f"job_{job_id}"
    )

    if format == "docx":
        buf = export_to_docx(
            description_text=description.description_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"source_description_job{job_id}.docx"
    elif format == "pdf":
        buf = export_to_pdf(
            description_text=description.description_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/pdf"
        filename = f"source_description_job{job_id}.pdf"
    else:
        # Markdown — return raw text
        buf = BytesIO(description.description_text.encode("utf-8"))
        media_type = "text/markdown"
        filename = f"source_description_job{job_id}.md"

    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Business Requirements Document (BRD) generation & download endpoints
# ─────────────────────────────────────────────────────────────────────────────

class BRDGenerateRequest(BaseModel):
    """Request body for BRD generation."""
    generation_source: Literal["yaml", "source_code"] = Field(
        default="yaml",
        description=(
            "'yaml' — generate BRD from the approved YAML only; "
            "'source_code' — generate BRD from the original source code only."
        ),
    )
    force_regenerate: bool = Field(
        default=False,
        description="Re-generate even if a cached BRD already exists.",
    )


@router.post(
    "/jobs/{job_id}/brd/generate",
    summary="Generate Business Requirements Document (BRD) for a job",
    description=(
        "Uses the LLM to generate a Business Requirements Document. "
        "Pass generation_source='yaml' to generate from the approved YAML, "
        "or 'source_code' to generate from the original source code. "
        "Each source produces an independent cached record."
    ),
    status_code=status.HTTP_200_OK,
)
def generate_brd(
    job_id: int,
    request: BRDGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate (or regenerate) the BRD for a job."""
    from app.services.brd_generator import BRDGenerator
    from app.schemas.yaml_schema import BRDResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    brd = BRDGenerator().generate_brd(
        db=db,
        job_id=job_id,
        performed_by=current_user.username,
        generation_source=request.generation_source,
        force_regenerate=request.force_regenerate,
    )
    return BRDResponse.model_validate(brd)


@router.get(
    "/jobs/{job_id}/brd",
    summary="Get cached BRD for a job",
    description=(
        "Returns the previously generated BRD filtered by source. "
        "Pass source='yaml' (default) or source='source_code'. "
        "Returns 404 if no BRD for that source has been generated yet."
    ),
)
def get_brd(
    job_id: int,
    source: Literal["yaml", "source_code"] = Query(
        default="yaml",
        description="Which BRD to retrieve: 'yaml' or 'source_code'.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return the cached BRD for a job and source type."""
    from app.services.brd_generator import BRDGenerator
    from app.schemas.yaml_schema import BRDResponse

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    brd = BRDGenerator().get_existing_brd(db, job_id, source)
    if not brd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No BRD ({source}) found for job {job_id}. "
                "Call POST /jobs/{job_id}/brd/generate first."
            ),
        )
    return BRDResponse.model_validate(brd)


@router.get(
    "/jobs/{job_id}/brd/download",
    summary="Download BRD as DOCX, PDF, or Markdown",
    description=(
        "Streams the cached BRD as a formatted Word document (.docx), PDF, or "
        "Markdown (.md). Pass source='yaml' or source='source_code' to select "
        "which BRD to download."
    ),
    response_class=StreamingResponse,
)
def download_brd(
    job_id: int,
    source: Literal["yaml", "source_code"] = Query(
        default="yaml",
        description="Which BRD to download: 'yaml' or 'source_code'.",
    ),
    format: Literal["docx", "pdf", "md"] = Query(
        default="docx",
        description="Output format: 'docx' (Word), 'pdf', or 'md' (Markdown).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Stream the BRD document as a DOCX, PDF, or Markdown download."""
    from app.services.brd_generator import BRDGenerator
    from app.services.document_exporter import export_to_docx, export_to_pdf

    job = _get_job_or_404(db, job_id)
    _require_job_access(job, current_user)

    brd = BRDGenerator().get_existing_brd(db, job_id, source)
    if not brd:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No BRD ({source}) found for job {job_id}. "
                "Call POST /jobs/{job_id}/brd/generate first."
            ),
        )

    metadata = {
        "job_id": job_id,
        "generated_at": brd.generated_at.strftime("%Y-%m-%d %H:%M UTC")
        if brd.generated_at
        else "",
        "llm_model": brd.llm_model or "",
    }
    job_name = (
        getattr(job, "name", None)
        or getattr(job, "source_filename", None)
        or f"job_{job_id}"
    )

    if format == "docx":
        buf = export_to_docx(
            description_text=brd.brd_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"brd_{source}_job{job_id}.docx"
    elif format == "pdf":
        buf = export_to_pdf(
            description_text=brd.brd_text,
            job_name=job_name,
            metadata=metadata,
        )
        media_type = "application/pdf"
        filename = f"brd_{source}_job{job_id}.pdf"
    else:
        buf = BytesIO(brd.brd_text.encode("utf-8"))
        media_type = "text/markdown"
        filename = f"brd_{source}_job{job_id}.md"

    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

