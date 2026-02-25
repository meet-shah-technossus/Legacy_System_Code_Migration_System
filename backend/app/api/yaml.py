"""API endpoints for YAML generation and version management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.services.yaml_service import YAMLService
from app.models.yaml_version import YAMLVersion


router = APIRouter()
yaml_service = YAMLService()


# Request/Response Schemas
class YAMLGenerationRequest(BaseModel):
    """Request to generate YAML for a job."""
    performed_by: str = Field(..., min_length=1, max_length=255, description="User/system performing the action")
    force_regenerate: bool = Field(default=False, description="Force regeneration even if YAML exists")


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
    yaml_version = yaml_service.generate_yaml_for_job(
        db=db,
        job_id=job_id,
        performed_by=request.performed_by,
        force_regenerate=request.force_regenerate
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
        additional_instructions=request.additional_instructions
    )
    
    return YAMLVersionResponse.from_orm(yaml_version)
