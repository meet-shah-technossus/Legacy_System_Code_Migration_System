"""
Utility functions for common operations across the application.
Reduces code duplication and provides reusable helpers.
"""

from typing import TypeVar, Type, Optional, Any, Dict
from sqlalchemy.orm import Session
from sqlalchemy.orm.query import Query
from fastapi import HTTPException, status
from datetime import datetime, timedelta

from app.core.config import settings

T = TypeVar('T')


def get_or_404(
    db: Session,
    model: Type[T],
    id_value: int,
    id_field: str = "id",
    error_message: Optional[str] = None
) -> T:
    """
    Get a database record by ID or raise 404 error.
    
    Args:
        db: Database session
        model: SQLAlchemy model class
        id_value: ID value to search for
        id_field: Name of the ID field (default: "id")
        error_message: Custom error message
        
    Returns:
        Model instance
        
    Raises:
        HTTPException: 404 if not found
    """
    filter_condition = getattr(model, id_field) == id_value
    instance = db.query(model).filter(filter_condition).first()
    
    if not instance:
        msg = error_message or f"{model.__name__} with {id_field}={id_value} not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    
    return instance


def apply_pagination(
    query: Query,
    skip: Optional[int] = None,
    limit: Optional[int] = None
) -> Query:
    """
    Apply pagination to a SQLAlchemy query.
    
    Args:
        query: SQLAlchemy Query object
        skip: Number of records to skip (default from settings)
        limit: Maximum records to return (default from settings)
        
    Returns:
        Query with pagination applied
    """
    skip = skip if skip is not None else settings.DEFAULT_SKIP
    limit = limit if limit is not None else settings.DEFAULT_PAGE_SIZE
    
    # Enforce max page size
    limit = min(limit, settings.MAX_PAGE_SIZE)
    
    return query.offset(skip).limit(limit)


def format_datetime(dt: Optional[datetime], format_str: str = "%Y-%m-%d %H:%M:%S") -> Optional[str]:
    """
    Format a datetime object as a string.
    
    Args:
        dt: Datetime object to format
        format_str: Format string (default: ISO-like format)
        
    Returns:
        Formatted string or None if dt is None
    """
    if dt is None:
        return None
    return dt.strftime(format_str)


def calculate_time_ago(dt: datetime) -> str:
    """
    Calculate human-readable time difference from now.
    
    Args:
        dt: Datetime to compare against current time
        
    Returns:
        Human-readable string (e.g., "2 hours ago", "3 days ago")
    """
    now = datetime.utcnow()
    diff = now - dt
    
    if diff < timedelta(minutes=1):
        return "just now"
    elif diff < timedelta(hours=1):
        minutes = int(diff.total_seconds() / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    elif diff < timedelta(days=1):
        hours = int(diff.total_seconds() / 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif diff < timedelta(days=30):
        days = diff.days
        return f"{days} day{'s' if days != 1 else ''} ago"
    elif diff < timedelta(days=365):
        months = int(diff.days / 30)
        return f"{months} month{'s' if months != 1 else ''} ago"
    else:
        years = int(diff.days / 365)
        return f"{years} year{'s' if years != 1 else ''} ago"


def clean_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clean metadata dictionary by removing None values and empty strings.
    
    Args:
        metadata: Dictionary to clean
        
    Returns:
        Cleaned dictionary
    """
    return {
        k: v for k, v in metadata.items()
        if v is not None and v != ""
    }


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """
    Truncate text to maximum length with suffix.
    
    Args:
        text: Text to truncate
        max_length: Maximum length including suffix
        suffix: Suffix to append if truncated
        
    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text
    
    # Reserve space for suffix
    truncate_at = max_length - len(suffix)
    return text[:truncate_at] + suffix


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """
    Safely divide two numbers, returning default if denominator is zero.
    
    Args:
        numerator: Numerator
        denominator: Denominator
        default: Value to return if denominator is zero
        
    Returns:
        Division result or default
    """
    if denominator == 0:
        return default
    return numerator / denominator


def calculate_percentage(part: float, total: float, decimal_places: int = 2) -> float:
    """
    Calculate percentage with safe division.
    
    Args:
        part: Part value
        total: Total value
        decimal_places: Number of decimal places to round to
        
    Returns:
        Percentage (0-100) rounded to specified decimal places
    """
    if total == 0:
        return 0.0
    
    percentage = (part / total) * 100
    return round(percentage, decimal_places)


def is_recent(dt: datetime, hours: int = 24) -> bool:
    """
    Check if a datetime is within the specified number of hours from now.
    
    Args:
        dt: Datetime to check
        hours: Number of hours to consider as "recent"
        
    Returns:
        True if datetime is within the specified hours
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    return dt >= cutoff


def batch_items(items: list, batch_size: int = 100):
    """
    Generator that yields batches of items.
    
    Args:
        items: List of items to batch
        batch_size: Size of each batch
        
    Yields:
        Batches of items
    """
    for i in range(0, len(items), batch_size):
        yield items[i:i + batch_size]


def extract_json_from_markdown(text: str) -> str:
    """
    Extract JSON content from markdown code blocks.
    
    Args:
        text: Text potentially containing markdown code blocks
        
    Returns:
        Extracted JSON content or original text
    """
    # Look for ```json...``` or ```...``` blocks
    import re
    
    # Try JSON code block
    json_pattern = r'```json\s*\n(.*?)\n```'
    match = re.search(json_pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    # Try generic code block
    generic_pattern = r'```\s*\n(.*?)\n```'
    match = re.search(generic_pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    
    return text.strip()


def validate_positive_int(value: int, field_name: str = "value") -> None:
    """
    Validate that an integer is positive.
    
    Args:
        value: Integer to validate
        field_name: Name of the field for error message
        
    Raises:
        HTTPException: 400 if value is not positive
    """
    if value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a positive integer, got {value}"
        )


def validate_non_empty_string(value: str, field_name: str = "value") -> None:
    """
    Validate that a string is not empty.
    
    Args:
        value: String to validate
        field_name: Name of the field for error message
        
    Raises:
        HTTPException: 400 if value is empty
    """
    if not value or not value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be empty"
        )
