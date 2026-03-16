"""
Job Manager Service.
Handles all migration job CRUD operations and state management.
"""

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime
from typing import Optional, List
from fastapi import HTTPException, status

from app.models.job import MigrationJob
from app.schemas.job import MigrationJobCreate, MigrationJobUpdate, Job2Create, DirectJobCreate
from app.core.enums import JobState, JobType, TargetLanguage
from app.core.config import settings
from app.core.exceptions import JobNotFoundException, to_http_exception
from app.core.utils import apply_pagination, get_or_404
from app.services.state_machine import StateMachine
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService


class JobManager:
    """
    Service for managing migration jobs.
    Handles creation, updates, state transitions, and queries.
    """
    
    @staticmethod
    def create_job(db: Session, job_data: MigrationJobCreate) -> MigrationJob:
        """
        Create a new Job 1 (Pick Basic → YAML).
        Target language is NOT required here — that belongs to Job 2.
        """
        job = MigrationJob(
            job_type=JobType.YAML_CONVERSION,
            job_name=job_data.job_name,
            description=job_data.description,
            original_source_code=job_data.original_source_code,
            source_filename=job_data.source_filename,
            pick_basic_version=job_data.pick_basic_version,
            target_language=None,  # Not set for Job 1
            current_state=JobState.CREATED,
            created_by=job_data.created_by,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            yaml_llm_provider=job_data.yaml_llm_provider.value if job_data.yaml_llm_provider else None,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        AuditService.log_job_created(
            db=db,
            job_id=job.id,
            created_by=job_data.created_by,
            metadata={"job_type": "YAML_CONVERSION", "source_filename": job_data.source_filename}
        )
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.JOB_CREATED,
            job_id=job.id,
            tags={"job_type": "YAML_CONVERSION"}
        )
        return job

    @staticmethod
    def create_direct_job(db: Session, job_data: "DirectJobCreate") -> MigrationJob:
        """Create a new DIRECT_CONVERSION job (Pick Basic → Target Language in one step)."""
        job = MigrationJob(
            job_type=JobType.DIRECT_CONVERSION,
            job_name=job_data.job_name or f"Direct → {job_data.target_language.value} ({job_data.source_filename or 'source'})",
            description=job_data.description,
            original_source_code=job_data.original_source_code,
            source_filename=job_data.source_filename,
            pick_basic_version=job_data.pick_basic_version,
            target_language=job_data.target_language,
            current_state=JobState.CREATED,
            created_by=job_data.created_by,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            # Persist the requested LLM provider so Direct Studio re-uses it
            # automatically — user should never have to re-select it
            code_llm_provider=job_data.llm_provider.value if job_data.llm_provider else None,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        AuditService.log_job_created(
            db=db,
            job_id=job.id,
            created_by=job_data.created_by,
            metadata={
                "job_type": "DIRECT_CONVERSION",
                "target_language": job_data.target_language.value,
                "source_filename": job_data.source_filename,
                "llm_provider": job_data.llm_provider.value,
            },
        )
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.JOB_CREATED,
            job_id=job.id,
            tags={"job_type": "DIRECT_CONVERSION"},
        )
        return job

    @staticmethod
    def create_job2(db: Session, job_data: Job2Create) -> MigrationJob:
        """
        Create a new Job 2 (YAML → Target Language).
        Picks an approved YAML from the queue and links it to the parent Job 1.
        """
        # Validate parent job exists and is in the queue
        parent = db.query(MigrationJob).filter(
            MigrationJob.id == job_data.parent_job_id
        ).first()

        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent job {job_data.parent_job_id} not found"
            )
        if parent.current_state != JobState.YAML_APPROVED_QUEUED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Parent job {job_data.parent_job_id} is not in the queue. "
                    f"Current state: {parent.current_state.value}"
                )
            )

        job = MigrationJob(
            job_type=JobType.CODE_CONVERSION,
            parent_job_id=job_data.parent_job_id,
            job_name=job_data.job_name or f"Code Conversion → {job_data.target_language.value} (from Job {job_data.parent_job_id})",
            description=job_data.description,
            original_source_code=None,  # Job 2 uses parent's YAML, not Pick Basic
            source_filename=parent.source_filename,  # carry forward for display
            target_language=job_data.target_language,
            current_state=JobState.CREATED,
            created_by=job_data.created_by,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        AuditService.log_job_created(
            db=db,
            job_id=job.id,
            created_by=job_data.created_by,
            metadata={
                "job_type": "CODE_CONVERSION",
                "parent_job_id": job_data.parent_job_id,
                "target_language": job_data.target_language.value
            }
        )
        AuditService.log_job2_created(
            db=db,
            job_id=job.id,
            parent_job_id=job_data.parent_job_id,
            target_language=job_data.target_language.value,
            created_by=job_data.created_by
        )
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.JOB_CREATED,
            job_id=job.id,
            tags={"job_type": "CODE_CONVERSION", "target_language": job_data.target_language.value}
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
    def get_job_or_404(db: Session, job_id: int, eager_load: bool = False) -> MigrationJob:
        """
        Get a job by ID or raise 404 error.
        
        Args:
            db: Database session
            job_id: Job ID
            eager_load: If True, eagerly load related YAML versions and reviews
            
        Returns:
            MigrationJob instance
            
        Raises:
            HTTPException: If job not found
        """
        query = db.query(MigrationJob).filter(MigrationJob.id == job_id)
        
        if eager_load:
            query = query.options(
                joinedload(MigrationJob.yaml_versions),
                joinedload(MigrationJob.generated_codes)
            )
        
        job = query.first()
        
        if not job:
            raise to_http_exception(JobNotFoundException(job_id))
        
        return job
    
    @staticmethod
    def list_jobs(
        db: Session,
        skip: Optional[int] = None,
        limit: Optional[int] = None,
        state: Optional[JobState] = None,
        target_language: Optional[TargetLanguage] = None,
        job_type: Optional[JobType] = None,
        created_by: Optional[str] = None,
    ) -> List[MigrationJob]:
        """List jobs with optional filters."""
        query = db.query(MigrationJob)

        if state:
            query = query.filter(MigrationJob.current_state == state)
        if target_language:
            query = query.filter(MigrationJob.target_language == target_language)
        if job_type:
            query = query.filter(MigrationJob.job_type == job_type)
        if created_by:
            query = query.filter(MigrationJob.created_by == created_by)

        query = query.order_by(MigrationJob.created_at.desc())
        query = apply_pagination(query, skip, limit)
        return query.all()

    @staticmethod
    def get_queued_jobs(db: Session) -> List[MigrationJob]:
        """Return all Job 1s waiting in the queue (YAML_APPROVED_QUEUED),
        i.e. approved but not yet picked up for Job 2."""
        return (
            db.query(MigrationJob)
            .filter(MigrationJob.current_state == JobState.YAML_APPROVED_QUEUED)
            .order_by(MigrationJob.updated_at.asc())  # oldest first — fair queue
            .all()
        )

    @staticmethod
    def get_parent_job(db: Session, job_id: int) -> MigrationJob:
        """Return the parent Job 1 for a given Job 2."""
        job = JobManager.get_job_or_404(db, job_id)
        if not job.parent_job_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} has no parent job (it is a standalone Job 1)"
            )
        parent = db.query(MigrationJob).filter(
            MigrationJob.id == job.parent_job_id
        ).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent job {job.parent_job_id} not found"
            )
        return parent
    
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
        
        job.updated_at = datetime.now()
        
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
        job.updated_at = datetime.now()
        
        # Set completion timestamp if transitioning to COMPLETED
        if new_state == JobState.COMPLETED:
            job.completed_at = datetime.now()
            lang_tag = job.target_language.value if job.target_language else "N/A"

            # Calculate job duration
            if job.created_at:
                duration = (job.completed_at - job.created_at).total_seconds()
                MetricsService.record_timer(
                    db=db,
                    metric_name=MetricsService.JOB_DURATION,
                    duration_seconds=duration,
                    job_id=job_id,
                    tags={"target_language": lang_tag}
                )

            # Record job completion
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.JOB_COMPLETED,
                job_id=job_id,
                tags={"target_language": lang_tag}
            )
        
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
        
        # Metrics for state transitions
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.STATE_TRANSITION,
            job_id=job_id,
            tags={"old_state": old_state.value, "new_state": new_state.value}
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
    def get_job_statistics(db: Session, created_by: Optional[str] = None) -> dict:
        """Get job statistics, optionally scoped to a single user."""
        def _base():
            q = db.query(func.count(MigrationJob.id))
            if created_by:
                q = q.filter(MigrationJob.created_by == created_by)
            return q

        total = _base().scalar()

        # Count by state
        state_counts = {}
        for state in JobState:
            state_counts[state.value] = _base().filter(MigrationJob.current_state == state).scalar()

        # Count by language
        language_counts = {}
        for lang in TargetLanguage:
            language_counts[lang.value] = _base().filter(MigrationJob.target_language == lang).scalar()

        # Count by job type
        job1_count    = _base().filter(MigrationJob.job_type == JobType.YAML_CONVERSION).scalar()
        job2_count    = _base().filter(MigrationJob.job_type == JobType.CODE_CONVERSION).scalar()
        direct_count  = _base().filter(MigrationJob.job_type == JobType.DIRECT_CONVERSION).scalar()

        # Queue count
        queue_count = _base().filter(MigrationJob.current_state == JobState.YAML_APPROVED_QUEUED).scalar()

        return {
            "total_jobs": total,
            "by_state": state_counts,
            "by_language": language_counts,
            "by_job_type": {
                "job1_yaml_conversion": job1_count,
                "job2_code_conversion": job2_count,
                "direct_conversion": direct_count,
            },
            "queue_count": queue_count
        }
