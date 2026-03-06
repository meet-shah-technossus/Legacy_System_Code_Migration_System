"""
Review service for managing YAML review workflow.
Handles review submission, state transitions, and regeneration requests.
"""

from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.models.review import Review, ReviewComment
from app.models.yaml_version import YAMLVersion
from app.models.job import MigrationJob
from app.schemas.review import ReviewSubmit, ReviewCommentCreate
from app.core.enums import ReviewDecision, JobState, JobType
from app.services.job_manager import JobManager
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService
from fastapi import HTTPException, status


class ReviewService:
    """Service for managing YAML reviews and feedback."""
    
    @staticmethod
    def submit_review(
        db: Session,
        job_id: int,
        review_data: ReviewSubmit,
        performed_by: Optional[str] = None
    ) -> Review:
        """
        Submit a review for a YAML version.
        Triggers appropriate state transitions based on decision.
        
        Args:
            db: Database session
            job_id: The job ID
            review_data: Review submission data
            performed_by: Who submitted the review
            
        Returns:
            Created Review object
        """
        # Get job and validate state
        job = JobManager.get_job_or_404(db, job_id)
        
        # Job must be in a valid review state (YAML or code review)
        allowed_review_states = [
            JobState.YAML_GENERATED,
            JobState.UNDER_REVIEW,
            JobState.CODE_UNDER_REVIEW,
            JobState.CODE_REGENERATE_REQUESTED
        ]
        if job.current_state not in allowed_review_states:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot submit review. Job is in state {job.current_state.value}. "
                       f"Must be in one of: {', '.join([s.value for s in allowed_review_states])}."
            )
        
        # For code review jobs, fetch YAML version from parent job
        yaml_lookup_job_id = job_id
        if hasattr(job, 'job_type') and job.job_type == JobType.CODE_CONVERSION and job.parent_job_id:
            yaml_lookup_job_id = job.parent_job_id
        yaml_version = db.query(YAMLVersion).filter(
            YAMLVersion.id == review_data.yaml_version_id,
            YAMLVersion.job_id == yaml_lookup_job_id
        ).first()
        
        if not yaml_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"YAML version {review_data.yaml_version_id} not found for job {job_id}"
            )
        
        # YAML version must be valid
        if not yaml_version.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot review invalid YAML version"
            )
        
        # Create review
        review = Review(
            job_id=job_id,
            yaml_version_id=review_data.yaml_version_id,
            decision=review_data.decision,
            general_comment=review_data.general_comment,
            reviewed_by=performed_by or review_data.reviewed_by or "SYSTEM",
            reviewed_at=datetime.now()
        )
        db.add(review)
        db.flush()  # Get review ID for comments
        
        # Create review comments
        for comment_data in review_data.comments:
            comment = ReviewComment(
                review_id=review.id,
                section_type=comment_data.section_type,
                section_path=comment_data.section_path,
                comment_text=comment_data.comment_text,
                is_blocking=int(comment_data.is_blocking),  # Convert bool to int for SQLite
                severity=comment_data.severity,
                created_at=datetime.now()
            )
            db.add(comment)
        
        # Handle state transitions based on decision
        ReviewService._handle_review_decision(db, job, yaml_version, review_data.decision, review_data)
        
        # Audit log
        AuditService.log_review_submitted(
            db=db,
            job_id=job_id,
            review_id=review.id,
            decision=review_data.decision,
            reviewed_by=review.reviewed_by
        )
        
        # Record metrics
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.REVIEW_SUBMITTED,
            job_id=job_id,
            tags={"decision": review_data.decision.value}
        )
        
        # Track review decision counts
        if review_data.decision == ReviewDecision.APPROVE:
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.REVIEW_APPROVED,
                job_id=job_id
            )
        elif review_data.decision == ReviewDecision.APPROVE_WITH_COMMENTS:
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.REVIEW_APPROVED,
                job_id=job_id,
                tags={"with_comments": "true"}
            )
        elif review_data.decision == ReviewDecision.REJECT_REGENERATE:
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.REVIEW_REJECTED,
                job_id=job_id
            )
        
        # Track time from YAML generation to review (if YAML version has generated_at)
        if yaml_version.generated_at:
            review_time = (datetime.now() - yaml_version.generated_at).total_seconds()
            MetricsService.record_timer(
                db=db,
                metric_name=MetricsService.REVIEW_TIME,
                duration_seconds=review_time,
                job_id=job_id,
                tags={"decision": review_data.decision.value}
            )
        
        db.commit()
        db.refresh(review)
        
        return review
    
    @staticmethod
    def _handle_review_decision(
        db: Session,
        job: MigrationJob,
        yaml_version: YAMLVersion,
        decision: ReviewDecision,
        review_data: ReviewSubmit
    ):
        """Handle state transitions based on review decision."""
        
        # Handle YAML review decisions
        if decision == ReviewDecision.REJECT_REGENERATE:
            # Transition to REGENERATE_REQUESTED
            if job.current_state == JobState.YAML_GENERATED:
                # First transition to UNDER_REVIEW
                JobManager.transition_state(
                    db=db,
                    job_id=job.id,
                    new_state=JobState.UNDER_REVIEW,
                    performed_by="SYSTEM"
                )
            
            # Then to REGENERATE_REQUESTED
            JobManager.transition_state(
                db=db,
                job_id=job.id,
                new_state=JobState.REGENERATE_REQUESTED,
                performed_by="SYSTEM"
            )
            

        elif decision == ReviewDecision.APPROVE:
            # Approve the YAML version
            yaml_version.is_approved = True
            yaml_version.approved_at = datetime.now()
            yaml_version.approved_by = "REVIEWER"

            # Transition to APPROVED
            if job.current_state != JobState.UNDER_REVIEW:
                JobManager.transition_state(
                    db=db, job_id=job.id,
                    new_state=JobState.UNDER_REVIEW, performed_by="SYSTEM"
                )
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.APPROVED, performed_by="SYSTEM"
            )
            # Chain immediately to YAML_APPROVED_QUEUED — Job 1 is done, sits in queue for Job 2
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.YAML_APPROVED_QUEUED, performed_by="SYSTEM"
            )
            AuditService.log_job_queued(
                db=db, job_id=job.id,
                queued_by=getattr(review_data, 'reviewed_by', None)
            )

        elif decision == ReviewDecision.CODE_APPROVE:
            # Approve the code version
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.CODE_ACCEPTED, performed_by="SYSTEM"
            )
            # Set is_accepted=True on latest code version for this job
            from app.models.code import GeneratedCode
            latest_code = db.query(GeneratedCode).filter(
                GeneratedCode.job_id == job.id,
                GeneratedCode.is_current == True
            ).first()
            if latest_code:
                latest_code.is_accepted = True
                db.commit()
                db.refresh(latest_code)

        elif decision == ReviewDecision.CODE_REJECT_REGENERATE:
            # Transition to CODE_REGENERATE_REQUESTED
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.CODE_REGENERATE_REQUESTED, performed_by="SYSTEM"
            )

        elif decision == ReviewDecision.APPROVE_WITH_COMMENTS:
            # Approve with comments
            yaml_version.is_approved = True
            yaml_version.approved_at = datetime.now()
            yaml_version.approved_by = "REVIEWER"

            # Transition to APPROVED_WITH_COMMENTS
            if job.current_state != JobState.UNDER_REVIEW:
                JobManager.transition_state(
                    db=db, job_id=job.id,
                    new_state=JobState.UNDER_REVIEW, performed_by="SYSTEM"
                )
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.APPROVED_WITH_COMMENTS, performed_by="SYSTEM"
            )
            # Chain immediately to YAML_APPROVED_QUEUED — Job 1 is done, sits in queue for Job 2
            JobManager.transition_state(
                db=db, job_id=job.id,
                new_state=JobState.YAML_APPROVED_QUEUED, performed_by="SYSTEM"
            )
            AuditService.log_job_queued(
                db=db, job_id=job.id,
                queued_by=getattr(review_data, 'reviewed_by', None)
            )
    
    @staticmethod
    def get_job_reviews(
        db: Session,
        job_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Review]:
        """Get all reviews for a job."""
        job = JobManager.get_job_or_404(db, job_id)
        
        reviews = db.query(Review).filter(
            Review.job_id == job_id
        ).order_by(
            Review.reviewed_at.desc()
        ).offset(skip).limit(limit).all()
        
        return reviews
    
    @staticmethod
    def get_review_by_id(
        db: Session,
        job_id: int,
        review_id: int
    ) -> Review:
        """Get a specific review by ID."""
        review = db.query(Review).filter(
            Review.id == review_id,
            Review.job_id == job_id
        ).first()
        
        if not review:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Review {review_id} not found for job {job_id}"
            )
        
        return review
    
    @staticmethod
    def get_yaml_version_reviews(
        db: Session,
        job_id: int,
        yaml_version_id: int
    ) -> List[Review]:
        """Get all reviews for a specific YAML version."""
        reviews = db.query(Review).filter(
            Review.job_id == job_id,
            Review.yaml_version_id == yaml_version_id
        ).order_by(
            Review.reviewed_at.desc()
        ).all()
        
        return reviews
    
    @staticmethod
    def get_latest_review(
        db: Session,
        job_id: int
    ) -> Optional[Review]:
        """Get the most recent review for a job."""
        review = db.query(Review).filter(
            Review.job_id == job_id
        ).order_by(
            Review.reviewed_at.desc()
        ).first()
        
        return review
    
    @staticmethod
    def get_review_statistics(
        db: Session,
        job_id: int
    ) -> Dict[str, Any]:
        """Get review statistics for a job."""
        job = JobManager.get_job_or_404(db, job_id)
        
        total_reviews = db.query(Review).filter(Review.job_id == job_id).count()
        
        approved_count = db.query(Review).filter(
            Review.job_id == job_id,
            Review.decision == ReviewDecision.APPROVE
        ).count()
        
        approved_with_comments_count = db.query(Review).filter(
            Review.job_id == job_id,
            Review.decision == ReviewDecision.APPROVE_WITH_COMMENTS
        ).count()
        
        rejected_count = db.query(Review).filter(
            Review.job_id == job_id,
            Review.decision == ReviewDecision.REJECT_REGENERATE
        ).count()
        
        total_comments = db.query(ReviewComment).join(Review).filter(
            Review.job_id == job_id
        ).count()
        
        blocking_comments = db.query(ReviewComment).join(Review).filter(
            Review.job_id == job_id,
            ReviewComment.is_blocking == 1
        ).count()
        
        return {
            "job_id": job_id,
            "total_reviews": total_reviews,
            "approved": approved_count,
            "approved_with_comments": approved_with_comments_count,
            "rejected": rejected_count,
            "total_comments": total_comments,
            "blocking_comments": blocking_comments
        }
    
    @staticmethod
    def prepare_regeneration_context(
        db: Session,
        job_id: int,
        include_previous_comments: bool = True
    ) -> Dict[str, Any]:
        """
        Prepare context for YAML regeneration from review feedback.
        
        Args:
            db: Database session
            job_id: The job ID
            include_previous_comments: Whether to include previous review comments
            
        Returns:
            Dictionary with regeneration context
        """
        job = JobManager.get_job_or_404(db, job_id)
        
        # Job must be in REGENERATE_REQUESTED state
        if job.current_state != JobState.REGENERATE_REQUESTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot prepare regeneration context. Job is in state {job.current_state.value}. "
                       f"Must be in REGENERATE_REQUESTED state."
            )
        
        context = {
            "job_id": job_id,
            "previous_comments": [],
            "rejection_count": 0
        }
        
        if include_previous_comments:
            # Get the latest review
            latest_review = ReviewService.get_latest_review(db, job_id)
            
            if latest_review:
                context["rejection_count"] = db.query(Review).filter(
                    Review.job_id == job_id,
                    Review.decision == ReviewDecision.REJECT_REGENERATE
                ).count()
                
                # Format comments
                comments = []
                if latest_review.general_comment:
                    comments.append({
                        "type": "general",
                        "text": latest_review.general_comment
                    })
                
                for comment in latest_review.comments:
                    comments.append({
                        "type": "section",
                        "section": comment.section_type.value,
                        "path": comment.section_path,
                        "text": comment.comment_text,
                        "blocking": bool(comment.is_blocking),
                        "severity": comment.severity
                    })
                
                context["previous_comments"] = comments
        
        return context
