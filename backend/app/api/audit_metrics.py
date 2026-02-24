"""
API endpoints for audit logs and metrics.
Provides querying and monitoring capabilities.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.core.database import get_db
from app.core.enums import AuditAction
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService
from app.schemas.audit_metrics import (
    AuditLogResponse,
    AuditLogListResponse,
    AuditQueryRequest,
    MetricResponse,
    MetricAggregateRequest,
    MetricAggregateResponse,
    SuccessRateResponse,
    PerformanceStatsResponse,
    MetricsSummaryResponse
)


router = APIRouter(prefix="/api", tags=["audit-metrics"])


# ===========================
# Audit Log Endpoints
# ===========================

@router.get("/jobs/{job_id}/audit-trail", response_model=AuditLogListResponse)
def get_job_audit_trail(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Get complete audit trail for a specific job.
    
    Returns all audit log entries for the job, ordered by timestamp.
    """
    logs = AuditService.get_job_audit_trail(db, job_id)
    
    return AuditLogListResponse(
        total=len(logs),
        logs=logs
    )


@router.get("/audit-logs", response_model=AuditLogListResponse)
def query_audit_logs(
    action: Optional[AuditAction] = Query(None, description="Filter by action type"),
    performed_by: Optional[str] = Query(None, description="Filter by performer"),
    start_time: Optional[datetime] = Query(None, description="Start of time range"),
    end_time: Optional[datetime] = Query(None, description="End of time range"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Query audit logs with various filters.
    
    Supports filtering by action type, performer, and time range.
    """
    if action:
        logs = AuditService.get_audit_logs_by_action(db, action, limit, offset)
    elif performed_by:
        logs = AuditService.get_audit_logs_by_performer(db, performed_by, limit, offset)
    elif start_time and end_time:
        logs = AuditService.get_audit_logs_by_timerange(db, start_time, end_time)
    else:
        logs = AuditService.get_recent_audit_logs(db, limit)
    
    return AuditLogListResponse(
        total=len(logs),
        logs=logs
    )


@router.get("/audit-logs/recent", response_model=AuditLogListResponse)
def get_recent_audit_logs(
    limit: int = Query(50, ge=1, le=500, description="Number of recent logs"),
    db: Session = Depends(get_db)
):
    """
    Get most recent audit log entries across all jobs.
    
    Returns the latest audit logs, ordered by timestamp (newest first).
    """
    logs = AuditService.get_recent_audit_logs(db, limit)
    
    return AuditLogListResponse(
        total=len(logs),
        logs=logs
    )


@router.get("/audit-logs/errors", response_model=AuditLogListResponse)
def get_error_logs(
    job_id: Optional[int] = Query(None, description="Filter by job ID"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    db: Session = Depends(get_db)
):
    """
    Get error logs, optionally filtered by job.
    
    Returns audit logs for errors, validation failures, and generation failures.
    """
    logs = AuditService.get_error_logs(db, job_id, limit)
    
    return AuditLogListResponse(
        total=len(logs),
        logs=logs
    )


# ===========================
# Metrics Endpoints
# ===========================

@router.get("/metrics/summary", response_model=MetricsSummaryResponse)
def get_metrics_summary(
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive metrics summary for the last N hours.
    
    Provides job statistics, success rates, performance metrics, and error counts.
    """
    summary = MetricsService.get_metrics_summary(db, hours)
    return summary


@router.post("/metrics/aggregate", response_model=MetricAggregateResponse)
def get_metric_aggregate(
    request: MetricAggregateRequest,
    db: Session = Depends(get_db)
):
    """
    Get aggregated metric value.
    
    Supports sum, avg, min, max, and count aggregations.
    Can filter by time range and job ID.
    """
    value = MetricsService.get_metric_aggregate(
        db=db,
        metric_name=request.metric_name,
        aggregation=request.aggregation,
        start_time=request.start_time,
        end_time=request.end_time,
        job_id=request.job_id
    )
    
    return MetricAggregateResponse(
        metric_name=request.metric_name,
        aggregation=request.aggregation,
        value=value,
        start_time=request.start_time,
        end_time=request.end_time
    )


@router.get("/metrics/success-rate/{operation}", response_model=SuccessRateResponse)
def get_success_rate(
    operation: str = Path(..., description="Operation: yaml_generation or code_generation"),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    db: Session = Depends(get_db)
):
    """
    Get success rate for an operation.
    
    Calculates success rate based on success and failure counts.
    Supported operations: yaml_generation, code_generation.
    """
    start_time = datetime.utcnow()
    if hours:
        from datetime import timedelta
        start_time = start_time - timedelta(hours=hours)
    
    if operation == "yaml_generation":
        success_metric = MetricsService.YAML_GENERATION_SUCCESS
        failure_metric = MetricsService.YAML_GENERATION_FAILURE
    elif operation == "code_generation":
        success_metric = MetricsService.CODE_GENERATION_SUCCESS
        failure_metric = MetricsService.CODE_GENERATION_FAILURE
    else:
        raise HTTPException(status_code=400, detail=f"Invalid operation: {operation}")
    
    result = MetricsService.get_success_rate(
        db, success_metric, failure_metric, start_time
    )
    
    return SuccessRateResponse(**result)


@router.get("/metrics/performance/{operation}", response_model=PerformanceStatsResponse)
def get_performance_stats(
    operation: str = Path(..., description="Operation: yaml_generation, code_generation, or review"),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    db: Session = Depends(get_db)
):
    """
    Get performance statistics for an operation.
    
    Returns min, max, avg, and count for operation duration.
    Supported operations: yaml_generation, code_generation, review.
    """
    start_time = datetime.utcnow()
    if hours:
        from datetime import timedelta
        start_time = start_time - timedelta(hours=hours)
    
    if operation == "yaml_generation":
        metric_name = MetricsService.YAML_GENERATION_TIME
    elif operation == "code_generation":
        metric_name = MetricsService.CODE_GENERATION_TIME
    elif operation == "review":
        metric_name = MetricsService.REVIEW_TIME
    else:
        raise HTTPException(status_code=400, detail=f"Invalid operation: {operation}")
    
    stats = MetricsService.get_performance_stats(db, metric_name, start_time)
    
    return PerformanceStatsResponse(**stats)


@router.get("/health", response_model=dict)
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint.
    
    Returns system health status and basic metrics.
    """
    from datetime import timedelta
    
    # Get metrics for last 1 hour
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    recent_errors = MetricsService.get_metric_aggregate(
        db, MetricsService.ERROR_COUNT, "count", one_hour_ago
    )
    
    recent_jobs = MetricsService.get_metric_aggregate(
        db, MetricsService.JOB_CREATED, "count", one_hour_ago
    )
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "metrics": {
            "recent_errors_1h": int(recent_errors),
            "recent_jobs_1h": int(recent_jobs)
        }
    }
