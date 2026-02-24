"""
Metrics service for tracking system performance and operational metrics.
Provides observability into system health, performance, and usage patterns.
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import json

from app.models.metrics import Metric


class MetricsService:
    """
    Service for recording and querying system metrics.
    Tracks performance, usage, and operational health.
    """
    
    # Metric Names
    JOB_CREATED = "job.created"
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    JOB_DURATION = "job.duration"
    
    YAML_GENERATION_TIME = "yaml.generation_time"
    YAML_GENERATION_SUCCESS = "yaml.generation_success"
    YAML_GENERATION_FAILURE = "yaml.generation_failure"
    YAML_VALIDATION_TIME = "yaml.validation_time"
    YAML_SIZE = "yaml.size_bytes"
    
    CODE_GENERATION_TIME = "code.generation_time"
    CODE_GENERATION_SUCCESS = "code.generation_success"
    CODE_GENERATION_FAILURE = "code.generation_failure"
    CODE_SIZE = "code.size_bytes"
    CODE_LINES = "code.line_count"
    
    REVIEW_SUBMITTED = "review.submitted"
    REVIEW_APPROVED = "review.approved"
    REVIEW_REJECTED = "review.rejected"
    REVIEW_TIME = "review.time_to_decision"
    
    LLM_REQUEST_TIME = "llm.request_time"
    LLM_TOKEN_COUNT = "llm.token_count"
    LLM_COST = "llm.cost_dollars"
    
    STATE_TRANSITION = "state.transition"
    ERROR_COUNT = "error.count"
    
    @staticmethod
    def record_counter(
        db: Session,
        metric_name: str,
        value: float = 1.0,
        job_id: Optional[int] = None,
        tags: Optional[Dict[str, Any]] = None
    ) -> Metric:
        """
        Record a counter metric (incremental value).
        
        Args:
            db: Database session
            metric_name: Name of the metric
            value: Value to increment by (default 1)
            job_id: Optional job ID for context
            tags: Optional tags for filtering
            
        Returns:
            Created Metric instance
        """
        return MetricsService._record_metric(
            db=db,
            metric_name=metric_name,
            metric_type="counter",
            value=value,
            job_id=job_id,
            tags=tags
        )
    
    @staticmethod
    def record_gauge(
        db: Session,
        metric_name: str,
        value: float,
        unit: Optional[str] = None,
        job_id: Optional[int] = None,
        tags: Optional[Dict[str, Any]] = None
    ) -> Metric:
        """
        Record a gauge metric (point-in-time value).
        
        Args:
            db: Database session
            metric_name: Name of the metric
            value: Current value
            unit: Unit of measurement
            job_id: Optional job ID for context
            tags: Optional tags for filtering
            
        Returns:
            Created Metric instance
        """
        return MetricsService._record_metric(
            db=db,
            metric_name=metric_name,
            metric_type="gauge",
            value=value,
            unit=unit,
            job_id=job_id,
            tags=tags
        )
    
    @staticmethod
    def record_timer(
        db: Session,
        metric_name: str,
        duration_seconds: float,
        job_id: Optional[int] = None,
        tags: Optional[Dict[str, Any]] = None
    ) -> Metric:
        """
        Record a timer metric (duration measurement).
        
        Args:
            db: Database session
            metric_name: Name of the metric
            duration_seconds: Duration in seconds
            job_id: Optional job ID for context
            tags: Optional tags for filtering
            
        Returns:
            Created Metric instance
        """
        return MetricsService._record_metric(
            db=db,
            metric_name=metric_name,
            metric_type="timer",
            value=duration_seconds,
            unit="seconds",
            job_id=job_id,
            tags=tags
        )
    
    @staticmethod
    def _record_metric(
        db: Session,
        metric_name: str,
        metric_type: str,
        value: float,
        unit: Optional[str] = None,
        job_id: Optional[int] = None,
        tags: Optional[Dict[str, Any]] = None
    ) -> Metric:
        """
        Internal method to record a metric.
        
        Args:
            db: Database session
            metric_name: Name of the metric
            metric_type: Type of metric (counter, gauge, timer)
            value: Metric value
            unit: Unit of measurement
            job_id: Optional job ID for context
            tags: Optional tags for filtering
            
        Returns:
            Created Metric instance
        """
        metric = Metric(
            metric_name=metric_name,
            metric_type=metric_type,
            value=value,
            unit=unit,
            job_id=job_id,
            tags=json.dumps(tags) if tags else None,
            timestamp=datetime.utcnow()
        )
        
        db.add(metric)
        db.commit()
        db.refresh(metric)
        
        return metric
    
    @staticmethod
    def get_metric_aggregate(
        db: Session,
        metric_name: str,
        aggregation: str = "sum",  # sum, avg, min, max, count
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        job_id: Optional[int] = None
    ) -> float:
        """
        Get aggregated metric value.
        
        Args:
            db: Database session
            metric_name: Name of the metric
            aggregation: Aggregation function (sum, avg, min, max, count)
            start_time: Optional start time filter
            end_time: Optional end time filter
            job_id: Optional job ID filter
            
        Returns:
            Aggregated metric value
        """
        query = db.query(Metric).filter(Metric.metric_name == metric_name)
        
        if start_time:
            query = query.filter(Metric.timestamp >= start_time)
        if end_time:
            query = query.filter(Metric.timestamp <= end_time)
        if job_id is not None:
            query = query.filter(Metric.job_id == job_id)
        
        if aggregation == "sum":
            result = query.with_entities(func.sum(Metric.value)).scalar()
        elif aggregation == "avg":
            result = query.with_entities(func.avg(Metric.value)).scalar()
        elif aggregation == "min":
            result = query.with_entities(func.min(Metric.value)).scalar()
        elif aggregation == "max":
            result = query.with_entities(func.max(Metric.value)).scalar()
        elif aggregation == "count":
            result = query.count()
        else:
            raise ValueError(f"Invalid aggregation: {aggregation}")
        
        return float(result) if result is not None else 0.0
    
    @staticmethod
    def get_success_rate(
        db: Session,
        success_metric: str,
        failure_metric: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Calculate success rate from success and failure metrics.
        
        Args:
            db: Database session
            success_metric: Name of success metric
            failure_metric: Name of failure metric
            start_time: Optional start time filter
            end_time: Optional end time filter
            
        Returns:
            Dict with success_count, failure_count, total_count, success_rate
        """
        success_count = MetricsService.get_metric_aggregate(
            db, success_metric, "count", start_time, end_time
        )
        failure_count = MetricsService.get_metric_aggregate(
            db, failure_metric, "count", start_time, end_time
        )
        
        total = success_count + failure_count
        success_rate = (success_count / total * 100) if total > 0 else 0.0
        
        return {
            "success_count": int(success_count),
            "failure_count": int(failure_count),
            "total_count": int(total),
            "success_rate": round(success_rate, 2)
        }
    
    @staticmethod
    def get_performance_stats(
        db: Session,
        metric_name: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, float]:
        """
        Get performance statistics for a timer metric.
        
        Args:
            db: Database session
            metric_name: Name of the timer metric
            start_time: Optional start time filter
            end_time: Optional end time filter
            
        Returns:
            Dict with min, max, avg, count
        """
        return {
            "min": MetricsService.get_metric_aggregate(
                db, metric_name, "min", start_time, end_time
            ),
            "max": MetricsService.get_metric_aggregate(
                db, metric_name, "max", start_time, end_time
            ),
            "avg": MetricsService.get_metric_aggregate(
                db, metric_name, "avg", start_time, end_time
            ),
            "count": int(MetricsService.get_metric_aggregate(
                db, metric_name, "count", start_time, end_time
            ))
        }
    
    @staticmethod
    def get_metrics_summary(
        db: Session,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get comprehensive metrics summary for the last N hours.
        
        Args:
            db: Database session
            hours: Number of hours to look back
            
        Returns:
            Dict with various metrics summaries
        """
        start_time = datetime.utcnow() - timedelta(hours=hours)
        
        return {
            "time_range_hours": hours,
            "jobs": {
                "created": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.JOB_CREATED, "count", start_time
                )),
                "completed": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.JOB_COMPLETED, "count", start_time
                )),
                "failed": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.JOB_FAILED, "count", start_time
                ))
            },
            "yaml_generation": {
                "success_rate": MetricsService.get_success_rate(
                    db,
                    MetricsService.YAML_GENERATION_SUCCESS,
                    MetricsService.YAML_GENERATION_FAILURE,
                    start_time
                ),
                "performance": MetricsService.get_performance_stats(
                    db, MetricsService.YAML_GENERATION_TIME, start_time
                )
            },
            "code_generation": {
                "success_rate": MetricsService.get_success_rate(
                    db,
                    MetricsService.CODE_GENERATION_SUCCESS,
                    MetricsService.CODE_GENERATION_FAILURE,
                    start_time
                ),
                "performance": MetricsService.get_performance_stats(
                    db, MetricsService.CODE_GENERATION_TIME, start_time
                )
            },
            "reviews": {
                "submitted": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.REVIEW_SUBMITTED, "count", start_time
                )),
                "approved": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.REVIEW_APPROVED, "count", start_time
                )),
                "rejected": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.REVIEW_REJECTED, "count", start_time
                ))
            },
            "errors": {
                "total": int(MetricsService.get_metric_aggregate(
                    db, MetricsService.ERROR_COUNT, "count", start_time
                ))
            }
        }
