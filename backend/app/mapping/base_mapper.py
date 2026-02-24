"""
Base mapper interface for language-specific code generation.
All target language mappers inherit from this abstract base class.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    VariableDeclaration,
    FileOperation,
    LogicFlowNode,
    SubroutineInfo,
    BusinessRule
)


class BaseMapper(ABC):
    """
    Abstract base class for language-specific code mappers.
    Defines the contract for translating YAML to target language code.
    """
    
    def __init__(self, target_language: str):
        """
        Initialize the mapper.
        
        Args:
            target_language: Target language name (e.g., "Python", "TypeScript")
        """
        self.target_language = target_language
    
    @abstractmethod
    def get_language_name(self) -> str:
        """Get the target language name."""
        pass
    
    @abstractmethod
    def get_file_extension(self) -> str:
        """Get the file extension for this language (e.g., '.py', '.ts')."""
        pass
    
    @abstractmethod
    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """
        Map a variable declaration to target language syntax.
        
        Args:
            variable: Variable declaration from YAML
            
        Returns:
            Code string for variable declaration
        """
        pass
    
    @abstractmethod
    def map_file_operation(self, operation: FileOperation) -> str:
        """
        Map a file operation to target language code.
        
        Args:
            operation: File operation from YAML
            
        Returns:
            Code string for file operation
        """
        pass
    
    @abstractmethod
    def map_logic_flow_node(
        self, 
        node: LogicFlowNode,
        business_rules: List[BusinessRule],
        indent_level: int = 0
    ) -> str:
        """
        Map a logic flow node to target language code.
        
        Args:
            node: Logic flow node from YAML
            business_rules: List of business rules for linking
            indent_level: Current indentation level
            
        Returns:
            Code string for logic flow node
        """
        pass
    
    @abstractmethod
    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """
        Generate import statements based on YAML content.
        
        Args:
            yaml_data: Parsed YAML schema
            
        Returns:
            Import statements as string
        """
        pass
    
    @abstractmethod
    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """
        Generate overall class/module structure.
        
        Args:
            yaml_data: Parsed YAML schema
            
        Returns:
            Class/module structure code
        """
        pass
    
    # Helper methods (non-abstract, can be overridden)
    
    def get_indent(self, level: int) -> str:
        """
        Get indentation string for given level.
        
        Args:
            level: Indentation level
            
        Returns:
            Indentation string (spaces or tabs)
        """
        return "    " * level  # 4 spaces per level by default
    
    def format_comment(self, comment: str, indent_level: int = 0) -> str:
        """
        Format a comment for the target language.
        
        Args:
            comment: Comment text
            indent_level: Indentation level
            
        Returns:
            Formatted comment
        """
        # Default to Python-style comments, override in subclasses if needed
        indent = self.get_indent(indent_level)
        return f"{indent}# {comment}"
    
    def add_business_rule_comment(
        self, 
        rule_ids: List[str],
        business_rules: List[BusinessRule],
        indent_level: int = 0
    ) -> str:
        """
        Generate comments for linked business rules.
        
        Args:
            rule_ids: List of business rule IDs
            business_rules: All available business rules
            indent_level: Indentation level
            
        Returns:
            Formatted business rule comments
        """
        if not rule_ids:
            return ""
        
        # Find matching rules
        rules_map = {rule.rule_id: rule for rule in business_rules}
        comments = []
        
        for rule_id in rule_ids:
            rule = rules_map.get(rule_id)
            if rule:
                comment = f"Business Rule {rule_id}: {rule.rule_text}"
                comments.append(self.format_comment(comment, indent_level))
        
        return "\n".join(comments) + "\n" if comments else ""


class MappingLoader:
    """Factory for loading language-specific mappers."""
    
    _mappers: Dict[str, type] = {}
    
    @classmethod
    def register_mapper(cls, language: str, mapper_class: type):
        """
        Register a mapper class for a language.
        
        Args:
            language: Language name (uppercase)
            mapper_class: Mapper class to register
        """
        cls._mappers[language.upper()] = mapper_class
    
    @classmethod
    def get_mapper(cls, language: str) -> BaseMapper:
        """
        Get a mapper instance for a language.
        
        Args:
            language: Target language name
            
        Returns:
            Mapper instance
            
        Raises:
            ValueError: If language not supported
        """
        mapper_class = cls._mappers.get(language.upper())
        if not mapper_class:
            raise ValueError(
                f"Language '{language}' not supported. "
                f"Available: {', '.join(cls._mappers.keys())}"
            )
        
        return mapper_class(language)
    
    @classmethod
    def get_supported_languages(cls) -> List[str]:
        """Get list of supported languages."""
        return list(cls._mappers.keys())
