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
    DirectJobCreate,
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
from app.services.auth_service import get_current_active_user
from app.models.user import User
from app.models.job import MigrationJob


router = APIRouter()


def _require_job_access(job: MigrationJob, current_user: User) -> None:
    """Raise 403 if a non-admin user tries to access a job they don't own."""
    if current_user.role.value == "admin":
        return
    if job.created_by != current_user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this job.",
        )


@router.post("/", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    job_data: MigrationJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create a new Job 1 (Pick Basic → YAML).
    Target language is NOT required here — it will be selected at Job 2 creation.
    """
    job_data.created_by = current_user.username
    job = JobManager.create_job(db, job_data)
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    return response_data


@router.post("/direct", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_direct_job(
    job_data: DirectJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create a new Direct Conversion job (Pick Basic → Target Language).
    No YAML intermediate step.  Code is generated in a single LLM call.
    """
    job_data.created_by = current_user.username
    job = JobManager.create_direct_job(db, job_data)
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    return response_data


@router.post("/job2", response_model=MigrationJobResponse, status_code=status.HTTP_201_CREATED)
def create_job2(
    job_data: Job2Create,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create a new Job 2 (YAML → Target Language).
    Picks an approved YAML from the queue by supplying parent_job_id and target_language.
    The parent Job 1 must be in YAML_APPROVED_QUEUED state.
    """
    job_data.created_by = current_user.username
    job = JobManager.create_job2(db, job_data)
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = 0
    response_data.reviews_count = 0
    return response_data


@router.get("/queue", response_model=List[MigrationJobSummary])
def get_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List migration jobs. Admins see all jobs; regular users see only their own."""
    created_by_filter = None if current_user.role.value == "admin" else current_user.username
    jobs = JobManager.list_jobs(
        db=db, skip=skip, limit=limit,
        state=state, target_language=target_language, job_type=job_type,
        created_by=created_by_filter,
    )
    return [MigrationJobSummary.model_validate(job) for job in jobs]


@router.get("/statistics")
def get_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get overall job statistics.

    Returns counts by state and target language.
    """
    created_by_filter = None if current_user.role.value == "admin" else current_user.username
    return JobManager.get_job_statistics(db, created_by=created_by_filter)


@router.get("/{job_id}", response_model=MigrationJobResponse)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get detailed information about a specific job.

    Uses eager loading to efficiently fetch related YAML versions and reviews.
    """
    # Use eager loading to avoid N+1 queries
    job = JobManager.get_job_or_404(db, job_id, eager_load=True)
    _require_job_access(job, current_user)

    # Add counts
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)

    return response_data


@router.get("/{job_id}/with-source", response_model=MigrationJobWithSource)
def get_job_with_source(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get job details including the original source code."""
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    return MigrationJobWithSource.model_validate(job)


@router.patch("/{job_id}", response_model=MigrationJobResponse)
def update_job(
    job_id: int,
    update_data: MigrationJobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update job metadata (name, description).

    Does NOT update job state - use the state transition endpoint for that.
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    job = JobManager.update_job(db, job_id, update_data)

    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)

    return response_data


@router.post("/{job_id}/transition", response_model=MigrationJobResponse)
def transition_job_state(
    job_id: int,
    transition: JobStateTransition,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Transition a job to a new state.

    Validates the transition according to the state machine rules.
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    job = JobManager.transition_state(
        db=db,
        job_id=job_id,
        new_state=transition.new_state,
        reason=transition.reason
    )

    # Side-effect: when accepting code directly via this endpoint (bypassing the
    # review service), ensure the current GeneratedCode row is marked accepted.
    # NOTE: For DIRECT_CODE_ACCEPTED we mark the is_current version; for a
    # version-aware accept use POST /{job_id}/direct/review with version_number.
    if transition.new_state in (JobState.CODE_ACCEPTED, JobState.DIRECT_CODE_ACCEPTED):
        from app.models.code import GeneratedCode
        current_code = (
            db.query(GeneratedCode)
            .filter(
                GeneratedCode.job_id == job_id,
                GeneratedCode.is_current == True,
            )
            .first()
        )
        if current_code and not current_code.is_accepted:
            current_code.is_accepted = True
            db.commit()

    # Add counts
    response_data = MigrationJobResponse.model_validate(job)
    response_data.yaml_versions_count = len(job.yaml_versions)
    response_data.reviews_count = len(job.reviews)

    return response_data


@router.get("/{job_id}/allowed-transitions")
def get_allowed_transitions(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get all valid state transitions for a job's current state.
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    
    allowed_states = StateMachine.get_allowed_transitions_for_job(
        current_state=job.current_state,
        job_type=job.job_type,
    )
    
    return {
        "current_state": job.current_state.value,
        "allowed_transitions": [state.value for state in allowed_states],
        "is_terminal": StateMachine.is_terminal_state(job.current_state)
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete a job and all its related data."""
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    JobManager.delete_job(db, job_id)
    return None


@router.get("/{job_id}/parent", response_model=MigrationJobResponse)
def get_parent_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the parent Job 1 for a given Job 2.
    Returns 404 if the job has no parent (i.e. it is itself a Job 1).
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    parent = JobManager.get_parent_job(db, job_id)
    response_data = MigrationJobResponse.model_validate(parent)
    response_data.yaml_versions_count = len(parent.yaml_versions)
    response_data.reviews_count = len(parent.reviews)
    return response_data


@router.post("/{job_id}/line-comments", response_model=LineCommentResponse, status_code=status.HTTP_201_CREATED)
def add_line_comment(
    job_id: int,
    comment_data: LineCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Add an inline line-level comment to a specific line of YAML or generated code.
    These comments are surfaced in the review UI and passed to the LLM when regenerating.
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
    comment = LineCommentService.add_line_comment(db, job_id, comment_data)
    return LineCommentResponse.model_validate(comment)


@router.get("/{job_id}/line-comments", response_model=List[LineCommentResponse])
def get_line_comments(
    job_id: int,
    code_type: Optional[str] = Query(None, description="Filter by 'yaml' or 'generated_code'"),
    review_round: Optional[int] = Query(None, ge=1, description="Filter by review round number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get all line-level comments for a job, ordered by line number.
    Optionally filter by code_type or review_round.
    """
    job = JobManager.get_job_or_404(db, job_id)
    _require_job_access(job, current_user)
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
