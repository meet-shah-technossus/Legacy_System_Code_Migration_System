"""
Review database models.
Tracks review decisions and section-specific comments.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import ReviewDecision, YAMLSectionType


class Review(Base):
    """
    Review decision for a YAML version.
    Each review is tied to a specific YAML version.
    """
    __tablename__ = "reviews"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Keys
    job_id = Column(Integer, ForeignKey("migration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    yaml_version_id = Column(Integer, ForeignKey("yaml_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Review Decision
    decision = Column(Enum(ReviewDecision), nullable=False)
    
    # General Feedback
    general_comment = Column(Text, nullable=True)
    
    # Reviewer Info
    reviewed_by = Column(String(100), nullable=True)  # Future: user ID
    reviewed_at = Column(DateTime, default=datetime.now, nullable=False)
    
    # Relationships
    job = relationship("MigrationJob", back_populates="reviews")
    comments = relationship("ReviewComment", back_populates="review", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Review(id={self.id}, job_id={self.job_id}, decision={self.decision})>"


class ReviewComment(Base):
    """
    Section-specific comments for a review.
    Allows targeted feedback on specific YAML sections.
    """
    __tablename__ = "review_comments"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Key
    review_id = Column(Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Comment Details
    section_type = Column(Enum(YAMLSectionType), nullable=False)
    section_path = Column(String(500), nullable=True)  # e.g., "logic_flow[0].children[2]"
    comment_text = Column(Text, nullable=False)
    
    # Priority/Severity
    is_blocking = Column(Integer, default=False, nullable=False)  # SQLite doesn't have native Boolean
    severity = Column(String(20), nullable=True)  # "critical", "warning", "suggestion"
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.now, nullable=False)
    
    # Relationship
    review = relationship("Review", back_populates="comments")
    
    def __repr__(self):
        return f"<ReviewComment(id={self.id}, section={self.section_type}, blocking={bool(self.is_blocking)})>"
