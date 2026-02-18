"""
Pydantic schemas for Code Generation.
Request/response models for code generation endpoints.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

from app.core.enums import TargetLanguage


# Request Schemas

class CodeGenerationRequest(BaseModel):
    """Schema for requesting code generation."""
    yaml_version_id: int = Field(..., description="Approved YAML version ID")
    target_language: Optional[TargetLanguage] = Field(None, description="Override target language")
    include_reviewer_comments: bool = Field(True, description="Apply reviewer constraints")
    custom_instructions: Optional[str] = Field(None, description="Additional generation instructions")


class CodeGenerationOptions(BaseModel):
    """Advanced options for code generation."""
    use_type_hints: bool = Field(True, description="Include type hints (Python/TypeScript)")
    include_documentation: bool = Field(True, description="Generate docstrings/comments")
    code_style: Optional[str] = Field("standard", description="Coding style preset")
    optimize_for: Optional[str] = Field("readability", description="readability or performance")


# Response Schemas

class OutputFileSchema(BaseModel):
    """Schema for a single output file."""
    filename: str = Field(..., description="Output filename")
    content: str = Field(..., description="File content")
    file_type: str = Field(..., description="File type/extension")
    description: Optional[str] = Field(None, description="Purpose of this file")


class GeneratedCodeResponse(BaseModel):
    """Response schema for generated code."""
    id: int
    job_id: int
    yaml_version_id: Optional[int]
    code_content: str
    target_language: str
    estimated_lines_of_code: Optional[int]
    generated_at: datetime
    llm_model_used: Optional[str]
    
    model_config = {"from_attributes": True}


class GeneratedCodeWithFiles(BaseModel):
    """Response schema including multi-file output."""
    id: int
    job_id: int
    yaml_version_id: Optional[int]
    code_content: str
    target_language: str
    output_files: Optional[List[Dict[str, Any]]] = None
    estimated_lines_of_code: Optional[int]
    complexity_score: Optional[int]
    llm_model_used: Optional[str]
    llm_tokens_used: Optional[int]
    generation_time_seconds: Optional[int]
    generated_at: datetime
    
    model_config = {"from_attributes": True}


class CodeGenerationSummary(BaseModel):
    """Condensed code generation summary."""
    id: int
    job_id: int
    target_language: str
    estimated_lines_of_code: Optional[int]
    generated_at: datetime
    
    model_config = {"from_attributes": True}
