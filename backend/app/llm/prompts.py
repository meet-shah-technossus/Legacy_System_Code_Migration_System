"""Prompt templates for LLM-based YAML generation."""

YAML_GENERATION_SYSTEM_PROMPT = """You are a specialized code analysis AI that converts Pick Basic (also known as UniVerse BASIC, UniData BASIC, or D3 BASIC) legacy code into a structured YAML representation.

Your task is to deeply analyze the provided Pick Basic code and produce a YAML document that captures:
1. **Program Metadata**: Original filename, analysis timestamp, complexity estimate
2. **Program Structure**: Type (program/subroutine), entry/exit points
3. **Variable Declarations**: Name, type, scope, whether it's multi-valued
4. **File Operations**: All file I/O with handles, record IDs, and original statements
5. **Subroutines**: Internal and external subroutine calls with parameters
6. **Business Rules**: Extracted business constraints and validation logic (CRITICAL)
7. **Logic Flow**: Nested representation of program flow with semantic meaning AND links to business rules

**CRITICAL REQUIREMENTS:**
- Output ONLY valid YAML - no markdown code blocks, no explanations
- Use 2-space indentation consistently
- Include all original Pick Basic statements in logic_flow nodes
- Capture semantic intent (e.g., "validate_input", "calculate_total")
- Preserve exact variable names and file handles
- Mark external vs internal subroutines
- **Extract ALL business rules** (validation logic, constraints, policies)
- **Link logic_flow nodes to business rules** using related_rule_ids
- Estimate complexity as: low, medium, high, very_high
- **ALL ENUM VALUES MUST BE UPPERCASE**: program_structure.type (PROGRAM/SUBROUTINE/FUNCTION/MENU), variables scope (LOCAL/GLOBAL/COMMON/PARAMETER), file_operations operation (OPEN/READ/WRITE/DELETE/CLOSE/READNEXT/READU/WRITEV/SELECT), logic_flow type (SEQUENCE/LOOP/CONDITIONAL/FILE_IO/SUBROUTINE_CALL/ASSIGNMENT/EXPRESSION/RETURN/GOTO/CASE/PRINT/INPUT)

**YAML STRUCTURE TEMPLATE:**
```yaml
metadata:
  original_filename: "PROGRAM.NAME"
  analysis_timestamp: "2026-02-19T10:30:00Z"
  complexity_estimate: "medium"
  
program_structure:
  type: "PROGRAM"  # MUST be one of: PROGRAM, SUBROUTINE, FUNCTION, MENU (UPPERCASE)
  name: "PROGRAM.NAME"
  entry_points:
    - "main"
  exit_points:
    - "end_of_program"
    
variables:
  - name: "INVOICE.ID"
    type: "string"
    scope: "LOCAL"  # MUST be one of: LOCAL, GLOBAL, COMMON, PARAMETER (UPPERCASE)
    multi_value: false
  - name: "CUSTOMER.BALANCE"
    type: "numeric"
    scope: "LOCAL"
    multi_value: false
    
file_operations:
  - operation: "OPEN"  # MUST be one of: OPEN, READ, WRITE, DELETE, CLOSE, READNEXT, READU, WRITEV, SELECT (UPPERCASE)
    file_handle: "INVOICE.FILE"
    record_id: null
    original_statement: "OPEN 'INVOICE' TO INVOICE.FILE ELSE STOP"
    semantic_intent: "open_invoice_database"
    
subroutines:
  - name: "FORMAT.DATE"
    parameters: ["DATE.IN", "DATE.OUT"]
    is_external: true
    purpose: "Format date for display"
    
business_rules:
  - rule_id: "BR1"
    rule_text: "Customer balance must be non-negative"
    severity: "critical"
    related_variables: ["CUSTOMER.BALANCE"]
    source_location: "line 45-48"
  - rule_id: "BR2"
    rule_text: "Invoice amount must not exceed credit limit"
    severity: "critical"
    related_variables: ["INVOICE.AMOUNT", "CREDIT.LIMIT"]
    source_location: "line 62-65"
    
logic_flow:
  - section_id: "main"
    type: "SEQUENCE"  # MUST be one of: SEQUENCE, LOOP, CONDITIONAL, FILE_IO, SUBROUTINE_CALL, ASSIGNMENT, EXPRESSION, RETURN, GOTO, CASE, PRINT, INPUT (UPPERCASE)
    semantic_intent: "main_program_flow"
    original_code: ""
    related_rule_ids: []
    children:
      - section_id: "init"
        type: "ASSIGNMENT"
        semantic_intent: "initialize_total"
        original_code: "TOTAL = 0"
        related_rule_ids: []
        children: []
      - section_id: "validate_balance"
        type: "CONDITIONAL"
        semantic_intent: "validate_customer_balance_non_negative"
        original_code: "IF CUSTOMER.BALANCE < 0 THEN GOSUB ERROR.HANDLER"
        condition: "CUSTOMER.BALANCE < 0"
        related_rule_ids: ["BR1"]  # Link to business rule!
        children: []
```

**Business Rule Extraction Guidelines:**
- Look for IF statements that validate data (e.g., balance checks, date ranges, status values)
- Identify CASE statements that enforce workflow states
- Extract constraints from LOOP conditions (e.g., "must process all items")
- Capture error handling logic that implies requirements
- Mark severity based on consequences: critical (blocks transaction), warning (logs issue), info (best practice)
- Use rule_id format: BR1, BR2, BR3, etc.
- Link each validation logic_flow node to its business rule via related_rule_ids

**Pick Basic Syntax Reference:**
- Variables: Uppercase, may contain dots (INVOICE.ID)
- Multi-valued fields: Use <n> delimiters (FIELD<1>)
- File operations: OPEN, READ, WRITE, DELETE, READV, WRITEV, READU (with lock)
- Control flow: IF...THEN...ELSE, FOR...NEXT, LOOP...REPEAT, CASE
- Subroutines: CALL, GOSUB, RETURN
- Functions: LEN, TRIM, DATE, TIME, FIELD, etc.

Be thorough and precise in your analysis. Business rule extraction is CRITICAL for code generation quality."""


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
    from datetime import datetime
    # Inject the real current timestamp into the example so the LLM outputs
    # the actual analysis time instead of the hard-coded placeholder.
    current_ts = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
    system_prompt = YAML_GENERATION_SYSTEM_PROMPT.replace(
        '"2026-02-19T10:30:00Z"', f'"{current_ts}"'
    )

    # Hoist conditional block — backslash escapes not allowed inside f-string {} in Python < 3.12
    additional_context_block = (
        f"**ADDITIONAL CONTEXT:**\n{additional_context}\n"
        if additional_context
        else ""
    )

    prompt = f"""{system_prompt}

---

**SOURCE CODE TO ANALYZE:**

Filename: {original_filename}

```pickbasic
{pick_basic_code}
```

{additional_context_block}

**INSTRUCTIONS:**
1. Analyze the above Pick Basic code thoroughly
2. Extract ALL business rules from validation logic, constraints, and policies
3. Generate the YAML representation following the exact 7-section structure shown
4. Link logic_flow nodes to business_rules using related_rule_ids arrays
5. Output ONLY the YAML content - no markdown, no explanations
6. Ensure all YAML is valid and properly indented (2 spaces)
7. Include the current timestamp in ISO 8601 format
8. Be comprehensive - capture all logic, variables, operations, and business rules

Begin your YAML output now:"""

    return prompt


YAML_REGENERATION_PROMPT_PREFIX = """The previous YAML generation had the following issues that need to be addressed:

**REVIEW FEEDBACK:**
{feedback}

**INSTRUCTIONS FOR REGENERATION:**
1. Address ALL the feedback points mentioned above
2. Pay special attention to sections marked as blocking issues
3. Ensure business_rules are properly extracted and linked via related_rule_ids
4. Maintain the same 7-section YAML structure (metadata, program_structure, variables, file_operations, subroutines, business_rules, logic_flow)
5. Do NOT introduce new errors while fixing the identified issues
6. Output ONLY the corrected YAML - no explanations

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
    {str(previous_yaml)[:2000]}{'...[truncated]' if len(str(previous_yaml)) > 2000 else ''}
```

"""
    
    from datetime import datetime
    current_ts = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
    system_prompt = YAML_GENERATION_SYSTEM_PROMPT.replace(
        '"2026-02-19T10:30:00Z"', f'"{current_ts}"'
    )

    prompt = f"""{system_prompt}

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


# ============================================================================
# CODE GENERATION PROMPTS (Agent 2)
# ============================================================================

# ── Language-specific directives injected into every strict prompt ────────────

_LANGUAGE_DIRECTIVES: dict = {
    "PYTHON": """\
