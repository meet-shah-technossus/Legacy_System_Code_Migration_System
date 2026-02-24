"""
CodeReview database model.
Tracks review decisions on generated target-language code (Agent 2 output).
Mirrors the YAML review concept but for the code generation stage.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class CodeReview(Base):
    """
    Review decision on a piece of generated code.
    Created when a reviewer accepts or rejects the code produced by Agent 2.
    """
    __tablename__ = "code_reviews"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Keys
    job_id = Column(
        Integer,
        ForeignKey("migration_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    generated_code_id = Column(
        Integer,
        ForeignKey("generated_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Decision
    # Values: "CODE_APPROVE" | "CODE_REJECT_REGENERATE"
    decision = Column(String(50), nullable=False)

    # Reviewer feedback
    general_comment = Column(Text, nullable=True)   # Free-text feedback / rejection reason

    # Who reviewed
    reviewed_by = Column(String(100), nullable=True)

    # Whether this review led to regeneration
    triggered_regeneration = Column(Boolean, default=False, nullable=False)

    # Timestamps
    reviewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    job = relationship("MigrationJob", back_populates="code_reviews")
    generated_code = relationship("GeneratedCode", back_populates="code_reviews")

    def __repr__(self):
        return (
            f"<CodeReview(id={self.id}, job_id={self.job_id}, "
            f"decision={self.decision}, reviewed_by={self.reviewed_by})>"
        )
