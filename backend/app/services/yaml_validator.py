"""YAML validation service for validating generated YAML against strict schema."""

import yaml
from typing import Tuple, List, Dict, Any, Optional
from pydantic import ValidationError
from app.schemas.yaml_schema import PickBasicYAMLSchema
import logging

logger = logging.getLogger(__name__)


class YAMLValidationError(Exception):
    """Custom exception for YAML validation errors."""
    
    def __init__(self, message: str, errors: List[str]):
        self.message = message
        self.errors = errors
        super().__init__(self.message)


class YAMLValidator:
    """Validator for YAML content against PickBasicYAMLSchema."""
    
    @staticmethod
    def clean_yaml_content(raw_content: str) -> str:
        """
        Clean YAML content by removing markdown code blocks and extra whitespace.
        
        Args:
            raw_content: Raw content from LLM (may include markdown)
            
        Returns:
            Cleaned YAML string
        """
        content = raw_content.strip()
        
        # Remove markdown code blocks if present
        if content.startswith("```yaml"):
            content = content[7:]  # Remove ```yaml
        elif content.startswith("```yml"):
            content = content[6:]  # Remove ```yml
        elif content.startswith("```"):
            content = content[3:]  # Remove ```
            
        if content.endswith("```"):
            content = content[:-3]
            
        return content.strip()
    
    @staticmethod
    def parse_yaml(yaml_content: str) -> Tuple[bool, Optional[Dict[str, Any]], List[str]]:
        """
        Parse YAML string into dictionary.
        
        Args:
            yaml_content: YAML string to parse
            
        Returns:
            Tuple of (success, parsed_dict, error_messages)
        """
        errors = []
        
        try:
            # Clean the content first
            cleaned_content = YAMLValidator.clean_yaml_content(yaml_content)
            
            if not cleaned_content:
                errors.append("YAML content is empty after cleaning")
                return False, None, errors
            
            # Parse YAML
            parsed = yaml.safe_load(cleaned_content)
            
            if not isinstance(parsed, dict):
                errors.append(f"YAML root must be a dictionary, got {type(parsed).__name__}")
                return False, None, errors
            
            logger.info("YAML parsed successfully")
            return True, parsed, []
            
        except yaml.YAMLError as e:
            error_msg = f"YAML parsing error: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            return False, None, errors
        except Exception as e:
            error_msg = f"Unexpected error during YAML parsing: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            return False, None, errors
    
    @staticmethod
    def validate_schema(
        yaml_dict: Dict[str, Any]
    ) -> Tuple[bool, Optional[PickBasicYAMLSchema], List[str]]:
        """
        Validate parsed YAML against PickBasicYAMLSchema.
        
        Args:
            yaml_dict: Parsed YAML dictionary
            
        Returns:
            Tuple of (success, validated_schema_object, error_messages)
        """
        errors = []
        
        try:
            # Validate against Pydantic schema
            validated_schema = PickBasicYAMLSchema(**yaml_dict)
            logger.info("YAML schema validation successful")
            return True, validated_schema, []
            
        except ValidationError as e:
            logger.error(f"Schema validation failed: {e}")
            
            # Extract readable error messages from Pydantic validation errors
            for error in e.errors():
                location = " -> ".join(str(loc) for loc in error["loc"])
                msg = error["msg"]
                error_type = error["type"]
                errors.append(f"[{location}]: {msg} (type: {error_type})")
            
            return False, None, errors
            
        except Exception as e:
            error_msg = f"Unexpected schema validation error: {str(e)}"
            logger.error(error_msg)
            errors.append(error_msg)
            return False, None, errors
    
    @staticmethod
    def validate_yaml_content(
        raw_yaml_content: str
    ) -> Tuple[bool, Optional[PickBasicYAMLSchema], List[str]]:
        """
        Complete validation pipeline: clean -> parse -> validate schema.
        
        Args:
            raw_yaml_content: Raw YAML content from LLM
            
        Returns:
            Tuple of (success, validated_schema_object, error_messages)
        """
        all_errors = []
        
        # Step 1: Parse YAML
        parse_success, yaml_dict, parse_errors = YAMLValidator.parse_yaml(raw_yaml_content)
        
        if not parse_success:
            all_errors.extend(parse_errors)
            logger.warning(f"YAML parsing failed with {len(parse_errors)} errors")
            return False, None, all_errors
        
        # Step 2: Validate against schema
        validate_success, schema_obj, validate_errors = YAMLValidator.validate_schema(yaml_dict)
        
        if not validate_success:
            all_errors.extend(validate_errors)
            logger.warning(f"Schema validation failed with {len(validate_errors)} errors")
            return False, None, all_errors
        
        logger.info("Complete YAML validation successful")
        return True, schema_obj, []
    
    @staticmethod
    def get_validation_summary(errors: List[str]) -> Dict[str, Any]:
        """
        Generate a structured summary of validation errors.
        
        Args:
            errors: List of error messages
            
        Returns:
            Dictionary with categorized errors
        """
        summary = {
            "total_errors": len(errors),
            "parsing_errors": [],
            "schema_errors": [],
            "other_errors": []
        }
        
        for error in errors:
            if "parsing error" in error.lower() or "yaml" in error.lower():
                summary["parsing_errors"].append(error)
            elif "[" in error and "]" in error:  # Pydantic error format
                summary["schema_errors"].append(error)
            else:
                summary["other_errors"].append(error)
        
        return summary
    
    @staticmethod
    def format_errors_for_llm(errors: List[str]) -> str:
        """
        Format validation errors into feedback for LLM regeneration.
        
        Args:
            errors: List of validation error messages
            
        Returns:
            Formatted error string suitable for LLM prompt
        """
        if not errors:
            return "No errors found."
        
        summary = YAMLValidator.get_validation_summary(errors)
        
        feedback_parts = [
            f"VALIDATION FAILED: {summary['total_errors']} errors found.",
            ""
        ]
        
        if summary["parsing_errors"]:
            feedback_parts.append("**YAML Parsing Errors:**")
            for i, error in enumerate(summary["parsing_errors"], 1):
                feedback_parts.append(f"{i}. {error}")
            feedback_parts.append("")
        
        if summary["schema_errors"]:
            feedback_parts.append("**Schema Validation Errors:**")
            for i, error in enumerate(summary["schema_errors"], 1):
                feedback_parts.append(f"{i}. {error}")
            feedback_parts.append("")
        
        if summary["other_errors"]:
            feedback_parts.append("**Other Errors:**")
            for i, error in enumerate(summary["other_errors"], 1):
                feedback_parts.append(f"{i}. {error}")
            feedback_parts.append("")
        
        feedback_parts.append("**ACTION REQUIRED:**")
        feedback_parts.append("Fix all errors above and regenerate valid YAML that conforms to the schema.")
        
        return "\n".join(feedback_parts)
