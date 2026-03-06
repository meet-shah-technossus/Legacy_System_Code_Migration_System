"""
MigrationJob database model.
Tracks the overall migration job lifecycle.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import JobState, JobType, TargetLanguage


class MigrationJob(Base):
    """
    Core migration job entity.
    Tracks the entire lifecycle of a Pick Basic to modern language migration.
    """
    __tablename__ = "migration_jobs"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Job Type & Relationship
    job_type = Column(Enum(JobType), nullable=False, default=JobType.YAML_CONVERSION, index=True)
    parent_job_id = Column(Integer, ForeignKey("migration_jobs.id"), nullable=True, index=True)

    # Job Identification
    job_name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)

    # Source Code (only for Job 1; Job 2 inherits YAML from parent)
    original_source_code = Column(Text, nullable=True)
    source_filename = Column(String(255), nullable=True)
    pick_basic_version = Column(String(50), nullable=True)

    # Target Configuration (only for Job 2; not asked at Job 1 creation)
    target_language = Column(Enum(TargetLanguage), nullable=True, default=None, index=True)
    
    # State Management
    current_state = Column(Enum(JobState), nullable=False, default=JobState.CREATED, index=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_by = Column(String(100), nullable=True, index=True)  # Future: user ID
    metadata_json = Column(Text, nullable=True)  # Additional flexible metadata as JSON
    
    # Relationships
    parent_job = relationship("MigrationJob", remote_side="MigrationJob.id", foreign_keys=[parent_job_id], back_populates="child_jobs")
    child_jobs = relationship("MigrationJob", back_populates="parent_job", foreign_keys="MigrationJob.parent_job_id")
    yaml_versions = relationship("YAMLVersion", back_populates="job", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="job", cascade="all, delete-orphan")
    generated_codes = relationship("GeneratedCode", back_populates="job", cascade="all, delete-orphan")
    code_reviews = relationship("CodeReview", back_populates="job", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="job", cascade="all, delete-orphan")
    line_comments = relationship("LineComment", back_populates="job", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<MigrationJob(id={self.id}, state={self.current_state}, created_at={self.created_at})>"
