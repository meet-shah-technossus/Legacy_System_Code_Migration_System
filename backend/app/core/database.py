"""
Database configuration and session management.
Sets up SQLAlchemy with SQLite for the POC.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine
from app.core.config import settings

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    echo=settings.DEBUG  # Log SQL queries in debug mode
)

# Enable foreign key support for SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable foreign key constraints for SQLite."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def get_db():
    """
    Dependency for getting database sessions.
    Yields a database session and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database - create all tables.
    Called on application startup.
    """
    # Import all models here to ensure they're registered with Base
    from app.models import (
        MigrationJob,
        YAMLVersion,
        Review,
        ReviewComment,
        GeneratedCode,
        CodeReview,
        AuditLog,
        Metric,
        LineComment,
        SystemConfig,  # noqa: F401 — registers system_configs table
    )
    from app.models.user import User  # noqa: F401 — registers users table

    Base.metadata.create_all(bind=engine)
    _safe_add_columns()

    # Seed default LLM config values so the Settings UI always has something to show
    from app.services.system_config_service import seed_defaults
    _seed_db = SessionLocal()
    try:
        seed_defaults(_seed_db)
    finally:
        _seed_db.close()


def _safe_add_columns():
    """Add new columns to existing tables without Alembic.

    SQLite does not support ALTER TABLE DROP COLUMN or ALTER TABLE MODIFY COLUMN,
    but it does support ALTER TABLE ADD COLUMN.  We use PRAGMA table_info to
    detect missing columns and add them only when absent (idempotent).
    """
    import sqlite3

    # Only applicable for SQLite
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    conn = sqlite3.connect(db_path)

    def existing_columns(table: str):
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return {row[1] for row in rows}  # row[1] = column name

    migrations = [
        # (table, column, DDL type)
        ("migration_jobs", "yaml_llm_provider",  "VARCHAR(20)"),
        ("migration_jobs", "yaml_llm_model",     "VARCHAR(100)"),
        ("migration_jobs", "code_llm_provider",  "VARCHAR(20)"),
        ("migration_jobs", "code_llm_model",     "VARCHAR(100)"),
        ("generated_codes", "llm_provider",      "VARCHAR(20)"),
    ]

    for table, col, col_type in migrations:
        cols = existing_columns(table)
        if col not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
            conn.commit()

    conn.close()
