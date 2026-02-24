"""
Test script for Phase 6b: Business Rules Integration.
Verifies that business rule comments are properly generated in output code.
"""

from app.mapping.python_mapper import PythonMapper
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    YAMLMetadata,
    ProgramStructure,
    VariableDeclaration,
    BusinessRule,
    LogicFlowNode,
    LogicNodeType,
    VariableScope
)


def test_business_rule_comment_generation():
    """Test that business rule comments are generated correctly."""
    
    print("🧪 Testing Business Rule Comment Generation (Phase 6b)")
    print("=" * 70)
    
    # Create sample business rules
    business_rules = [
        BusinessRule(
            rule_id="BR1",
            rule_text="Customer credit limit must not exceed $50,000",
            severity="critical",
            related_variables=["CREDIT.LIMIT", "CUSTOMER.ID"],
            source_location="Lines 45-52"
        ),
        BusinessRule(
            rule_id="BR2",
            rule_text="Invoice date must be within current fiscal year",
            severity="warning",
            related_variables=["INVOICE.DATE", "FISCAL.YEAR"],
            source_location="Lines 78-85"
        )
    ]
    
    # Create logic flow nodes with business rule linkage
    logic_flow = [
        LogicFlowNode(
            section_id="L1",
            type=LogicNodeType.CONDITIONAL,
            semantic_intent="Validate customer credit limit",
            original_code="IF CREDIT.LIMIT > 50000 THEN",
            condition="CREDIT.LIMIT > 50000",
            related_rule_ids=["BR1"],  # Link to BR1
            children=[
                LogicFlowNode(
                    section_id="L2",
                    type=LogicNodeType.PRINT,
                    semantic_intent="Display error message",
                    original_code='PRINT "Credit limit exceeded"'
                )
            ]
        ),
        LogicFlowNode(
            section_id="L3",
            type=LogicNodeType.CONDITIONAL,
            semantic_intent="Check invoice date validity",
            original_code="IF INVOICE.DATE < FISCAL.YEAR.START THEN",
            condition="INVOICE.DATE < FISCAL.YEAR.START",
            related_rule_ids=["BR2"],  # Link to BR2
            children=[
                LogicFlowNode(
                    section_id="L4",
                    type=LogicNodeType.PRINT,
                    semantic_intent="Display warning",
                    original_code='PRINT "Invalid invoice date"'
                )
            ]
        ),
        LogicFlowNode(
            section_id="L5",
            type=LogicNodeType.ASSIGNMENT,
            semantic_intent="Set default value",
            original_code="TOTAL = 0",
            # No related_rule_ids - should not generate business rule comment
        )
    ]
    
    # Create minimal YAML schema
    yaml_data = PickBasicYAMLSchema(
        metadata=YAMLMetadata(
            original_filename="TEST.PROGRAM",
            analysis_timestamp="2026-02-19T12:00:00",
            pick_basic_version="D3"
        ),
        program_structure=ProgramStructure(
            name="TEST.PROGRAM",
            type="PROGRAM"
        ),
        variables=[
            VariableDeclaration(
                name="CREDIT.LIMIT",
                scope=VariableScope.LOCAL,
                type="numeric"
            ),
            VariableDeclaration(
                name="INVOICE.DATE",
                scope=VariableScope.LOCAL,
                type="date"
            ),
            VariableDeclaration(
                name="TOTAL",
                scope=VariableScope.LOCAL,
                type="numeric"
            )
        ],
        file_operations=[],
        subroutines=[],
        business_rules=business_rules,
        logic_flow=logic_flow
    )
    
    # Initialize mapper
    mapper = PythonMapper()
    
    print("\n📋 Test Data:")
    print(f"   Business Rules: {len(business_rules)}")
    print(f"   Logic Flow Nodes: {len(logic_flow)}")
    print(f"   Nodes with rule links: 2 (L1→BR1, L3→BR2)")
    
    # Generate code
    print("\n🔧 Generating Python code...")
    generated_code = mapper.generate_class_structure(yaml_data)
    
    print("\n✅ Generated Code:")
    print("-" * 70)
    print(generated_code)
    print("-" * 70)
    
    # Verify business rule comments are present
    print("\n🔍 Verification:")
    checks = [
        ("BR1 comment present", "# Business Rule BR1:" in generated_code),
        ("BR1 text present", "Customer credit limit must not exceed $50,000" in generated_code),
        ("BR2 comment present", "# Business Rule BR2:" in generated_code),
        ("BR2 text present", "Invoice date must be within current fiscal year" in generated_code),
        ("Credit limit condition present", "50000" in generated_code),
        ("Invoice date condition present", "fiscal" in generated_code.lower()),
        ("No orphan BR comments", generated_code.count("# Business Rule") == 2),
        ("BR1 before credit check", generated_code.index("BR1:") < generated_code.index("50000")),
        ("BR2 before date check", generated_code.index("BR2:") < generated_code.index("fiscal"))
    ]
    
    all_passed = True
    for check_name, check_result in checks:
        status = "✅" if check_result else "❌"
        print(f"   {status} {check_name}")
        if not check_result:
            all_passed = False
    
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 All checks passed! Phase 6b is working correctly.")
        print("\n📝 Summary:")
        print("   - Business rule comments are generated for linked logic nodes")
        print("   - Comments include rule ID and full rule text")
        print("   - Nodes without rule links don't get spurious comments")
        print("   - Integration between YAML schema and mapper is correct")
    else:
        print("⚠️  Some checks failed. Review the output above.")
    
    print("=" * 70)
    
    return all_passed


if __name__ == "__main__":
    test_business_rule_comment_generation()
