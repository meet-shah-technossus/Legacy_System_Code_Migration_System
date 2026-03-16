"""
Enum definitions for the application.
Contains all state machines and categorizations.
"""

from enum import Enum


class JobType(str, Enum):
    """
    Migration job type.
    Job 1: Pick Basic → YAML (Human 1 reviews)
    Job 2: YAML → Target Language (Human 2 reviews)
    Direct: Pick Basic → Target Language in one shot (comparison mode)
    """
    YAML_CONVERSION = "YAML_CONVERSION"
    CODE_CONVERSION = "CODE_CONVERSION"
    DIRECT_CONVERSION = "DIRECT_CONVERSION"


class JobState(str, Enum):
    """
    Migration job state machine.
    Defines the lifecycle of a migration job.
    """
    CREATED = "CREATED"
    # Job 1 states
    YAML_GENERATED = "YAML_GENERATED"
    UNDER_REVIEW = "UNDER_REVIEW"
    REGENERATE_REQUESTED = "REGENERATE_REQUESTED"
    APPROVED = "APPROVED"
    APPROVED_WITH_COMMENTS = "APPROVED_WITH_COMMENTS"
    YAML_APPROVED_QUEUED = "YAML_APPROVED_QUEUED"  # Job 1 complete, waiting in queue for Job 2
    # Job 2 states
    CODE_GENERATED = "CODE_GENERATED"
    CODE_UNDER_REVIEW = "CODE_UNDER_REVIEW"
    CODE_REGENERATE_REQUESTED = "CODE_REGENERATE_REQUESTED"
    CODE_ACCEPTED = "CODE_ACCEPTED"
    COMPLETED = "COMPLETED"
    # Direct Conversion states (Pick Basic → Target Language, no YAML step)
    DIRECT_CODE_GENERATED = "DIRECT_CODE_GENERATED"
    DIRECT_CODE_UNDER_REVIEW = "DIRECT_CODE_UNDER_REVIEW"
    DIRECT_CODE_REGENERATE_REQUESTED = "DIRECT_CODE_REGENERATE_REQUESTED"
    DIRECT_CODE_ACCEPTED = "DIRECT_CODE_ACCEPTED"
    DIRECT_COMPLETED = "DIRECT_COMPLETED"


class ReviewDecision(str, Enum):
    """Review decision types."""
    # YAML review decisions
    REJECT_REGENERATE = "REJECT_REGENERATE"
    APPROVE = "APPROVE"
    APPROVE_WITH_COMMENTS = "APPROVE_WITH_COMMENTS"
    # Code review decisions (Job 2)
    CODE_APPROVE = "CODE_APPROVE"
    CODE_REJECT_REGENERATE = "CODE_REJECT_REGENERATE"
    # Direct conversion review decisions
    DIRECT_APPROVE = "DIRECT_APPROVE"
    DIRECT_REJECT_REGENERATE = "DIRECT_REJECT_REGENERATE"


class TargetLanguage(str, Enum):
    """Supported target languages for code generation."""
    PYTHON = "PYTHON"
    TYPESCRIPT = "TYPESCRIPT"
    JAVASCRIPT = "JAVASCRIPT"
    JAVA = "JAVA"
    CSHARP = "CSHARP"


class LLMProvider(str, Enum):
    """
    LLM provider selection.
    Stored on each job/code record so users can see which model produced each result.
    OPENAI  → OpenAI (gpt-4.1 by default)
    ANTHROPIC → Anthropic Claude (claude-opus-4-6 by default)
    """
    OPENAI = "OPENAI"
    ANTHROPIC = "ANTHROPIC"


class YAMLSectionType(str, Enum):
    """YAML document section types for targeted comments."""
    METADATA = "METADATA"
    PROGRAM_STRUCTURE = "PROGRAM_STRUCTURE"
    VARIABLES = "VARIABLES"
    FILE_OPERATIONS = "FILE_OPERATIONS"
    SUBROUTINES = "SUBROUTINES"
    BUSINESS_RULES = "BUSINESS_RULES"
    LOGIC_FLOW = "LOGIC_FLOW"
    GENERAL = "GENERAL"


class AuditAction(str, Enum):
    """Audit log action types."""
    # Job lifecycle
    JOB_CREATED = "JOB_CREATED"
    JOB_DELETED = "JOB_DELETED"
    JOB_COMPLETED = "JOB_COMPLETED"
    JOB2_CREATED = "JOB2_CREATED"  # Job 2 created from queue
    JOB_QUEUED = "JOB_QUEUED"      # Job 1 moved to queue
    
    # State transitions
    STATE_CHANGED = "STATE_CHANGED"
    
    # YAML operations
    YAML_GENERATED = "YAML_GENERATED"
    YAML_VALIDATED = "YAML_VALIDATED"
    YAML_VALIDATION_FAILED = "YAML_VALIDATION_FAILED"
    YAML_VERSION_CHANGED = "YAML_VERSION_CHANGED"
    
    # Review operations
    REVIEW_SUBMITTED = "REVIEW_SUBMITTED"
    REGENERATION_REQUESTED = "REGENERATION_REQUESTED"
    
    # Code generation
    CODE_GENERATED = "CODE_GENERATED"
    CODE_GENERATION_FAILED = "CODE_GENERATION_FAILED"

    # Code review
    CODE_REVIEW_SUBMITTED = "CODE_REVIEW_SUBMITTED"
    CODE_REGENERATION_REQUESTED = "CODE_REGENERATION_REQUESTED"
    CODE_ACCEPTED = "CODE_ACCEPTED"

    # Direct conversion
    DIRECT_CODE_GENERATED = "DIRECT_CODE_GENERATED"
    DIRECT_CODE_GENERATION_FAILED = "DIRECT_CODE_GENERATION_FAILED"
    DIRECT_CODE_REVIEW_SUBMITTED = "DIRECT_CODE_REVIEW_SUBMITTED"
    DIRECT_CODE_REGENERATION_REQUESTED = "DIRECT_CODE_REGENERATION_REQUESTED"
    DIRECT_CODE_ACCEPTED = "DIRECT_CODE_ACCEPTED"
    DIRECT_JOB_COMPLETED = "DIRECT_JOB_COMPLETED"

    # Line comments
    LINE_COMMENT_ADDED = "LINE_COMMENT_ADDED"

    # Error tracking
    ERROR_OCCURRED = "ERROR_OCCURRED"
    
    # System events
    SYSTEM_HEALTH_CHECK = "SYSTEM_HEALTH_CHECK"