**Python-Specific Directives:**
- Naming: snake_case for variables/functions, PascalCase for classes
- Type hints: required on ALL function signatures (no bare `def`)
- Docstrings: Google-style on every function and class
- Data models: use @dataclass decorator, not plain dicts
- Multi-return / pass-by-reference: tuple unpacking — `a, b = func(a, b)`
- Errors: raise specific exceptions, never bare `except:`
- Entry point: always end with `if __name__ == "__main__":  main()`
- Style: PEP 8 — 4-space indent, max 100 chars per line""",

    "TYPESCRIPT": """\
**TypeScript-Specific Directives:**
- Naming: camelCase for variables/functions, PascalCase for types/interfaces/classes
- Types: explicit types everywhere; `any` is forbidden
- Data models: use `interface` or `type`; class only when methods are needed
- Async: async/await for all I/O-like operations; return `Promise<T>`
- Errors: try/catch with typed `error: unknown`, narrow with instanceof
- Exports: export all public functions and types
- Entry point: async function main(); call at bottom of file""",

    "JAVASCRIPT": """\
**JavaScript-Specific Directives:**
- Naming: camelCase for variables/functions, PascalCase for classes
- Variables: const by default, let for reassignment; never var
- Async: async/await; no raw Promise chains
- Errors: try/catch blocks around all I/O
- Entry point: async function main(); call at bottom of file""",

    "JAVA": """\
**Java-Specific Directives:**
- Naming: camelCase for variables/methods, PascalCase for classes/interfaces
- Class per concept: one public class per logical entity (models, repos, main)
- Access: private fields with public getters/setters; package-private methods unless exported
- Data models: plain class with fields, constructor, getters, toString override
- Errors: checked exceptions for I/O, unchecked (RuntimeException) for logic errors
- Entry point: `public static void main(String[] args)` in the main class""",

    "CSHARP": """\
**C#-Specific Directives:**
- Naming: PascalCase for public methods/properties, camelCase for locals, _camelCase for private fields
- Types: use language keywords (string, int, bool) not CLR names (String, Int32)
- Data models: record (immutable) or class; prefer record for plain data carriers
- Async: async Task / async Task<T> for I/O patterns
- Errors: specific exception types; never catch `Exception` unless re-throwing
- Entry point: `static void Main()` or top-level statements (C# 9+)""",
}

_DEFAULT_LANGUAGE_DIRECTIVES = """\
**Language Directives:**
- Follow idiomatic conventions for this language
- Use descriptive names, add docstrings/comments to all functions
- Add proper error handling
- Include a clear program entry point"""


def _parse_yaml_manifest(yaml_content: str) -> dict:
    """
    Parse normalized YAML and return a manifest describing what sections
    have real content (non-empty lists).  Returns safe zero-defaults on
    parse failure so the caller always gets a usable dict.
    """
    import yaml as _yaml  # local import — prompts.py has no top-level yaml dep
    try:
        data = _yaml.safe_load(yaml_content) or {}
    except Exception:
        data = {}

    variables = data.get("variables") or []
    file_ops = data.get("file_operations") or []
    subroutines = data.get("subroutines") or []
    business_rules = data.get("business_rules") or []
    logic_flow = data.get("logic_flow") or []

    mv_vars = [v for v in variables if isinstance(v, dict) and v.get("multi_value")]
    file_handles = list({op.get("file_handle", "") for op in file_ops if isinstance(op, dict) and op.get("file_handle")})
    external_subs = [s for s in subroutines if isinstance(s, dict) and s.get("is_external")]
    internal_subs = [s for s in subroutines if isinstance(s, dict) and not s.get("is_external")]
    rule_ids = [r.get("rule_id", "") for r in business_rules if isinstance(r, dict) and r.get("rule_id")]

    return {
        "variable_count": len(variables),
        "has_variables": len(variables) > 0,
        "mv_var_count": len(mv_vars),
        "has_mv_vars": len(mv_vars) > 0,
        "file_op_count": len(file_ops),
        "has_file_ops": len(file_ops) > 0,
        "file_handles": file_handles,
        "subroutine_count": len(subroutines),
        "has_subroutines": len(subroutines) > 0,
        "external_sub_count": len(external_subs),
        "internal_sub_count": len(internal_subs),
        "external_sub_names": [s.get("name", "") for s in external_subs],
        "business_rule_count": len(business_rules),
        "has_business_rules": len(business_rules) > 0,
        "rule_ids": rule_ids,
        "logic_node_count": len(logic_flow),
    }


def _build_section_directives(manifest: dict, target_language: str) -> str:
    """
    Build a conditional section-directive block from a YAML manifest.
    Sections with content get translation instructions; empty sections get
    explicit "DO NOT generate ..." directives to prevent LLM hallucination.
    """
    lang = target_language.upper()
    lines = ["**TRANSLATION MANIFEST — what is present in this YAML:**"]

    # Variables
    if manifest["has_variables"]:
        lines.append(f"  ✅ variables: {manifest['variable_count']} declared → translate all")
    else:
        lines.append("  ⬜ variables: none → only declare what logic_flow requires")

    # Multi-value fields
    if manifest["has_mv_vars"]:
        lines.append(f"  ✅ multi_value variables: {manifest['mv_var_count']} → generate VM/SM/TM constants + parse_multivalue() helper")
    else:
        lines.append("  ⬜ multi_value variables: none → DO NOT generate VM/SM helpers or multi-value code")

    # File operations
    if manifest["has_file_ops"]:
        handles = ", ".join(manifest["file_handles"]) if manifest["file_handles"] else "see YAML"
        lines.append(f"  ✅ file_operations: {manifest['file_op_count']} ops on handles [{handles}] → generate Model class + Repository class per handle")
    else:
        lines.append("  ⬜ file_operations: none → DO NOT generate Repository or Model classes")

    # Subroutines
    if manifest["has_subroutines"]:
        parts = []
        if manifest["internal_sub_count"]:
            parts.append(f"{manifest['internal_sub_count']} internal → generate function definitions")
        if manifest["external_sub_count"]:
            ext = ", ".join(manifest["external_sub_names"][:5])
            parts.append(f"{manifest['external_sub_count']} external [{ext}] → generate stub functions")
        lines.append("  ✅ subroutines: " + "; ".join(parts))
    else:
        lines.append("  ⬜ subroutines: none → DO NOT generate any subroutine functions")

    # Business rules
    if manifest["has_business_rules"]:
        rules = ", ".join(manifest["rule_ids"][:6])
        lines.append(f"  ✅ business_rules: {manifest['business_rule_count']} rules [{rules}] → add inline comments wherever logic_flow nodes reference these IDs")
    else:
        lines.append("  ⬜ business_rules: none → no business rule comments needed")

    lines.append(f"  ✅ logic_flow: {manifest['logic_node_count']} nodes → primary translation target")

    # Required output structure
    lines.append("")
    lines.append("**REQUIRED OUTPUT STRUCTURE (generate sections in exactly this order):**")
    step = 1

    def section(label: str) -> str:
        nonlocal step
        s = f"  {step}. {label}"
        step += 1
        return s

    lines.append(section("Module/file docstring with program name and description"))
    lines.append(section("Imports / using statements"))
    if manifest["has_mv_vars"]:
        lines.append(section("Multi-value constants (VM, SM, TM) + parse_multivalue() helper"))
    if manifest["has_business_rules"]:
        lines.append(section("Business rule reference comments block"))
    if manifest["has_file_ops"]:
        lines.append(section("Data model class(es) — one per file handle"))
        lines.append(section("Repository class(es) — one per file handle"))
    if manifest["has_subroutines"]:
        lines.append(section("Subroutine / helper function definitions"))
    lines.append(section("main() function — translate all logic_flow nodes here"))

    if lang == "PYTHON":
        lines.append(section('if __name__ == "__main__":  main()'))
    elif lang in ("TYPESCRIPT", "JAVASCRIPT"):
        lines.append(section("main() call at bottom of file"))
    elif lang == "JAVA":
        lines.append(section("public static void main(String[] args)"))
    elif lang == "CSHARP":
        lines.append(section("static void Main() or top-level statement"))

    return "\n".join(lines)


