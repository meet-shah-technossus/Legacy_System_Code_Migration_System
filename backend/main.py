"""
Main FastAPI application entry point.

This module initializes the Legacy System Code Migration backend service,
which provides a two-stage transformation system for migrating Pick Basic
code to modern programming languages (Python, JavaScript, Java).

Key Features:
    - Two-stage transformation: Pick Basic → YAML → Target Language
    - LLM-powered YAML generation using Google Gemini
    - Hybrid code generation (LLM + rule-based mapper)
    - Human-in-the-loop review workflow
    - Comprehensive audit logging and metrics
    - State machine-driven job lifecycle management

Architecture:
    - Agent 1 (YAML Generator): Converts Pick Basic to intermediate YAML
    - Agent 2 (Code Generator): Transforms YAML to target language code
    - Review System: Human approval gates between stages
    - Audit Layer: Complete observability and compliance tracking

API Endpoints:
    - /api/jobs: Job management (CRUD, state transitions, statistics)
    - /api/yaml: YAML generation and versioning
    - /api/reviews: Review submission and approval workflow
    - /api/code-generation: Code generation and retrieval
    - /api/audit-logs: Audit trail queries
    - /api/metrics: Performance metrics and health monitoring

Configuration:
    - Environment variables loaded from .env file
    - See app.core.config.Settings for all configuration options

Database:
    - SQLite for development (configurable via DATABASE_URL)
    - SQLAlchemy ORM with automatic schema creation

For more information, see the API documentation at /docs or /redoc.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import init_db
from app.api import jobs, yaml, reviews, code_generation, audit_metrics, auth, chat
from app.api import settings as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup: Initialize database
    print("🚀 Starting up application...")
    print(f"📦 App: {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"🗄️  Database: {settings.DATABASE_URL}")
    init_db()
    print("✅ Database initialized")
    
    yield
    
    # Shutdown
    print("👋 Shutting down application...")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend service for migrating Pick Basic code to modern languages. © 2026 Technossus. All rights reserved.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/", tags=["Health"])
async def root():
    """Root endpoint - health check."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "copyright": settings.APP_COPYRIGHT,
        "message": "Legacy Code Migration Backend is running"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "copyright": settings.APP_COPYRIGHT,
        "database": "connected",
        "llm_configured": bool(settings.OPENAI_API_KEY)
    }


# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(yaml.router, prefix="/api", tags=["YAML"])
app.include_router(reviews.router, prefix="/api/jobs", tags=["Reviews"])
app.include_router(code_generation.router, prefix="/api/jobs", tags=["Code Generation"])
app.include_router(audit_metrics.router, tags=["Audit & Metrics"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
