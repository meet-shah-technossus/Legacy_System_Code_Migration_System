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

**YAML STRUCTURE TEMPLATE:**
```yaml
metadata:
  original_filename: "PROGRAM.NAME"
  analysis_timestamp: "2026-02-19T10:30:00Z"
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
  - name: "CUSTOMER.BALANCE"
    type: "numeric"
    scope: "local"
    multi_value: false
    
file_operations:
  - operation: "open"
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
    type: "sequence"
    semantic_intent: "main_program_flow"
    original_code: ""
    related_rule_ids: []
    children:
      - section_id: "init"
        type: "assignment"
        semantic_intent: "initialize_total"
        original_code: "TOTAL = 0"
        related_rule_ids: []
        children: []
      - section_id: "validate_balance"
        type: "conditional"
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
    # Hoist conditional block — backslash escapes not allowed inside f-string {} in Python < 3.12
    additional_context_block = (
        f"**ADDITIONAL CONTEXT:**\n{additional_context}\n"
        if additional_context
        else ""
    )

    prompt = f"""{YAML_GENERATION_SYSTEM_PROMPT}

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
