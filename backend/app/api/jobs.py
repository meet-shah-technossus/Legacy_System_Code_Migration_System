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
    MigrationJobUpdate,
    MigrationJobResponse,
    MigrationJobSummary,
    MigrationJobWithSource,
    JobStateTransition,
)
from app.core.enums import JobState, TargetLanguage
from app.services.job_manager import JobManager
from app.services.state_machine import StateMachine


router = APIRouter()


@router.post("/", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    job_data: MigrationJobCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new migration job.
    
    - **job_name**: Optional job name
    - **original_source_code**: Required Pick Basic source code
    - **target_language**: Target programming language (default: PYTHON)
    """
    job = JobManager.create_job(db, job_data)
    
    # Add counts for response
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    
    return response_data


@router.get("/", response_model=List[MigrationJobSummary])
def list_jobs(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum records to return"),
    state: Optional[JobState] = Query(None, description="Filter by job state"),
    target_language: Optional[TargetLanguage] = Query(None, description="Filter by target language"),
    db: Session = Depends(get_db)
):
    """
    List all migration jobs with optional filters.
    
    - **skip**: Pagination offset
    - **limit**: Maximum number of results
    - **state**: Filter by job state
    - **target_language**: Filter by target programming language
    """
    jobs = JobManager.list_jobs(
        db=db,
        skip=skip,
        limit=limit,
        state=state,
        target_language=target_language
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
    
    - **job_id**: The job ID
    """
    job = JobManager.get_job_or_404(db, job_id)
    
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
    
    - **job_id**: The job ID
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
    """
    Delete a job and all its related data (YAML versions, reviews, etc.).
    
    - **job_id**: The job ID
    """
    JobManager.delete_job(db, job_id)
    return None


@router.get("/{job_id}/workflow")
def get_workflow_info():
    """
    Get information about the migration workflow.
    
    Returns a description of all possible states and transitions.
    """
    return {
        "workflow_description": StateMachine.get_workflow_path(),
        "all_states": [state.value for state in JobState],
        "state_transitions": {
            state.value: [s.value for s in StateMachine.get_allowed_transitions(state)]
            for state in JobState
        }
    }
