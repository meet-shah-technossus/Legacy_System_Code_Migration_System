"""Gemini LLM client for interacting with Google's Generative AI API."""

import google.generativeai as genai
from typing import Optional, Dict, Any
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for interacting with Gemini API."""
    
    def __init__(self):
        """Initialize the Gemini client with API key from settings."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured")
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model_name = settings.GEMINI_MODEL
        self.model = genai.GenerativeModel(self.model_name)
        logger.info(f"Initialized Gemini client with model: {self.model_name}")
    
    def generate_content(
        self,
        prompt: str,
        temperature: float = 0.2,
        max_output_tokens: Optional[int] = None,
        top_p: float = 0.8,
        top_k: int = 40
    ) -> str:
        """
        Generate content using Gemini API.
        
        Args:
            prompt: The prompt to send to the model
            temperature: Controls randomness (0.0-1.0). Lower = more deterministic
            max_output_tokens: Maximum tokens in response
            top_p: Nucleus sampling parameter
            top_k: Top-k sampling parameter
            
        Returns:
            Generated text content
            
        Raises:
            Exception: If generation fails after retries
        """
        try:
            generation_config = genai.types.GenerationConfig(
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                max_output_tokens=max_output_tokens or settings.MAX_TOKENS
            )
            
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
            if not response.text:
                raise ValueError("Empty response from Gemini API")
            
            logger.info(f"Successfully generated content. Length: {len(response.text)} chars")
            return response.text
            
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}")
            raise
    
    def generate_with_retry(
        self,
        prompt: str,
        max_retries: int = 3,
        temperature: float = 0.2,
        **kwargs
    ) -> str:
        """
        Generate content with retry logic.
        
        Args:
            prompt: The prompt to send to the model
            max_retries: Maximum number of retry attempts
            temperature: Temperature for generation
            **kwargs: Additional generation parameters
            
        Returns:
            Generated text content
            
        Raises:
            Exception: If all retries fail
        """
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Generation attempt {attempt + 1}/{max_retries}")
                return self.generate_content(prompt, temperature=temperature, **kwargs)
            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt < max_retries - 1:
                    # Increase temperature slightly on retry to get different output
                    temperature = min(temperature + 0.1, 0.7)
                    continue
        
        logger.error(f"All {max_retries} generation attempts failed")
        raise last_error
    
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
