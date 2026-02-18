"""
Pydantic schemas for Review workflows.
Request/response models for YAML review endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from app.core.enums import ReviewDecision, YAMLSectionType


# Request Schemas

class ReviewCommentCreate(BaseModel):
    """Schema for creating a review comment."""
    section_type: YAMLSectionType = Field(..., description="YAML section this comment applies to")
    section_path: Optional[str] = Field(None, max_length=500, description="Specific path in YAML (e.g., 'logic_flow[0]')")
    comment_text: str = Field(..., min_length=1, description="The actual comment")
    is_blocking: bool = Field(False, description="Whether this comment blocks approval")
    severity: Optional[str] = Field(None, description="critical, warning, or suggestion")


class ReviewSubmit(BaseModel):
    """Schema for submitting a complete review."""
    yaml_version_id: int = Field(..., description="YAML version being reviewed")
    decision: ReviewDecision = Field(..., description="Review decision")
    general_comment: Optional[str] = Field(None, description="Overall feedback")
    comments: List[ReviewCommentCreate] = Field(default_factory=list, description="Section-specific comments")
    reviewed_by: Optional[str] = Field(None, max_length=100, description="Reviewer identifier")


class RegenerationRequest(BaseModel):
    """Schema for requesting YAML regeneration with context."""
    include_previous_comments: bool = Field(True, description="Include comments from last review")
    additional_instructions: Optional[str] = Field(None, description="Additional guidance for regeneration")


# Response Schemas

class ReviewCommentResponse(BaseModel):
    """Response schema for a review comment."""
    id: int
    section_type: YAMLSectionType
    section_path: Optional[str]
    comment_text: str
    is_blocking: bool
    severity: Optional[str]
    created_at: datetime
    
    model_config = {"from_attributes": True}


class ReviewResponse(BaseModel):
    """Response schema for a review."""
    id: int
    job_id: int
    yaml_version_id: int
    decision: ReviewDecision
    general_comment: Optional[str]
    reviewed_by: Optional[str]
    reviewed_at: datetime
    comments: List[ReviewCommentResponse] = []
    
    model_config = {"from_attributes": True}


class ReviewSummary(BaseModel):
    """Condensed review summary."""
    id: int
    yaml_version_id: int
    decision: ReviewDecision
    reviewed_by: Optional[str]
    reviewed_at: datetime
    comments_count: int = 0
    
    model_config = {"from_attributes": True}
