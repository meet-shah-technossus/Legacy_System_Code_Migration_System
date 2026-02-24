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
        llm_model: Optional[str] = None,
        generation_time: Optional[float] = None
    ) -> AuditLog:
        """Log code generation event."""
        metadata = {
            "code_id": code_id,
            "target_language": target_language,
            "llm_model": llm_model
        }
        if generation_time is not None:
            metadata["generation_time_seconds"] = generation_time
            
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_GENERATED,
            description=f"Code generated in {target_language}",
            performed_by="LLM_AGENT_2",
            metadata=metadata
        )
    
    @staticmethod
    def log_code_generation_failed(
        db: Session,
        job_id: int,
        target_language: str,
        error_message: str,
        llm_model: Optional[str] = None
    ) -> AuditLog:
        """Log code generation failure."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_GENERATION_FAILED,
            description=f"Code generation failed for {target_language}: {error_message}",
            performed_by="LLM_AGENT_2",
            metadata={
                "target_language": target_language,
                "error": error_message,
                "llm_model": llm_model
            }
        )

    @staticmethod
    def log_code_review_submitted(
        db: Session,
        job_id: int,
        review_id: int,
        decision: str,
        reviewed_by: Optional[str] = None
    ) -> AuditLog:
        """Log code review submission event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_REVIEW_SUBMITTED,
            description=f"Code review submitted with decision: {decision}",
            performed_by=reviewed_by or "REVIEWER",
            metadata={"review_id": review_id, "decision": decision}
        )

    @staticmethod
    def log_code_regeneration_requested(
        db: Session,
        job_id: int,
        requested_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> AuditLog:
        """Log code regeneration request after reviewer rejection."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_REGENERATION_REQUESTED,
            description="Code regeneration requested by reviewer",
            performed_by=requested_by or "REVIEWER",
            metadata={"reason": reason} if reason else None
        )

    @staticmethod
    def log_code_accepted(
        db: Session,
        job_id: int,
        code_id: int,
        accepted_by: Optional[str] = None
    ) -> AuditLog:
        """Log code acceptance event (reviewer approved the generated code)."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.CODE_ACCEPTED,
            description="Generated code accepted by reviewer",
            performed_by=accepted_by or "REVIEWER",
            metadata={"code_id": code_id}
        )

    @staticmethod
    def log_job_queued(
        db: Session,
        job_id: int,
        queued_by: Optional[str] = None
    ) -> AuditLog:
        """Log Job 1 entering the queue after YAML approval (waiting for Job 2)."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.JOB_QUEUED,
            description="Job 1 YAML approved and placed in queue for Job 2 (code conversion)",
            performed_by=queued_by or "SYSTEM"
        )

    @staticmethod
    def log_job2_created(
        db: Session,
        job_id: int,
        parent_job_id: int,
        target_language: str,
        created_by: Optional[str] = None
    ) -> AuditLog:
        """Log Job 2 creation from a queued Job 1."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.JOB2_CREATED,
            description=f"Job 2 created from queued Job 1 #{parent_job_id} targeting {target_language}",
            performed_by=created_by or "SYSTEM",
            metadata={"parent_job_id": parent_job_id, "target_language": target_language}
        )

    @staticmethod
    def log_line_comment_added(
        db: Session,
        job_id: int,
        line_number: int,
        code_type: str,
        added_by: Optional[str] = None
    ) -> AuditLog:
        """Log a line-level inline comment being added during review."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.LINE_COMMENT_ADDED,
            description=f"Line comment added at line {line_number} of {code_type}",
            performed_by=added_by or "REVIEWER",
            metadata={"line_number": line_number, "code_type": code_type}
        )

    @staticmethod
    def log_job_deleted(
        db: Session,
        job_id: int,
        deleted_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> AuditLog:
        """Log job deletion event."""
        metadata = {"reason": reason} if reason else None
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.JOB_DELETED,
            description="Migration job deleted",
            performed_by=deleted_by or "SYSTEM",
            metadata=metadata
        )
    
    @staticmethod
    def log_yaml_version_changed(
        db: Session,
        job_id: int,
        old_version_id: int,
        new_version_id: int,
        changed_by: Optional[str] = None
    ) -> AuditLog:
        """Log YAML version change event."""
        return AuditService._create_log(
            db=db,
            job_id=job_id,
            action=AuditAction.YAML_VERSION_CHANGED,
            description=f"Active YAML version changed from {old_version_id} to {new_version_id}",
            performed_by=changed_by or "SYSTEM",
            metadata={
                "old_version_id": old_version_id,
                "new_version_id": new_version_id
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
    
    @staticmethod
    def get_audit_logs_by_action(
        db: Session,
        action: AuditAction,
        limit: int = 100,
        offset: int = 0
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific action type.
        
        Args:
            db: Database session
            action: Action type to filter by
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of audit logs ordered by timestamp (newest first)
        """
        return db.query(AuditLog)\
            .filter(AuditLog.action == action)\
            .order_by(AuditLog.timestamp.desc())\
            .limit(limit)\
            .offset(offset)\
            .all()
    
    @staticmethod
    def get_audit_logs_by_timerange(
        db: Session,
        start_time: datetime,
        end_time: datetime,
        job_id: Optional[int] = None,
        action: Optional[AuditAction] = None
    ) -> list[AuditLog]:
        """
        Get audit logs within a time range.
        
        Args:
            db: Database session
            start_time: Start of time range
            end_time: End of time range
            job_id: Optional job ID filter
            action: Optional action type filter
            
        Returns:
            List of audit logs ordered by timestamp
        """
        query = db.query(AuditLog).filter(
            AuditLog.timestamp >= start_time,
            AuditLog.timestamp <= end_time
        )
        
        if job_id is not None:
            query = query.filter(AuditLog.job_id == job_id)
        
        if action is not None:
            query = query.filter(AuditLog.action == action)
        
        return query.order_by(AuditLog.timestamp).all()
    
    @staticmethod
    def get_audit_logs_by_performer(
        db: Session,
        performed_by: str,
        limit: int = 100,
        offset: int = 0
    ) -> list[AuditLog]:
        """
        Get audit logs for a specific performer.
        
        Args:
            db: Database session
            performed_by: Who performed the actions
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of audit logs ordered by timestamp (newest first)
        """
        return db.query(AuditLog)\
            .filter(AuditLog.performed_by == performed_by)\
            .order_by(AuditLog.timestamp.desc())\
            .limit(limit)\
            .offset(offset)\
            .all()
    
    @staticmethod
    def get_error_logs(
        db: Session,
        job_id: Optional[int] = None,
        limit: int = 100
    ) -> list[AuditLog]:
        """
        Get error logs, optionally filtered by job.
        
        Args:
            db: Database session
            job_id: Optional job ID filter
            limit: Maximum number of results
            
        Returns:
            List of error logs ordered by timestamp (newest first)
        """
        query = db.query(AuditLog).filter(
            AuditLog.action.in_([
                AuditAction.ERROR_OCCURRED,
                AuditAction.YAML_VALIDATION_FAILED,
                AuditAction.CODE_GENERATION_FAILED
            ])
        )
        
        if job_id is not None:
            query = query.filter(AuditLog.job_id == job_id)
        
        return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    
    @staticmethod
    def get_recent_audit_logs(
        db: Session,
        limit: int = 50
    ) -> list[AuditLog]:
        """
        Get most recent audit logs across all jobs.
        
        Args:
            db: Database session
            limit: Maximum number of results
            
        Returns:
            List of audit logs ordered by timestamp (newest first)
        """
        return db.query(AuditLog)\
            .order_by(AuditLog.timestamp.desc())\
            .limit(limit)\
            .all()
