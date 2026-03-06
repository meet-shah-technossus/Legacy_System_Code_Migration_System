"""
LineComment database model.
Stores line-level reviewer comments on YAML or generated code.
These comments are pinned to specific line numbers and bundled
into the LLM regeneration prompt for targeted improvements.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class LineComment(Base):
    """
    Stores a reviewer's inline comment on a specific line of code.
    Tied to a job and a line number within the current YAML or generated code.
    """
    __tablename__ = "line_comments"

    id = Column(Integer, primary_key=True, index=True)

    # Which job this comment belongs to
    job_id = Column(Integer, ForeignKey("migration_jobs.id"), nullable=False, index=True)

    # Line number in the code being reviewed (1-based)
    line_number = Column(Integer, nullable=False)

    # Which code artifact this line is from: "yaml" or "generated_code"
    code_type = Column(String(20), nullable=False, default="yaml")

    # The reviewer's comment text
    comment = Column(Text, nullable=False)

    # Who left the comment
    reviewer = Column(String(100), nullable=True)

    # Whether this comment was included in a regeneration request
    included_in_regeneration = Column(Boolean, default=False, nullable=False)

    # The review round this comment was created in (increments per rejection)
    review_round = Column(Integer, default=1, nullable=False)

    # Timestamp
    created_at = Column(DateTime, default=datetime.now, nullable=False)

    # Relationship back to job
    job = relationship("MigrationJob", back_populates="line_comments")

    def __repr__(self):
        return (
            f"<LineComment(id={self.id}, job_id={self.job_id}, "
            f"line={self.line_number}, code_type={self.code_type})>"
        )
