"""
Test multi-value field handling in Phase 6e.

This script verifies that the PythonMapper correctly handles:
1. Multi-value field initialization as lists
2. Multi-value helper functions generation
3. Pick Basic delimiters (VM, SM, TM)
4. Multi-value parsing functions
"""

from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    YAMLMetadata,
    ProgramStructure,
    ProgramType,
    VariableDeclaration,
    VariableScope,
    LogicFlowNode,
    LogicNodeType
)
from app.mapping.python_mapper import PythonMapper
from app.mapping.multivalue_handler import MultiValueHandler
from datetime import datetime


def test_multivalue_handler():
    """Test that MultiValueHandler utility works correctly."""
    
    print("=" * 80)
    print("PHASE 6E: MULTI-VALUE FIELD HANDLING TEST")
    print("=" * 80)
    print()
    
    print("PART 1: MULTIVALUE HANDLER UTILITY TESTS")
    print("-" * 80)
    
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
    
    # Check 1: Constants generation
    constants = MultiValueHandler.generate_constants()
    check(
        "VM = chr(253)" in constants and "SM = chr(252)" in constants,
        "Constants include VM and SM delimiters"
    )
    
    # Check 2: Parse function generation
    parse_func = MultiValueHandler.generate_parse_function()
    check(
        "def parse_multivalue" in parse_func,
        "Parse function generated"
    )
    
    # Check 3: Build function in parse output
    check(
        "def build_multivalue" in parse_func,
        "Build function generated"
    )
    
    # Check 4: Get element function
    check(
        "def get_multivalue_element" in parse_func,
        "Get element function generated"
    )
    
    # Check 5: Set element function
    check(
        "def set_multivalue_element" in parse_func,
        "Set element function generated"
    )
    
    # Check 6: Multi-value initialization
    mv_init = MultiValueHandler.get_python_initialization("names", is_multi_value=True)
    check(
        "names = []" in mv_init and "Multi-value" in mv_init,
        "Multi-value field initializes to empty list with comment"
    )
    
    # Check 7: Regular initialization
    regular_init = MultiValueHandler.get_python_initialization("name", is_multi_value=False)
    check(
        'name = ""' in regular_init,
        "Regular field initializes to empty string"
    )
    
    # Check 8: Simple array access conversion
    converted = MultiValueHandler.convert_multivalue_access("NAMES<1>")
    check(
        converted == "names[0]",
        "NAMES<1> converts to names[0] (1-based to 0-based)"
    )
    
    # Check 9: Multi-dimensional access
    converted_2d = MultiValueHandler.convert_multivalue_access("VALUES<2,3>")
    check(
        converted_2d == "values[1][2]",
        "VALUES<2,3> converts to values[1][2]"
    )
    
    # Check 10: Delimiter constants
    check(
        MultiValueHandler.VM == chr(253),
        "VM delimiter is chr(253)"
    )
    
    print()
    print("PART 2: PYTHON MAPPER MULTI-VALUE GENERATION")
    print("-" * 80)
    
    # Create test YAML data with multi-value fields
    yaml_data = PickBasicYAMLSchema(
        metadata=YAMLMetadata(
            original_filename="CUSTOMER.PROCESS.bp",
            analysis_timestamp=datetime.now().isoformat(),
            pick_basic_version="Phase_6e",
            complexity_estimate="MEDIUM"
        ),
        program_structure=ProgramStructure(
            name="CUSTOMER.PROCESS",
            type=ProgramType.PROGRAM,
            entry_points=["MAIN"]
        ),
        variables=[
            VariableDeclaration(
                name="CUSTOMER.NAMES",
                type="STRING",
                scope=VariableScope.LOCAL,
                initial_value=None,
                description="Customer names",
                multi_value=True  # Multi-value field!
            ),
            VariableDeclaration(
                name="CUSTOMER.PHONES",
                type="STRING",
                scope=VariableScope.LOCAL,
                initial_value=None,
                description="Customer phone numbers",
                multi_value=True  # Multi-value field!
            ),
            VariableDeclaration(
                name="CUSTOMER.ID",
                type="STRING",
                scope=VariableScope.LOCAL,
                initial_value=None,
                description="Customer ID",
                multi_value=False  # Regular field
            )
        ],
        file_operations=[],
        subroutines=[],
        business_rules=[],
        logic_flow=[
            LogicFlowNode(
                section_id="process",
                type=LogicNodeType.ASSIGNMENT,
                semantic_intent="Process customer data",
                original_code="* Main logic",
                children=[]
            )
        ]
    )
    
    # Generate code
    mapper = PythonMapper("Python")
    imports = mapper.generate_imports(yaml_data)
    structure = mapper.generate_class_structure(yaml_data)
    generated_code = f"{imports}\n{structure}"
    
    print()
    print("GENERATED CODE:")
    print("-" * 80)
    print(generated_code)
    print("-" * 80)
    print()
    
    print("VERIFICATION CHECKS:")
    print("-" * 80)
    
    # Check 11: VM constant in generated code
    check(
        "VM = chr(253)" in generated_code,
        "Generated code includes VM constant"
    )
    
    # Check 12: SM constant in generated code
    check(
        "SM = chr(252)" in generated_code,
        "Generated code includes SM constant"
    )
    
    # Check 13: TM constant in generated code
    check(
        "TM = chr(251)" in generated_code,
        "Generated code includes TM constant"
    )
    
    # Check 14: parse_multivalue function
    check(
        "def parse_multivalue" in generated_code,
        "Generated code includes parse_multivalue function"
    )
    
    # Check 15: build_multivalue function
    check(
        "def build_multivalue" in generated_code,
        "Generated code includes build_multivalue function"
    )
    
    # Check 16: get_multivalue_element function
    check(
        "def get_multivalue_element" in generated_code,
        "Generated code includes get_multivalue_element function"
    )
    
    # Check 17: set_multivalue_element function
    check(
        "def set_multivalue_element" in generated_code,
        "Generated code includes set_multivalue_element function"
    )
    
    # Check 18: Multi-value field customer_names initialized as list
    check(
        "customer_names = []" in generated_code and "Multi-value" in generated_code,
        "customer_names initialized as list with multi-value comment"
    )
    
    # Check 19: Multi-value field customer_phones initialized as list
    check(
        "customer_phones = []" in generated_code,
        "customer_phones initialized as list"
    )
    
    # Check 20: Regular field customer_id not initialized as list
    check(
        'customer_id = ""' in generated_code,
        "customer_id (regular field) initialized as string"
    )
    
    # Check 21: Function signature includes List type hint
    check(
        "-> List[str]:" in generated_code,
        "Helper functions use proper List type hints"
    )
    
    # Check 22: Delimiter parameter in parse function
    check(
        "delimiter: str" in generated_code,
        "Parse function accepts delimiter parameter"
    )
    
    # Check 23: 1-based to 0-based index conversion comment
    check(
        "1-based" in generated_code or "zero_index = index - 1" in generated_code,
        "Code includes 1-based to 0-based index conversion logic"
    )
    
    # Check 24: Split by delimiter logic
    check(
        "split(delimiter)" in generated_code,
        "Parse function uses split(delimiter)"
    )
    
    # Check 25: Join logic for build
    check(
        "join(values)" in generated_code or "delimiter.join" in generated_code,
        "Build function uses delimiter.join"
    )
    
    print("-" * 80)
    print()
    print(f"RESULTS: {checks_passed}/{checks_total} checks passed")
    print()
    
    if checks_passed == checks_total:
        print("✓ ALL CHECKS PASSED! Multi-value field handling is working correctly.")
        return True
    else:
        print(f"✗ {checks_total - checks_passed} checks failed. Review the output above.")
        return False


if __name__ == "__main__":
    success = test_multivalue_handler()
    exit(0 if success else 1)
