"""
State Machine validation logic.
Enforces valid state transitions for migration jobs.
"""

from typing import Dict, Set, Optional
from app.core.enums import JobState


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
            JobState.YAML_GENERATED,   # Job 1: YAML generation starts
            JobState.CODE_GENERATED,   # Job 2: code generation starts immediately
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
            JobState.CODE_GENERATED,  # Loop back to regenerate
        },
        JobState.CODE_ACCEPTED: {
            JobState.COMPLETED,
            JobState.CODE_UNDER_REVIEW,  # Allow restoring/reviewing after acceptance
        },
        JobState.COMPLETED: set(),  # Terminal state - no transitions allowed
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
        Get all valid next states from current state.
        
        Args:
            current_state: Current job state
            
        Returns:
            Set of allowed next states
        """
        return cls.VALID_TRANSITIONS.get(current_state, set())
    
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
