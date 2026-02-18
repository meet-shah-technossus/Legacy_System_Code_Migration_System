"""
Enum definitions for the application.
Contains all state machines and categorizations.
"""

from enum import Enum


class JobState(str, Enum):
    """
    Migration job state machine.
    Defines the lifecycle of a migration job.
    """
    CREATED = "CREATED"
    YAML_GENERATED = "YAML_GENERATED"
    UNDER_REVIEW = "UNDER_REVIEW"
    REGENERATE_REQUESTED = "REGENERATE_REQUESTED"
    APPROVED = "APPROVED"
    APPROVED_WITH_COMMENTS = "APPROVED_WITH_COMMENTS"
    CODE_GENERATED = "CODE_GENERATED"
    COMPLETED = "COMPLETED"


class ReviewDecision(str, Enum):
    """Review decision types."""
    REJECT_REGENERATE = "REJECT_REGENERATE"
    APPROVE = "APPROVE"
    APPROVE_WITH_COMMENTS = "APPROVE_WITH_COMMENTS"


class TargetLanguage(str, Enum):
    """Supported target languages for code generation."""
    PYTHON = "PYTHON"
    TYPESCRIPT = "TYPESCRIPT"
    JAVASCRIPT = "JAVASCRIPT"
    JAVA = "JAVA"
    CSHARP = "CSHARP"


class YAMLSectionType(str, Enum):
    """YAML document section types for targeted comments."""
    METADATA = "METADATA"
    PROGRAM_STRUCTURE = "PROGRAM_STRUCTURE"
    VARIABLES = "VARIABLES"
    LOGIC_FLOW = "LOGIC_FLOW"
    FILE_OPERATIONS = "FILE_OPERATIONS"
    SUBROUTINES = "SUBROUTINES"
    GENERAL = "GENERAL"


class AuditAction(str, Enum):
    """Audit log action types."""
    JOB_CREATED = "JOB_CREATED"
    STATE_CHANGED = "STATE_CHANGED"
    YAML_GENERATED = "YAML_GENERATED"
    YAML_VALIDATED = "YAML_VALIDATED"
    YAML_VALIDATION_FAILED = "YAML_VALIDATION_FAILED"
    REVIEW_SUBMITTED = "REVIEW_SUBMITTED"
    REGENERATION_REQUESTED = "REGENERATION_REQUESTED"
    CODE_GENERATED = "CODE_GENERATED"
    JOB_COMPLETED = "JOB_COMPLETED"
    ERROR_OCCURRED = "ERROR_OCCURRED"
