"""
GeneratedCode database model.
Stores the final generated modern language code.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
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
    
    # Timestamps
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    job = relationship("MigrationJob", back_populates="generated_codes")
    
    def __repr__(self):
        return f"<GeneratedCode(id={self.id}, job_id={self.job_id}, language={self.target_language})>"
