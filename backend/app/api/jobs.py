"""
Job API endpoints.
RESTful API for managing migration jobs.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.schemas.job import (
    MigrationJobCreate,
    Job2Create,
    MigrationJobUpdate,
    MigrationJobResponse,
    MigrationJobSummary,
    MigrationJobWithSource,
    JobStateTransition,
    LineCommentCreate,
    LineCommentResponse,
)
from app.core.enums import JobState, JobType, TargetLanguage
from app.services.job_manager import JobManager
from app.services.state_machine import StateMachine
from app.services.line_comment_service import LineCommentService


router = APIRouter()


@router.post("/", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    job_data: MigrationJobCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new Job 1 (Pick Basic → YAML).
    Target language is NOT required here — it will be selected at Job 2 creation.
    """
    job = JobManager.create_job(db, job_data)
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    return response_data


@router.post("/job2", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_job2(
    job_data: Job2Create,
    db: Session = Depends(get_db)
):
    """
    Create a new Job 2 (YAML → Target Language).
    Picks an approved YAML from the queue by supplying parent_job_id and target_language.
    The parent Job 1 must be in YAML_APPROVED_QUEUED state.
    """
    job = JobManager.create_job2(db, job_data)
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    return response_data


@router.get("/queue", response_model=List[MigrationJobSummary])
def get_queue(db: Session = Depends(get_db)):
    """
    Get all Job 1s waiting in the queue (YAML approved, not yet picked up for Job 2).
    Ordered oldest-first (fair queue).
    """
    jobs = JobManager.get_queued_jobs(db)
    return [MigrationJobSummary.model_validate(j) for j in jobs]


@router.get("/", response_model=List[MigrationJobSummary])
def list_jobs(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum records to return"),
    state: Optional[JobState] = Query(None, description="Filter by job state"),
    target_language: Optional[TargetLanguage] = Query(None, description="Filter by target language"),
    job_type: Optional[JobType] = Query(None, description="Filter by job type (YAML_CONVERSION or CODE_CONVERSION)"),
    db: Session = Depends(get_db)
):
    """List all migration jobs with optional filters."""
    jobs = JobManager.list_jobs(
        db=db, skip=skip, limit=limit,
        state=state, target_language=target_language, job_type=job_type
    )
    return [MigrationJobSummary.model_validate(job) for job in jobs]


@router.get("/statistics")
def get_statistics(db: Session = Depends(get_db)):
    """
    Get overall job statistics.
    
    Returns counts by state and target language.
    """
    return JobManager.get_job_statistics(db)


@router.get("/{job_id}", response_model=MigrationJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific job.
    
    Uses eager loading to efficiently fetch related YAML versions and reviews.
    
    Args:
        job_id: The unique identifier of the migration job
        
    Returns:
        MigrationJobResponse with complete job details and counts
    """
    # Use eager loading to avoid N+1 queries
    job = JobManager.get_job_or_404(db, job_id, eager_load=True)
    
    # Add counts
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)
    
    return response_data


@router.get("/{job_id}/with-source", response_model=MigrationJobWithSource)
def get_job_with_source(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get job details including the original source code.
    
    Args:
        job_id: The unique identifier of the migration job
        
    Returns:
        MigrationJobWithSource including original Pick Basic source code
    
    Note:
        This endpoint returns the complete source code which may be large.
        Use the standard GET endpoint if source code is not needed.
    """
    job = JobManager.get_job_or_404(db, job_id)
    return MigrationJobWithSource.model_validate(job)


@router.patch("/{job_id}", response_model=MigrationJobResponse)
def update_job(
    job_id: int,
    update_data: MigrationJobUpdate,
    db: Session = Depends(get_db)
):
    """
    Update job metadata (name, description).
    
    Does NOT update job state - use the state transition endpoint for that.
    
    - **job_id**: The job ID
    """
    job = JobManager.update_job(db, job_id, update_data)
    
    # Add counts
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)
    
    return response_data


@router.post("/{job_id}/transition", response_model=MigrationJobResponse)
def transition_job_state(
    job_id: int,
    transition: JobStateTransition,
    db: Session = Depends(get_db)
):
    """
    Transition a job to a new state.
    
    Validates the transition according to the state machine rules.
    
    - **job_id**: The job ID
    - **new_state**: Target state
    - **reason**: Optional reason for the transition
    """
    job = JobManager.transition_state(
        db=db,
        job_id=job_id,
        new_state=transition.new_state,
        reason=transition.reason
    )
    
    # Add counts
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)
    
    return response_data


@router.get("/{job_id}/allowed-transitions")
def get_allowed_transitions(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all valid state transitions for a job's current state.
    
    - **job_id**: The job ID
    """
    job = JobManager.get_job_or_404(db, job_id)
    
    allowed_states = StateMachine.get_allowed_transitions(job.current_state)
    
    return {
        "current_state": job.current_state.value,
        "allowed_transitions": [state.value for state in allowed_states],
        "is_terminal": StateMachine.is_terminal_state(job.current_state)
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    """Delete a job and all its related data."""
    JobManager.delete_job(db, job_id)
    return None


@router.get("/{job_id}/parent", response_model=MigrationJobResponse)
def get_parent_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get the parent Job 1 for a given Job 2.
    Returns 404 if the job has no parent (i.e. it is itself a Job 1).
    """
    parent = JobManager.get_parent_job(db, job_id)
    response_data = MigrationJobResponse.model_validate(parent)
    response_data.yaml_versions_count = len(parent.yaml_versions)
    response_data.reviews_count = len(parent.reviews)
    return response_data


@router.post("/{job_id}/line-comments", response_model=LineCommentResponse, status_code=status.HTTP_201_CREATED)
def add_line_comment(
    job_id: int,
    comment_data: LineCommentCreate,
    db: Session = Depends(get_db)
):
    """
    Add an inline line-level comment to a specific line of YAML or generated code.
    These comments are surfaced in the review UI and passed to the LLM when regenerating.
    """
    comment = LineCommentService.add_line_comment(db, job_id, comment_data)
    return LineCommentResponse.model_validate(comment)


@router.get("/{job_id}/line-comments", response_model=List[LineCommentResponse])
def get_line_comments(
    job_id: int,
    code_type: Optional[str] = Query(None, description="Filter by 'yaml' or 'generated_code'"),
    review_round: Optional[int] = Query(None, ge=1, description="Filter by review round number"),
    db: Session = Depends(get_db)
):
    """
    Get all line-level comments for a job, ordered by line number.
    Optionally filter by code_type or review_round.
    """
    comments = LineCommentService.get_line_comments(db, job_id, code_type=code_type, review_round=review_round)
    return [LineCommentResponse.model_validate(c) for c in comments]


@router.get("/{job_id}/workflow")
def get_workflow_info():
    """Get information about the migration workflow."""
    return {
        "workflow_description": StateMachine.get_workflow_path(),
        "all_states": [state.value for state in JobState],
        "state_transitions": {
            state.value: [s.value for s in StateMachine.get_allowed_transitions(state)]
            for state in JobState
        }
    }