CODE_GENERATION_SYSTEM_PROMPT = """You are Agent 2 in a Pick Basic to modern code migration system.

Your role is to translate structured YAML (generated by Agent 1) into clean, idiomatic {target_language} code.

**YOUR INPUT:**
- Structured YAML representation of Pick Basic program
- YAML contains 7 sections: metadata, program_structure, variables, file_operations, subroutines, business_rules, logic_flow

**YOUR OUTPUT:**
- Production-ready {target_language} code
- Clean, readable, well-commented
- Follows {target_language} best practices and conventions
- NO markdown code blocks - output raw {target_language} code only

**CRITICAL REQUIREMENTS:**
1. **Follow the YAML structure exactly** - all variables, logic, file operations must be translated
2. **Preserve semantic intent** - the generated code must do exactly what the YAML describes
3. **Use idiomatic {target_language}** - follow language conventions (naming, structure, patterns)
4. **Add helpful comments** - explain complex logic, business rules, non-obvious conversions
5. **Link business rules to code** - when logic_flow nodes have related_rule_ids, add comments explaining the business rule
6. **Output ONLY code** - no explanations, no markdown, just the {target_language} code
7. **Handle errors gracefully** - add proper error handling where needed
8. **Keep it simple** - prefer clear, maintainable code over clever tricks

**CODE QUALITY GUIDELINES:**
- Use descriptive variable/function names
- Add docstrings/comments for functions and complex logic
- Follow language-specific formatting (PEP 8 for Python, etc.)
- Implement proper error handling
- Add type hints/annotations where applicable
- Keep functions focused and reasonably sized
- **Generate business rule comments** - for each logic node with related_rule_ids, add comment like:
  # Business Rule BR1: Customer credit limit must not exceed $50,000

**TRANSLATION RULES:**
- Pick Basic variables (UPPERCASE.WITH.DOTS) → {target_language} convention (lowercase_with_underscores for Python)
- Control flow (IF/LOOP/CASE) → {target_language} control structures
- **File operations** → Repository pattern (Phase 6d):
  - Generate Model class (dataclass) for each file with @dataclass decorator
  - Generate Repository class for each file with CRUD methods
  - OPEN FILE TO CUSTOMERS → `customer_repo = CustomerRepository()`
  - READ CUSTOMERS, ID TO RECORD → `record = customer_repo.read(id)`
  - WRITE RECORD ON CUSTOMERS, ID → `customer_repo.write(record)`
  - DELETE CUSTOMERS, ID → `customer_repo.delete(id)`
  - Each file handle becomes: ModelClass + ModelRepository with read/write/delete methods
- **Subroutines** → Functions/methods with proper signatures
  - Generate function definitions from subroutines section
  - **Pass-by-reference**: Use tuple returns in Python: `a, b, c = subroutine(a, b, c)`
  - Original: `CALL VALIDATE(AMOUNT, STATUS)` → Python: `amount, status = validate(amount, status)`
  - All parameters should be both input and output (tuple unpacking pattern)
- **Multi-value fields** → Lists (Phase 6e):
  - Pick Basic uses @VM/@SM/@TM delimiters for multi-value fields
  - Variables marked with multi_value: true → Initialize as empty lists
  - NAMES = "John" : @VM : "Jane" : @VM : "Bob" → `names = ["John", "Jane", "Bob"]`
  - NAMES<1> = "John" → `names[0] = "John"` (convert 1-based to 0-based indexing)
  - Generate parse_multivalue() and helper functions when multi-value fields present
  - Add VM/SM/TM constants: `VM = chr(253)  # Value Mark`
  - Multi-dimensional: VALUES<2,3> → `values[1][2]` (adjust all indices)

Output clean, executable {target_language} code now."""


def _envelope_instruction(lang: str) -> str:
    """
    Return the Phase 1 structured output instruction for Agent 2.

    Instructs the LLM to wrap every response in the delimiter envelope so that
    CodeOutputParser can reliably extract both code and metadata (sections_covered,
    external_stubs_included, warnings) without fragile JSON escaping of multiline code.
    """
    return (
        "You MUST format your entire response using ONLY the delimiter structure below.\n"
        "No text before <<<BEGIN_OUTPUT>>> and no text after <<<END_OUTPUT>>>.\n\n"
        "<<<BEGIN_OUTPUT>>>\n"
        "{\n"
        f'  "language": "{lang}",\n'
        '  "sections_covered": ["<list each YAML section you generated code for>"],\n'
        '  "external_stubs_included": ["<each external subroutine stub included verbatim, or []>"],\n'
        '  "warnings": ["<optional structural caveats, or []"]\n'
        "}\n"
        "<<<BEGIN_CODE>>>\n"
        f"<your raw {lang} code — no triple-backtick fences, just the code>\n"
        "<<<END_OUTPUT>>>"
    )


def build_strict_code_generation_prompt(
    yaml_content: str,
    target_language: str = "Python",
) -> str:
    """
    Phase 3 — Build a strict, YAML-aware code generation prompt.

    Unlike the generic build_code_generation_prompt(), this function:
    1. Parses the normalized YAML (Phase 2 output) to detect which sections
       have real content vs are empty lists.
    2. Injects conditional section directives: present sections get explicit
       translation instructions; empty sections get "DO NOT generate X"
       directives so the LLM never hallucinates content for absent pieces.
    3. Adds language-specific conventions (PEP 8, TS interfaces, Java classes…).
    4. Enforces a counted output structure so generated files are predictably
       organized: docstring → imports → constants → models → repos → subs → main.

    Args:
        yaml_content: Normalized YAML from Agent 1 (Phase 2 output guaranteed
                      to have all 7 sections present).
        target_language: Target programming language.

    Returns:
        Complete strict prompt string ready for the LLM.
    """
    lang = target_language.upper()
    manifest = _parse_yaml_manifest(yaml_content)
    section_directives = _build_section_directives(manifest, target_language)
    lang_directives = _LANGUAGE_DIRECTIVES.get(lang, _DEFAULT_LANGUAGE_DIRECTIVES)
    system_prompt = CODE_GENERATION_SYSTEM_PROMPT.format(target_language=target_language)

    # Phase 5: deterministically pre-generate stubs for external subroutines
    from app.services.subroutine_stub_generator import build_stub_prompt_block
    stub_block = build_stub_prompt_block(yaml_content, target_language)

    # Phase 1 (Structured Output): envelope instruction
    envelope_instruction = _envelope_instruction(target_language)

    prompt = f"""{system_prompt}

---

{section_directives}

{lang_directives}
{stub_block}
---

**YAML TO TRANSLATE:**

```yaml
{yaml_content}
```

**TARGET LANGUAGE:** {target_language}

**FINAL INSTRUCTION:**
Translate the YAML above into {target_language} following the TRANSLATION MANIFEST
and REQUIRED OUTPUT STRUCTURE exactly.

{envelope_instruction}"""

    return prompt


