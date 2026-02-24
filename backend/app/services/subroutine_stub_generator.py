"""
Phase 5 — External Subroutine Stub Generator.

Deterministically generates stub functions for all ``is_external: true``
subroutines found in the normalized YAML.  These stubs are injected into
the code-generation prompt BEFORE the LLM call so that:

  1. External subroutine signatures are never hallucinated — the LLM is
     told "use these exact signatures when calling from main()".
  2. Generated output always contains a concrete placeholder the human
     developer can search for and implement.
  3. The stub body raises NotImplementedError / throws, making it
     immediately obvious at runtime if a stub was called without being
     implemented.

Stub naming follows each language's idiomatic convention and the
pass-by-reference tuple-return pattern already enforced by Agent 2.
"""

import re
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


# ── Naming helpers ────────────────────────────────────────────────────────────

def _to_snake_case(name: str) -> str:
    """FORMAT.DATE  →  format_date  (Python convention)."""
    return re.sub(r"[.\-\s]+", "_", name).lower()


def _to_camel_case(name: str) -> str:
    """FORMAT.DATE  →  formatDate  (JS/TS/Java convention)."""
    parts = re.split(r"[.\-\s_]+", name)
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])


def _to_pascal_case(name: str) -> str:
    """FORMAT.DATE  →  FormatDate  (C# convention)."""
    parts = re.split(r"[.\-\s_]+", name)
    return "".join(p.capitalize() for p in parts)


def _param_name(raw: str, lang: str) -> str:
    """Convert a Pick Basic param name to language convention."""
    lang = lang.upper()
    if lang == "PYTHON":
        return _to_snake_case(raw)
    if lang in ("TYPESCRIPT", "JAVASCRIPT", "JAVA"):
        return _to_camel_case(raw)
    if lang == "CSHARP":
        return _to_camel_case(raw)
    return _to_snake_case(raw)  # safe default


# ── Per-language stub generators ──────────────────────────────────────────────

def _python_stub(name: str, params: List[str], purpose: str) -> str:
    fn = _to_snake_case(name)
    py_params = [_to_snake_case(p) for p in params] if params else ["*args"]
    sig_params = ", ".join(f"{p}: str" for p in py_params)
    ret_type = f"tuple[{', '.join(['str'] * len(py_params))}]" if py_params[0] != "*args" else "tuple"
    return_vals = ", ".join(py_params) if py_params[0] != "*args" else ""
    purpose_doc = purpose or f"External Pick Basic subroutine: {name}"
    lines = [
        f"def {fn}({sig_params}) -> {ret_type}:",
        f'    """TODO: Implement external subroutine.',
        f"",
        f"    Original Pick Basic: CALL {name}({', '.join(params)})",
        f"    Purpose: {purpose_doc}",
        f'    """',
        f"    # TODO: replace this stub with the real implementation",
        f'    raise NotImplementedError("External subroutine \'{name}\' has not been implemented yet")',
    ]
    if return_vals:
        lines.append(f"    return {return_vals}")
    return "\n".join(lines)


def _typescript_stub(name: str, params: List[str], purpose: str) -> str:
    fn = _to_camel_case(name)
    ts_params = [_to_camel_case(p) for p in params] if params else []
    sig = ", ".join(f"{p}: string" for p in ts_params)
    ret = f"[{', '.join(['string'] * len(ts_params))}]" if ts_params else "void"
    ret_val = f"[{', '.join(ts_params)}]" if ts_params else ""
    purpose_doc = purpose or f"External Pick Basic subroutine: {name}"
    lines = [
        f"// TODO: Implement external subroutine.",
        f"// Original Pick Basic: CALL {name}({', '.join(params)})",
        f"// Purpose: {purpose_doc}",
        f"function {fn}({sig}): {ret} {{",
        f"  // TODO: replace this stub with the real implementation",
        f"  throw new Error(\"External subroutine '{name}' has not been implemented yet\");",
    ]
    if ret_val:
        lines.append(f"  return {ret_val};")
    lines.append("}")
    return "\n".join(lines)


def _javascript_stub(name: str, params: List[str], purpose: str) -> str:
    fn = _to_camel_case(name)
    js_params = [_to_camel_case(p) for p in params] if params else []
    sig = ", ".join(js_params)
    ret_val = f"[{', '.join(js_params)}]" if js_params else ""
    purpose_doc = purpose or f"External Pick Basic subroutine: {name}"
    lines = [
        f"// TODO: Implement external subroutine.",
        f"// Original Pick Basic: CALL {name}({', '.join(params)})",
        f"// Purpose: {purpose_doc}",
        f"function {fn}({sig}) {{",
        f"  // TODO: replace this stub with the real implementation",
        f"  throw new Error(\"External subroutine '{name}' has not been implemented yet\");",
    ]
    if ret_val:
        lines.append(f"  return {ret_val};")
    lines.append("}")
    return "\n".join(lines)


