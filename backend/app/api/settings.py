"""
Settings API — CRUD endpoints for runtime application configuration.

GET  /api/settings/llm    → read current LLM config (model names + provider)
PUT  /api/settings/llm    → update LLM config (no restart required)
GET  /api/settings/keys   → read API keys (masked)
PUT  /api/settings/keys   → update API keys (stored in DB, env is fallback)
GET  /api/settings/all    → all stored config keys (admin only, for debug)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.config import settings as app_settings
from app.services.system_config_service import (
    get_all_configs,
    get_config_value,
    get_api_key,
    set_config_value,
    invalidate_cache,
    KEY_OPENAI_MODEL,
    KEY_ANTHROPIC_MODEL,
    KEY_DEFAULT_LLM_PROVIDER,
    KEY_OPENAI_API_KEY,
    KEY_ANTHROPIC_API_KEY,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class LLMConfigResponse(BaseModel):
    openai_model: str
    anthropic_model: str
    default_llm_provider: str


class LLMConfigUpdate(BaseModel):
    openai_model: Optional[str] = Field(None, min_length=1, max_length=200)
    anthropic_model: Optional[str] = Field(None, min_length=1, max_length=200)
    default_llm_provider: Optional[str] = Field(None, pattern="^(OPENAI|ANTHROPIC)$")


class SingleConfigResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    updated_at: Optional[str] = None


class AllConfigsResponse(BaseModel):
    configs: dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/llm",
    response_model=LLMConfigResponse,
    summary="Get current LLM model configuration",
    description="Returns the active model names for OpenAI and Anthropic, and the default provider. "
                "Values reflect what is stored in the database; if a value was never saved, the "
                "environment-variable default is returned.",
)
def get_llm_config(db: Session = Depends(get_db)) -> LLMConfigResponse:
    merged = get_all_configs(db)
    return LLMConfigResponse(
        openai_model=merged.get(KEY_OPENAI_MODEL, ""),
        anthropic_model=merged.get(KEY_ANTHROPIC_MODEL, ""),
        default_llm_provider=merged.get(KEY_DEFAULT_LLM_PROVIDER, "OPENAI"),
    )


@router.put(
    "/llm",
    response_model=LLMConfigResponse,
    summary="Update LLM model configuration",
    description="Persists new model names or default provider to the database. Changes take effect "
                "for new LLM calls within ~60 seconds (cache TTL) — no application restart required. "
                "Only fields provided in the request body are updated; omitted fields are unchanged.",
)
def update_llm_config(
    payload: LLMConfigUpdate,
    db: Session = Depends(get_db),
) -> LLMConfigResponse:
    if payload.openai_model is not None:
        set_config_value(KEY_OPENAI_MODEL, payload.openai_model, db)

    if payload.anthropic_model is not None:
        set_config_value(KEY_ANTHROPIC_MODEL, payload.anthropic_model, db)

    if payload.default_llm_provider is not None:
        set_config_value(KEY_DEFAULT_LLM_PROVIDER, payload.default_llm_provider.upper(), db)

    merged = get_all_configs(db)
    logger.info(
        "LLM config updated via API: openai=%s anthropic=%s provider=%s",
        merged.get(KEY_OPENAI_MODEL),
        merged.get(KEY_ANTHROPIC_MODEL),
        merged.get(KEY_DEFAULT_LLM_PROVIDER),
    )
    return LLMConfigResponse(
        openai_model=merged.get(KEY_OPENAI_MODEL, ""),
        anthropic_model=merged.get(KEY_ANTHROPIC_MODEL, ""),
        default_llm_provider=merged.get(KEY_DEFAULT_LLM_PROVIDER, "OPENAI"),
    )


@router.get(
    "/all",
    response_model=AllConfigsResponse,
    summary="Get all configuration entries (debug)",
    description="Returns every key/value pair currently stored in the system_configs table, "
                "merged with defaults for any keys not yet saved.",
)
def get_all_config_entries(db: Session = Depends(get_db)) -> AllConfigsResponse:
    return AllConfigsResponse(configs=get_all_configs(db))


# ── API Key helpers ────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    """Return a masked version of an API key for safe display.

    Shows the first 8 characters and replaces the rest with ****,
    so users can confirm which key is active without exposing the secret.
    Returns an empty string when no key is configured.
    """
    if not key:
        return ""
    return key[:8] + "****" if len(key) > 8 else "****"


# ── API Key schemas ────────────────────────────────────────────────────────────

class APIKeysResponse(BaseModel):
    """Masked API key values — safe to return to the frontend."""
    openai_api_key: str = Field(..., description="Masked OpenAI API key (e.g. sk-proj-Ab****).")
    anthropic_api_key: str = Field(..., description="Masked Anthropic API key.")
    openai_source: str = Field(..., description="'db' if key comes from DB, 'env' if from .env file.")
    anthropic_source: str = Field(..., description="'db' if key comes from DB, 'env' if from .env file.")


class APIKeysUpdate(BaseModel):
    """Plaintext API keys to persist in the database."""
    openai_api_key: Optional[str] = Field(
        None,
        description="New OpenAI API key. Pass an empty string to clear the DB value (env fallback applies).",
    )
    anthropic_api_key: Optional[str] = Field(
        None,
        description="New Anthropic API key. Pass an empty string to clear the DB value (env fallback applies).",
    )


# ── API Key endpoints ──────────────────────────────────────────────────────────

def _key_source(db_raw: str, env_val: str) -> str:
    """Return 'db' if the DB value is non-empty, else 'env'."""
    return "db" if db_raw and db_raw.strip() else ("env" if env_val else "not_set")


@router.get(
    "/keys",
    response_model=APIKeysResponse,
    summary="Get active API keys (masked)",
    description="Returns masked versions of the active API keys for each provider. "
                "The 'source' fields indicate whether the key is coming from the database "
                "or from the environment / .env file.",
)
def get_api_keys(db: Session = Depends(get_db)) -> APIKeysResponse:
    from app.models.system_config import SystemConfig as _SC

    openai_row = db.query(_SC).filter(_SC.key == KEY_OPENAI_API_KEY).first()
    anthropic_row = db.query(_SC).filter(_SC.key == KEY_ANTHROPIC_API_KEY).first()

    openai_db_raw = openai_row.value if openai_row else ""
    anthropic_db_raw = anthropic_row.value if anthropic_row else ""

    # Resolve the actual key (DB takes precedence; env is fallback)
    openai_active = get_api_key(KEY_OPENAI_API_KEY, app_settings.OPENAI_API_KEY)
    anthropic_active = get_api_key(KEY_ANTHROPIC_API_KEY, app_settings.ANTHROPIC_API_KEY)

    return APIKeysResponse(
        openai_api_key=_mask_key(openai_active),
        anthropic_api_key=_mask_key(anthropic_active),
        openai_source=_key_source(openai_db_raw, app_settings.OPENAI_API_KEY),
        anthropic_source=_key_source(anthropic_db_raw, app_settings.ANTHROPIC_API_KEY),
    )


@router.put(
    "/keys",
    response_model=APIKeysResponse,
    summary="Update API keys",
    description="Persists new API keys to the database. Changes take effect immediately for "
                "new LLM client instances (the singleton is invalidated on the next request). "
                "Pass an empty string for a key to clear the DB override and fall back to the "
                "environment variable. Only fields included in the request body are changed.",
)
def update_api_keys(
    payload: APIKeysUpdate,
    db: Session = Depends(get_db),
) -> APIKeysResponse:
    if payload.openai_api_key is not None:
        # Store empty string to clear (get_api_key treats empty as 'not set')
        set_config_value(KEY_OPENAI_API_KEY, payload.openai_api_key.strip(), db,
                         description="OpenAI API key (overrides OPENAI_API_KEY env variable)")
        logger.info("OpenAI API key updated via Settings UI")

    if payload.anthropic_api_key is not None:
        set_config_value(KEY_ANTHROPIC_API_KEY, payload.anthropic_api_key.strip(), db,
                         description="Anthropic API key (overrides ANTHROPIC_API_KEY env variable)")
        logger.info("Anthropic API key updated via Settings UI")

    # Invalidate the config cache so LLM client singletons pick up the change
    invalidate_cache()

    # Return masked response
    return get_api_keys(db)
