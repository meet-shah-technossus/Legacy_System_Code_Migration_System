"""LLM Router — provider-agnostic factory.

Usage
-----
    from app.llm.llm_router import get_llm_client
    from app.core.enums import LLMProvider

    client = get_llm_client(LLMProvider.OPENAI)
    result = client.generate_with_retry(prompt)

Both OpenAIClient and AnthropicClient expose the same interface:
    - generate_content(prompt, temperature, max_output_tokens) -> {"text": str}
    - generate_with_retry(prompt, max_retries, temperature, ...) -> {"text": str}
    - health_check() -> {"status": ..., "model": ..., ...}
"""

from typing import Union
from app.core.enums import LLMProvider
from app.llm.openai_client import OpenAIClient, get_openai_client
from app.llm.anthropic_client import AnthropicClient, get_anthropic_client
from app.core.exceptions import ConfigurationException
import logging

logger = logging.getLogger(__name__)

# Type alias for callers that want to annotate the returned client
LLMClient = Union[OpenAIClient, AnthropicClient]


def get_llm_client(provider: LLMProvider) -> LLMClient:
    """Return the singleton LLM client for the given provider.

    Args:
        provider: ``LLMProvider.OPENAI`` or ``LLMProvider.ANTHROPIC``

    Returns:
        Either an :class:`OpenAIClient` or :class:`AnthropicClient`, both of
        which share the same public interface.

    Raises:
        ConfigurationException: If the provider is unknown or not configured.
    """
    if provider == LLMProvider.OPENAI:
        logger.debug("LLM router → OpenAI")
        return get_openai_client()

    if provider == LLMProvider.ANTHROPIC:
        logger.debug("LLM router → Anthropic")
        return get_anthropic_client()

    raise ConfigurationException(
        "LLM_PROVIDER",
        f"Unknown LLM provider: {provider!r}. Valid values: {[p.value for p in LLMProvider]}"
    )


def get_default_llm_client() -> LLMClient:
    """Return the default LLM client (OpenAI) for backwards compatibility.

    Existing code that calls ``get_openai_client()`` directly can be
    migrated to this helper so a single config change switches the default.
    """
    return get_llm_client(LLMProvider.OPENAI)
