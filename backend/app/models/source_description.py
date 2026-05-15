"""
SourceDescription database model.
Stores the LLM-generated plain-English description produced directly
from the Pick Basic source code (as opposed to YAMLDescription which
is produced from the approved YAML).
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import LLMProvider


class SourceDescription(Base):
    """
    Cached plain-English description generated from the original Pick Basic
    source code.

    One description record per job_id.  If the user requests a new generation,
    the existing record is replaced.
    """
    __tablename__ = "source_descriptions"

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Key
    job_id = Column(
        Integer,
        ForeignKey("migration_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )

    # Generated content — full Markdown document
    description_text = Column(Text, nullable=False)

    # LLM provenance
    llm_provider = Column(SAEnum(LLMProvider), nullable=True)
    llm_model = Column(String(100), nullable=True)

    # Who requested the generation
    generated_by = Column(String(100), nullable=True)

    # Timestamps
    generated_at = Column(DateTime, default=datetime.now, nullable=False, index=True)

    # Relationships
    job = relationship("MigrationJob", backref="source_descriptions")

    def __repr__(self) -> str:
        return (
            f"<SourceDescription(id={self.id}, job_id={self.job_id})>"
        )
