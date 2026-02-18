"""
Job Manager Service.
Handles all migration job CRUD operations and state management.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional, List
from fastapi import HTTPException, status

from app.models.job import MigrationJob
from app.schemas.job import MigrationJobCreate, MigrationJobUpdate
from app.core.enums import JobState, TargetLanguage
from app.services.state_machine import StateMachine
from app.services.audit_service import AuditService


class JobManager:
    """
    Service for managing migration jobs.
    Handles creation, updates, state transitions, and queries.
    """
    
    @staticmethod
    def create_job(db: Session, job_data: MigrationJobCreate) -> MigrationJob:
        """
        Create a new migration job.
        
        Args:
            db: Database session
            job_data: Job creation data
            
        Returns:
            Created MigrationJob instance
        """
        # Create job with initial state
        job = MigrationJob(
            job_name=job_data.job_name,
            description=job_data.description,
            original_source_code=job_data.original_source_code,
            source_filename=job_data.source_filename,
            pick_basic_version=job_data.pick_basic_version,
            target_language=job_data.target_language,
            current_state=JobState.CREATED,
            created_by=job_data.created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(job)
        db.commit()
        db.refresh(job)
        
        # Audit log
        AuditService.log_job_created(
            db=db,
            job_id=job.id,
            created_by=job_data.created_by,
            metadata={
                "target_language": job_data.target_language.value,
                "source_filename": job_data.source_filename
            }
        )
        
        return job
    
    @staticmethod
    def get_job(db: Session, job_id: int) -> Optional[MigrationJob]:
        """
        Get a job by ID.
        
        Args:
            db: Database session
            job_id: Job ID
            
        Returns:
            MigrationJob instance or None
        """
        return db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
    
    @staticmethod
    def get_job_or_404(db: Session, job_id: int) -> MigrationJob:
        """
        Get a job by ID or raise 404 error.
        
        Args:
            db: Database session
            job_id: Job ID
            
        Returns:
            MigrationJob instance
            
        Raises:
            HTTPException: If job not found
        """
        job = JobManager.get_job(db, job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job with id {job_id} not found"
            )
        return job
    
    @staticmethod
    def list_jobs(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        state: Optional[JobState] = None,
        target_language: Optional[TargetLanguage] = None
    ) -> List[MigrationJob]:
        """
        List jobs with optional filters.
        
        Args:
            db: Database session
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            state: Filter by job state
            target_language: Filter by target language
            
        Returns:
            List of MigrationJob instances
        """
        query = db.query(MigrationJob)
        
        if state:
            query = query.filter(MigrationJob.current_state == state)
        
        if target_language:
            query = query.filter(MigrationJob.target_language == target_language)
        
        return query.order_by(MigrationJob.created_at.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
    
    @staticmethod
    def count_jobs(
        db: Session,
        state: Optional[JobState] = None,
        target_language: Optional[TargetLanguage] = None
    ) -> int:
        """
        Count jobs with optional filters.
        
        Args:
            db: Database session
            state: Filter by job state
            target_language: Filter by target language
            
        Returns:
            Total count
        """
        query = db.query(func.count(MigrationJob.id))
        
        if state:
            query = query.filter(MigrationJob.current_state == state)
        
        if target_language:
            query = query.filter(MigrationJob.target_language == target_language)
        
        return query.scalar()
    
    @staticmethod
    def update_job(
        db: Session,
        job_id: int,
        update_data: MigrationJobUpdate
    ) -> MigrationJob:
        """
        Update job metadata (not state).
        
        Args:
            db: Database session
            job_id: Job ID
            update_data: Fields to update
            
        Returns:
            Updated MigrationJob instance
        """
        job = JobManager.get_job_or_404(db, job_id)
        
        # Update only provided fields
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(job, field, value)
        
        job.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(job)
        
        return job
    
    @staticmethod
    def transition_state(
        db: Session,
        job_id: int,
        new_state: JobState,
        performed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> MigrationJob:
        """
        Transition job to a new state with validation.
        
        Args:
            db: Database session
            job_id: Job ID
            new_state: Target state
            performed_by: Who is performing the transition
            reason: Optional reason for transition
            
        Returns:
            Updated MigrationJob instance
            
        Raises:
            HTTPException: If transition is invalid
        """
        job = JobManager.get_job_or_404(db, job_id)
        
        # Validate transition
        is_valid, error_message = StateMachine.validate_transition(
            job.current_state,
            new_state
        )
        
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_message
            )
        
        # Perform transition
        old_state = job.current_state
        job.current_state = new_state
        job.updated_at = datetime.utcnow()
        
        # Set completion timestamp if transitioning to COMPLETED
        if new_state == JobState.COMPLETED:
            job.completed_at = datetime.utcnow()
        
        db.commit()
        db.refresh(job)
        
        # Audit log
        AuditService.log_state_change(
            db=db,
            job_id=job_id,
            old_state=old_state,
            new_state=new_state,
            performed_by=performed_by,
            reason=reason
        )
        
        return job
    
    @staticmethod
    def delete_job(db: Session, job_id: int) -> None:
        """
        Delete a job (cascade deletes all related data).
        
        Args:
            db: Database session
            job_id: Job ID
            
        Raises:
            HTTPException: If job not found
        """
        job = JobManager.get_job_or_404(db, job_id)
        
        db.delete(job)
        db.commit()
    
    @staticmethod
    def get_job_statistics(db: Session) -> dict:
        """
        Get overall job statistics.
        
        Returns:
            Dictionary with statistics
        """
        total = db.query(func.count(MigrationJob.id)).scalar()
        
        # Count by state
        state_counts = {}
        for state in JobState:
            count = db.query(func.count(MigrationJob.id))\
                .filter(MigrationJob.current_state == state)\
                .scalar()
            state_counts[state.value] = count
        
        # Count by language
        language_counts = {}
        for lang in TargetLanguage:
            count = db.query(func.count(MigrationJob.id))\
                .filter(MigrationJob.target_language == lang)\
                .scalar()
            language_counts[lang.value] = count
        
        return {
            "total_jobs": total,
            "by_state": state_counts,
            "by_language": language_counts
        }