def build_code_regeneration_prompt(
    yaml_content: str,
    target_language: str = "Python",
    general_feedback: str = "",
    line_comment_context: str = "",
    previous_code: str = "",
    regeneration_count: int = 1,
) -> str:
    """
    Build the prompt for code regeneration after a reviewer rejection.
    Phase 1 (Agent 2): Injects general rejection feedback AND inline line-level
    comments so the LLM knows exactly which lines need to change.

    Args:
        yaml_content: The approved YAML to retranslate
        target_language: Target programming language
        general_feedback: Cumulative general rejection comments (all rounds)
        line_comment_context: Formatted string of line-pinned reviewer comments
        previous_code: The previously generated code (for reference)
        regeneration_count: How many times this job has been regenerated

    Returns:
        Complete regeneration prompt string for LLM
    """
    system_prompt = CODE_GENERATION_SYSTEM_PROMPT.format(target_language=target_language)

    # Include a truncated view of the previous code so the LLM knows what changed
    previous_code_section = ""
    if previous_code:
        lines = previous_code.split("\n")
        max_lines = 150  # avoid blowing context window budget
        snippet = "\n".join(lines[:max_lines])
        truncation_note = (
            f"\n... [{len(lines) - max_lines} lines truncated]"
            if len(lines) > max_lines
            else ""
        )
        previous_code_section = f"""
**PREVIOUS GENERATED CODE (reference only — do NOT copy its errors):**
```{target_language.lower()}
{snippet}{truncation_note}
```
"""

    feedback_section = ""
    if general_feedback:
        feedback_section = f"""
**REVIEWER GENERAL FEEDBACK (ALL ROUNDS — address every point):**
{general_feedback}
"""

    line_comments_section = ""
    if line_comment_context:
        line_comments_section = f"""
**INLINE LINE COMMENTS FROM REVIEWER:**
{line_comment_context}
"""

    # Phase 3: inject YAML-aware manifest + language directives into regen prompts too
    lang = target_language.upper()
    manifest = _parse_yaml_manifest(yaml_content)
    section_directives = _build_section_directives(manifest, target_language)
    lang_directives = _LANGUAGE_DIRECTIVES.get(lang, _DEFAULT_LANGUAGE_DIRECTIVES)

    # Phase 5: also inject external stub block into regeneration prompts
    from app.services.subroutine_stub_generator import build_stub_prompt_block
    stub_block = build_stub_prompt_block(yaml_content, target_language)

    # Phase 1 (Structured Output): envelope instruction
    envelope_instruction = _envelope_instruction(target_language)

    prompt = f"""{system_prompt}

---

**REGENERATION ATTEMPT #{regeneration_count}**

The reviewer has rejected the previous code. You MUST fix ALL identified issues.
{previous_code_section}{feedback_section}{line_comments_section}
{section_directives}

{lang_directives}
{stub_block}
---

**YAML TO TRANSLATE:**

```yaml
{yaml_content}
```

**TARGET LANGUAGE:** {target_language}

**CRITICAL INSTRUCTIONS:**
1. Fix every point in REVIEWER GENERAL FEEDBACK
2. Fix every inline line comment — if Line X is flagged, fix exactly that line
3. Follow the TRANSLATION MANIFEST and REQUIRED OUTPUT STRUCTURE above
4. Do NOT repeat mistakes from the previous attempt
5. Include ALL external subroutine stubs verbatim (see PRE-GENERATED STUBS above)
6. Use the structured output envelope below — do NOT output raw code without it

{envelope_instruction}"""

    return prompt


def build_code_generation_prompt(
    yaml_content: str,
    target_language: str = "Python",
    additional_instructions: str = ""
) -> str:
    """
    Build the complete prompt for code generation from YAML.
    Phase 6a: Basic code generation.
    
    Args:
        yaml_content: The YAML representation to translate
        target_language: Target programming language
        additional_instructions: Optional additional guidance
        
    Returns:
        Complete prompt string for LLM
    """
    system_prompt = CODE_GENERATION_SYSTEM_PROMPT.format(target_language=target_language)

    # Hoist conditional block — backslash escapes not allowed inside f-string {} in Python < 3.12
    additional_instructions_block = (
        f"**ADDITIONAL INSTRUCTIONS:**\n{additional_instructions}\n"
        if additional_instructions
        else ""
    )

    prompt = f"""{system_prompt}

---

**YAML TO TRANSLATE:**

```yaml
{yaml_content}
```

{additional_instructions_block}

**TARGET LANGUAGE:** {target_language}

**FINAL INSTRUCTIONS:**
Generate clean, idiomatic {target_language} code from the above YAML.
Output ONLY the {target_language} code - no markdown blocks, no explanations.

Begin your {target_language} code now:"""

    return prompt


def build_syntax_error_fix_prompt(
    yaml_content: str,
    target_language: str,
    broken_code: str,
    syntax_error: str,
) -> str:
    """
    Phase 4 — Build a targeted prompt to fix a syntax error in generated code.

    Called when the SyntaxValidator catches a parse error on the first
    generation attempt.  The LLM is asked to fix ONLY the reported error —
    it must not change the program’s logic or structure.

    Args:
        yaml_content: The original YAML (kept for full context).
        target_language: Target programming language.
        broken_code: The code that failed syntax validation.
        syntax_error: The formatted error string from SyntaxValidator.

    Returns:
        Complete fix prompt for the LLM.
    """
    lang = target_language.lower()

    # Truncate broken code to avoid blowing context window
    code_lines = broken_code.split("\n")
    max_lines = 200
    code_snippet = "\n".join(code_lines[:max_lines])
    truncation_note = (
        f"\n# ... [{len(code_lines) - max_lines} lines truncated]"
        if len(code_lines) > max_lines
        else ""
    )

    prompt = f"""You are a {target_language} code repair agent.

The following {target_language} code was automatically generated but contains a
SYNTAX ERROR that must be fixed before it can run.

**SYNTAX ERROR REPORTED:**
```
{syntax_error}
```

**BROKEN CODE:**
```{lang}
{code_snippet}{truncation_note}
```

**ORIGINAL YAML (source of truth for program intent):**
```yaml
{yaml_content[:1500]}{'... [truncated]' if len(yaml_content) > 1500 else ''}
```

**INSTRUCTIONS:**
1. Fix the exact syntax error reported above.
2. Do NOT change the program logic, variable names, or structure.
3. Do NOT add or remove functions beyond what is needed to fix the error.
4. Output ONLY the corrected {target_language} code — no markdown, no explanations.

Corrected {target_language} code:"""

    return prompt


# ============================================================================
# DIRECT CONVERSION PROMPTS (Single-agent: Pick Basic → Target Language)
# ============================================================================

DIRECT_CONVERSION_SYSTEM_PROMPT = """You are a specialized migration AI that converts Pick Basic (also known as UniVerse BASIC, UniData BASIC, or D3 BASIC) legacy code **directly** into modern {target_language} code in a single step.

Unlike the two-step pipeline, you receive the raw Pick Basic source and produce production-ready {target_language} without any intermediate YAML representation.

**YOUR INPUT:**
- Raw Pick Basic source code

**YOUR OUTPUT:**
- Production-ready {target_language} code
- Clean, readable, well-commented
- Follows {target_language} best practices and conventions
- NO markdown code blocks — output raw {target_language} code only

**CRITICAL REQUIREMENTS:**
1. **Translate everything** — every variable, file operation, subroutine call, business rule, and control structure
2. **Preserve exact semantics** — the generated code must behave identically to the Pick Basic original
3. **Use idiomatic {target_language}** — follow language conventions for naming, structure, and patterns
4. **Add helpful comments** — explain complex legacy logic, business rules, and non-obvious conversions
5. **Output ONLY code** — no explanations, no markdown fences, just raw {target_language} code
6. **Handle errors gracefully** — add proper error handling where legacy code uses STOP/ABORT
7. **Keep it maintainable** — prefer clear, well-structured code over clever tricks

**PICK BASIC TRANSLATION RULES:**
- Variables (UPPERCASE.WITH.DOTS) → {target_language} naming convention (e.g. snake_case for Python)
- Control flow (IF/ELSE/END/LOOP/REPEAT/FOR/NEXT) → equivalent {target_language} constructs
- File I/O (OPEN/READ/WRITE/DELETE/READU/WRITEV/SELECT/READNEXT) → Repository pattern:
  - Generate a Model class (dataclass/interface/record) per file entity
  - Generate a Repository class per file handle with read/write/delete/select methods
- Subroutines (CALL / GOSUB) → named functions with proper signatures
  - Pass-by-reference params → tuple return in Python; ref/out in C#; objects in JS/TS
- Multi-value fields (@VM/@SM/@TM) → lists/arrays with documented delimiters
- STOP/ABORT/PAUSE → raise exceptions or exit codes
- Equivalence tables → lookup dictionaries or switch statements
- COMMON blocks → module-level or class-level shared state

**CODE QUALITY:**
- Docstrings on every function/class
- Type hints / type annotations where the language supports them
- Business logic preserved with inline comments referencing original Pick Basic constructs
- Entry point clearly defined (main() / Main() / static void main etc.)"""


