"""
Test script for Phase 6c: Subroutine Handling with Pass-by-Reference.
Verifies that subroutines are properly generated with tuple return pattern.
"""

from app.mapping.python_mapper import PythonMapper
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    YAMLMetadata,
    ProgramStructure,
    VariableDeclaration,
    SubroutineInfo,
    LogicFlowNode,
    LogicNodeType,
    VariableScope
)


def test_subroutine_generation():
    """Test that subroutines are generated with pass-by-reference pattern."""
    
    print("🧪 Testing Subroutine Generation with Pass-by-Reference (Phase 6c)")
    print("=" * 70)
    
    # Create sample subroutines
    subroutines = [
        SubroutineInfo(
            name="VALIDATE.AMOUNT",
            parameters=["AMOUNT", "STATUS", "ERROR.MSG"],
            is_external=False,
            purpose="Validate transaction amount and set status"
        ),
        SubroutineInfo(
            name="CALCULATE.TAX",
            parameters=["SUBTOTAL", "TAX.RATE", "TAX.AMOUNT"],
            is_external=False,
            purpose="Calculate tax based on subtotal and rate"
        ),
        SubroutineInfo(
            name="EXTERNAL.FORMATTER",
            parameters=["INPUT", "OUTPUT"],
            is_external=True,
            purpose="External formatting routine"
        ),
        SubroutineInfo(
            name="NO.PARAMS",
            parameters=[],
            is_external=False,
            purpose="Subroutine with no parameters"
        )
    ]
    
    # Create logic flow with subroutine calls
    logic_flow = [
        LogicFlowNode(
            section_id="L1",
            type=LogicNodeType.ASSIGNMENT,
            semantic_intent="Initialize amount",
            original_code="AMOUNT = 100"
        ),
        LogicFlowNode(
            section_id="L2",
            type=LogicNodeType.SUBROUTINE_CALL,
            semantic_intent="Validate the amount",
            original_code="CALL VALIDATE.AMOUNT(AMOUNT, STATUS, ERROR.MSG)",
            target_label="VALIDATE.AMOUNT"
        ),
        LogicFlowNode(
            section_id="L3",
            type=LogicNodeType.CONDITIONAL,
            semantic_intent="Check validation status",
            original_code="IF STATUS = 'OK' THEN",
            condition="STATUS = 'OK'",
            children=[
                LogicFlowNode(
                    section_id="L4",
                    type=LogicNodeType.SUBROUTINE_CALL,
                    semantic_intent="Calculate tax on subtotal",
                    original_code="CALL CALCULATE.TAX(SUBTOTAL, TAX.RATE, TAX.AMOUNT)",
                    target_label="CALCULATE.TAX"
                )
            ]
        ),
        LogicFlowNode(
            section_id="L5",
            type=LogicNodeType.SUBROUTINE_CALL,
            semantic_intent="Call external formatter",
            original_code="CALL EXTERNAL.FORMATTER(INPUT, OUTPUT)",
            target_label="EXTERNAL.FORMATTER"
        ),
        LogicFlowNode(
            section_id="L6",
            type=LogicNodeType.SUBROUTINE_CALL,
            semantic_intent="Call subroutine without parameters",
            original_code="CALL NO.PARAMS",
            target_label="NO.PARAMS"
        )
    ]
    
    # Create minimal YAML schema
    yaml_data = PickBasicYAMLSchema(
        metadata=YAMLMetadata(
            original_filename="TEST.SUBROUTINES",
            analysis_timestamp="2026-02-19T14:00:00",
            pick_basic_version="D3"
        ),
        program_structure=ProgramStructure(
            name="TEST.SUBROUTINES",
            type="PROGRAM"
        ),
        variables=[
            VariableDeclaration(
                name="AMOUNT",
                scope=VariableScope.LOCAL,
                type="numeric"
            ),
            VariableDeclaration(
                name="STATUS",
                scope=VariableScope.LOCAL,
                type="string"
            ),
            VariableDeclaration(
                name="ERROR.MSG",
                scope=VariableScope.LOCAL,
                type="string"
            ),
            VariableDeclaration(
                name="SUBTOTAL",
                scope=VariableScope.LOCAL,
                type="numeric"
            ),
            VariableDeclaration(
                name="TAX.RATE",
                scope=VariableScope.LOCAL,
                type="numeric"
            ),
            VariableDeclaration(
                name="TAX.AMOUNT",
                scope=VariableScope.LOCAL,
                type="numeric"
            )
        ],
        file_operations=[],
        subroutines=subroutines,
        business_rules=[],
        logic_flow=logic_flow
    )
    
    # Initialize mapper
    mapper = PythonMapper()
    
    print("\n📋 Test Data:")
    print(f"   Subroutines: {len(subroutines)}")
    print(f"   - validate.amount (3 params)")
    print(f"   - calculate.tax (3 params)")
    print(f"   - external.formatter (2 params, external)")
    print(f"   - no.params (0 params)")
    print(f"   Logic Flow Nodes: {len(logic_flow)}")
    print(f"   - 4 subroutine calls total")
    
    # Generate code
    print("\n🔧 Generating Python code...")
    generated_code = mapper.generate_class_structure(yaml_data)
    
    print("\n✅ Generated Code:")
    print("-" * 70)
    print(generated_code)
    print("-" * 70)
    
    # Verify subroutine generation
    print("\n🔍 Verification:")
    checks = [
        # Subroutine definitions (with underscores replacing dots)
        ("validate_amount function defined", "def validate_amount(" in generated_code),
        ("calculate_tax function defined", "def calculate_tax(" in generated_code),
        ("external_formatter function defined", "def external_formatter(" in generated_code),
        ("no_params function defined", "def no_params(" in generated_code),
        
        # Function parameters (with underscores)
        ("validate_amount has 3 params", "amount, status, error_msg" in generated_code),
        ("calculate_tax has 3 params", "subtotal, tax_rate, tax_amount" in generated_code),
        ("external_formatter has 2 params", "input, output" in generated_code),
        
        # Pass-by-reference pattern (tuple returns)
        ("validate_amount returns tuple", "return amount, status, error_msg" in generated_code),
        ("calculate_tax returns tuple", "return subtotal, tax_rate, tax_amount" in generated_code),
        ("external_formatter returns tuple", "return input, output" in generated_code),
        
        # Subroutine calls with tuple unpacking
        ("validate_amount call uses tuple unpacking", "amount, status, error_msg = validate_amount(amount, status, error_msg)" in generated_code),
        ("calculate_tax call uses tuple unpacking", "subtotal, tax_rate, tax_amount = calculate_tax(subtotal, tax_rate, tax_amount)" in generated_code),
        ("external_formatter call uses tuple unpacking", "input, output = external_formatter(input, output)" in generated_code),
        ("no_params simple call", "no_params()" in generated_code),
        
        # Docstrings
        ("validate_amount has docstring", '"""' in generated_code and "Validate transaction amount" in generated_code),
        ("external flag noted", "external subroutine" in generated_code.lower()),
        
        # Structure
        ("Subroutines before main", generated_code.index("def validate_amount") < generated_code.index("def test_subroutines")),
        ("5 function definitions total", generated_code.count("def ") == 5),  # 4 subroutines + 1 main
        
        # Python naming conventions
        ("No dots in function names", "def " in generated_code and ".(" not in generated_code.split("def ")[1] if "def " in generated_code else False),
        ("Underscores used instead of dots", "validate_amount" in generated_code and "error_msg" in generated_code)
    ]
    
    all_passed = True
    for check_name, check_result in checks:
        status = "✅" if check_result else "❌"
        print(f"   {status} {check_name}")
        if not check_result:
            all_passed = False
    
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 All checks passed! Phase 6c is working correctly.")
        print("\n📝 Summary:")
        print("   - Subroutines are generated as Python functions")
        print("   - Function signatures include all parameters")
        print("   - Pass-by-reference implemented via tuple returns")
        print("   - Subroutine calls use tuple unpacking: a, b, c = func(a, b, c)")
        print("   - External subroutines are marked in docstrings")
        print("   - Subroutines without parameters handled correctly")
        print("   - Subroutines defined before main function")
    else:
        print("⚠️  Some checks failed. Review the output above.")
    
    print("=" * 70)
    
    return all_passed


if __name__ == "__main__":
    test_subroutine_generation()
