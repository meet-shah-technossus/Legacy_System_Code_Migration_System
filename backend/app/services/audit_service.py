"""
Audit service for tracking all job events and state transitions.
Provides complete traceability for governance and debugging.
"""

from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import json

from app.models.audit import AuditLog
from app.core.enums import AuditAction, JobState


class AuditService:
    """
    Service for creating audit log entries.
    Every significant action should be audited.
    """
    
    @staticmethod
    def log_job_created(
        db: Session,
        job_id: int,
        created_by: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> AuditLog:
        """Log job creation event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.JOB_CREATED,
            description="Migration job created",
            performed_by=created_by or "SYSTEM",
            metadata=metadata
        )
    
    @staticmethod
    def log_state_change(
        db: Session,
        job_id: int,
        old_state: JobState,
        new_state: JobState,
        performed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> AuditLog:
        """Log state transition event."""
        metadata = {"reason": reason} if reason else None
        
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.STATE_CHANGED,
            description=f"State changed from {old_state.value} to {new_state.value}",
            old_state=old_state.value,
            new_state=new_state.value,
            performed_by=performed_by or "SYSTEM",
            metadata=metadata
        )
    
    @staticmethod
    def log_yaml_generated(
        db: Session,
        job_id: int,
        yaml_version_id: int,
        version_number: int,
        llm_model: Optional[str] = None,
        generation_time: Optional[int] = None
    ) -> AuditLog:
        """Log YAML generation event."""
        metadata = {
            "yaml_version_id": yaml_version_id,
            "version_number": version_number,
            "llm_model": llm_model,
            "generation_time_seconds": generation_time
        }
        
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.YAML_GENERATED,
            description=f"YAML version {version_number} generated",
            performed_by="LLM_AGENT_1",
            metadata=metadata
        )
    
    @staticmethod
    def log_yaml_validated(
        db: Session,
        job_id: int,
        yaml_version_id: int,
        is_valid: bool
    ) -> AuditLog:
        """Log YAML validation result."""
        action = AuditAction.YAML_VALIDATED if is_valid else AuditAction.YAML_VALIDATION_FAILED
        description = "YAML validation passed" if is_valid else "YAML validation failed"
        
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=action,
            description=description,
            performed_by="VALIDATOR",
            metadata={"yaml_version_id": yaml_version_id, "is_valid": is_valid}
        )
    
    @staticmethod
    def log_review_submitted(
        db: Session,
        job_id: int,
        review_id: int,
        decision: str,
        reviewed_by: Optional[str] = None
    ) -> AuditLog:
        """Log review submission event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.REVIEW_SUBMITTED,
            description=f"Review submitted with decision: {decision}",
            performed_by=reviewed_by or "REVIEWER",
            metadata={"review_id": review_id, "decision": decision}
        )
    
    @staticmethod
    def log_regeneration_requested(
        db: Session,
        job_id: int,
        requested_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> AuditLog:
        """Log YAML regeneration request."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.REGENERATION_REQUESTED,
            description="YAML regeneration requested",
            performed_by=requested_by or "REVIEWER",
            metadata={"reason": reason} if reason else None
        )
    
    @staticmethod
    def log_code_generated(
        db: Session,
        job_id: int,
        code_id: int,
        target_language: str,
        llm_model: Optional[str] = None
    ) -> AuditLog:
        """Log code generation event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_GENERATED,
            description=f"Code generated in {target_language}",
            performed_by="LLM_AGENT_2",
            metadata={
                "code_id": code_id,
                "target_language": target_language,
                "llm_model": llm_model
            }
        )
    
    @staticmethod
    def log_job_completed(
        db: Session,
        job_id: int,
        performed_by: Optional[str] = None
    ) -> AuditLog:
        """Log job completion event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.JOB_COMPLETED,
            description="Migration job completed successfully",
            performed_by=performed_by or "SYSTEM"
        )
    
    @staticmethod
    def log_error(
        db: Session,
        job_id: int,
        error_message: str,
        error_context: Optional[dict] = None
    ) -> AuditLog:
        """Log error event."""
        metadata = {"error": error_message}
        if error_context:
            metadata.update(error_context)
        
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.ERROR_OCCURRED,
            description=f"Error: {error_message}",
            performed_by="SYSTEM",
            metadata=metadata
        )
    
    @staticmethod
    def _create_log(
        db: Session,
        job_id: int,
        action: AuditAction,
        description: str,
        performed_by: str = "SYSTEM",
        old_state: Optional[str] = None,
        new_state: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> AuditLog:
        """
        Internal method to create audit log entry.
        
        Args:
            db: Database session
            job_id: Job ID
            action: Audit action type
            description: Human-readable description
            performed_by: Who/what performed the action
            old_state: Previous state (for state transitions)
            new_state: New state (for state transitions)
            metadata: Additional context as dict
            
        Returns:
            Created AuditLog instance
        """
        audit_log = AuditLog(
            job_id=job_id,
            action=action,
            description=description,
            old_state=old_state,
            new_state=new_state,
            performed_by=performed_by,
            metadata_json=json.dumps(metadata) if metadata else None,
            timestamp=datetime.utcnow()
        )
        
        db.add(audit_log)
        db.commit()
        db.refresh(audit_log)
        
        return audit_log
    
    @staticmethod
    def get_job_audit_trail(db: Session, job_id: int) -> list[AuditLog]:
        """
        Get complete audit trail for a job.
        
        Args:
            db: Database session
            job_id: Job ID
            
        Returns:
            List of audit logs ordered by timestamp
        """
        return db.query(AuditLog)\
            .filter(AuditLog.job_id == job_id)\
            .order_by(AuditLog.timestamp)\
            .all()