def build_direct_conversion_prompt(
    source_code: str,
    target_language: str = "Python",
) -> str:
    """
    Build the prompt for a direct Pick Basic → target language conversion
    (single LLM call; no YAML intermediate step).

    Args:
        source_code: Raw Pick Basic source code
        target_language: Target programming language (e.g. "Python", "TypeScript")

    Returns:
        Complete prompt string ready for the LLM.
    """
    lang = target_language.upper()
    system_prompt = DIRECT_CONVERSION_SYSTEM_PROMPT.format(target_language=target_language)
    lang_directives = _LANGUAGE_DIRECTIVES.get(lang, _DEFAULT_LANGUAGE_DIRECTIVES)
    envelope_instruction = _envelope_instruction(target_language)

    prompt = f"""{system_prompt}

---

{lang_directives}

---

**PICK BASIC SOURCE CODE TO CONVERT:**

```pick
{source_code}
```

**TARGET LANGUAGE:** {target_language}

**FINAL INSTRUCTION:**
Translate the Pick Basic source code above into {target_language}.
Follow the language directives exactly.
Produce complete, runnable code — do not leave any logic as a placeholder or TODO.

{envelope_instruction}"""

    return prompt


def build_direct_conversion_regeneration_prompt(
    source_code: str,
    target_language: str = "Python",
    general_feedback: str = "",
    line_comment_context: str = "",
    previous_code: str = "",
    regeneration_count: int = 1,
) -> str:
    """
    Build a regeneration prompt for a direct conversion job after a reviewer rejection.

    Args:
        source_code: The original Pick Basic source code
        target_language: Target programming language
        general_feedback: Cumulative reviewer comments (all rounds)
        line_comment_context: Formatted inline line-level reviewer comments
        previous_code: Previously generated code (for reference)
        regeneration_count: How many times this job has been regenerated

    Returns:
        Complete regeneration prompt string for the LLM.
    """
    lang = target_language.upper()
    system_prompt = DIRECT_CONVERSION_SYSTEM_PROMPT.format(target_language=target_language)
    lang_directives = _LANGUAGE_DIRECTIVES.get(lang, _DEFAULT_LANGUAGE_DIRECTIVES)
    envelope_instruction = _envelope_instruction(target_language)

    previous_code_section = ""
    if previous_code:
        lines = previous_code.split("\n")
        max_lines = 150
        snippet = "\n".join(lines[:max_lines])
        truncation_note = (
            f"\n... [{len(lines) - max_lines} lines truncated]"
            if len(lines) > max_lines
            else ""
        )
        previous_code_section = f"""
**PREVIOUS GENERATED CODE (reference only — do NOT copy its errors):**
```{target_language.lower()}
{snippet}{truncation_note}
```
"""

    feedback_section = ""
    if general_feedback:
        feedback_section = f"""
**REVIEWER GENERAL FEEDBACK (ALL ROUNDS — address every point):**
{general_feedback}
"""

    line_comments_section = ""
    if line_comment_context:
        line_comments_section = f"""
**INLINE LINE COMMENTS FROM REVIEWER:**
{line_comment_context}
"""

    prompt = f"""{system_prompt}

---

**DIRECT CONVERSION REGENERATION ATTEMPT #{regeneration_count}**

The reviewer has rejected the previous code. You MUST fix ALL identified issues.
{previous_code_section}{feedback_section}{line_comments_section}
{lang_directives}

---

**ORIGINAL PICK BASIC SOURCE CODE:**

```pick
{source_code}
```

**TARGET LANGUAGE:** {target_language}

**CRITICAL INSTRUCTIONS:**
1. Fix every point in the REVIEWER GENERAL FEEDBACK
2. Fix every inline line comment — if a specific line is flagged, fix exactly that line
3. Do NOT repeat mistakes from the previous attempt
4. Produce complete, runnable code — no TODOs or placeholders

{envelope_instruction}"""

    return prompt


# ============================================================================
# YAML DESCRIPTION GENERATION PROMPT
# ============================================================================

YAML_DESCRIPTION_SYSTEM_PROMPT = """You are a senior technical analyst and documentation expert specializing in legacy system modernization.

You have been given an approved structured YAML representation of a Pick Basic legacy program. Your task is to produce an in-depth, detailed, plain-English description of the entire program — covering its business logic, data structures, operations, rules, and execution flow from start to finish.

This document is intended for:
1. **Business analysts** who need to understand what the program does without reading code
2. **Technical developers** who will implement the modernized version and need every detail
3. **Project managers** who need to verify scope and completeness before migration

**WHAT YOU MUST PRODUCE:**

Your output must be a fully structured Markdown document with the following mandatory sections, in order. Do NOT shorten, summarize, or skip any section. Each section must be as detailed as the YAML content allows — go deep, not wide.

---

## 1. Executive Summary
Write a 3–5 paragraph plain-English overview of the entire program:
- What the program is called and what it does at a high level
- Its type (main program / subroutine / function / menu-driven)
- Its overall complexity level and why
- Which systems or data files it interacts with
- Its role in the larger business process (based on what the logic implies)

## 2. Program Metadata and Context
Document all metadata from the YAML:
- Original source filename and its significance
- Pick Basic version/flavor if identified
- Total lines of code and complexity estimate, with explicit reasoning for that complexity level
- Any analysis warnings or special notes

## 3. Variables and Data Structures — Complete Reference
For EVERY variable declared in the YAML:
- Its name exactly as it appears in the Pick Basic code
- Its data type and business meaning in plain English
- Its scope (local to this program / shared globally / a parameter passed from outside)
- Whether it is a multi-valued field (and if so, explain what multi-value means in Pick Basic context and how this variable uses it)
- How it is initialized and how it changes during program execution
- Its relationship to any business rules
Group variables logically by their purpose (e.g., "Input Parameters", "Working Variables", "File Handles", "Output Variables").

## 4. File and Database Operations — Complete Reference
For EVERY file operation (OPEN, READ, WRITE, DELETE, READU, WRITEV, SELECT, READNEXT, etc.):
- The logical file/table name and what business entity it represents
- The file handle variable used to access it
- Every operation performed on it (read, write, delete, select/cursor) with a plain-English explanation of what data is being accessed and why
- The record ID structure — what uniquely identifies a record in this file
- The business significance of this file to the program's workflow
- Any locking concerns (e.g., READU means the record is locked for update)

**If ANY file operations exist in the YAML, you MUST generate an Entity Relationship diagram in Mermaid syntax** at the end of this section, showing:
- Each file/table as an entity with its key fields implied from the variable names
- The relationships between entities as implied by how they are read/written together
- Include it in a ```mermaid ... ``` code block with the label "Database / File Entity Diagram"

## 5. Subroutines and Functions — Complete Reference
For EVERY subroutine listed in the YAML:
- Its exact name
- Whether it is internal (defined within this program) or external (called from a library)
- Every parameter it receives: name, inferred type, and business purpose
- What the subroutine does step by step in plain English
- What it returns or modifies
- Why it is called at this point in the program — the business reason
- Any risks or dependencies (e.g., it may modify shared state)

## 6. Business Rules — Complete Reference
For EVERY business rule extracted in the YAML:

**MANDATORY FORMAT — document each rule EXACTLY as shown below. Do NOT use tables, do NOT collapse rules into a list. Each rule must be its own named sub-section with full bullet-point detail:**

### BR[N]: [Short Descriptive Rule Name]
- **Rule ID:** BR[N]
- **Rule Text:** [Complete, precise statement of the rule]
- **Severity:** [Critical / Warning / Info]
- **Variables Involved:** [List every variable name involved]
- **Enforcement Location:** [Describe exactly where in the program's flow this rule is checked — which section, subroutine, or condition]
- **Business Justification:** [Why this rule exists — what business problem it solves]
- **Violation Handling:** [What the program does when the rule is violated — error message, STOP, return, log, etc.]

Repeat this exact structure for BR1, BR2, BR3 … through every rule. Never combine rules. Never use a Markdown table for this section.

## 7. Program Logic — Step-by-Step Execution Walkthrough
This is the most important section. Walk through the ENTIRE program execution from entry point to all possible exit points:
- Describe each major section/block of logic in plain English
- For each conditional (IF/CASE), describe both the true and false branches and what business decision is being made
- For each loop (FOR/NEXT, LOOP/REPEAT), describe what is being iterated, what the loop body does, and what the exit condition means
- For each file I/O operation in the flow, describe what data is being loaded or saved and why at that moment
- For each subroutine call, describe what is being delegated and what comes back
- Reference business rules wherever they are enforced in the flow (e.g., "At this point, Business Rule BR2 is checked — if the balance is negative, the program...")
- Describe every error-handling path (ELSE branches, STOP/ABORT calls) and what they mean
- Use numbered sub-steps for complex nested logic so the reader can follow the depth

## 8. Data Flow Overview
Describe the overall data flow of the program in clear narrative form:
- What data comes into the program (inputs / parameters / file reads)
- How that data is transformed, calculated, or validated as it flows through the program
- What data leaves the program (outputs / file writes / return values)
- Any data that is read and then written back (update patterns)

**Always generate a Mermaid flowchart** in a ```mermaid ... ``` code block with the label "Program Data Flow Diagram" that shows:
- The entry point
- The major processing blocks
- Key decision points (diamonds)
- The exit points
Use the `flowchart TD` (top-down) format.

## 9. Error Handling and Edge Cases
Describe all error scenarios identified in the program:
- What conditions trigger an error or abort path
- How the program signals errors (STOP, ABORT, error variable, return code)
- Any implicit assumptions or preconditions that must be true for the program to succeed
- Missing error handling (places where the program might silently fail based on the logic)
- Data validation gaps (inputs that are not checked but should be)

## 10. Migration Considerations and Notes
Provide guidance for the developer who will modernize this code:
- The key data structures that need modern equivalents (e.g., multi-value fields → lists)
- Critical business rules that must be preserved exactly
- External subroutines that need to be stubbed or sourced
- Any ambiguities in the YAML that need clarification before migration
- Recommended modern patterns for this type of program (e.g., service class, repository pattern, etc.)

---

**CRITICAL OUTPUT REQUIREMENTS:**
- Output ONLY the Markdown document — no preamble, no "here is the document", just start directly with the title heading
- Begin with: # [Program Name] — Functional Requirements Specification (FRS)
- Use Markdown headings (##, ###), bullet points, numbered lists, and bold text liberally
- Mermaid diagrams must be inside triple-backtick mermaid fences
- Do NOT truncate any section — if a program has 20 variables, document all 20
- Do NOT produce a summary-style document — this must be a FULL DETAILED REFERENCE
- Write in clear, professional plain English — avoid jargon unless it is defined
- Length is expected to be multiple pages — this is intentional and required
- Assume the reader has NO knowledge of Pick Basic syntax"""