def _java_stub(name: str, params: List[str], purpose: str) -> str:
    fn = _to_camel_case(name)
    java_params = [_to_camel_case(p) for p in params] if params else []
    sig = ", ".join(f"String {p}" for p in java_params)
    ret_type = f"String[]" if java_params else "void"
    ret_val = f"new String[]{{ {', '.join(java_params)} }}" if java_params else ""
    purpose_doc = purpose or f"External Pick Basic subroutine: {name}"
    lines = [
        f"/**",
        f" * TODO: Implement external subroutine.",
        f" * Original Pick Basic: CALL {name}({', '.join(params)})",
        f" * Purpose: {purpose_doc}",
        f" */",
        f"private static {ret_type} {fn}({sig}) {{",
        f"    // TODO: replace this stub with the real implementation",
        f"    throw new RuntimeException(\"External subroutine '{name}' has not been implemented yet\");",
    ]
    if ret_val:
        lines.append(f"    return {ret_val};")
    lines.append("}")
    return "\n".join(lines)


def _csharp_stub(name: str, params: List[str], purpose: str) -> str:
    fn = _to_pascal_case(name)
    cs_params = [_to_camel_case(p) for p in params] if params else []
    sig = ", ".join(f"string {p}" for p in cs_params)
    ret_type = f"({', '.join(['string'] * len(cs_params))})" if cs_params else "void"
    ret_val = f"({', '.join(cs_params)})" if cs_params else ""
    purpose_doc = purpose or f"External Pick Basic subroutine: {name}"
    lines = [
        f"/// <summary>",
        f"/// TODO: Implement external subroutine.",
        f"/// Original Pick Basic: CALL {name}({', '.join(params)})",
        f"/// Purpose: {purpose_doc}",
        f"/// </summary>",
        f"private static {ret_type} {fn}({sig})",
        f"{{",
        f"    // TODO: replace this stub with the real implementation",
        f"    throw new NotImplementedException(\"External subroutine '{name}' has not been implemented yet\");",
    ]
    if ret_val:
        lines.append(f"    return {ret_val};")
    lines.append("}")
    return "\n".join(lines)


_STUB_GENERATORS = {
    "PYTHON": _python_stub,
    "TYPESCRIPT": _typescript_stub,
    "JAVASCRIPT": _javascript_stub,
    "JAVA": _java_stub,
    "CSHARP": _csharp_stub,
}


# ── Public API ────────────────────────────────────────────────────────────────

def generate_external_stubs(yaml_content: str, target_language: str) -> str:
    """
    Parse the normalized YAML and generate stub functions for every
    ``is_external: true`` subroutine entry.

    Args:
        yaml_content: Normalized YAML string (Phase 2 output).
        target_language: Target programming language (case-insensitive).

    Returns:
        A code string containing all external stub functions, ready to
        be injected into the LLM prompt or appended directly to generated
        output.  Returns an empty string if there are no external subroutines.
    """
    import yaml as _yaml
    try:
        data = _yaml.safe_load(yaml_content) or {}
    except Exception as exc:
        logger.warning("Could not parse YAML for stub generation: %s", exc)
        return ""

    subroutines: List[Dict[str, Any]] = data.get("subroutines") or []
    external = [s for s in subroutines if isinstance(s, dict) and s.get("is_external")]

    if not external:
        return ""

    lang = target_language.upper()
    generator = _STUB_GENERATORS.get(lang)
    if generator is None:
        logger.debug("No stub generator for language %s — skipping stubs", lang)
        return ""

    stubs: List[str] = []
    for sub in external:
        name = sub.get("name", "UNKNOWN")
        params = sub.get("parameters") or []
        purpose = sub.get("purpose") or ""
        try:
            stub_code = generator(name, params, purpose)
            stubs.append(stub_code)
            logger.debug("Generated stub for external subroutine: %s (%s)", name, lang)
        except Exception as exc:
            logger.warning("Failed to generate stub for %s: %s", name, exc)

    if not stubs:
        return ""

    separator = "\n\n"
    return separator.join(stubs)


def build_stub_prompt_block(yaml_content: str, target_language: str) -> str:
    """
    Build the prompt block that injects pre-generated external subroutine
    stubs into the LLM prompt.

    The LLM is instructed to:
      - Include these stubs verbatim (do not rewrite them)
      - Call them using the exact function names and signatures shown
      - NEVER replace the ``raise NotImplementedError`` body — that is
        intentional and must be preserved

    Args:
        yaml_content: Normalized YAML (Phase 2 output).
        target_language: Target programming language.

    Returns:
        A formatted prompt block string, or empty string if no external
        subroutines are present.
    """
    stubs_code = generate_external_stubs(yaml_content, target_language)
    if not stubs_code:
        return ""

    lang_lower = target_language.lower()
    return f"""
**PRE-GENERATED EXTERNAL SUBROUTINE STUBS (include verbatim in your output):**

These stub functions have been pre-generated for all external Pick Basic
subroutines.  You MUST:
  1. Include ALL of the stubs below verbatim — do NOT rewrite or omit them.
  2. Use the EXACT function name and parameter names when calling them from main().
  3. Do NOT replace the `raise NotImplementedError` / `throw` body — the stub
     body is intentional and marks it for the human developer to implement.
  4. If a subroutine is called in logic_flow, call the stub using the tuple-return
     pattern: `param_a, param_b = stub_function(param_a, param_b)`

```{lang_lower}
{stubs_code}
```
"""
