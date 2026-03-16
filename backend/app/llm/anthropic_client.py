"""Anthropic (Claude) LLM client — same interface as OpenAIClient."""

import anthropic as _anthropic
from typing import Optional, Dict, Any
from app.core.config import settings
from app.core.exceptions import LLMServiceException, ConfigurationException
from app.services.system_config_service import (
    get_config_value, get_api_key,
    KEY_ANTHROPIC_MODEL, KEY_ANTHROPIC_API_KEY,
)
import logging
import time

logger = logging.getLogger(__name__)


class AnthropicClient:
    """Client for interacting with the Anthropic Claude API with retry logic and error handling.

    Exposes the same public interface as OpenAIClient so the rest of the codebase
    can use either provider transparently via llm_router.get_llm_client().
    """

    def __init__(self):
        """Initialise the Anthropic client with API key from DB config or env."""
        api_key = get_api_key(KEY_ANTHROPIC_API_KEY, settings.ANTHROPIC_API_KEY)
        if not api_key:
            raise ConfigurationException(
                "ANTHROPIC_API_KEY",
                "API key is required for Anthropic LLM operations. Set it in Settings or in the .env file."
            )

        try:
            self.client = _anthropic.Anthropic(api_key=api_key)
            self._api_key_used = api_key  # track for singleton invalidation
            self.model_name = settings.ANTHROPIC_MODEL
            logger.info(f"Initialised Anthropic client with model: {self.model_name}")
        except Exception as e:
            raise ConfigurationException(
                "ANTHROPIC_MODEL",
                f"Failed to initialise Anthropic client: {str(e)}"
            )

    def generate_content(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Generate content using the Anthropic Messages API.

        Args:
            prompt: The prompt to send to the model
            temperature: Controls randomness (0.0-1.0 for Claude). Default from settings
            max_output_tokens: Maximum tokens in response. Default from settings

        Returns:
            Dict with 'text' key containing the generated content

        Raises:
            LLMServiceException: If generation fails
        """
        if not prompt or not prompt.strip():
            raise LLMServiceException(
                "Prompt cannot be empty",
                model_name=self.model_name
            )

        try:
            # Anthropic temperature range is 0.0–1.0 (vs OpenAI's 0.0–2.0); clamp safely
            temp = temperature if temperature is not None else settings.DEFAULT_TEMPERATURE
            temp = min(max(float(temp), 0.0), 1.0)

            # Resolve model name at call time so DB changes take effect without restart
            active_model = get_config_value(KEY_ANTHROPIC_MODEL, self.model_name)
            response = self.client.messages.create(
                model=active_model,
                max_tokens=max_output_tokens or settings.MAX_TOKENS,
                temperature=temp,
                messages=[{"role": "user", "content": prompt}],
            )

            # Extract text from the first content block
            text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    text = block.text
                    break

            if not text.strip():
                raise LLMServiceException(
                    "Empty response from Anthropic API",
                    model_name=self.model_name
                )

            logger.info(f"Successfully generated content. Length: {len(text)} chars")
            return {"text": text}

        except Exception as e:
            logger.error(f"Anthropic API error: {str(e)}")
            if isinstance(e, LLMServiceException):
                raise
            raise LLMServiceException(str(e), model_name=self.model_name)

    def generate_with_retry(
        self,
        prompt: str,
        max_retries: Optional[int] = None,
        temperature: Optional[float] = None,
        backoff_factor: float = 2.0,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate content with exponential backoff retry logic.

        Args:
            prompt: The prompt to send to the model
            max_retries: Maximum retry attempts (default from settings)
            temperature: Temperature for generation (default from settings)
            backoff_factor: Multiplier for exponential backoff (default: 2.0)

        Returns:
            Dict with 'text' key containing the generated content

        Raises:
            LLMServiceException: If all retries fail
        """
        max_retries = max_retries or settings.MAX_YAML_RETRY_ATTEMPTS
        temperature = temperature if temperature is not None else settings.DEFAULT_TEMPERATURE
        last_error = None

        for attempt in range(max_retries):
            try:
                logger.info(f"Anthropic generation attempt {attempt + 1}/{max_retries}")
                return self.generate_content(
                    prompt,
                    temperature=temperature,
                    **kwargs
                )
            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")

                if attempt < max_retries - 1:
                    sleep_time = backoff_factor ** attempt
                    logger.info(f"Retrying in {sleep_time:.1f} seconds...")
                    time.sleep(sleep_time)

                    # Slightly increase temperature on retry for variation (capped at 1.0 for Claude)
                    temperature = min(temperature + 0.1, 1.0)
                    continue

        logger.error(f"All {max_retries} Anthropic generation attempts failed")
        raise LLMServiceException(
            f"Failed after {max_retries} attempts: {str(last_error)}",
            model_name=self.model_name,
            retry_count=max_retries
        )

    def health_check(self) -> Dict[str, Any]:
        """
        Check if the Anthropic API is accessible and configured correctly.

        Returns:
            Dictionary with health status information
        """
        try:
            response = self.generate_content(
                "Reply with just: OK",
                temperature=0.0,
                max_output_tokens=10
            )
            return {
                "status": "healthy",
                "model": self.model_name,
                "api_accessible": True,
                "test_response": response["text"][:50]
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "model": self.model_name,
                "api_accessible": False,
                "error": str(e)
            }


# Singleton instance
_anthropic_client: Optional[AnthropicClient] = None


def get_anthropic_client() -> AnthropicClient:
    """Get or create the singleton Anthropic client instance.

    The singleton is automatically invalidated and recreated when the API key
    stored in the DB differs from the key that was used to build it.
    """
    global _anthropic_client
    current_key = get_api_key(KEY_ANTHROPIC_API_KEY, settings.ANTHROPIC_API_KEY)
    if _anthropic_client is None or getattr(_anthropic_client, '_api_key_used', None) != current_key:
        _anthropic_client = AnthropicClient()
    return _anthropic_client
