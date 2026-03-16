"""
SystemConfig model — stores runtime-editable key/value configuration.

Allows administrators to change settings (e.g. LLM model names, default
LLM provider) through the API without touching .env files or restarting
the application.  A short in-memory TTL cache (see system_config_service)
means changes propagate within ~60 seconds.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class SystemConfig(Base):
    """Key-value store for runtime application configuration."""

    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False, default="")
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:  # pragma: no cover
        return f"<SystemConfig key={self.key!r} value={self.value!r}>"
