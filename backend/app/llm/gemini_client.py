"""Gemini LLM client for interacting with Google's Generative AI API."""

import google.generativeai as genai
from typing import Optional, Dict, Any
from app.core.config import settings
from app.core.exceptions import LLMServiceException, ConfigurationException
import logging
import time

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for interacting with Gemini API with retry logic and error handling."""
    
    def __init__(self):
        """Initialize the Gemini client with API key from settings."""
        if not settings.GEMINI_API_KEY:
            raise ConfigurationException(
                "GEMINI_API_KEY",
                "API key is required for LLM operations"
            )
        
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.model_name = settings.GEMINI_MODEL
            self.model = genai.GenerativeModel(self.model_name)
            logger.info(f"Initialized Gemini client with model: {self.model_name}")
        except Exception as e:
            raise ConfigurationException(
                "GEMINI_MODEL",
                f"Failed to initialize Gemini model: {str(e)}"
            )
    
    def generate_content(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        top_k: Optional[int] = None
    ) -> str:
        """
        Generate content using Gemini API.
        
        Args:
            prompt: The prompt to send to the model
            temperature: Controls randomness (0.0-1.0). Default from settings
            max_output_tokens: Maximum tokens in response. Default from settings
            top_p: Nucleus sampling parameter. Default from settings
            top_k: Top-k sampling parameter. Default from settings
            
        Returns:
            Generated text content
            
        Raises:
            LLMServiceException: If generation fails
        """
        if not prompt or not prompt.strip():
            raise LLMServiceException(
                "Prompt cannot be empty",
                model_name=self.model_name
            )
        
        try:
            generation_config = genai.types.GenerationConfig(
                temperature=temperature or settings.DEFAULT_TEMPERATURE,
                top_p=top_p or settings.DEFAULT_TOP_P,
                top_k=top_k or settings.DEFAULT_TOP_K,
                max_output_tokens=max_output_tokens or settings.MAX_TOKENS
            )
            
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
            if not response.text:
                raise LLMServiceException(
                    "Empty response from Gemini API",
                    model_name=self.model_name
                )
            
            logger.info(f"Successfully generated content. Length: {len(response.text)} chars")
            return response.text
            
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}")
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
    ) -> str:
        """
        Generate content with exponential backoff retry logic.
        
        Args:
            prompt: The prompt to send to the model
            max_retries: Maximum retry attempts (default from settings)
            temperature: Temperature for generation (default from settings)
            backoff_factor: Multiplier for exponential backoff (default: 2.0)
            **kwargs: Additional generation parameters
            
        Returns:
            Generated text content
            
        Raises:
            LLMServiceException: If all retries fail
        """
        max_retries = max_retries or settings.MAX_YAML_RETRY_ATTEMPTS
        temperature = temperature or settings.DEFAULT_TEMPERATURE
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Generation attempt {attempt + 1}/{max_retries}")
                return self.generate_content(
                    prompt,
                    temperature=temperature,
                    **kwargs
                )
            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                
                if attempt < max_retries - 1:
                    # Exponential backoff before retry
                    sleep_time = (backoff_factor ** attempt)
                    logger.info(f"Retrying in {sleep_time:.1f} seconds...")
                    time.sleep(sleep_time)
                    
                    # Increase temperature slightly on retry for variation
                    temperature = min(temperature + 0.1, 0.7)
                    continue
        
        logger.error(f"All {max_retries} generation attempts failed")
        raise LLMServiceException(
            f"Failed after {max_retries} attempts: {str(last_error)}",
            model_name=self.model_name,
            retry_count=max_retries
        )
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check if the Gemini API is accessible and configured correctly.
        
        Returns:
            Dictionary with health status information
        """
        try:
            # Try a minimal generation to verify connectivity
            response = self.generate_content(
                "Reply with just: OK",
                temperature=0.0,
                max_output_tokens=10
            )
            
            return {
                "status": "healthy",
                "model": self.model_name,
                "api_accessible": True,
                "test_response": response[:50]  # First 50 chars
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "model": self.model_name,
                "api_accessible": False,
                "error": str(e)
            }


# Singleton instance
_gemini_client: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """Get or create the singleton Gemini client instance."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = GeminiClient()
    return _gemini_client
