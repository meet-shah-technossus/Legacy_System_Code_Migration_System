"""
YAMLDescription database model.
Stores the LLM-generated plain-English description for an approved YAML version.
Generated on-demand (not every time) and cached here so repeated downloads
do not trigger additional LLM calls.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base
from app.core.enums import LLMProvider


class YAMLDescription(Base):
    """
    Cached plain-English description of an approved YAML version.

    One description record per (job_id, yaml_version_id) pair.
    If the user requests a new generation, the existing record is replaced.
    """
    __tablename__ = "yaml_descriptions"

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
        ForeignKey("yaml_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Generated content — full Markdown document
    description_text = Column(Text, nullable=False)

    # LLM provenance — same model that generated the YAML
    llm_provider = Column(SAEnum(LLMProvider), nullable=True)
    llm_model = Column(String(100), nullable=True)

    # Who requested the generation
    generated_by = Column(String(100), nullable=True)

    # Timestamps
    generated_at = Column(DateTime, default=datetime.now, nullable=False, index=True)

    # Relationships
    job = relationship("MigrationJob", backref="yaml_descriptions")
    yaml_version = relationship("YAMLVersion", backref="descriptions")

    def __repr__(self) -> str:
        return (
            f"<YAMLDescription(id={self.id}, job_id={self.job_id}, "
            f"yaml_version_id={self.yaml_version_id})>"
        )
