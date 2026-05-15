"""
JobBRD database model.
Stores the LLM-generated Business Requirements Document (BRD) for a job.
Generated on-demand from both the approved YAML and original source code.
Cached so repeated downloads do not trigger additional LLM calls.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import LLMProvider


class JobBRD(Base):
    """
    Cached Business Requirements Document for a job.

    Two variants per job, distinguished by generation_source:
      - 'yaml'        — generated from the approved YAML only
      - 'source_code' — generated from the original Pick Basic source code only
    """
    __tablename__ = "job_brds"
    __table_args__ = (
        UniqueConstraint('job_id', 'generation_source', name='uq_job_brd_source'),
    )

    # Primary Key
    id = Column(Integer, primary_key=True, index=True)

    # Foreign Keys
    job_id = Column(
        Integer,
        ForeignKey("migration_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    yaml_version_id = Column(
        Integer,
        ForeignKey("yaml_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Which input was used to generate this BRD
    generation_source = Column(String(20), nullable=False, default='yaml')  # 'yaml' | 'source_code'

    # Generated content — full Markdown BRD document
    brd_text = Column(Text, nullable=False)

    # LLM provenance
    llm_provider = Column(SAEnum(LLMProvider), nullable=True)
    llm_model = Column(String(100), nullable=True)

    # Who requested the generation
    generated_by = Column(String(100), nullable=True)

    # Timestamps
    generated_at = Column(DateTime, default=datetime.now, nullable=False, index=True)

    # Relationships
    job = relationship("MigrationJob", backref="job_brds")
    yaml_version = relationship("YAMLVersion", backref="brds")

    def __repr__(self) -> str:
        return (
            f"<JobBRD(id={self.id}, job_id={self.job_id}, "
            f"generation_source={self.generation_source!r})>"
        )
