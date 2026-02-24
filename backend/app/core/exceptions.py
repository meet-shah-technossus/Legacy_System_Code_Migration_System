"""
Custom exception classes for the Legacy System Code Migration application.
Provides domain-specific exceptions for better error handling and debugging.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class MigrationBaseException(Exception):
    """Base exception for all migration-related errors."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class JobNotFoundException(MigrationBaseException):
    """Raised when a migration job is not found."""
    
    def __init__(self, job_id: int):
        super().__init__(
            message=f"Migration job with ID {job_id} not found",
            details={"job_id": job_id}
        )
        self.job_id = job_id


class YAMLVersionNotFoundException(MigrationBaseException):
    """Raised when a YAML version is not found."""
    
    def __init__(self, version_id: int):
        super().__init__(
            message=f"YAML version with ID {version_id} not found",
            details={"version_id": version_id}
        )
        self.version_id = version_id


class GeneratedCodeNotFoundException(MigrationBaseException):
    """Raised when generated code is not found."""
    
    def __init__(self, code_id: int):
        super().__init__(
            message=f"Generated code with ID {code_id} not found",
            details={"code_id": code_id}
        )
        self.code_id = code_id


class ReviewNotFoundException(MigrationBaseException):
    """Raised when a review is not found."""
    
    def __init__(self, review_id: int):
        super().__init__(
            message=f"Review with ID {review_id} not found",
            details={"review_id": review_id}
        )
        self.review_id = review_id


class InvalidStateTransitionException(MigrationBaseException):
    """Raised when an invalid state transition is attempted."""
    
    def __init__(self, current_state: str, target_state: str, reason: str = ""):
        message = f"Invalid state transition from {current_state} to {target_state}"
        if reason:
            message += f": {reason}"
        
        super().__init__(
            message=message,
            details={
                "current_state": current_state,
                "target_state": target_state,
                "reason": reason
            }
        )
        self.current_state = current_state
        self.target_state = target_state


class YAMLGenerationException(MigrationBaseException):
    """Raised when YAML generation fails."""
    
    def __init__(self, job_id: int, error_message: str, llm_model: Optional[str] = None):
        super().__init__(
            message=f"YAML generation failed for job {job_id}: {error_message}",
            details={
                "job_id": job_id,
                "error_message": error_message,
                "llm_model": llm_model
            }
        )
        self.job_id = job_id


class CodeGenerationException(MigrationBaseException):
    """Raised when code generation fails."""
    
    def __init__(self, job_id: int, error_message: str, target_language: Optional[str] = None):
        super().__init__(
            message=f"Code generation failed for job {job_id}: {error_message}",
            details={
                "job_id": job_id,
                "error_message": error_message,
                "target_language": target_language
            }
        )
        self.job_id = job_id


class YAMLValidationException(MigrationBaseException):
    """Raised when YAML validation fails."""
    
    def __init__(self, errors: list[str], yaml_content: Optional[str] = None):
        error_summary = "; ".join(errors[:3])  # First 3 errors
        if len(errors) > 3:
            error_summary += f" (and {len(errors) - 3} more)"
        
        super().__init__(
            message=f"YAML validation failed: {error_summary}",
            details={
                "errors": errors,
                "error_count": len(errors)
            }
        )
        self.errors = errors


class LLMServiceException(MigrationBaseException):
    """Raised when LLM service encounters an error."""
    
    def __init__(self, message: str, model_name: Optional[str] = None, retry_count: int = 0):
        super().__init__(
            message=f"LLM service error: {message}",
            details={
                "model_name": model_name,
                "retry_count": retry_count
            }
        )


class ConfigurationException(MigrationBaseException):
    """Raised when configuration is invalid or missing."""
    
    def __init__(self, config_key: str, message: str):
        super().__init__(
            message=f"Configuration error for '{config_key}': {message}",
            details={"config_key": config_key}
        )
        self.config_key = config_key


class ReviewAlreadyExistsException(MigrationBaseException):
    """Raised when attempting to create a duplicate review."""
    
    def __init__(self, yaml_version_id: int, reviewer: str):
        super().__init__(
            message=f"Review already exists for YAML version {yaml_version_id} by {reviewer}",
            details={
                "yaml_version_id": yaml_version_id,
                "reviewer": reviewer
            }
        )


class InsufficientDataException(MigrationBaseException):
    """Raised when operation requires data that is not available."""
    
    def __init__(self, resource: str, requirement: str):
        super().__init__(
            message=f"Insufficient data for {resource}: {requirement}",
            details={
                "resource": resource,
                "requirement": requirement
            }
        )


def to_http_exception(exc: MigrationBaseException) -> HTTPException:
    """
    Convert a domain exception to an HTTP exception for FastAPI.
    
    Args:
        exc: The domain exception to convert
        
    Returns:
        HTTPException with appropriate status code and detail
    """
    # Map exception types to HTTP status codes
    status_map = {
        JobNotFoundException: status.HTTP_404_NOT_FOUND,
        YAMLVersionNotFoundException: status.HTTP_404_NOT_FOUND,
        GeneratedCodeNotFoundException: status.HTTP_404_NOT_FOUND,
        ReviewNotFoundException: status.HTTP_404_NOT_FOUND,
        InvalidStateTransitionException: status.HTTP_400_BAD_REQUEST,
        YAMLGenerationException: status.HTTP_500_INTERNAL_SERVER_ERROR,
        CodeGenerationException: status.HTTP_500_INTERNAL_SERVER_ERROR,
        YAMLValidationException: status.HTTP_422_UNPROCESSABLE_ENTITY,
        LLMServiceException: status.HTTP_503_SERVICE_UNAVAILABLE,
        ConfigurationException: status.HTTP_500_INTERNAL_SERVER_ERROR,
        ReviewAlreadyExistsException: status.HTTP_409_CONFLICT,
        InsufficientDataException: status.HTTP_400_BAD_REQUEST,
    }
    
    status_code = status_map.get(type(exc), status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return HTTPException(
        status_code=status_code,
        detail={
            "message": exc.message,
            "error_type": type(exc).__name__,
            **exc.details
        }
    )
