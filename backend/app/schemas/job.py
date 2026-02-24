"""
Pydantic schemas for Migration Job.
Request/response models for API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.core.enums import JobState, JobType, TargetLanguage


# ── Request Schemas ─────────────────────────────────────────────────────────

class MigrationJobCreate(BaseModel):
    """Schema for creating a new Job 1 (Pick Basic → YAML).
    Target language is NOT required here — that is Job 2's concern.
    """
    job_name: Optional[str] = Field(None, max_length=255, description="Optional job name")
    description: Optional[str] = Field(None, description="Job description")
    original_source_code: str = Field(..., min_length=1, description="Pick Basic source code")
    source_filename: Optional[str] = Field(None, max_length=255, description="Original filename")
    pick_basic_version: Optional[str] = Field(None, max_length=50, description="Pick Basic version")
    created_by: Optional[str] = Field(None, max_length=100, description="User identifier")


class Job2Create(BaseModel):
    """Schema for creating a new Job 2 (YAML → Target Language).
    Picked from the queue — requires a parent Job 1 and target language.
    """
    job_name: Optional[str] = Field(None, max_length=255, description="Optional job name")
    description: Optional[str] = Field(None, description="Job description")
    parent_job_id: int = Field(..., description="ID of the approved Job 1 from the queue")
    target_language: TargetLanguage = Field(..., description="Target programming language")
    created_by: Optional[str] = Field(None, max_length=100, description="User identifier")


class MigrationJobUpdate(BaseModel):
    """Schema for updating job metadata (not state)."""
    job_name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


class JobStateTransition(BaseModel):
    """Schema for requesting a state transition."""
    new_state: JobState = Field(..., description="Target state")
    reason: Optional[str] = Field(None, description="Reason for transition")


# ── Line Comment Schemas ─────────────────────────────────────────────────────

class LineCommentCreate(BaseModel):
    """Schema for adding a line-level comment during review."""
    line_number: int = Field(..., ge=1, description="1-based line number in the code")
    code_type: str = Field("yaml", description="'yaml' or 'generated_code'")
    comment: str = Field(..., min_length=1, description="Reviewer's comment for this line")
    reviewer: Optional[str] = Field(None, max_length=100)
    review_round: int = Field(1, ge=1, description="Review round number")


class LineCommentResponse(BaseModel):
    """Response schema for a line-level comment."""
    id: int
    job_id: int
    line_number: int
    code_type: str
    comment: str
    reviewer: Optional[str]
    included_in_regeneration: bool
    review_round: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Response Schemas ─────────────────────────────────────────────────────────

class MigrationJobResponse(BaseModel):
    """Full migration job details response."""
    id: int
    job_type: JobType
    parent_job_id: Optional[int]
    job_name: Optional[str]
    description: Optional[str]
    source_filename: Optional[str]
    pick_basic_version: Optional[str]
    target_language: Optional[TargetLanguage]
    current_state: JobState
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    created_by: Optional[str]

    # Counts for related entities
    yaml_versions_count: int = 0
    reviews_count: int = 0

    model_config = {"from_attributes": True}


class MigrationJobSummary(BaseModel):
    """Condensed job summary for list views."""
    id: int
    job_type: JobType
    parent_job_id: Optional[int]
    job_name: Optional[str]
    source_filename: Optional[str]
    target_language: Optional[TargetLanguage]
    current_state: JobState
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MigrationJobWithSource(BaseModel):
    """Job details including source code."""
    id: int
    job_type: JobType
    parent_job_id: Optional[int]
    job_name: Optional[str]
    description: Optional[str]
    original_source_code: Optional[str]
    source_filename: Optional[str]
    pick_basic_version: Optional[str]
    target_language: Optional[TargetLanguage]
    current_state: JobState
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    created_by: Optional[str]

    model_config = {"from_attributes": True}
