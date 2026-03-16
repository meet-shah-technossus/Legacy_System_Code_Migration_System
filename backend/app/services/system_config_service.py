"""
SystemConfig service — production-ready runtime configuration management.

Design
------
- Values are stored in the ``system_configs`` DB table.
- A module-level in-memory cache (TTL = 60 s) means the LLM clients never
  hit the DB on every single generation call, while still picking up changes
  within ~60 seconds — no application restart required.
- Falls back to the pydantic ``settings`` object (env / .env file) when a
  key has not yet been saved to the DB.

Canonical config keys (defined as constants so callers don't typo them)
-----------------------------------------------------------------------
    OPENAI_MODEL          → e.g. "gpt-4.1"
    ANTHROPIC_MODEL       → e.g. "claude-opus-4-5"
    DEFAULT_LLM_PROVIDER  → "OPENAI" | "ANTHROPIC"
"""

import time
import logging
from datetime import datetime
from typing import Optional, Dict

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.system_config import SystemConfig

logger = logging.getLogger(__name__)

# ── Canonical configuration keys ─────────────────────────────────────────────
KEY_OPENAI_MODEL         = "openai_model"
KEY_ANTHROPIC_MODEL      = "anthropic_model"
KEY_DEFAULT_LLM_PROVIDER = "default_llm_provider"
KEY_OPENAI_API_KEY       = "openai_api_key"
KEY_ANTHROPIC_API_KEY    = "anthropic_api_key"

# ── Fallback defaults (from env / pydantic settings) ─────────────────────────
_DEFAULTS: Dict[str, str] = {
    KEY_OPENAI_MODEL:         settings.OPENAI_MODEL,
    KEY_ANTHROPIC_MODEL:      settings.ANTHROPIC_MODEL,
    KEY_DEFAULT_LLM_PROVIDER: "OPENAI",
    # API keys are NOT defaulted here — they're secret and must be set explicitly.
    # get_api_key() handles the env fallback separately.
}

# ── In-memory cache ───────────────────────────────────────────────────────────
_cache: Dict[str, str] = {}
_cache_ts: float = 0.0
_CACHE_TTL: float = 60.0  # seconds


def _refresh_cache() -> None:
    """Load all rows from system_configs into the in-memory cache."""
    global _cache, _cache_ts
    db: Session = SessionLocal()
    try:
        rows = db.query(SystemConfig).all()
        _cache = {row.key: row.value for row in rows}
        _cache_ts = time.monotonic()
        logger.debug("SystemConfig cache refreshed: %d keys", len(_cache))
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to refresh SystemConfig cache: %s", exc)
    finally:
        db.close()


def _ensure_cache() -> None:
    """Refresh the cache if it is stale or empty."""
    if time.monotonic() - _cache_ts > _CACHE_TTL:
        _refresh_cache()


def invalidate_cache() -> None:
    """Force the next read to re-query the DB (call after a write)."""
    global _cache_ts
    _cache_ts = 0.0


def get_config_value(key: str, default: Optional[str] = None) -> str:
    """
    Return a configuration value.

    Lookup order:
      1. In-memory cache (refreshed from DB every 60 s) — only if non-empty
      2. ``default`` argument
      3. Environment / pydantic settings fallback for known keys
      4. Empty string

    Args:
        key:     Config key (use the ``KEY_*`` constants above).
        default: Caller-supplied fallback; overrides env fallback.

    Returns:
        The string value of the config entry.
    """
    _ensure_cache()
    cached = _cache.get(key, "")
    if cached:  # non-empty DB value wins
        return cached
    if default is not None:
        return default
    return _DEFAULTS.get(key, "")


def get_api_key(key: str, env_fallback: str) -> str:
    """
    Return an API key, preferring the DB-stored value over the env fallback.
    If the DB value is empty or not set, ``env_fallback`` is returned.
    This means: set key via Settings UI → takes effect within 60 s.
    Leave unset in DB → use the .env / environment variable.

    Args:
        key:          One of ``KEY_OPENAI_API_KEY`` or ``KEY_ANTHROPIC_API_KEY``.
        env_fallback: Value from ``settings.OPENAI_API_KEY`` / ``settings.ANTHROPIC_API_KEY``.
    """
    return get_config_value(key, env_fallback) or env_fallback


def get_all_configs(db: Session) -> Dict[str, str]:
    """
    Return all stored configs merged with defaults, as a flat dict.
    Values present in the DB override the defaults.
    """
    rows = db.query(SystemConfig).all()
    merged = dict(_DEFAULTS)
    for row in rows:
        merged[row.key] = row.value
    return merged


def set_config_value(key: str, value: str, db: Session, description: Optional[str] = None) -> SystemConfig:
    """
    Persist a config value to the DB and invalidate the in-memory cache.

    Args:
        key:         Config key.
        value:       New string value.
        db:          Active SQLAlchemy session.
        description: Optional human-readable description (only written on creation).

    Returns:
        The updated / created :class:`SystemConfig` row.
    """
    row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        row = SystemConfig(key=key, value=value, description=description)
        db.add(row)
    db.commit()
    db.refresh(row)
    invalidate_cache()
    logger.info("SystemConfig updated: %s = %r", key, value)
    return row


def seed_defaults(db: Session) -> None:
    """
    Ensure all canonical config keys exist in the DB with sensible defaults.
    Called once at application startup so the Settings UI always shows current values.
    Only inserts rows that are not yet present — never overwrites existing values.
    """
    descriptions = {
        KEY_OPENAI_MODEL:         "OpenAI model used for all code generation and chat (e.g. gpt-4.1, gpt-4o)",
        KEY_ANTHROPIC_MODEL:      "Anthropic model used when the ANTHROPIC provider is selected (e.g. claude-opus-4-5)",
        KEY_DEFAULT_LLM_PROVIDER: "Default LLM provider for new jobs when no provider is explicitly chosen (OPENAI or ANTHROPIC)",
    }
    for key, default_value in _DEFAULTS.items():
        existing = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        if not existing:
            db.add(SystemConfig(key=key, value=default_value, description=descriptions.get(key)))
    db.commit()
    invalidate_cache()
    logger.info("SystemConfig defaults seeded")
