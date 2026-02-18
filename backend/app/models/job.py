"""
MigrationJob database model.
Tracks the overall migration job lifecycle.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import JobState, TargetLanguage


class MigrationJob(Base):
    """
    Core migration job entity.
    Tracks the entire lifecycle of a Pick Basic to modern language migration.
    """
    __tablename__ = "migration_jobs"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Job Identification
    job_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    
    # Source Code
    original_source_code = Column(Text, nullable=False)
    source_filename = Column(String(255), nullable=True)
    pick_basic_version = Column(String(50), nullable=True)
    
    # Target Configuration
    target_language = Column(Enum(TargetLanguage), nullable=False, default=TargetLanguage.PYTHON)
    
    # State Management
    current_state = Column(Enum(JobState), nullable=False, default=JobState.CREATED)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_by = Column(String(100), nullable=True)  # Future: user ID
    metadata_json = Column(Text, nullable=True)  # Additional flexible metadata as JSON
    
    # Relationships
    yaml_versions = relationship("YAMLVersion", back_populates="job", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="job", cascade="all, delete-orphan")
    generated_codes = relationship("GeneratedCode", back_populates="job", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="job", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<MigrationJob(id={self.id}, state={self.current_state}, created_at={self.created_at})>"
