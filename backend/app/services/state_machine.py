"""
State Machine validation logic.
Enforces valid state transitions for migration jobs.
"""

from typing import Dict, Set, Optional, TYPE_CHECKING
from app.core.enums import JobState

if TYPE_CHECKING:
    from app.core.enums import JobType


class StateMachine:
    """
    State machine for migration job workflow.
    Defines and validates all allowed state transitions.
    """
    
    # Define valid state transitions
    # Key: current state, Value: set of allowed next states
    VALID_TRANSITIONS: Dict[JobState, Set[JobState]] = {
        # ── Job 1: Pick Basic → YAML ─────────────────────────────────────────
        JobState.CREATED: {
            JobState.YAML_GENERATED,          # Job 1: YAML generation starts
            JobState.CODE_GENERATED,          # Job 2: code generation starts immediately
            JobState.DIRECT_CODE_GENERATED,   # Direct Conversion: skip YAML, go straight to code
        },
        JobState.YAML_GENERATED: {
            JobState.UNDER_REVIEW,
        },
        JobState.UNDER_REVIEW: {
            JobState.REGENERATE_REQUESTED,
            JobState.APPROVED,
            JobState.APPROVED_WITH_COMMENTS,
        },
        JobState.REGENERATE_REQUESTED: {
            JobState.YAML_GENERATED,  # Loop back to regenerate
            JobState.UNDER_REVIEW,    # Cancel the regeneration request — return to review
        },
        JobState.APPROVED: {
            JobState.YAML_APPROVED_QUEUED,  # Job 1 complete — wait in queue for Job 2
        },
        JobState.APPROVED_WITH_COMMENTS: {
            JobState.YAML_APPROVED_QUEUED,  # Job 1 complete — wait in queue for Job 2
        },
        JobState.YAML_APPROVED_QUEUED: set(),  # Terminal for Job 1 — Job 2 is a new separate job

        # ── Job 2: YAML → Target Language ────────────────────────────────────
        JobState.CODE_GENERATED: {
            JobState.CODE_UNDER_REVIEW,
        },
        JobState.CODE_UNDER_REVIEW: {
            JobState.CODE_REGENERATE_REQUESTED,
            JobState.CODE_ACCEPTED,
        },
        JobState.CODE_REGENERATE_REQUESTED: {
            JobState.CODE_GENERATED,      # Loop back to regenerate
            JobState.CODE_UNDER_REVIEW,   # Cancel the regeneration request — return to review
        },
        JobState.CODE_ACCEPTED: {
            JobState.COMPLETED,
            JobState.CODE_UNDER_REVIEW,  # Allow restoring/reviewing after acceptance
        },
        JobState.COMPLETED: set(),  # Terminal state - no transitions allowed

        # ── Direct Conversion: Pick Basic → Code (no YAML step) ──────────────
        JobState.DIRECT_CODE_GENERATED: {
            JobState.DIRECT_CODE_UNDER_REVIEW,
        },
        JobState.DIRECT_CODE_UNDER_REVIEW: {
            JobState.DIRECT_CODE_REGENERATE_REQUESTED,
            JobState.DIRECT_CODE_ACCEPTED,
        },
        JobState.DIRECT_CODE_REGENERATE_REQUESTED: {
            JobState.DIRECT_CODE_GENERATED,     # Loop back to regenerate
            JobState.DIRECT_CODE_UNDER_REVIEW,  # Cancel the regeneration request — return to review
        },
        JobState.DIRECT_CODE_ACCEPTED: {
            JobState.DIRECT_COMPLETED,
            JobState.DIRECT_CODE_UNDER_REVIEW,  # Allow re-review after acceptance
        },
        JobState.DIRECT_COMPLETED: set(),  # Terminal state
    }
    
    @classmethod
    def can_transition(cls, current_state: JobState, new_state: JobState) -> bool:
        """
        Check if a state transition is valid.
        
        Args:
            current_state: Current job state
            new_state: Desired new state
            
        Returns:
            True if transition is allowed, False otherwise
        """
        allowed_states = cls.VALID_TRANSITIONS.get(current_state, set())
        return new_state in allowed_states
    
    @classmethod
    def get_allowed_transitions(cls, current_state: JobState) -> Set[JobState]:
        """
        Get all valid next states from current state (not job-type filtered).
        """
        return cls.VALID_TRANSITIONS.get(current_state, set())

    @classmethod
    def get_allowed_transitions_for_job(
        cls,
        current_state: JobState,
        job_type: 'JobType',
    ) -> Set[JobState]:
        """
        Get valid next states filtered by job type.

        The CREATED state shares three possible first transitions across all job
        types (YAML_GENERATED, CODE_GENERATED, DIRECT_CODE_GENERATED).  This
        method limits the result to the single transition that is valid for the
        concrete job type so the UI only ever shows the right options.
        """
        from app.core.enums import JobType  # local import to avoid circular
        all_allowed = cls.VALID_TRANSITIONS.get(current_state, set())
        if current_state != JobState.CREATED:
            return all_allowed
        # CREATED: filter to the first step specific to this job type
        if job_type == JobType.YAML_CONVERSION:
            return {JobState.YAML_GENERATED}
        if job_type == JobType.CODE_CONVERSION:
            return {JobState.CODE_GENERATED}
        if job_type == JobType.DIRECT_CONVERSION:
            return {JobState.DIRECT_CODE_GENERATED}
        return all_allowed
    
    @classmethod
    def validate_transition(
        cls, 
        current_state: JobState, 
        new_state: JobState
    ) -> tuple[bool, Optional[str]]:
        """
        Validate a state transition and provide error message if invalid.
        
        Args:
            current_state: Current job state
            new_state: Desired new state
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if current_state == new_state:
            return False, f"Job is already in state {current_state.value}"
        
        if current_state == JobState.COMPLETED:
            return False, "Cannot transition from COMPLETED state - job is finished"
        
        if current_state == JobState.DIRECT_COMPLETED:
            return False, "Cannot transition from DIRECT_COMPLETED state - job is finished"
        
        if cls.can_transition(current_state, new_state):
            return True, None
        
        allowed = cls.get_allowed_transitions(current_state)
        if allowed:
            allowed_list = ", ".join([s.value for s in allowed])
            return False, (
                f"Invalid transition from {current_state.value} to {new_state.value}. "
                f"Allowed transitions: {allowed_list}"
            )
        else:
            return False, f"No transitions allowed from {current_state.value}"
    
    @classmethod
    def is_terminal_state(cls, state: JobState) -> bool:
        """Check if a state is terminal (no further transitions)."""
        return len(cls.VALID_TRANSITIONS.get(state, set())) == 0
    
    @classmethod
    def get_workflow_path(cls) -> str:
        """
        Get a human-readable description of the workflow.
        
        Returns:
            String describing the complete workflow
        """
        return """
        Migration Workflow (Two-Job Architecture):

        ── JOB 1: Pick Basic → YAML (Human 1 reviews) ──────────────────────

        1. CREATED → YAML_GENERATED
           (YAML generation by Agent 1)

        2. YAML_GENERATED → UNDER_REVIEW
           (Submit for Human 1 review)

        3a. UNDER_REVIEW → APPROVED / APPROVED_WITH_COMMENTS
            → YAML_APPROVED_QUEUED  (Job 1 complete, waiting in queue)

        3b. UNDER_REVIEW → REGENERATE_REQUESTED
            → YAML_GENERATED → UNDER_REVIEW (loop)

        ── JOB 2: YAML → Target Language (Human 2 reviews) ──────────────────

        1. CREATED → CODE_GENERATED
           (Human 2 picks from queue, selects target language, Agent 2 generates code)

        2. CODE_GENERATED → CODE_UNDER_REVIEW
           (Auto-submit for Human 2 review)

        3a. CODE_UNDER_REVIEW → CODE_ACCEPTED
            → COMPLETED

        3b. CODE_UNDER_REVIEW → CODE_REGENERATE_REQUESTED
            → CODE_GENERATED → CODE_UNDER_REVIEW (loop)
        """
