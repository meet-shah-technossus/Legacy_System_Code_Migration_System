"""
Application configuration management using Pydantic Settings.
Loads configuration from environment variables and .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    APP_NAME: str = "Legacy Code Migration System"
    APP_VERSION: str = "1.0.0.0"
    APP_COPYRIGHT: str = "© 2026 Technossus. All rights reserved."
    DEBUG: bool = True
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Database
    DATABASE_URL: str = "sqlite:///./migration.db"
    DB_ECHO: bool = False  # Log SQL queries
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    
    # LLM Configuration - OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1"

    # LLM Configuration - Anthropic (used when job/step selects ANTHROPIC provider)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-opus-4-5"
    
    # LLM Settings
    MAX_YAML_RETRY_ATTEMPTS: int = 3
    MAX_CODE_RETRY_ATTEMPTS: int = 2
    LLM_TIMEOUT_SECONDS: int = 60
    MAX_TOKENS: int = 8000
    DEFAULT_TEMPERATURE: float = 0.2
    
    # Pagination Defaults
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 1000
    DEFAULT_SKIP: int = 0
    
    # Code Generation
    DEFAULT_INDENTATION: int = 4
    MAX_CODE_LINE_LENGTH: int = 100
    INCLUDE_GENERATED_HEADER: bool = True
    
    # Audit & Metrics
    AUDIT_LOG_RETENTION_DAYS: int = 90
    METRICS_RETENTION_DAYS: int = 30
    DEFAULT_METRICS_SUMMARY_HOURS: int = 24
    MAX_RECENT_AUDIT_LOGS: int = 100
    
    # Review Settings
    ALLOW_SELF_REVIEW: bool = False
    MAX_REVIEW_COMMENTS_PER_REVIEW: int = 50
    
    # YAML Generation
    YAML_INDENT: int = 2
    YAML_MAX_LINE_LENGTH: int = 120
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# Global settings instance
settings = Settings()
