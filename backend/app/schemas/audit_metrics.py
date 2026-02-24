"""
Schemas for audit and metrics API endpoints.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any, List
from app.core.enums import AuditAction


class AuditLogResponse(BaseModel):
    """Response schema for audit log entry."""
    id: int
    job_id: int
    action: AuditAction
    description: Optional[str] = None
    old_state: Optional[str] = None
    new_state: Optional[str] = None
    performed_by: Optional[str] = None
    metadata_json: Optional[str] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Response schema for list of audit logs."""
    total: int
    logs: List[AuditLogResponse]


class AuditQueryRequest(BaseModel):
    """Request schema for querying audit logs."""
    job_id: Optional[int] = None
    action: Optional[AuditAction] = None
    performed_by: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


class MetricResponse(BaseModel):
    """Response schema for metric entry."""
    id: int
    metric_name: str
    metric_type: str
    value: float
    unit: Optional[str] = None
    job_id: Optional[int] = None
    tags: Optional[str] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True


class MetricAggregateRequest(BaseModel):
    """Request schema for metric aggregation."""
    metric_name: str
    aggregation: str = Field(default="sum", pattern="^(sum|avg|min|max|count)$")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    job_id: Optional[int] = None


class MetricAggregateResponse(BaseModel):
    """Response schema for metric aggregation."""
    metric_name: str
    aggregation: str
    value: float
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class SuccessRateResponse(BaseModel):
    """Response schema for success rate metrics."""
    success_count: int
    failure_count: int
    total_count: int
    success_rate: float


class PerformanceStatsResponse(BaseModel):
    """Response schema for performance statistics."""
    min: float
    max: float
    avg: float
    count: int


class MetricsSummaryResponse(BaseModel):
    """Response schema for metrics summary."""
    time_range_hours: int
    jobs: Dict[str, int]
    yaml_generation: Dict[str, Any]
    code_generation: Dict[str, Any]
    reviews: Dict[str, int]
    errors: Dict[str, int]