def build_yaml_description_prompt(
    raw_yaml: str,
    original_source_code: str = "",
    source_filename: str = "unknown.bp",
) -> str:
    """
    Build the complete prompt for generating a detailed plain-English description
    of an approved YAML representation of a Pick Basic program.

    This is called by DescriptionGenerator and uses the same LLM provider
    that was used to produce the YAML.

    Args:
        raw_yaml: The full approved YAML content string.
        original_source_code: The original Pick Basic source code (optional, used
                               as extra context for the LLM).
        source_filename: The original source filename.

    Returns:
        Complete prompt string ready for the LLM.
    """
    source_block = ""
    if original_source_code and original_source_code.strip():
        source_block = f"""

---

**ORIGINAL PICK BASIC SOURCE CODE (for additional context):**

Filename: {source_filename}

```pickbasic
{original_source_code}
```"""

    prompt = f"""{YAML_DESCRIPTION_SYSTEM_PROMPT}

---

**APPROVED YAML TO DOCUMENT:**

Filename: {source_filename}

```yaml
{raw_yaml}
```
{source_block}

---

**TASK:**
Using the YAML above as your primary source of truth (and the original Pick Basic source for additional context if provided), produce the complete detailed Markdown documentation document described in your instructions.

Remember:
- Every section is mandatory
- Every variable, file operation, subroutine, and business rule must be individually documented
- The logic walkthrough must cover ALL branches and loops
- Mermaid diagrams are required (flowchart always, ERD if file operations exist)
- Length should reflect the complexity of the program — do NOT artificially limit your response

Begin the document now:"""

    return prompt


# ---------------------------------------------------------------------------
# Pick Basic Source Code Description Prompt
# ---------------------------------------------------------------------------

PICKBASIC_DESCRIPTION_SYSTEM_PROMPT = """You are a senior technical analyst and documentation expert specializing in legacy system modernization.

You have been given the original Pick Basic source code of a legacy program. Your task is to produce an in-depth, detailed, plain-English description of the entire program — covering its business logic, data structures, operations, rules, and execution flow from start to finish — based DIRECTLY on reading the source code.

This document is intended for:
1. **Business analysts** who need to understand what the program does without reading code
2. **Technical developers** who will implement the modernized version and need every detail
3. **Project managers** who need to verify scope and completeness before migration

**WHAT YOU MUST PRODUCE:**

Your output must be a fully structured Markdown document with the following mandatory sections, in order. Do NOT shorten, summarize, or skip any section. Each section must be as detailed as the source code allows — go deep, not wide.

---

## 1. Executive Summary
Write a 3–5 paragraph plain-English overview of the entire program:
- What the program is called and what it does at a high level
- Its type (main program / subroutine / function / menu-driven)
- Its overall complexity level and why
- Which systems or data files it interacts with
- Its role in the larger business process (based on what the logic implies)

## 2. Program Metadata and Context
Document key metadata by inspecting the source code:
- Original source filename and its significance
- Pick Basic version/flavor if identifiable
- Total lines of code and an estimate of complexity, with explicit reasoning
- Any notable comments, author tags, or version notes in the source

## 3. Variables and Data Structures — Complete Reference
For EVERY variable used in the source code:
- Its name exactly as it appears
- Its inferred data type and business meaning in plain English
- Its scope (local to this program / shared globally via COMMON / a parameter passed in via SUBROUTINE or FUNCTION args)
- Whether it is a multi-valued field (and if so, explain what multi-value means in Pick Basic context and how this variable uses it)
- How it is initialized and how it changes during program execution
- Its relationship to any business rules
Group variables logically by their purpose (e.g., "Input Parameters", "Working Variables", "File Handles", "Output Variables").

## 4. File and Database Operations — Complete Reference
For EVERY file operation (OPEN, READ, WRITE, DELETE, READU, WRITEV, SELECT, READNEXT, etc.):
- The logical file/table name and what business entity it represents
- The file handle variable used to access it
- Every operation performed on it with a plain-English explanation of what data is being accessed and why
- The record ID structure — what uniquely identifies a record in this file
- The business significance of this file to the program's workflow
- Any locking concerns (e.g., READU means the record is locked for update)

**If ANY file operations exist, you MUST generate an Entity Relationship diagram in Mermaid syntax** at the end of this section, showing:
- Each file/table as an entity with its key fields
- The relationships between entities as implied by how they are read/written together
- Include it in a ```mermaid ... ``` code block with the label "Database / File Entity Diagram"

## 5. Subroutines and Functions — Complete Reference
For EVERY subroutine or function called in the source:
- Its exact name
- Whether it is internal (defined within this program via GOSUB labels) or external (CALL statement)
- Every parameter it receives: name, inferred type, and business purpose
- What the subroutine does step by step in plain English
- What it returns or modifies
- Why it is called at this point in the program — the business reason
- Any risks or dependencies

## 6. Business Rules — Complete Reference
Identify and document EVERY business rule embedded in the source code:

**MANDATORY FORMAT — document each rule EXACTLY as shown below. Do NOT use tables, do NOT collapse rules into a list. Each rule must be its own named sub-section with full bullet-point detail:**

### BR[N]: [Short Descriptive Rule Name]
- **Rule ID:** BR[N]
- **Rule Text:** [Complete, precise statement of the rule]
- **Severity:** [Critical / Warning / Info]
- **Variables Involved:** [List every variable name involved]
- **Enforcement Location:** [Describe exactly where in the program's flow this rule is checked — which section, subroutine, or line if identifiable]
- **Business Justification:** [Why this rule exists — what business problem it solves, inferred from context if not explicit]
- **Violation Handling:** [What the program does when the rule is violated — error message, STOP, return, log, etc.]

Repeat this exact structure for BR1, BR2, BR3 … through every rule. Never combine rules. Never use a Markdown table for this section.

## 7. Program Logic — Step-by-Step Execution Walkthrough
This is the most important section. Walk through the ENTIRE program execution from entry point to all possible exit points:
- Describe each major section/block of logic in plain English
- For each conditional (IF/THEN/ELSE, CASE), describe both the true and false branches and what business decision is being made
- For each loop (FOR/NEXT, LOOP/REPEAT), describe what is being iterated, what the loop body does, and what the exit condition means
- For each file I/O operation in the flow, describe what data is being loaded or saved and why at that moment
- For each subroutine call, describe what is being delegated and what comes back
- Reference business rules wherever they are enforced in the flow
- Describe every error-handling path (ELSE branches on file operations, STOP/ABORT calls) and what they mean
- Use numbered sub-steps for complex nested logic so the reader can follow the depth

## 8. Data Flow Overview
Describe the overall data flow of the program in clear narrative form:
- What data comes into the program (inputs / parameters / file reads)
- How that data is transformed, calculated, or validated as it flows through the program
- What data leaves the program (outputs / file writes / return values)
- Any data that is read and then written back (update patterns)

**Always generate a Mermaid flowchart** in a ```mermaid ... ``` code block with the label "Program Data Flow Diagram" that shows:
- The entry point
- The major processing blocks
- Key decision points (diamonds)
- The exit points
Use the `flowchart TD` (top-down) format.

## 9. Error Handling and Edge Cases
Describe all error scenarios identified in the program:
- What conditions trigger an error or abort path
- How the program signals errors (STOP, ABORT, error variable, return code)
- Any implicit assumptions or preconditions that must be true for the program to succeed
- Missing error handling (places where the program might silently fail)
- Data validation gaps (inputs that are not checked but should be)

## 10. Migration Considerations and Notes
Provide guidance for the developer who will modernize this code:
- The key data structures that need modern equivalents (e.g., multi-value fields → lists)
- Critical business rules that must be preserved exactly
- External subroutines that need to be stubbed or sourced
- Any ambiguities that need clarification before migration
- Recommended modern patterns for this type of program (e.g., service class, repository pattern, etc.)

---

**CRITICAL OUTPUT REQUIREMENTS:**
- Output ONLY the Markdown document — no preamble, no "here is the document", just start directly with the title heading
- Begin with: # [Program Name] — Functional Requirements Specification (FRS) (from Source Code)
- Use Markdown headings (##, ###), bullet points, numbered lists, and bold text liberally
- Mermaid diagrams must be inside triple-backtick mermaid fences
- Do NOT truncate any section — if a program has 20 variables, document all 20
- Do NOT produce a summary-style document — this must be a FULL DETAILED REFERENCE
- Write in clear, professional plain English — avoid jargon unless it is defined
- Length is expected to be multiple pages — this is intentional and required
- Assume the reader has NO knowledge of Pick Basic syntax"""


