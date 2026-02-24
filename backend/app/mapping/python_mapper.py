"""
Python language mapper - Minimal implementation for Phase 6a.
Maps YAML structure to Python code.
"""

from typing import List
from app.mapping.base_mapper import BaseMapper, MappingLoader
from app.mapping.multivalue_handler import MultiValueHandler
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    VariableDeclaration,
    FileOperation,
    LogicFlowNode,
    SubroutineInfo,
    BusinessRule,
    LogicNodeType,
    FileOperationType,
    VariableScope
)


class PythonMapper(BaseMapper):
    """Minimal Python code mapper for Phase 6a."""
    
    def __init__(self, target_language: str = "Python"):
        super().__init__(target_language)
    
    def get_language_name(self) -> str:
        """Get the target language name."""
        return "Python"
    
    def get_file_extension(self) -> str:
        """Get the file extension for Python."""
        return ".py"
    
    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """
        Map a variable declaration to Python syntax.
        Phase 6e: Handle multi-value fields as lists.
        
        Args:
            variable: Variable declaration from YAML
            
        Returns:
            Python variable initialization
        """
        var_name = variable.name.lower().replace(".", "_")  # Python convention: lowercase with underscores
        
        # Phase 6e: Multi-value fields become lists
        if variable.multi_value:
            comment = f"  # Multi-value: {variable.description}" if variable.description else "  # Multi-value field"
            return f"{var_name} = []{comment}"
        
        # Determine initial value based on type
        if variable.initial_value:
            initial_value = variable.initial_value
        elif variable.type and "numeric" in variable.type.lower():
            initial_value = "0"
        elif variable.type and "array" in variable.type.lower():
            initial_value = "[]"
        else:
            initial_value = '""'
        
        comment = f"  # {variable.description}" if variable.description else ""
        return f"{var_name} = {initial_value}{comment}"
    
    def map_file_operation(self, operation: FileOperation) -> str:
        """
        Map a file operation to Python code.
        Phase 6d: Repository pattern with model and repository classes.
        
        Args:
            operation: File operation from YAML
            
        Returns:
            Python code for file operation
        """
        # Phase 6d: Repository pattern
        file_handle = operation.file_handle.lower().replace(".", "_")
        indent = self.get_indent(1)
        
        # Derive repository and model names from file handle
        # Example: CUSTOMER.FILE -> CustomerRepository, Customer model
        class_name = self._file_handle_to_class_name(operation.file_handle)
        repo_var = f"{file_handle}_repo"
        
        if operation.operation == FileOperationType.OPEN:
            # Initialize repository
            return f'{indent}# Open file: {operation.semantic_intent}\n{indent}{repo_var} = {class_name}Repository()'
        
        elif operation.operation == FileOperationType.READ:
            record_var = operation.record_id.lower().replace(".", "_") if operation.record_id else "record"
            record_id_var = f"{record_var}_id" if operation.record_id else "record_id"
            return f'{indent}# Read operation: {operation.semantic_intent}\n{indent}{record_var} = {repo_var}.read({record_id_var})'
        
        elif operation.operation == FileOperationType.WRITE:
            record_var = operation.record_id.lower().replace(".", "_") if operation.record_id else "record"
            return f'{indent}# Write operation: {operation.semantic_intent}\n{indent}{repo_var}.write({record_var})'
        
        elif operation.operation == FileOperationType.DELETE:
            record_var = operation.record_id.lower().replace(".", "_") if operation.record_id else "record"
            return f'{indent}# Delete operation: {operation.semantic_intent}\n{indent}{repo_var}.delete({record_var})'
        
        else:
            return f'{indent}# {operation.operation.value}: {operation.semantic_intent}\n{indent}# TODO: Implement {operation.operation.value}'
    
    def map_logic_flow_node(
        self, 
        node: LogicFlowNode,
        business_rules: List[BusinessRule],
        indent_level: int = 0
    ) -> str:
        """
        Map a logic flow node to Python code.
        Phase 6a: Basic control flow mapping.
        
        Args:
            node: Logic flow node from YAML
            business_rules: List of business rules for linking
            indent_level: Current indentation level
            
        Returns:
            Python code for logic flow node
        """
        indent = self.get_indent(indent_level)
        code_lines = []
        
        # Add business rule comments if this node is linked to business rules
        if node.related_rule_ids:
            rule_comment = self.add_business_rule_comment(
                rule_ids=node.related_rule_ids,
                business_rules=business_rules,
                indent_level=indent_level
            )
            if rule_comment:
                code_lines.append(rule_comment.rstrip())  # Remove trailing newline
        
        # Add semantic intent as comment
        code_lines.append(f"{indent}# {node.semantic_intent}")
        
        # Map based on node type
        if node.type == LogicNodeType.ASSIGNMENT:
            # Simple assignment
            code_lines.append(f"{indent}{node.original_code.lower()}")
        
        elif node.type == LogicNodeType.CONDITIONAL:
            # IF statement
            if node.condition:
                condition_python = self._convert_condition(node.condition)
                code_lines.append(f"{indent}if {condition_python}:")
                
                # Process children
                if node.children:
                    for child in node.children:
                        child_code = self.map_logic_flow_node(child, business_rules, indent_level + 1)
                        code_lines.append(child_code)
                else:
                    code_lines.append(f"{self.get_indent(indent_level + 1)}pass")
        
        elif node.type == LogicNodeType.LOOP:
            # FOR/WHILE loop
            if node.loop_variable:
                loop_var = node.loop_variable.lower()
                code_lines.append(f"{indent}for {loop_var} in range(10):  # TODO: Determine correct range")
            else:
                code_lines.append(f"{indent}while True:  # TODO: Add proper condition")
            
            # Process children
            if node.children:
                for child in node.children:
                    child_code = self.map_logic_flow_node(child, business_rules, indent_level + 1)
                    code_lines.append(child_code)
            else:
                code_lines.append(f"{self.get_indent(indent_level + 1)}pass")
        
        elif node.type == LogicNodeType.SUBROUTINE_CALL:
            # Function call - Phase 6c: Handle parameters and pass-by-reference
            func_name = node.target_label.lower().replace(".", "_") if node.target_label else "function"
            
            # Extract parameters from original code if available
            # Pick Basic: CALL SUB(A, B, C)
            # Python with pass-by-reference: a, b, c = sub(a, b, c)
            if "(" in node.original_code and ")" in node.original_code:
                # Extract parameters from CALL SUB(A, B, C)
                param_section = node.original_code[node.original_code.index("(") + 1:node.original_code.rindex(")")]
                params = [p.strip().lower().replace(".", "_") for p in param_section.split(",") if p.strip()]
                
                if params:
                    params_str = ", ".join(params)
                    # Use tuple unpacking for pass-by-reference pattern
                    code_lines.append(f"{indent}{params_str} = {func_name}({params_str})  # Subroutine call with pass-by-reference")
                else:
                    code_lines.append(f"{indent}{func_name}()  # Subroutine call")
            else:
                code_lines.append(f"{indent}{func_name}()  # Subroutine call")
        
        elif node.type == LogicNodeType.RETURN:
            code_lines.append(f"{indent}return")
        
        elif node.type == LogicNodeType.FILE_IO:
            # File I/O operation - Phase 6d: Repository pattern
            # Parse the original code to determine operation type
            original_upper = node.original_code.upper()
            
            if "READ" in original_upper:
                # Extract file handle and record variable
                # Example: READ CUSTOMER.RECORD FROM CUSTOMER.FILE, CUSTOMER.ID
                parts = node.original_code.split()
                if len(parts) >= 4:
                    record_var = parts[1].lower().replace(".", "_")
                    # Find file handle (after FROM)
                    if "FROM" in original_upper:
                        from_idx = next(i for i, p in enumerate(parts) if p.upper() == "FROM")
                        file_handle = parts[from_idx + 1].replace(",", "")
                        
                        # Create repo variable name
                        repo_var = f"{file_handle.lower().replace('.', '_')}_repo"
                        record_id_var = f"{record_var}_id"
                        
                        code_lines.append(f"{indent}{record_var} = {repo_var}.read({record_id_var})")
                    else:
                        code_lines.append(f"{indent}# TODO: Implement READ: {node.original_code}")
                else:
                    code_lines.append(f"{indent}# TODO: Implement READ: {node.original_code}")
            
            elif "WRITE" in original_upper:
                # Extract file handle and record variable
                # Example: WRITE CUSTOMER.RECORD ON CUSTOMER.FILE, CUSTOMER.ID
                parts = node.original_code.split()
                if len(parts) >= 4:
                    record_var = parts[1].lower().replace(".", "_")
                    # Find file handle (after ON)
                    if "ON" in original_upper:
                        on_idx = next(i for i, p in enumerate(parts) if p.upper() == "ON")
                        file_handle = parts[on_idx + 1].replace(",", "")
                        
                        # Create repo variable name
                        repo_var = f"{file_handle.lower().replace('.', '_')}_repo"
                        
                        code_lines.append(f"{indent}{repo_var}.write({record_var})")
                    else:
                        code_lines.append(f"{indent}# TODO: Implement WRITE: {node.original_code}")
                else:
                    code_lines.append(f"{indent}# TODO: Implement WRITE: {node.original_code}")
            
            elif "DELETE" in original_upper:
                # Extract file handle and record ID
                # Example: DELETE CUSTOMER.FILE, CUSTOMER.ID
                parts = node.original_code.split()
                if len(parts) >= 3:
                    file_handle = parts[1].replace(",", "")
                    repo_var = f"{file_handle.lower().replace('.', '_')}_repo"
                    record_id_var = parts[2].lower().replace(".", "_")
                    
                    code_lines.append(f"{indent}{repo_var}.delete({record_id_var})")
                else:
                    code_lines.append(f"{indent}# TODO: Implement DELETE: {node.original_code}")
            
            else:
                code_lines.append(f"{indent}# File I/O: {node.original_code}")
        
        elif node.type == LogicNodeType.PRINT:
            code_lines.append(f"{indent}print({node.original_code.lower()})")
        
        else:
            # Generic fallback
            code_lines.append(f"{indent}# {node.type.value}: {node.original_code}")
            
            # Process children if any
            if node.children:
                for child in node.children:
                    child_code = self.map_logic_flow_node(child, business_rules, indent_level)
                    code_lines.append(child_code)
        
        return "\n".join(code_lines)
    
    def _convert_condition(self, condition: str) -> str:
        """
        Convert Pick Basic condition to Python.
        Phase 6a: Simple conversion.
        
        Args:
            condition: Pick Basic condition expression
            
        Returns:
            Python condition
        """
        # Simple conversions
        python_condition = condition.lower()
        python_condition = python_condition.replace(" = ", " == ")
        python_condition = python_condition.replace(" and ", " and ")
        python_condition = python_condition.replace(" or ", " or ")
        python_condition = python_condition.replace(" not ", " not ")
        
        return python_condition
    
    def _file_handle_to_class_name(self, file_handle: str) -> str:
        """
        Convert file handle to Python class name.
        Phase 6d: Repository pattern naming.
        
        Args:
            file_handle: File handle from Pick Basic (e.g., CUSTOMER.FILE)
            
        Returns:
            Python class name (e.g., Customer)
        """
        # Remove common suffixes
        name = file_handle.upper()
        for suffix in ['.FILE', '.MASTER', '.DATA', 'FILE', 'MASTER', 'DATA']:
            if name.endswith(suffix):
                name = name[:-len(suffix)]
        
        # Convert to title case with underscores removed
        name = name.replace('.', '_').replace('-', '_')
        parts = name.split('_')
        class_name = ''.join(word.capitalize() for word in parts if word)
        
        return class_name if class_name else 'Record'
    
    def generate_model_class(self, file_handle: str, variables: List[VariableDeclaration]) -> str:
        """
        Generate a model class for a file.
        Phase 6d: Repository pattern model.
        
        Args:
            file_handle: File handle name
            variables: Variables that might be fields in this record
            
        Returns:
            Python dataclass definition
        """
        class_name = self._file_handle_to_class_name(file_handle)
        lines = []
        
        lines.append("@dataclass")
        lines.append(f"class {class_name}:")
        lines.append(f'{self.get_indent(1)}"""')
        lines.append(f"{self.get_indent(1)}Data model for {file_handle} file.")
        lines.append(f"{self.get_indent(1)}Represents a single record in the file.")
        lines.append(f'{self.get_indent(1)}"""')
        
        # Add common fields
        lines.append(f"{self.get_indent(1)}id: str = ''  # Record ID")
        lines.append(f"{self.get_indent(1)}# TODO: Add actual fields based on file structure")
        lines.append(f"{self.get_indent(1)}# Common fields from Pick Basic:")
        
        # Add placeholder fields from variables that might belong to this file
        # This is a heuristic - in reality, you'd need schema information
        lines.append(f"{self.get_indent(1)}data: Dict[str, Any] = None  # Raw field data")
        lines.append(f"{self.get_indent(1)}")
        lines.append(f"{self.get_indent(1)}def __post_init__(self):")
        lines.append(f"{self.get_indent(2)}if self.data is None:")
        lines.append(f"{self.get_indent(3)}self.data = {{}}")
        
        return "\n".join(lines)
    
    def generate_repository_class(self, file_handle: str) -> str:
        """
        Generate a repository class for file operations.
        Phase 6d: Repository pattern.
        
        Args:
            file_handle: File handle name
            
        Returns:
            Python repository class definition
        """
        class_name = self._file_handle_to_class_name(file_handle)
        repo_name = f"{class_name}Repository"
        lines = []
        
        lines.append(f"class {repo_name}:")
        lines.append(f'{self.get_indent(1)}"""')
        lines.append(f"{self.get_indent(1)}Repository for {file_handle} file operations.")
        lines.append(f"{self.get_indent(1)}Handles CRUD operations for {class_name} records.")
        lines.append(f'{self.get_indent(1)}"""')
        lines.append(f"{self.get_indent(1)}")
        lines.append(f"{self.get_indent(1)}def __init__(self):")
        lines.append(f'{self.get_indent(2)}"""Initialize repository connection."""')
        lines.append(f"{self.get_indent(2)}# TODO: Setup database connection or file handle")
        lines.append(f"{self.get_indent(2)}self.file_handle = '{file_handle}'")
        lines.append(f"{self.get_indent(2)}self.connection = None  # Placeholder for actual connection")
        lines.append(f"{self.get_indent(1)}")
        lines.append(f"{self.get_indent(1)}def read(self, record_id: str) -> Optional[{class_name}]:")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}Read a record by ID.")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Args:")
        lines.append(f"{self.get_indent(3)}record_id: Record identifier")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Returns:")
        lines.append(f"{self.get_indent(3)}{class_name} object or None if not found")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}# TODO: Implement actual read from Pick Basic file")
        lines.append(f"{self.get_indent(2)}# Original: READ record FROM file.handle, record.id")
        lines.append(f"{self.get_indent(2)}return {class_name}(id=record_id)")
        lines.append(f"{self.get_indent(1)}")
        lines.append(f"{self.get_indent(1)}def write(self, record: {class_name}) -> bool:")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}Write a record to the file.")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Args:")
        lines.append(f"{self.get_indent(3)}record: {class_name} object to write")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Returns:")
        lines.append(f"{self.get_indent(3)}True if successful")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}# TODO: Implement actual write to Pick Basic file")
        lines.append(f"{self.get_indent(2)}# Original: WRITE record ON file.handle, record.id")
        lines.append(f"{self.get_indent(2)}return True")
        lines.append(f"{self.get_indent(1)}")
        lines.append(f"{self.get_indent(1)}def delete(self, record_id: str) -> bool:")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}Delete a record by ID.")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Args:")
        lines.append(f"{self.get_indent(3)}record_id: Record identifier")
        lines.append(f"{self.get_indent(2)}")
        lines.append(f"{self.get_indent(2)}Returns:")
        lines.append(f"{self.get_indent(3)}True if successful")
        lines.append(f'{self.get_indent(2)}"""')
        lines.append(f"{self.get_indent(2)}# TODO: Implement actual delete from Pick Basic file")
        lines.append(f"{self.get_indent(2)}# Original: DELETE file.handle, record.id")
        lines.append(f"{self.get_indent(2)}return True")
        
        return "\n".join(lines)
    
    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """
        Generate Python import statements.
        Phase 6e: Add multi-value helpers when needed.
        
        Args:
            yaml_data: Parsed YAML schema
            
        Returns:
            Import statements
        """
        imports = [
            '"""',
            f'Generated from: {yaml_data.metadata.original_filename or "unknown"}',
            f'Generated at: {yaml_data.metadata.analysis_timestamp}',
            'Auto-generated by Legacy Code Migration System',
            '"""',
            '',
            'from typing import Optional, List, Dict, Any',
            'from dataclasses import dataclass',
            'from datetime import datetime',
            ''
        ]
        
        # Phase 6e: Check if any variables are multi-value
        has_multivalue = any(var.multi_value for var in yaml_data.variables or [])
        
        if has_multivalue:
            imports.append('')
            imports.append(MultiValueHandler.generate_constants())
            imports.append('')
            imports.append('')
            imports.append(MultiValueHandler.generate_parse_function())
            imports.append('')
        
        return "\n".join(imports)
    
    def generate_subroutine_function(self, subroutine: SubroutineInfo) -> str:
        """
        Generate a Python function from subroutine information.
        Phase 6c: Implement pass-by-reference using tuple returns.
        
        Args:
            subroutine: Subroutine information from YAML
            
        Returns:
            Python function definition
        """
        lines = []
        
        # Convert to Python naming convention: lowercase with underscores
        func_name = subroutine.name.lower().replace(".", "_")
        params = [p.lower().replace(".", "_") for p in subroutine.parameters]
        params_str = ", ".join(params) if params else ""
        
        # Function signature
        lines.append(f"def {func_name}({params_str}):")
        
        # Docstring
        lines.append(f'{self.get_indent(1)}"""')
        if subroutine.purpose:
            lines.append(f"{self.get_indent(1)}{subroutine.purpose}")
        else:
            lines.append(f"{self.get_indent(1)}Subroutine: {subroutine.name}")
        
        if subroutine.is_external:
            lines.append(f"{self.get_indent(1)}Note: This is an external subroutine.")
        
        if params:
            lines.append(f"{self.get_indent(1)}")
            lines.append(f"{self.get_indent(1)}Args:")
            for param in params:
                lines.append(f"{self.get_indent(2)}{param}: Parameter from Pick Basic")
            lines.append(f"{self.get_indent(1)}")
            lines.append(f"{self.get_indent(1)}Returns:")
            lines.append(f"{self.get_indent(2)}Tuple of ({params_str}) for pass-by-reference")
        
        lines.append(f'{self.get_indent(1)}"""')
        
        # Function body
        if subroutine.is_external:
            lines.append(f"{self.get_indent(1)}# TODO: Implement external subroutine {subroutine.name}")
            lines.append(f"{self.get_indent(1)}# This subroutine is external and needs to be implemented")
        else:
            lines.append(f"{self.get_indent(1)}# TODO: Implement subroutine logic from external file")
            lines.append(f"{self.get_indent(1)}# Original subroutine: {subroutine.name}")
        
        lines.append(f"{self.get_indent(1)}pass")
        
        # Return statement for pass-by-reference pattern
        if params:
            lines.append(f"{self.get_indent(1)}")
            lines.append(f"{self.get_indent(1)}# Pass-by-reference: return all parameters as tuple")
            lines.append(f"{self.get_indent(1)}return {params_str}")
        else:
            lines.append(f"{self.get_indent(1)}return None")
        
        return "\n".join(lines)
    
    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """
        Generate overall Python class structure.
        Phase 6d: Add repository pattern classes.
        
        Args:
            yaml_data: Parsed YAML schema
            
        Returns:
            Python class/module structure
        """
        lines = []
        
        # Phase 6d: Generate model and repository classes for files
        if yaml_data.file_operations:
            # Extract unique file handles
            file_handles = set()
            for file_op in yaml_data.file_operations:
                if file_op.file_handle:
                    file_handles.add(file_op.file_handle)
            
            if file_handles:
                lines.append("# Data models and repositories")
                lines.append("")
                
                for file_handle in sorted(file_handles):
                    # Generate model class
                    model_code = self.generate_model_class(file_handle, yaml_data.variables or [])
                    lines.append(model_code)
                    lines.append("")
                    lines.append("")
                    
                    # Generate repository class
                    repo_code = self.generate_repository_class(file_handle)
                    lines.append(repo_code)
                    lines.append("")
                    lines.append("")
        
        # Generate subroutine functions (Phase 6c)
        if yaml_data.subroutines:
            lines.append("# Subroutine definitions")
            lines.append("")
            for subroutine in yaml_data.subroutines:
                sub_code = self.generate_subroutine_function(subroutine)
                lines.append(sub_code)
                lines.append("")
                lines.append("")
        
        # Program name
        program_name = yaml_data.program_structure.name or "MigratedProgram"
        program_name_clean = program_name.replace(".", "_").lower()
        
        # Main function header
        lines.append(f"def {program_name_clean}():")
        lines.append(f'{self.get_indent(1)}"""')
        lines.append(f'{self.get_indent(1)}Migrated from Pick Basic program: {program_name}')
        lines.append(f'{self.get_indent(1)}Original complexity: {yaml_data.metadata.complexity_estimate or "unknown"}')
        lines.append(f'{self.get_indent(1)}"""')
        lines.append("")
        
        # Initialize variables
        if yaml_data.variables:
            lines.append(f"{self.get_indent(1)}# Variable declarations")
            for var in yaml_data.variables:
                if var.scope in [VariableScope.LOCAL, VariableScope.PARAMETER]:
                    var_decl = self.map_variable_declaration(var)
                    lines.append(f"{self.get_indent(1)}{var_decl}")
            lines.append("")
        
        # File operations setup
        if yaml_data.file_operations:
            lines.append(f"{self.get_indent(1)}# File operations")
            for file_op in yaml_data.file_operations:
                if file_op.operation == FileOperationType.OPEN:
                    op_code = self.map_file_operation(file_op)
                    lines.append(op_code)
            lines.append("")
        
        # Main logic
        lines.append(f"{self.get_indent(1)}# Main program logic")
        for node in yaml_data.logic_flow:
            node_code = self.map_logic_flow_node(node, yaml_data.business_rules, indent_level=1)
            lines.append(node_code)
        
        lines.append("")
        lines.append("")
        lines.append('if __name__ == "__main__":')
        lines.append(f"{self.get_indent(1)}{program_name_clean}()")
        
        return "\n".join(lines)


# Register the Python mapper
MappingLoader.register_mapper("PYTHON", PythonMapper)
