"""
Multi-Value Field Handler for Pick Basic to Python conversion.
Phase 6e: Handle @VM/@SM/@TM delimited multi-value fields.

Pick Basic uses special delimiters for multi-value fields:
- @VM (Value Mark) - ASCII 253 - separates values within a field
- @SM (Sub-Value Mark) - ASCII 252 - separates sub-values
- @TM (Text Mark) - ASCII 251 - rarely used

Example Pick Basic:
  NAMES = "John" : @VM : "Jane" : @VM : "Bob"
  NAMES<1> = "John"
  NAMES<2> = "Jane"

Python equivalent:
  names = ["John", "Jane", "Bob"]
  names[0] = "John"
  names[1] = "Jane"
"""


class MultiValueHandler:
    """Utility for handling Pick Basic multi-value fields in Python."""
    
    # Pick Basic delimiter constants (ASCII codes)
    VM = chr(253)  # Value Mark
    SM = chr(252)  # Sub-Value Mark
    TM = chr(251)  # Text Mark
    
    @staticmethod
    def generate_constants() -> str:
        """
        Generate Python constants for multi-value delimiters.
        
        Returns:
            Python constant definitions
        """
        return """# Multi-value field delimiters (Pick Basic compatibility)
VM = chr(253)  # Value Mark - separates values
SM = chr(252)  # Sub-Value Mark - separates sub-values
TM = chr(251)  # Text Mark - rarely used"""
    
    @staticmethod
    def generate_parse_function() -> str:
        """
        Generate Python function to parse multi-value strings.
        
        Returns:
            Python function definition
        """
        return '''def parse_multivalue(mv_string: str, delimiter: str = None) -> List[str]:
    """
    Parse a Pick Basic multi-value string into a Python list.
    
    Args:
        mv_string: Multi-value string from Pick Basic
        delimiter: Delimiter to use (VM, SM, or TM). If None, tries VM first.
        
    Returns:
        List of values
    
    Example:
        >>> parse_multivalue("John" + VM + "Jane" + VM + "Bob")
        ["John", "Jane", "Bob"]
    """
    if not mv_string:
        return []
    
    if delimiter is None:
        delimiter = VM
    
    # Split by delimiter
    if delimiter in mv_string:
        return mv_string.split(delimiter)
    else:
        # No delimiter found, return as single-item list
        return [mv_string] if mv_string else []


def build_multivalue(values: List[str], delimiter: str = None) -> str:
    """
    Build a Pick Basic multi-value string from a Python list.
    
    Args:
        values: List of values
        delimiter: Delimiter to use (VM, SM, or TM). If None, uses VM.
        
    Returns:
        Multi-value string
    
    Example:
        >>> build_multivalue(["John", "Jane", "Bob"])
        "John" + VM + "Jane" + VM + "Bob"
    """
    if not values:
        return ""
    
    if delimiter is None:
        delimiter = VM
    
    return delimiter.join(values)


def get_multivalue_element(mv_string: str, index: int, delimiter: str = None) -> str:
    """
    Get a specific element from a multi-value string (1-based indexing for Pick Basic).
    
    Args:
        mv_string: Multi-value string
        index: 1-based index (Pick Basic convention)
        delimiter: Delimiter to use
        
    Returns:
        Value at index, or empty string if out of bounds
    
    Example:
        >>> get_multivalue_element("John" + VM + "Jane", 1)
        "John"
        >>> get_multivalue_element("John" + VM + "Jane", 2)
        "Jane"
    """
    values = parse_multivalue(mv_string, delimiter)
    
    # Convert 1-based to 0-based index
    zero_index = index - 1
    
    if 0 <= zero_index < len(values):
        return values[zero_index]
    else:
        return ""


def set_multivalue_element(mv_string: str, index: int, value: str, delimiter: str = None) -> str:
    """
    Set a specific element in a multi-value string (1-based indexing).
    
    Args:
        mv_string: Multi-value string
        index: 1-based index
        value: Value to set
        delimiter: Delimiter to use
        
    Returns:
        Updated multi-value string
    
    Example:
        >>> set_multivalue_element("John" + VM + "Jane", 2, "Bob")
        "John" + VM + "Bob"
    """
    values = parse_multivalue(mv_string, delimiter)
    
    # Convert 1-based to 0-based index
    zero_index = index - 1
    
    # Extend list if necessary
    while len(values) <= zero_index:
        values.append("")
    
    values[zero_index] = value
    
    return build_multivalue(values, delimiter)'''
    
    @staticmethod
    def generate_helper_comment() -> str:
        """
        Generate comment explaining multi-value fields.
        
        Returns:
            Python comment block
        """
        return """# Multi-value field helpers
# Pick Basic uses delimited strings for multi-value fields
# Example: NAMES = "John" + VM + "Jane" + VM + "Bob"
# Python equivalent: names = ["John", "Jane", "Bob"]"""
    
    @staticmethod
    def get_python_initialization(var_name: str, is_multi_value: bool = False) -> str:
        """
        Get Python initialization code for a variable.
        
        Args:
            var_name: Variable name (already converted to Python convention)
            is_multi_value: Whether this is a multi-value field
            
        Returns:
            Python initialization code
        """
        if is_multi_value:
            return f"{var_name} = []  # Multi-value field"
        else:
            return f'{var_name} = ""'
    
    @staticmethod
    def convert_multivalue_access(pick_expression: str) -> str:
        """
        Convert Pick Basic multi-value access to Python.
        
        Args:
            pick_expression: Pick Basic expression like NAMES<1> or VALUES<2,3>
            
        Returns:
            Python equivalent
        
        Examples:
            NAMES<1> -> names[0]  # 1-based to 0-based
            VALUES<2,3> -> values[1][2]  # Multi-dimensional
        """
        # Simple pattern: VAR<n>
        if "<" in pick_expression and ">" in pick_expression:
            base_var = pick_expression[:pick_expression.index("<")]
            indices = pick_expression[pick_expression.index("<") + 1:pick_expression.index(">")]
            
            # Convert to lowercase and underscores
            python_var = base_var.lower().replace(".", "_")
            
            # Handle single or multiple indices
            if "," in indices:
                # Multi-dimensional: <2,3> -> [1][2]
                index_parts = indices.split(",")
                python_indices = "".join(f"[{int(idx.strip()) - 1}]" for idx in index_parts)
                return f"{python_var}{python_indices}"
            else:
                # Single index: <1> -> [0]
                zero_index = int(indices.strip()) - 1
                return f"{python_var}[{zero_index}]"
        
        return pick_expression.lower().replace(".", "_")
