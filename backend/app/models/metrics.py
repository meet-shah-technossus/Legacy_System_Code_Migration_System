"""
Metrics database model for monitoring and performance tracking.
Tracks operational metrics for observability and analytics.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from datetime import datetime

from app.core.database import Base


class Metric(Base):
    """
    Metrics for monitoring system performance and usage.
    Provides insights into system health and performance.
    """
    __tablename__ = "metrics"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Metric Information
    metric_name = Column(String(100), nullable=False, index=True)
    metric_type = Column(String(50), nullable=False)  # 'counter', 'gauge', 'timer', 'histogram'
    
    # Metric Values
    value = Column(Float, nullable=False)
    unit = Column(String(50), nullable=True)  # 'count', 'seconds', 'bytes', etc.
    
    # Context
    job_id = Column(Integer, nullable=True, index=True)
    tags = Column(Text, nullable=True)  # JSON string of tags for filtering
    
    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    def __repr__(self):
        return f"<Metric(id={self.id}, name={self.metric_name}, value={self.value}, timestamp={self.timestamp})>"
