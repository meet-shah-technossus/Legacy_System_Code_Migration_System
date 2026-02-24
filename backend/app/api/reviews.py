"""
Review API endpoints.
RESTful API for managing YAML reviews and feedback.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.schemas.review import (
    ReviewSubmit,
    ReviewResponse,
    ReviewSummary,
    ReviewCommentResponse,
    RegenerationRequest
)
from app.services.review_service import ReviewService


router = APIRouter()


@router.post("/{job_id}/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def submit_review(
    job_id: int,
    review_data: ReviewSubmit,
    performed_by: Optional[str] = Query(None, description="Reviewer identifier"),
    db: Session = Depends(get_db)
):
    """
    Submit a review for a YAML version.
    
    Triggers state transitions:
    - REJECT_REGENERATE → Transition to REGENERATE_REQUESTED
    - APPROVE → Transition to APPROVED (and approve YAML version)
    - APPROVE_WITH_COMMENTS → Transition to APPROVED_WITH_COMMENTS (and approve YAML version)
    
    - **job_id**: The job ID
    - **yaml_version_id**: YAML version being reviewed
    - **decision**: Review decision (REJECT_REGENERATE, APPROVE, APPROVE_WITH_COMMENTS)
    - **general_comment**: Overall feedback
    - **comments**: Section-specific comments with severity
    """
    review = ReviewService.submit_review(
        db=db,
        job_id=job_id,
        review_data=review_data,
        performed_by=performed_by
    )
    
    # Build response with comments
    response = ReviewResponse.model_validate(review)
    response.comments = [ReviewCommentResponse.model_validate(c) for c in review.comments]
    
    return response


@router.get("/{job_id}/reviews", response_model=List[ReviewSummary])
def list_reviews(
    job_id: int,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum records to return"),
    db: Session = Depends(get_db)
):
    """
    List all reviews for a job.
    
    - **job_id**: The job ID
    - **skip**: Pagination offset
    - **limit**: Maximum number of results
    """
    reviews = ReviewService.get_job_reviews(
        db=db,
        job_id=job_id,
        skip=skip,
        limit=limit
    )
    
    # Build summaries with comment counts
    summaries = []
    for review in reviews:
        summary = ReviewSummary.model_validate(review)
        summary.comments_count = len(review.comments)
        summaries.append(summary)
    
    return summaries


@router.get("/{job_id}/reviews/{review_id}", response_model=ReviewResponse)
def get_review(
    job_id: int,
    review_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific review.
    
    - **job_id**: The job ID
    - **review_id**: The review ID
    """
    review = ReviewService.get_review_by_id(
        db=db,
        job_id=job_id,
        review_id=review_id
    )
    
    # Build response with comments
    response = ReviewResponse.model_validate(review)
    response.comments = [ReviewCommentResponse.model_validate(c) for c in review.comments]
    
    return response


@router.get("/{job_id}/reviews/latest", response_model=Optional[ReviewResponse])
def get_latest_review(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get the most recent review for a job.
    
    - **job_id**: The job ID
    """
    review = ReviewService.get_latest_review(db=db, job_id=job_id)
    
    if not review:
        return None
    
    # Build response with comments
    response = ReviewResponse.model_validate(review)
    response.comments = [ReviewCommentResponse.model_validate(c) for c in review.comments]
    
    return response


@router.get("/{job_id}/yaml/versions/{yaml_version_id}/reviews", response_model=List[ReviewSummary])
def get_yaml_version_reviews(
    job_id: int,
    yaml_version_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all reviews for a specific YAML version.
    
    - **job_id**: The job ID
    - **yaml_version_id**: The YAML version ID
    """
    reviews = ReviewService.get_yaml_version_reviews(
        db=db,
        job_id=job_id,
        yaml_version_id=yaml_version_id
    )
    
    # Build summaries with comment counts
    summaries = []
    for review in reviews:
        summary = ReviewSummary.model_validate(review)
        summary.comments_count = len(review.comments)
        summaries.append(summary)
    
    return summaries


@router.get("/{job_id}/reviews/statistics")
def get_review_statistics(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get review statistics for a job.
    
    Returns counts of:
    - Total reviews
    - Approved reviews
    - Approved with comments
    - Rejected reviews
    - Total comments
    - Blocking comments
    
    - **job_id**: The job ID
    """
    return ReviewService.get_review_statistics(db=db, job_id=job_id)


@router.post("/{job_id}/yaml/regenerate")
def request_regeneration(
    job_id: int,
    regeneration_request: RegenerationRequest,
    performed_by: Optional[str] = Query(None, description="Who requested regeneration"),
    db: Session = Depends(get_db)
):
    """
    Request YAML regeneration with context from previous reviews.
    
    Job must be in REGENERATE_REQUESTED state.
    Returns context that will be used for regeneration.
    
    - **job_id**: The job ID
    - **include_previous_comments**: Whether to include comments from last review
    - **additional_instructions**: Additional guidance for regeneration
    """
    context = ReviewService.prepare_regeneration_context(
        db=db,
        job_id=job_id,
        include_previous_comments=regeneration_request.include_previous_comments
    )
    
    # Add additional instructions if provided
    if regeneration_request.additional_instructions:
        context["additional_instructions"] = regeneration_request.additional_instructions
    
    return {
        "job_id": job_id,
        "message": "Regeneration context prepared. Use POST /api/jobs/{job_id}/yaml/generate to regenerate.",
        "context": context
    }
