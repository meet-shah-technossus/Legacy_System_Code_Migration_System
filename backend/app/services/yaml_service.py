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
        force_regenerate: bool = False
    ) -> YAMLVersion:
        """
        Generate YAML for a migration job and store it in the database.
        
        Args:
            db: Database session
            job_id: Migration job ID
            performed_by: User/system performing the action
            force_regenerate: Force regeneration even if YAML exists
            
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
        
        # Generate YAML with auto-retry
        result: YAMLGenerationResult = self.generator.generate_yaml_with_auto_retry(
            pick_basic_code=job.original_source_code,
            original_filename=job.source_filename or "unknown.bp",
            additional_context=metadata.get("additional_context", "")
        )
        
        # Determine parent version (if this is a regeneration)
        parent_version_id = None
        if job.current_state == JobState.REGENERATE_REQUESTED and job.yaml_versions:
            # Get the most recent version
            latest_version = max(job.yaml_versions, key=lambda v: v.created_at)
            parent_version_id = latest_version.id
        
        # Create YAML version record
        yaml_version = YAMLVersion(
            job_id=job_id,
            version_number=len(job.yaml_versions) + 1,
            yaml_content=result.raw_yaml,
            is_valid=result.success,
            validation_errors=result.errors if not result.success else None,
            generated_by=performed_by,
            generation_metadata={
                "llm_model": result.llm_metadata.get("model"),
                "attempt_count": result.attempt_number,
                "generation_timestamp": result.timestamp.isoformat(),
                "prompt_length": result.llm_metadata.get("prompt_length"),
                "response_length": result.llm_metadata.get("response_length"),
                "validation_errors_count": len(result.errors)
            },
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
                performed_by=performed_by,
                yaml_version_id=yaml_version.id,
                is_valid=True
            )
            
            logger.info(f"YAML generation successful for job {job_id}, version {yaml_version.version_number}")
        else:
            # Log failed generation
            AuditService.log_error(
                db=db,
                job_id=job_id,
                performed_by=performed_by,
                error_type="yaml_generation_validation_failed",
                error_details={
                    "errors": result.errors,
                    "attempt_count": result.attempt_number
                }
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
        version.approval_comments = comments
        
        # Log validation (approval counts as validation)
        AuditService.log_yaml_validated(
            db=db,
            job_id=job_id,
            performed_by=approved_by,
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
