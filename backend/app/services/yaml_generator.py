"""YAML generator service using LLM for Pick Basic code analysis."""

from typing import Tuple, Optional, Dict, Any
from app.llm.gemini_client import get_gemini_client
from app.llm.prompts import build_yaml_generation_prompt, build_yaml_regeneration_prompt
from app.services.yaml_validator import YAMLValidator
from app.schemas.yaml_schema import PickBasicYAMLSchema
from app.core.config import settings
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class YAMLGenerationResult:
    """Result of YAML generation attempt."""
    
    def __init__(
        self,
        success: bool,
        raw_yaml: str,
        validated_schema: Optional[PickBasicYAMLSchema] = None,
        errors: Optional[list] = None,
        attempt_number: int = 1,
        llm_metadata: Optional[Dict[str, Any]] = None
    ):
        self.success = success
        self.raw_yaml = raw_yaml
        self.validated_schema = validated_schema
        self.errors = errors or []
        self.attempt_number = attempt_number
        self.llm_metadata = llm_metadata or {}
        self.timestamp = datetime.utcnow()


class YAMLGenerator:
    """Generator for creating YAML representations from Pick Basic code."""
    
    def __init__(self):
        """Initialize the YAML generator with LLM client."""
        self.llm_client = get_gemini_client()
        self.validator = YAMLValidator()
        self.max_retries = settings.MAX_YAML_RETRY_ATTEMPTS
    
    def generate_yaml(
        self,
        pick_basic_code: str,
        original_filename: str = "unknown.bp",
        additional_context: str = ""
    ) -> YAMLGenerationResult:
        """
        Generate YAML from Pick Basic code with automatic validation.
        
        Args:
            pick_basic_code: The Pick Basic source code
            original_filename: Original filename of the source
            additional_context: Optional additional context
            
        Returns:
            YAMLGenerationResult with success status and validated YAML
        """
        logger.info(f"Starting YAML generation for: {original_filename}")
        
        # Build the prompt
        prompt = build_yaml_generation_prompt(
            pick_basic_code=pick_basic_code,
            original_filename=original_filename,
            additional_context=additional_context
        )
        
        # Generate with LLM
        try:
            raw_yaml = self.llm_client.generate_with_retry(
                prompt=prompt,
                max_retries=3,
                temperature=0.2
            )
            
            logger.info(f"LLM generated {len(raw_yaml)} characters of YAML")
            
            # Validate the generated YAML
            is_valid, validated_schema, errors = self.validator.validate_yaml_content(raw_yaml)
            
            if is_valid:
                logger.info("YAML generation successful and validated")
                return YAMLGenerationResult(
                    success=True,
                    raw_yaml=raw_yaml,
                    validated_schema=validated_schema,
                    errors=[],
                    attempt_number=1,
                    llm_metadata={
                        "model": self.llm_client.model_name,
                        "prompt_length": len(prompt),
                        "response_length": len(raw_yaml)
                    }
                )
            else:
                logger.warning(f"YAML validation failed with {len(errors)} errors")
                return YAMLGenerationResult(
                    success=False,
                    raw_yaml=raw_yaml,
                    validated_schema=None,
                    errors=errors,
                    attempt_number=1,
                    llm_metadata={
                        "model": self.llm_client.model_name,
                        "validation_errors": len(errors)
                    }
                )
                
        except Exception as e:
            logger.error(f"YAML generation failed: {str(e)}")
            return YAMLGenerationResult(
                success=False,
                raw_yaml="",
                validated_schema=None,
                errors=[f"LLM generation error: {str(e)}"],
                attempt_number=1
            )
    
    def generate_yaml_with_auto_retry(
        self,
        pick_basic_code: str,
        original_filename: str = "unknown.bp",
        additional_context: str = ""
    ) -> YAMLGenerationResult:
        """
        Generate YAML with automatic retry on validation failure.
        
        This method will attempt to generate valid YAML up to MAX_YAML_RETRY_ATTEMPTS times.
        On validation failure, it sends the errors back to the LLM for correction.
        
        Args:
            pick_basic_code: The Pick Basic source code
            original_filename: Original filename
            additional_context: Optional additional context
            
        Returns:
            YAMLGenerationResult - final result after all attempts
        """
        logger.info(f"Starting YAML generation with auto-retry (max {self.max_retries} attempts)")
        
        last_result = None
        previous_yaml = ""
        
        for attempt in range(1, self.max_retries + 1):
            logger.info(f"Generation attempt {attempt}/{self.max_retries}")
            
            if attempt == 1:
                # First attempt - use regular generation
                result = self.generate_yaml(
                    pick_basic_code=pick_basic_code,
                    original_filename=original_filename,
                    additional_context=additional_context
                )
            else:
                # Subsequent attempts - use regeneration with error feedback
                error_feedback = self.validator.format_errors_for_llm(last_result.errors)
                result = self.regenerate_yaml(
                    pick_basic_code=pick_basic_code,
                    original_filename=original_filename,
                    review_feedback=error_feedback,
                    previous_yaml=previous_yaml,
                    regeneration_count=attempt - 1
                )
            
            result.attempt_number = attempt
            last_result = result
            
            if result.success:
                logger.info(f"YAML generation succeeded on attempt {attempt}")
                return result
            
            # Store for next iteration
            previous_yaml = result.raw_yaml
            logger.warning(f"Attempt {attempt} failed with {len(result.errors)} errors")
        
        # All attempts failed
        logger.error(f"YAML generation failed after {self.max_retries} attempts")
        return last_result
    
    def regenerate_yaml(
        self,
        pick_basic_code: str,
        original_filename: str,
        review_feedback: str,
        previous_yaml: str = "",
        regeneration_count: int = 1
    ) -> YAMLGenerationResult:
        """
        Regenerate YAML based on review feedback.
        
        Args:
            pick_basic_code: Original Pick Basic code
            original_filename: Original filename
            review_feedback: Feedback from reviewer (human or validator)
            previous_yaml: Previously generated YAML (for context)
            regeneration_count: Which regeneration attempt this is
            
        Returns:
            YAMLGenerationResult with regenerated YAML
        """
        logger.info(f"Regenerating YAML (attempt #{regeneration_count})")
        
        # Build regeneration prompt
        prompt = build_yaml_regeneration_prompt(
            pick_basic_code=pick_basic_code,
            original_filename=original_filename,
            review_feedback=review_feedback,
            previous_yaml=previous_yaml,
            regeneration_count=regeneration_count
        )
        
        try:
            # Generate with LLM
            raw_yaml = self.llm_client.generate_with_retry(
                prompt=prompt,
                max_retries=2,
                temperature=0.3  # Slightly higher temperature for regeneration
            )
            
            logger.info(f"LLM regenerated {len(raw_yaml)} characters of YAML")
            
            # Validate the regenerated YAML
            is_valid, validated_schema, errors = self.validator.validate_yaml_content(raw_yaml)
            
            return YAMLGenerationResult(
                success=is_valid,
                raw_yaml=raw_yaml,
                validated_schema=validated_schema,
                errors=errors,
                attempt_number=regeneration_count + 1,
                llm_metadata={
                    "model": self.llm_client.model_name,
                    "is_regeneration": True,
                    "regeneration_count": regeneration_count,
                    "feedback_length": len(review_feedback)
                }
            )
            
        except Exception as e:
            logger.error(f"YAML regeneration failed: {str(e)}")
            return YAMLGenerationResult(
                success=False,
                raw_yaml="",
                validated_schema=None,
                errors=[f"LLM regeneration error: {str(e)}"],
                attempt_number=regeneration_count + 1
            )
