"""
YAMLVersion database model.
Tracks all versions of generated YAML for a job.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class YAMLVersion(Base):
    """
    YAML version tracking.
    Every YAML generation creates a new version - never overwrite.
    """
    __tablename__ = "yaml_versions"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Key to Job
    job_id = Column(Integer, ForeignKey("migration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Version Information
    version_number = Column(Integer, nullable=False)  # 1, 2, 3, etc.
    parent_version_id = Column(Integer, ForeignKey("yaml_versions.id", ondelete="SET NULL"), nullable=True)
    
    # YAML Content
    yaml_content = Column(Text, nullable=False)
    
    # Generation Context
    generation_prompt = Column(Text, nullable=True)  # The prompt sent to LLM
    regeneration_reason = Column(Text, nullable=True)  # Why this was regenerated
    reviewer_comments_context = Column(Text, nullable=True)  # Comments from previous review
    
    # Validation
    is_valid = Column(Boolean, default=True, nullable=False)
    validation_errors = Column(Text, nullable=True)  # JSON array of validation errors
    
    # Approval Status
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String(100), nullable=True)
    
    # Timestamps
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # LLM Metadata
    llm_model_used = Column(String(100), nullable=True)
    llm_tokens_used = Column(Integer, nullable=True)
    generation_time_seconds = Column(Integer, nullable=True)
    
    # Relationships
    job = relationship("MigrationJob", back_populates="yaml_versions")
    parent_version = relationship("YAMLVersion", remote_side=[id], backref="child_versions")
    
    def __repr__(self):
        return f"<YAMLVersion(id={self.id}, job_id={self.job_id}, version={self.version_number}, approved={self.is_approved})>"
