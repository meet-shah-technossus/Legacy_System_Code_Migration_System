"""
Application configuration management using Pydantic Settings.
Loads configuration from environment variables and .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    APP_NAME: str = "Legacy Code Migration Backend"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Database
    DATABASE_URL: str = "sqlite:///./migration.db"
    
    # LLM Configuration - Google Gemini
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash-exp"
    
    # LLM Settings
    MAX_YAML_RETRY_ATTEMPTS: int = 3
    MAX_CODE_RETRY_ATTEMPTS: int = 2
    LLM_TIMEOUT_SECONDS: int = 60
    MAX_TOKENS: int = 8000
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
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
