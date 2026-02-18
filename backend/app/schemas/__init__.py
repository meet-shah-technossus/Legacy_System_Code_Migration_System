"""
Pydantic schemas package.
All request/response schemas for API validation.
"""

from app.schemas.job import (
    MigrationJobCreate,
    MigrationJobUpdate,
    MigrationJobResponse,
    MigrationJobSummary,
    MigrationJobWithSource,
    JobStateTransition,
)
from app.schemas.review import (
    ReviewCommentCreate,
    ReviewSubmit,
    RegenerationRequest,
    ReviewCommentResponse,
    ReviewResponse,
    ReviewSummary,
)
from app.schemas.code import (
    CodeGenerationRequest,
    CodeGenerationOptions,
    OutputFileSchema,
    GeneratedCodeResponse,
    GeneratedCodeWithFiles,
    CodeGenerationSummary,
)
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    YAMLMetadata,
    ProgramStructure,
    VariableDeclaration,
    LogicFlowNode,
    FileOperation,
    SubroutineInfo,
    YAMLVersionResponse,
    YAMLVersionSummary,
    YAMLGenerationRequest,
)

__all__ = [
    # Job schemas
    "MigrationJobCreate",
    "MigrationJobUpdate",
    "MigrationJobResponse",
    "MigrationJobSummary",
    "MigrationJobWithSource",
    "JobStateTransition",
    # Review schemas
    "ReviewCommentCreate",
    "ReviewSubmit",
    "RegenerationRequest",
    "ReviewCommentResponse",
    "ReviewResponse",
    "ReviewSummary",
    # Code schemas
    "CodeGenerationRequest",
    "CodeGenerationOptions",
    "OutputFileSchema",
    "GeneratedCodeResponse",
    "GeneratedCodeWithFiles",
    "CodeGenerationSummary",
    # YAML schemas
    "PickBasicYAMLSchema",
    "YAMLMetadata",
    "ProgramStructure",
    "VariableDeclaration",
    "LogicFlowNode",
    "FileOperation",
    "SubroutineInfo",
    "YAMLVersionResponse",
    "YAMLVersionSummary",
    "YAMLGenerationRequest",
]
