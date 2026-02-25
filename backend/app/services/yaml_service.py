"""YAML service for orchestrating YAML generation and version management."""

from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
import json

from app.models.job import MigrationJob
from app.models.yaml_version import YAMLVersion
from app.core.enums import JobState
from app.services.yaml_generator import YAMLGenerator, YAMLGenerationResult
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService
from app.services.job_manager import JobManager
import logging

logger = logging.getLogger(__name__)


class YAMLService:
    """Service for managing YAML generation and versioning."""
    
    def __init__(self):
        self.generator = YAMLGenerator()
        self.job_manager = JobManager()
    
    def generate_yaml_for_job(
        self,
        db: Session,
        job_id: int,
        performed_by: str,
        force_regenerate: bool = False,
        review_feedback_context: Optional[Dict[str, Any]] = None
    ) -> YAMLVersion:
        """
        Generate YAML for a migration job and store it in the database.
        
        Args:
            db: Database session
            job_id: Migration job ID
            performed_by: User/system performing the action
            force_regenerate: Force regeneration even if YAML exists
            review_feedback_context: Optional context from review feedback for regeneration
            
        Returns:
            Created YAMLVersion object
            
        Raises:
            HTTPException: If job not found or in invalid state
        """
        # Get the job
        job = self.job_manager.get_job_or_404(db, job_id)
        
        # Validate job state
        if not force_regenerate:
            if job.current_state != JobState.CREATED and job.current_state != JobState.REGENERATE_REQUESTED:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot generate YAML for job in state: {job.current_state.value}"
                )
        
        logger.info(f"Starting YAML generation for job {job_id}")
        
        # Parse metadata JSON
        metadata = {}
        if job.metadata_json:
            try:
                metadata = json.loads(job.metadata_json)
            except (json.JSONDecodeError, TypeError):
                logger.warning(f"Failed to parse metadata_json for job {job_id}")
        
        # Prepare additional context (including review feedback if provided)
        additional_context = metadata.get("additional_context", "")
        
        if review_feedback_context:
            # Build feedback summary for LLM
            feedback_parts = []
            
            if review_feedback_context.get("previous_comments"):
                feedback_parts.append("\n=== REVIEWER FEEDBACK ===")
                feedback_parts.append(f"Previous version: {review_feedback_context.get('previous_version_number', 'N/A')}")
                
                # Add general comment if present
                if review_feedback_context.get("general_comment"):
                    feedback_parts.append(f"\nGeneral Feedback: {review_feedback_context['general_comment']}")
                
                # Add section-specific comments
                comments = review_feedback_context["previous_comments"]
                if comments:
                    feedback_parts.append("\nSection-Specific Feedback:")
                    for comment in comments:
                        severity_marker = "[CRITICAL]" if comment.get("is_blocking") else ""
                        section = comment.get("section_type", "general")
                        # Try multiple possible keys for comment text
                        comment_text = comment.get('comment_text') or comment.get('text') or comment.get('comment')
                        if not comment_text:
                            continue  # skip if no text
                        feedback_parts.append(f"  {severity_marker} {section}: {comment_text}")
            
            if review_feedback_context.get("additional_instructions"):
                feedback_parts.append(f"\nAdditional Instructions: {review_feedback_context['additional_instructions']}")
            
            if feedback_parts:
                additional_context += "\n" + "\n".join(feedback_parts)
                logger.info(f"Including review feedback in generation for job {job_id}")

        # Track timing
        start_time = datetime.utcnow()
        result: YAMLGenerationResult = self.generator.generate_yaml_with_auto_retry(
            pick_basic_code=job.original_source_code,
            original_filename=job.source_filename or "unknown.bp",
            additional_context=additional_context
        )
        generation_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Determine parent version (if this is a regeneration)
        parent_version_id = None
        if job.current_state == JobState.REGENERATE_REQUESTED and job.yaml_versions:
            # Get the most recent version
            latest_version = max(job.yaml_versions, key=lambda v: v.generated_at)
            parent_version_id = latest_version.id
        
        # Always store YAML as string (serialize if dict)
        yaml_content_to_store = result.raw_yaml
        if isinstance(yaml_content_to_store, dict):
            import yaml as _yaml
            yaml_content_to_store = _yaml.dump(yaml_content_to_store)
        yaml_version = YAMLVersion(
            job_id=job_id,
            version_number=len(job.yaml_versions) + 1,
            yaml_content=yaml_content_to_store,
            is_valid=result.success,
            validation_errors=json.dumps(result.errors) if not result.success and result.errors else None,
            llm_model_used=result.llm_metadata.get("model"),
            llm_tokens_used=result.llm_metadata.get("tokens_used"),
            generation_time_seconds=int(generation_time),
            generation_prompt=result.llm_metadata.get("prompt"),
            regeneration_reason=performed_by,
            parent_version_id=parent_version_id
        )
        
        db.add(yaml_version)
        
        # Update job state if generation was successful
        if result.success:
            self.job_manager.transition_state(
                db=db,
                job_id=job_id,
                new_state=JobState.YAML_GENERATED,
                performed_by=performed_by,
                reason=f"YAML generated successfully (version {yaml_version.version_number})"
            )
            
            # Log successful generation
            AuditService.log_yaml_generated(
                db=db,
                job_id=job_id,
                yaml_version_id=yaml_version.id,
                version_number=yaml_version.version_number,
                generation_time=int(generation_time)
            )
            
            # Record success metrics
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.YAML_GENERATION_SUCCESS,
                job_id=job_id,
                tags={"version": yaml_version.version_number}
            )
            
            MetricsService.record_timer(
                db=db,
                metric_name=MetricsService.YAML_GENERATION_TIME,
                duration_seconds=generation_time,
                job_id=job_id,
                tags={"success": "true", "version": yaml_version.version_number}
            )
            
            # Track YAML size
            yaml_size = len(result.raw_yaml.encode('utf-8'))
            MetricsService.record_gauge(
                db=db,
                metric_name=MetricsService.YAML_SIZE,
                value=yaml_size,
                unit="bytes",
                job_id=job_id,
                tags={"version": yaml_version.version_number}
            )
            
            logger.info(f"YAML generation successful for job {job_id}, version {yaml_version.version_number}")
        else:
            # Log failed generation
            AuditService.log_error(
                db=db,
                job_id=job_id,
                error_message=f"YAML validation failed with {len(result.errors)} errors",
                error_context={
                    "errors": result.errors,
                    "attempt_count": result.attempt_number
                }
            )
            
            # Record failure metrics
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.YAML_GENERATION_FAILURE,
                job_id=job_id,
                tags={"attempt": result.attempt_number}
            )
            
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.ERROR_COUNT,
                job_id=job_id,
                tags={"error_type": "yaml_validation"}
            )
            
            logger.warning(f"YAML generation validation failed for job {job_id} after {result.attempt_number} attempts")
        
        db.commit()
        db.refresh(yaml_version)
        
        return yaml_version
    
    def get_yaml_versions(
        self,
        db: Session,
        job_id: int,
        include_invalid: bool = False
    ) -> List[YAMLVersion]:
        """
        Get all YAML versions for a job.
        
        Args:
            db: Database session
            job_id: Migration job ID
            include_invalid: Include invalid YAML versions
            
        Returns:
            List of YAMLVersion objects
        """
        # Verify job exists
        self.job_manager.get_job_or_404(db, job_id)
        
        query = db.query(YAMLVersion).filter(YAMLVersion.job_id == job_id)
        
        if not include_invalid:
            query = query.filter(YAMLVersion.is_valid == True)
        
        versions = query.order_by(YAMLVersion.version_number.desc()).all()
        
        logger.info(f"Retrieved {len(versions)} YAML versions for job {job_id}")
        return versions
    
    def get_yaml_version(
        self,
        db: Session,
        job_id: int,
        version_number: int
    ) -> YAMLVersion:
        """
        Get a specific YAML version.
        
        Args:
            db: Database session
            job_id: Migration job ID
            version_number: Version number to retrieve
            
        Returns:
            YAMLVersion object
            
        Raises:
            HTTPException: If version not found
        """
        # Verify job exists
        self.job_manager.get_job_or_404(db, job_id)
        
        version = db.query(YAMLVersion).filter(
            YAMLVersion.job_id == job_id,
            YAMLVersion.version_number == version_number
        ).first()
        
        if not version:
            raise HTTPException(
                status_code=404,
                detail=f"YAML version {version_number} not found for job {job_id}"
            )
        
        return version
    
    def get_latest_yaml_version(
        self,
        db: Session,
        job_id: int,
        only_valid: bool = True
    ) -> Optional[YAMLVersion]:
        """
        Get the latest YAML version for a job.
        
        Args:
            db: Database session
            job_id: Migration job ID
            only_valid: Only return valid YAML versions
            
        Returns:
            Latest YAMLVersion or None
        """
        # Verify job exists
        self.job_manager.get_job_or_404(db, job_id)
        
        query = db.query(YAMLVersion).filter(YAMLVersion.job_id == job_id)
        
        if only_valid:
            query = query.filter(YAMLVersion.is_valid == True)
        
        version = query.order_by(YAMLVersion.version_number.desc()).first()
        
        if version:
            logger.info(f"Retrieved latest YAML version {version.version_number} for job {job_id}")
        else:
            logger.info(f"No YAML versions found for job {job_id}")
        
        return version
    
    def approve_yaml_version(
        self,
        db: Session,
        job_id: int,
        version_number: int,
        approved_by: str,
        comments: Optional[str] = None
    ) -> YAMLVersion:
        """
        Approve a YAML version (typically done after review).
        
        Args:
            db: Database session
            job_id: Migration job ID
            version_number: Version to approve
            approved_by: User approving the version
            comments: Optional approval comments
            
        Returns:
            Updated YAMLVersion
            
        Raises:
            HTTPException: If version not found or invalid
        """
        version = self.get_yaml_version(db, job_id, version_number)
        
        if not version.is_valid:
            raise HTTPException(
                status_code=400,
                detail="Cannot approve invalid YAML version"
            )
        
        if version.is_approved:
            raise HTTPException(
                status_code=400,
                detail="YAML version already approved"
            )
        
        # Update version
        version.is_approved = True
        version.approved_by = approved_by
        version.approved_at = datetime.utcnow()
        # Store approval comments in reviewer_comments_context (no dedicated column)
        if comments:
            version.reviewer_comments_context = comments
        
        # Log validation (approval counts as validation)
        AuditService.log_yaml_validated(
            db=db,
            job_id=job_id,
            yaml_version_id=version.id,
            is_valid=True
        )
        
        db.commit()
        db.refresh(version)
        
        logger.info(f"YAML version {version_number} approved for job {job_id} by {approved_by}")
        
        return version
    
    def get_version_lineage(
        self,
        db: Session,
        job_id: int,
        version_number: int
    ) -> List[YAMLVersion]:
        """
        Get the lineage (parent chain) of a YAML version.
        
        Args:
            db: Database session
            job_id: Migration job ID
            version_number: Version to get lineage for
            
        Returns:
            List of YAMLVersion objects from oldest to newest
        """
        version = self.get_yaml_version(db, job_id, version_number)
        
        lineage = [version]
        current = version
        
        # Walk up the parent chain
        while current.parent_version_id:
            parent = db.query(YAMLVersion).filter(
                YAMLVersion.id == current.parent_version_id
            ).first()
            
            if not parent:
                break
            
            lineage.insert(0, parent)  # Add to beginning
            current = parent
        
        logger.info(f"Retrieved lineage of {len(lineage)} versions for job {job_id}, version {version_number}")
        
        return lineage
    
    def regenerate_yaml_with_feedback(
        self,
        db: Session,
        job_id: int,
        performed_by: str,
        include_previous_comments: bool = True,
        additional_instructions: Optional[str] = None
    ) -> YAMLVersion:
        """
        Regenerate YAML incorporating feedback from previous review.
        
        Args:
            db: Database session
            job_id: Migration job ID
            performed_by: User/system performing the action
            include_previous_comments: Include comments from last review
            additional_instructions: Additional guidance for regeneration
            
        Returns:
            New YAMLVersion object
            
        Raises:
            HTTPException: If job not found or not in REGENERATE_REQUESTED state
        """
        from app.services.review_service import ReviewService
        
        # Verify job is in REGENERATE_REQUESTED state
        job = self.job_manager.get_job_or_404(db, job_id)
        
        if job.current_state != JobState.REGENERATE_REQUESTED:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot regenerate YAML. Job is in state {job.current_state.value}. Must be in REGENERATE_REQUESTED state."
            )
        
        # Prepare regeneration context from review feedback
        feedback_context = ReviewService.prepare_regeneration_context(
            db=db,
            job_id=job_id,
            include_previous_comments=include_previous_comments
        )
        
        # Add additional instructions if provided
        if additional_instructions:
            feedback_context["additional_instructions"] = additional_instructions
        
        logger.info(f"Regenerating YAML for job {job_id} with review feedback")
        
        # Generate new YAML version with feedback context
        return self.generate_yaml_for_job(
            db=db,
            job_id=job_id,
            performed_by=performed_by,
            force_regenerate=False,
            review_feedback_context=feedback_context
        )