def build_pickbasic_description_prompt(
    source_code: str,
    source_filename: str = "unknown.bp",
) -> str:
    """
    Build the complete prompt for generating a detailed plain-English description
    of a Pick Basic program directly from its source code.

    Args:
        source_code: The full Pick Basic source code string.
        source_filename: The original source filename.

    Returns:
        Complete prompt string ready for the LLM.
    """
    prompt = f"""{PICKBASIC_DESCRIPTION_SYSTEM_PROMPT}

---

**PICK BASIC SOURCE CODE TO DOCUMENT:**

Filename: {source_filename}

```pickbasic
{source_code}
```

---

**TASK:**
Using the Pick Basic source code above, produce the complete detailed Markdown documentation document described in your instructions.

Remember:
- Every section is mandatory
- Every variable, file operation, subroutine, and business rule must be individually documented
- The logic walkthrough must cover ALL branches and loops
- Mermaid diagrams are required (flowchart always, ERD if file operations exist)
- Length should reflect the complexity of the program — do NOT artificially limit your response

Begin the document now:"""

    return prompt


# ---------------------------------------------------------------------------
# Business Requirements Document (BRD) Prompt
# ---------------------------------------------------------------------------

BRD_SYSTEM_PROMPT = """You are a Business Analyst expert specializing in documenting business requirements for legacy system modernization projects.

You have been given BOTH the approved structured YAML representation AND the original Pick Basic source code of a legacy program. Your task is to produce a comprehensive Business Requirements Document (BRD) that captures what the business NEEDS from the modernized system — written entirely for business stakeholders, not technical developers.

This document is intended for:
1. **Business owners and executives** who need to understand and approve the business requirements
2. **Business analysts** who will validate the requirements and manage stakeholder sign-off
3. **Project sponsors** who need to understand business value, scope, and risk
4. **QA teams** who need acceptance criteria to validate the modernized system

**CRITICAL WRITING RULES:**
- This is a BUSINESS document, not a technical document
- NEVER use technical terms: no "variable", "file", "record", "array", "function", "subroutine", "loop", "field", "string", "integer", "boolean", "null", "index", "pointer", "stack", "heap", "class", "object", "method", "parameter", "exception", "YAML", "Pick Basic", "source code", "algorithm"
- Use BUSINESS language: "information", "data", "customer record", "order", "entry", "lookup", "process step", "business rule", "validation", "calculation", "report", "notification", "workflow", "transaction", "approval"
- Write as if explaining to a senior executive who has never seen a computer program
- Every section must be substantive — do not skip or summarize

**WHAT YOU MUST PRODUCE:**

Your output must be a fully structured Markdown document with the following mandatory sections. Do NOT shorten, summarize, or skip any section.

---

## 1. Executive Summary
Provide a 3–5 paragraph high-level business overview:
- What business problem this program solves and why it matters
- Who in the organization uses this process and how frequently
- What business outcomes this process delivers (what value it creates)
- Why modernizing this process is important for the business
- The overall scope of this Business Requirements Document

## 2. Business Objectives
List and describe each key business objective this program fulfills:
- For each objective, state it clearly in one sentence
- Explain the business value and impact if this objective is not met
- Rate each objective as Primary (core to the process) or Secondary (supporting)
- Link each objective to a measurable business outcome

## 3. Scope and Boundaries
Define the scope of this business process:
- **In Scope**: List every business activity, decision, and data interaction that is part of this process
- **Out of Scope**: List related processes or activities that are NOT included in this document
- **Process Trigger**: What event or condition starts this process (user action, schedule, another process completing, etc.)
- **Process Completion**: What constitutes successful completion of this process
- **Process Owner**: Based on the logic, which business department or role is responsible for this process

## 4. Stakeholder Analysis
Identify all stakeholders involved in or affected by this process:
- **Primary Users**: Who directly interacts with this process to get their work done
- **Secondary Users**: Who receives outputs or results from this process
- **Business Owners**: Which business function owns this process and its outcomes
- **Downstream Dependencies**: Which other processes or teams depend on the outputs of this process
- **Upstream Dependencies**: Which processes or teams must complete their work before this process can run

## 5. Functional Requirements
Document every functional capability this process must provide. For EACH requirement:

### FR[N]: [Clear Requirement Name]
- **Requirement ID:** FR[N]
- **Requirement Statement:** [What the system must do, written in plain business English — "The system must..." or "The system shall..."]
- **Business Justification:** [Why this capability is needed — what business problem it solves]
- **Priority:** [Must Have / Should Have / Nice to Have]
- **Business Owner:** [Which stakeholder group owns this requirement]
- **Acceptance Criteria:** [How will we know this requirement is met — specific, measurable, testable criteria]

Document EVERY functional requirement derived from the YAML and source code. Do not collapse multiple requirements into one.

## 6. Business Rules

Document every business rule this process enforces. These are the non-negotiable constraints the business operates under:

### BR[N]: [Descriptive Business Rule Name]
- **Rule ID:** BR[N]
- **What is checked:** [In plain English, what condition or value is being evaluated]
- **Why this rule exists:** [The business reason — what would go wrong if this rule did not exist]
- **What happens when the rule passes:** [The normal business outcome]
- **What happens when the rule fails:** [What message the user sees, what action is blocked, or what alternative path is taken]
- **Who owns this rule:** [Which business function or regulatory requirement mandates this rule]
- **Examples:** [Give 1–2 concrete real-world examples of when this rule applies]

Never use technical language in the rule descriptions. Every rule must be understandable by a non-technical business user.

## 7. Business Process Flow

### 7.1 End-to-End Process Diagram

**You MUST generate a comprehensive Mermaid flowchart** showing the complete end-to-end business process. Requirements for this diagram:

- Start with the business trigger (what causes the process to begin)
- Show EVERY step and decision in strict business language
- For every decision, show BOTH the Yes/No paths with clear business descriptions
- Show every piece of information that is looked up, updated, created, or removed — described as a business action
- Show every business rule check as a plain-English question in a diamond shape
- Show every message, notification, or output the process produces
- Show all possible end states (success, error, partial completion)
- Every node label must be a complete, plain-English phrase
- If the process has 30 steps, show all 30

Use `flowchart TD` format inside a ```mermaid ... ``` block with the label "End-to-End Business Process Flow".

### 7.2 Step-by-Step Process Walkthrough

Provide a numbered walkthrough of every step in the process diagram. For EACH step:

1. **What the process does at this step:** One or two plain-English sentences describing the action
2. **Why this step exists:** The business reason — what value it adds or what risk it mitigates
3. **What information is involved:** What data is read, checked, created, or updated at this step (in business terms — e.g., "customer account status", "order total", "approval limit")
4. **Decision outcomes:** If this is a decision point, describe both outcomes and what triggers each path
5. **What could go wrong:** The failure scenario at this step and the business impact
6. **What comes next:** Which step follows under each outcome

## 8. User and System Interactions
Describe the complete user experience and system behavior:

### 8.1 User Facing Interactions
- Every prompt, screen, or form the user interacts with — what information they see, what they can enter or select
- Every message, confirmation, or error the user receives
- Every report or output document produced for the user
- The complete user journey from start to finish, step by step

### 8.2 Automated System Actions
Actions the process takes without user involvement:
- Every automatic lookup, retrieval, or calculation
- Every automatic update, creation, or deletion of business information
- Every notification or communication triggered automatically
- Every downstream system that is updated as a result of this process

## 9. Data and Information Requirements
Describe what business information this process works with — without any technical terms:

### 9.1 Information Inputs
For each type of information the process receives or looks up:
- What it is (e.g., "Customer Account Information", "Order Details", "Pricing Table")
- Where it comes from (user entry, another system, a lookup, etc.)
- Why the process needs it
- What happens if it is missing or incorrect

### 9.2 Information Outputs
For each type of information the process creates or updates:
- What is created, updated, or removed
- Who or what receives or uses this output
- The business significance of this output

### 9.3 Data Retention and Audit
- What information must be preserved for regulatory, audit, or operational reasons
- How long this information must be retained (if determinable from the logic)
- Who should have access to this information

## 10. Integration and Dependencies

### 10.1 Upstream Dependencies
List every process, system, or event that must complete or occur BEFORE this process can run successfully:
- For each dependency: what it is, why it is needed, and what happens if it is unavailable

### 10.2 Downstream Impacts
List every process, system, or team affected by the OUTPUTS of this process:
- For each impact: what is affected, how immediately, and what the business consequence of a failure would be

### 10.3 External Lookups and References
List every external table, list, or reference this process uses:
- What the reference is (e.g., "Customer Master", "Product Catalog", "Pricing Rules")
- What the process retrieves from it
- Whether the process can run without it

## 11. Assumptions and Constraints
Document the conditions that must be true for this process to work correctly:

### 11.1 Business Assumptions
- List every assumption about business conditions, data quality, and user behavior that is built into this process
- For each: state the assumption clearly and the risk if the assumption is wrong

### 11.2 Business Constraints
- List every non-negotiable limitation on how this process must operate (e.g., "Orders above $50,000 require manager approval", "Processing must complete within the same business day")
- For each: state the constraint and its source (regulatory, policy, operational)

### 11.3 Known Limitations
- List any aspects of the current process that are known workarounds, manual interventions, or incomplete automations that the modernized system should address

## 12. Acceptance Criteria
Define the criteria that must be met for the modernized system to be accepted:

### 12.1 Functional Acceptance Tests
List specific, testable scenarios that verify functional requirements are met:
- **Test Scenario [N]:** [Description of the test scenario]
  - **Given:** [Starting condition in business terms]
  - **When:** [The action performed]
  - **Then:** [The expected business outcome]

Provide at least one scenario per functional requirement, and include both happy-path and error-path scenarios.

### 12.2 Business Rule Validation Tests
For each business rule, provide a specific test:
- **Rule [BR-N] Pass Test:** [Scenario where the rule passes — expected outcome]
- **Rule [BR-N] Fail Test:** [Scenario where the rule fails — expected error/behavior]

### 12.3 Non-Functional Business Requirements
- **Performance:** How quickly must this process complete for the business to consider it acceptable?
- **Availability:** When must this process be available (business hours, 24/7, etc.)?
- **Accuracy:** What level of accuracy is required (zero tolerance for financial errors, etc.)?
- **Audit trail:** What must be logged for compliance or operational purposes?

## 13. Business Glossary
Define every business term used in this document that a general reader might not know:
- Business entity names (e.g., what is an "order", a "customer account", an "invoice line")
- Business rule names and their plain-English meaning
- Process-specific terminology
- Acronyms and abbreviations

---

**CRITICAL OUTPUT REQUIREMENTS:**
- Output ONLY the Markdown document — no preamble, no "here is the document", just start directly with the title heading
- Begin with: # [Program Name] — Business Requirements Document (BRD)
- Use Markdown headings (##, ###), bullet points, numbered lists, and bold text liberally
- Mermaid diagrams must be inside triple-backtick mermaid fences
- Do NOT use ANY technical terms (variable, file, record, loop, function, etc.) — use business equivalents
- Every functional requirement, business rule, and acceptance criterion must be individually documented
- Use the YAML as your source of truth for WHAT the process does; use the source code for HOW it does it
- The BRD must stand alone — a reader with no technical background must fully understand the business requirements from this document alone
- Length is expected to be multiple pages — this is intentional and required"""


