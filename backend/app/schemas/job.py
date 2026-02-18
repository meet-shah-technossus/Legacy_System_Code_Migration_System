"""
Pydantic schemas for Migration Job.
Request/response models for API endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.core.enums import JobState, TargetLanguage


# Request Schemas

class MigrationJobCreate(BaseModel):
    """Schema for creating a new migration job."""
    job_name: Optional[str] = Field(None, max_length=255, description="Optional job name")
    description: Optional[str] = Field(None, description="Job description")
    original_source_code: str = Field(..., min_length=1, description="Pick Basic source code")
    source_filename: Optional[str] = Field(None, max_length=255, description="Original filename")
    pick_basic_version: Optional[str] = Field(None, max_length=50, description="Pick Basic version")
    target_language: TargetLanguage = Field(TargetLanguage.PYTHON, description="Target programming language")
    created_by: Optional[str] = Field(None, max_length=100, description="User identifier")


class MigrationJobUpdate(BaseModel):
    """Schema for updating job metadata (not state)."""
    job_name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    
    
class JobStateTransition(BaseModel):
    """Schema for requesting a state transition."""
    new_state: JobState = Field(..., description="Target state")
    reason: Optional[str] = Field(None, description="Reason for transition")


# Response Schemas

class MigrationJobResponse(BaseModel):
    """Full migration job details response."""
    id: int
    job_name: Optional[str]
    description: Optional[str]
    source_filename: Optional[str]
    pick_basic_version: Optional[str]
    target_language: TargetLanguage
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
    job_name: Optional[str]
    source_filename: Optional[str]
    target_language: TargetLanguage
    current_state: JobState
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class MigrationJobWithSource(BaseModel):
    """Job details including source code."""
    id: int
    job_name: Optional[str]
    description: Optional[str]
    original_source_code: str
    source_filename: Optional[str]
    pick_basic_version: Optional[str]
    target_language: TargetLanguage
    current_state: JobState
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    created_by: Optional[str]
    
    model_config = {"from_attributes": True}
