"""
GeneratedCode database model.
Stores the final generated modern language code.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class GeneratedCode(Base):
    """
    Generated modern language code from approved YAML.
    Stores the output of LLM Agent 2.
    """
    __tablename__ = "generated_codes"
    
    # Primary Key
    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign Keys
    job_id = Column(Integer, ForeignKey("migration_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    yaml_version_id = Column(Integer, ForeignKey("yaml_versions.id", ondelete="SET NULL"), nullable=True)
    
    # Generated Code
    code_content = Column(Text, nullable=False)
    target_language = Column(String(50), nullable=False)  # Python, TypeScript, etc.
    
    # Generation Context
    mapping_rules_used = Column(Text, nullable=True)  # JSON of which mapping rules were applied
    generation_prompt = Column(Text, nullable=True)  # The prompt sent to Agent 2
    reviewer_constraints = Column(Text, nullable=True)  # Comments from approved review
    
    # Code Metadata
    estimated_lines_of_code = Column(Integer, nullable=True)
    complexity_score = Column(Integer, nullable=True)  # Future: code complexity analysis
    
    # File Structure (if multi-file output)
    output_files = Column(Text, nullable=True)  # JSON array of {filename, content} objects
    
    # LLM Metadata
    llm_model_used = Column(String(100), nullable=True)
    llm_tokens_used = Column(Integer, nullable=True)
    generation_time_seconds = Column(Integer, nullable=True)

    # Phase 1 (Structured Output) — Agent 2 envelope metadata
    # JSON-serialised lists; None when code was generated before Phase 1
    sections_covered = Column(Text, nullable=True)          # JSON list[str]
    external_stubs_included = Column(Text, nullable=True)   # JSON list[str]
    generation_warnings = Column(Text, nullable=True)       # JSON list[str]
    llm_envelope_used = Column(Boolean, nullable=True)      # True/False/None

    # Phase 2 (Language-Specific Validation) — per-attempt validation metadata
    validation_tool_available = Column(Boolean, nullable=True)  # False = toolchain absent
    validation_errors = Column(Text, nullable=True)             # JSON list[str]

    # Phase 3 (Code Version Control) — version tracking per job
    version_number = Column(Integer, nullable=True, index=True)  # 1, 2, 3… per job
    is_current = Column(Boolean, nullable=True, default=False)   # True on the latest version

    # Timestamps
    generated_at = Column(DateTime, default=datetime.now, nullable=False)

    # Review gate — True only after a reviewer explicitly accepts this code
    is_accepted = Column(Boolean, default=False, nullable=False)

    # Relationships
    job = relationship("MigrationJob", back_populates="generated_codes")
    code_reviews = relationship("CodeReview", back_populates="generated_code", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<GeneratedCode(id={self.id}, job_id={self.job_id}, language={self.target_language})>"