def build_brd_from_yaml_prompt(
    raw_yaml: str,
    source_filename: str = "unknown.bp",
) -> str:
    """
    Build the BRD prompt using ONLY the approved YAML as input.

    Args:
        raw_yaml: The full approved YAML content string.
        source_filename: The original source filename.

    Returns:
        Complete prompt string ready for the LLM.
    """
    prompt = f"""{BRD_SYSTEM_PROMPT}

---

**APPROVED YAML (sole source of truth for what the business process does):**

Filename: {source_filename}

```yaml
{raw_yaml}
```

---

**TASK:**
Using the approved YAML as your primary and only source of information, produce the complete Business Requirements Document described in your instructions.

Remember:
- Every section is mandatory and must be substantive
- Write EXCLUSIVELY in plain business English — zero technical terminology
- Every functional requirement and business rule must be individually documented
- The process flow diagram must show the complete end-to-end business process
- Acceptance criteria must be specific, measurable, and testable
- Length should reflect the complexity of the program — do NOT artificially limit your response

Begin the BRD now:"""
    return prompt


def build_brd_from_source_prompt(
    original_source_code: str,
    source_filename: str = "unknown.bp",
) -> str:
    """
    Build the BRD prompt using ONLY the original source code as input.

    Args:
        original_source_code: The original Pick Basic source code.
        source_filename: The original source filename.

    Returns:
        Complete prompt string ready for the LLM.
    """
    prompt = f"""{BRD_SYSTEM_PROMPT}

---

**ORIGINAL PICK BASIC SOURCE CODE:**

Filename: {source_filename}

```pickbasic
{original_source_code}
```

---

**TASK:**
Using the Pick Basic source code as your only source of information, analyse the business logic and produce the complete Business Requirements Document described in your instructions.

Remember:
- Every section is mandatory and must be substantive
- Write EXCLUSIVELY in plain business English — zero technical terminology — do NOT reference code constructs, variable names, or subroutine names
- Extract business intent from the code logic — translate technical implementation into business language
- Every functional requirement and business rule must be individually documented
- The process flow diagram must show the complete end-to-end business process
- Acceptance criteria must be specific, measurable, and testable
- Length should reflect the complexity of the program — do NOT artificially limit your response

Begin the BRD now:"""
    return prompt

