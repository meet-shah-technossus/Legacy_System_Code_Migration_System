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
        JobState.CREATED: {
            JobState.YAML_GENERATED,
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
            JobState.CODE_GENERATED,
        },
        JobState.APPROVED_WITH_COMMENTS: {
            JobState.CODE_GENERATED,
        },
        JobState.CODE_GENERATED: {
            JobState.COMPLETED,
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
        Migration Workflow:
        
        1. CREATED → YAML_GENERATED
           (Initial YAML generation)
           
        2. YAML_GENERATED → UNDER_REVIEW
           (Submit for human review)
           
        3a. UNDER_REVIEW → APPROVED
            (Accept YAML as-is)
            → CODE_GENERATED → COMPLETED
            
        3b. UNDER_REVIEW → APPROVED_WITH_COMMENTS
            (Accept with constraints)
            → CODE_GENERATED → COMPLETED
            
        3c. UNDER_REVIEW → REGENERATE_REQUESTED
            (Reject and request new version)
            → YAML_GENERATED → UNDER_REVIEW (loop)
        """
