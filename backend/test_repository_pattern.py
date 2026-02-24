"""
Test repository pattern generation in Phase 6d.

This script verifies that the PythonMapper correctly generates:
1. Model classes (dataclass) for each file
2. Repository classes with CRUD methods
3. Repository method calls in file operations
"""

from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    YAMLMetadata,
    ProgramStructure,
    ProgramType,
    VariableDeclaration,
    VariableScope,
    FileOperation,
    FileOperationType,
    LogicFlowNode,
    LogicNodeType
)
from app.mapping.python_mapper import PythonMapper
from datetime import datetime


def test_repository_pattern_generation():
    """Test that repository pattern classes and operations are generated correctly."""
    
    print("=" * 80)
    print("PHASE 6D: REPOSITORY PATTERN GENERATION TEST")
    print("=" * 80)
    print()
    
    # Create test YAML data with file operations
    yaml_data = PickBasicYAMLSchema(
        metadata=YAMLMetadata(
            original_filename="CUSTOMER.PROCESS.bp",
            analysis_timestamp=datetime.now().isoformat(),
            pick_basic_version="Phase_6d",
            complexity_estimate="MEDIUM"
        ),
        program_structure=ProgramStructure(
            name="CUSTOMER.PROCESS",
            type=ProgramType.SUBROUTINE,
            entry_points=["MAIN"]
        ),
        variables=[
            VariableDeclaration(
                name="CUSTOMER.ID",
                type="STRING",
                scope=VariableScope.LOCAL,
                initial_value=None,
                description="Customer ID for lookup"
            ),
            VariableDeclaration(
                name="CUSTOMER.RECORD",
                type="STRING",
                scope=VariableScope.LOCAL,
                initial_value=None,
                description="Customer record data"
            )
        ],
        file_operations=[
            FileOperation(
                operation=FileOperationType.OPEN,
                file_handle="CUSTOMER.FILE",
                record_id=None,
                field_number=None,
                original_statement="OPEN 'CUSTOMER.FILE' TO CUSTOMER.FILE ELSE STOP",
                semantic_intent="Open customer master file for reading",
                line_number=10
            )
        ],
        subroutines=[],
        business_rules=[],
        logic_flow=[
            LogicFlowNode(
                section_id="read_customer",
                type=LogicNodeType.FILE_IO,
                semantic_intent="Read customer record by ID",
                original_code="READ CUSTOMER.RECORD FROM CUSTOMER.FILE, CUSTOMER.ID ELSE RETURN",
                children=[],
                # Store file operation details for FILE_IO nodes
                # In real implementation, this would be a FileOperation reference
            ),
            LogicFlowNode(
                section_id="process",
                type=LogicNodeType.ASSIGNMENT,
                semantic_intent="Process customer record",
                original_code="* Main logic",
                children=[]
            ),
            LogicFlowNode(
                section_id="write_customer",
                type=LogicNodeType.FILE_IO,
                semantic_intent="Write updated customer record",
                original_code="WRITE CUSTOMER.RECORD ON CUSTOMER.FILE, CUSTOMER.ID",
                children=[]
            )
        ]
    )
    
    # Generate code
    mapper = PythonMapper("Python")
    imports = mapper.generate_imports(yaml_data)
    structure = mapper.generate_class_structure(yaml_data)
    generated_code = f"{imports}\n{structure}"
    
    print("GENERATED CODE:")
    print("-" * 80)
    print(generated_code)
    print("-" * 80)
    print()
    
    # Verification checks
    checks_passed = 0
    checks_total = 0
    
    def check(condition: bool, description: str):
        nonlocal checks_passed, checks_total
        checks_total += 1
        if condition:
            checks_passed += 1
            print(f"✓ CHECK {checks_total}: {description}")
        else:
            print(f"✗ CHECK {checks_total}: {description}")
        return condition
    
    print("VERIFICATION CHECKS:")
    print("-" * 80)
    
    # Check 1: Dataclass import
    check(
        "from dataclasses import dataclass" in generated_code,
        "Imports include dataclass"
    )
    
    # Check 2: Model class generated
    check(
        "@dataclass" in generated_code,
        "Model class has @dataclass decorator"
    )
    
    # Check 3: Model class name (Customer from CUSTOMER.FILE)
    check(
        "class Customer:" in generated_code,
        "Model class named 'Customer' (derived from CUSTOMER.FILE)"
    )
    
    # Check 4: Model has id field
    check(
        "id: str" in generated_code,
        "Model class has 'id' field"
    )
    
    # Check 5: Model has data field
    check(
        "data: Dict[str, Any]" in generated_code,
        "Model class has 'data' field for generic storage"
    )
    
    # Check 6: Repository class generated
    check(
        "class CustomerRepository:" in generated_code,
        "Repository class named 'CustomerRepository'"
    )
    
    # Check 7: Repository has __init__ method
    check(
        "def __init__(self):" in generated_code and "CustomerRepository" in generated_code,
        "Repository has __init__ method"
    )
    
    # Check 8: Repository has read method
    check(
        "def read(self, record_id: str) -> Optional[Customer]:" in generated_code,
        "Repository has read method with correct signature"
    )
    
    # Check 9: Repository has write method
    check(
        "def write(self, record: Customer) -> bool:" in generated_code,
        "Repository has write method with correct signature"
    )
    
    # Check 10: Repository has delete method
    check(
        "def delete(self, record_id: str) -> bool:" in generated_code,
        "Repository has delete method"
    )
    
    # Check 11: OPEN operation generates repository initialization
    check(
        "customer_file_repo = CustomerRepository()" in generated_code,
        "OPEN operation creates repository instance"
    )
    
    # Check 12: READ operation uses repository.read()
    check(
        "customer_file_repo.read(" in generated_code,
        "READ operation calls repository.read()"
    )
    
    # Check 13: WRITE operation uses repository.write()
    check(
        "customer_file_repo.write(" in generated_code,
        "WRITE operation calls repository.write()"
    )
    
    # Check 14: Repository docstrings present
    check(
        '"""' in generated_code and "Repository for" in generated_code,
        "Repository class has docstring"
    )
    
    # Check 15: Model docstring present
    check(
        "Data model for" in generated_code,
        "Model class has docstring"
    )
    
    # Check 16: Read method has docstring with Args/Returns
    check(
        "Args:" in generated_code and "Returns:" in generated_code,
        "Repository methods have proper docstrings with Args/Returns"
    )
    
    # Check 17: Repository stores file handle reference
    check(
        "self.file_handle = 'CUSTOMER.FILE'" in generated_code,
        "Repository stores original file handle reference"
    )
    
    # Check 18: Read method returns Optional[Model]
    check(
        "Optional[Customer]" in generated_code,
        "Read method returns Optional[Customer]"
    )
    
    # Check 19: Model has __post_init__ for data initialization
    check(
        "def __post_init__(self):" in generated_code,
        "Model has __post_init__ method"
    )
    
    # Check 20: File operations section comments
    check(
        "# File operations" in generated_code,
        "Generated code has file operations section comment"
    )
    
    print("-" * 80)
    print()
    print(f"RESULTS: {checks_passed}/{checks_total} checks passed")
    print()
    
    if checks_passed == checks_total:
        print("✓ ALL CHECKS PASSED! Repository pattern generation is working correctly.")
        return True
    else:
        print(f"✗ {checks_total - checks_passed} checks failed. Review the output above.")
        return False


if __name__ == "__main__":
    success = test_repository_pattern_generation()
    exit(0 if success else 1)
