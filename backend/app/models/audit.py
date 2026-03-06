"""
AuditLog database model.
Tracks all state transitions and important events.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import AuditAction


class AuditLog(Base):
    """
    Audit trail for all job events.
    Provides complete accountability and traceability.
    """
    __tablename__ = "audit_logs"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Key
    job_id = Column(Integer, ForeignKey("migration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Action Details
    action = Column(Enum(AuditAction), nullable=False)
    description = Column(Text, nullable=True)
    
    # State Transition (if applicable)
    old_state = Column(String(50), nullable=True)
    new_state = Column(String(50), nullable=True)
    
    # Actor
    performed_by = Column(String(100), nullable=True)  # User ID or "SYSTEM"
    
    # Context
    metadata_json = Column(Text, nullable=True)  # Additional context as JSON
    
    # Timestamps
    timestamp = Column(DateTime, default=datetime.now, nullable=False, index=True)
    
    # Relationship
    job = relationship("MigrationJob", back_populates="audit_logs")
    
    def __repr__(self):
        return f"<AuditLog(id={self.id}, job_id={self.job_id}, action={self.action}, timestamp={self.timestamp})>"
