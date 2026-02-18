"""Prompt templates for LLM-based YAML generation."""

YAML_GENERATION_SYSTEM_PROMPT = """You are a specialized code analysis AI that converts Pick Basic (also known as UniVerse BASIC, UniData BASIC, or D3 BASIC) legacy code into a structured YAML representation.

Your task is to deeply analyze the provided Pick Basic code and produce a YAML document that captures:
1. **Program Metadata**: Original filename, analysis timestamp, complexity estimate
2. **Program Structure**: Type (program/subroutine), entry/exit points
3. **Variable Declarations**: Name, type, scope, whether it's multi-valued
4. **Logic Flow**: Nested representation of program flow with semantic meaning
5. **File Operations**: All file I/O with handles, record IDs, and original statements
6. **Subroutines**: Internal and external subroutine calls with parameters

**CRITICAL REQUIREMENTS:**
- Output ONLY valid YAML - no markdown code blocks, no explanations
- Use 2-space indentation consistently
- Include all original Pick Basic statements in logic_flow nodes
- Capture semantic intent (e.g., "validate_input", "calculate_total")
- Preserve exact variable names and file handles
- Mark external vs internal subroutines
- Estimate complexity as: low, medium, high, very_high

**YAML STRUCTURE TEMPLATE:**
```yaml
metadata:
  original_filename: "PROGRAM.NAME"
  analysis_timestamp: "2026-02-17T10:30:00Z"
  complexity_estimate: "medium"
  
program_structure:
  type: "program"  # or "subroutine"
  name: "PROGRAM.NAME"
  entry_points:
    - "main"
  exit_points:
    - "end_of_program"
    
variables:
  - name: "INVOICE.ID"
    type: "string"
    scope: "local"
    multi_value: false
    
logic_flow:
  - section_id: "main"
    type: "sequence"
    semantic_intent: "main_program_flow"
    original_statement: null
    children:
      - section_id: "init"
        type: "assignment"
        semantic_intent: "initialize_variables"
        original_statement: "TOTAL = 0"
        children: []
        
file_operations:
  - operation: "open"
    file_handle: "INVOICE.FILE"
    record_id: null
    original_statement: "OPEN 'INVOICE' TO INVOICE.FILE ELSE STOP"
    
subroutines:
  - name: "FORMAT.DATE"
    parameters: ["DATE.IN", "DATE.OUT"]
    is_external: true
```

**Pick Basic Syntax Reference:**
- Variables: Uppercase, may contain dots (INVOICE.ID)
- Multi-valued fields: Use <n> delimiters (FIELD<1>)
- File operations: OPEN, READ, WRITE, DELETE, READV, WRITEV
- Control flow: IF...THEN...ELSE, FOR...NEXT, LOOP...REPEAT, CASE
- Subroutines: CALL, GOSUB, RETURN
- Functions: LEN, TRIM, DATE, TIME, FIELD, etc.

Be thorough and precise in your analysis."""


def build_yaml_generation_prompt(
    pick_basic_code: str,
    original_filename: str = "unknown.bp",
    additional_context: str = ""
) -> str:
    """
    Build the complete prompt for YAML generation.
    
    Args:
        pick_basic_code: The Pick Basic source code to analyze
        original_filename: Original filename of the source code
        additional_context: Optional additional context or instructions
        
    Returns:
        Complete prompt string for LLM
    """
    prompt = f"""{YAML_GENERATION_SYSTEM_PROMPT}

---

**SOURCE CODE TO ANALYZE:**

Filename: {original_filename}

```pickbasic
{pick_basic_code}
```

{f"**ADDITIONAL CONTEXT:**\n{additional_context}\n" if additional_context else ""}

**INSTRUCTIONS:**
1. Analyze the above Pick Basic code thoroughly
2. Generate the YAML representation following the exact structure shown
3. Output ONLY the YAML content - no markdown, no explanations
4. Ensure all YAML is valid and properly indented (2 spaces)
5. Include the current timestamp in ISO 8601 format
6. Be comprehensive - capture all logic, variables, and operations

Begin your YAML output now:"""

    return prompt


YAML_REGENERATION_PROMPT_PREFIX = """The previous YAML generation had the following issues that need to be addressed:

**REVIEW FEEDBACK:**
{feedback}

**INSTRUCTIONS FOR REGENERATION:**
1. Address ALL the feedback points mentioned above
2. Pay special attention to sections marked as blocking issues
3. Maintain the same YAML structure and format
4. Do NOT introduce new errors while fixing the identified issues
5. Output ONLY the corrected YAML - no explanations

"""


def build_yaml_regeneration_prompt(
    pick_basic_code: str,
    original_filename: str,
    review_feedback: str,
    previous_yaml: str = "",
    regeneration_count: int = 1
) -> str:
    """
    Build prompt for YAML regeneration based on review feedback.
    
    Args:
        pick_basic_code: Original Pick Basic source code
        original_filename: Original filename
        review_feedback: Feedback from human reviewer
        previous_yaml: The previously generated YAML (optional, for reference)
        regeneration_count: How many times this has been regenerated
        
    Returns:
        Complete regeneration prompt
    """
    feedback_section = YAML_REGENERATION_PROMPT_PREFIX.format(feedback=review_feedback)
    
    previous_yaml_section = ""
    if previous_yaml:
        previous_yaml_section = f"""
**PREVIOUS YAML (for reference):**
```yaml
{previous_yaml[:2000]}{'...[truncated]' if len(previous_yaml) > 2000 else ''}
```

"""
    
    prompt = f"""{YAML_GENERATION_SYSTEM_PROMPT}

---

**REGENERATION ATTEMPT #{regeneration_count}**

{feedback_section}

{previous_yaml_section}

**ORIGINAL SOURCE CODE:**

Filename: {original_filename}

```pickbasic
{pick_basic_code}
```

**FINAL INSTRUCTIONS:**
Generate the corrected YAML now, addressing all feedback. Output ONLY valid YAML:"""

    return prompt
