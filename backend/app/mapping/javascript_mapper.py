"""
JavaScript language mapper — mirrors PythonMapper feature-for-feature.

Translates PickBasicYAMLSchema sections into idiomatic JavaScript (ES2020+, CommonJS):
  - Variables         → const / let declarations with JSDoc
  - File operations   → class (Repository) with async CRUD methods
  - Subroutines       → exported async functions; pass-by-ref via array return
  - Multi-value       → VM/SM/TM constants + parseMultivalue() helper
  - Logic flow        → JavaScript control structures (if/for/while)
  - Class structure   → CommonJS module with top-level async main(); call at EOF
"""

from typing import List
from app.mapping.base_mapper import BaseMapper, MappingLoader
from app.schemas.yaml_schema import (
    PickBasicYAMLSchema,
    VariableDeclaration,
    FileOperation,
    LogicFlowNode,
    SubroutineInfo,
    BusinessRule,
    LogicNodeType,
    FileOperationType,
    VariableScope,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _pick_to_js_name(raw: str) -> str:
    """Convert PICK.BASIC.NAME → pickBasicName (camelCase)."""
    parts = raw.replace("-", ".").split(".")
    if not parts:
        return raw.lower()
    result = parts[0].lower()
    for p in parts[1:]:
        result += p.capitalize()
    return result


def _pick_to_js_class(raw: str) -> str:
    """Convert FILE.HANDLE → FileHandle (PascalCase)."""
    name = raw.upper()
    for suffix in (".FILE", ".MASTER", ".DATA", "FILE", "MASTER", "DATA"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    parts = name.replace(".", "_").replace("-", "_").split("_")
    return "".join(p.capitalize() for p in parts if p) or "Record"


def _infer_js_default(variable: VariableDeclaration) -> str:
    """Return a JavaScript default value string."""
    if variable.multi_value:
        return "[]"
    if variable.initial_value:
        vtype = (variable.type or "").lower()
        if "numeric" in vtype or "int" in vtype or "float" in vtype or "number" in vtype:
            return variable.initial_value
        return f'"{variable.initial_value}"'
    vtype = (variable.type or "").lower()
    if "numeric" in vtype or "int" in vtype or "float" in vtype or "number" in vtype:
        return "0"
    if "bool" in vtype:
        return "false"
    if "array" in vtype or "list" in vtype:
        return "[]"
    return '""'


class JavaScriptMapper(BaseMapper):
    """Full JavaScript code mapper — idiomatic ES2020+, async/await."""

    def __init__(self, target_language: str = "JavaScript"):
        super().__init__(target_language)

    # ── BaseMapper interface ──────────────────────────────────────────────────

    def get_language_name(self) -> str:
        return "JavaScript"

    def get_file_extension(self) -> str:
        return ".js"

    def format_comment(self, comment: str, indent_level: int = 0) -> str:
        indent = self.get_indent(indent_level)
        return f"{indent}// {comment}"

    # ── Variable declarations ─────────────────────────────────────────────────

    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """Map a Pick Basic variable to a JavaScript const/let declaration."""
        var_name = _pick_to_js_name(variable.name)
        default_val = _infer_js_default(variable)
        prefix = "let" if variable.multi_value else "const"
        comment = f"  // {variable.description}" if variable.description else ""
        if variable.multi_value:
            comment = f"  // Multi-value field{': ' + variable.description if variable.description else ''}"
        return f"{prefix} {var_name} = {default_val};{comment}"

    # ── File operations ───────────────────────────────────────────────────────

    def map_file_operation(self, operation: FileOperation) -> str:
        """Map a Pick Basic file operation to JavaScript using repository pattern."""
        file_handle = _pick_to_js_name(operation.file_handle)
        repo_var = f"{file_handle}Repo"
        class_name = _pick_to_js_class(operation.file_handle)
        indent = self.get_indent(1)

        if operation.operation == FileOperationType.OPEN:
            return (
                f"{indent}// Open file: {operation.semantic_intent}\n"
                f"{indent}const {repo_var} = new {class_name}Repository();"
            )
        if operation.operation == FileOperationType.READ:
            record_var = _pick_to_js_name(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Read: {operation.semantic_intent}\n"
                f"{indent}const {record_var} = await {repo_var}.read({id_var});"
            )
        if operation.operation == FileOperationType.WRITE:
            record_var = _pick_to_js_name(operation.record_id) if operation.record_id else "record"
            return (
                f"{indent}// Write: {operation.semantic_intent}\n"
                f"{indent}await {repo_var}.write({record_var});"
            )
        if operation.operation == FileOperationType.DELETE:
            record_var = _pick_to_js_name(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Delete: {operation.semantic_intent}\n"
                f"{indent}await {repo_var}.delete({id_var});"
            )
        return (
            f"{indent}// {operation.operation.value}: {operation.semantic_intent}\n"
            f"{indent}// TODO: Implement {operation.operation.value}"
        )

    # ── Logic flow ────────────────────────────────────────────────────────────

    def map_logic_flow_node(
        self,
        node: LogicFlowNode,
        business_rules: List[BusinessRule],
        indent_level: int = 0,
    ) -> str:
        """Map a logic flow node to JavaScript."""
        indent = self.get_indent(indent_level)
        lines: List[str] = []

        if node.related_rule_ids:
            rule_comment = self.add_business_rule_comment(
                rule_ids=node.related_rule_ids,
                business_rules=business_rules,
                indent_level=indent_level,
            )
            if rule_comment:
                lines.append(rule_comment.rstrip())

        lines.append(f"{indent}// {node.semantic_intent}")

        if node.type == LogicNodeType.ASSIGNMENT:
            stmt = _pick_to_js_name(node.original_code)
            lines.append(f"{indent}{stmt};")

        elif node.type == LogicNodeType.CONDITIONAL:
            cond = self._convert_condition(node.condition or "true")
            lines.append(f"{indent}if ({cond}) {{")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}// TODO: implement branch")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.LOOP:
            if node.loop_variable:
                var = _pick_to_js_name(node.loop_variable)
                lines.append(f"{indent}for (let {var} = 0; {var} < 10; {var}++) {{  // TODO: correct range")
            else:
                lines.append(f"{indent}while (true) {{  // TODO: add proper condition")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}break;")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.SUBROUTINE_CALL:
            func_name = _pick_to_js_name(node.target_label or "function")
            if "(" in node.original_code and ")" in node.original_code:
                param_section = node.original_code[
                    node.original_code.index("(") + 1: node.original_code.rindex(")")
                ]
                params = [
                    _pick_to_js_name(p.strip())
                    for p in param_section.split(",")
                    if p.strip()
                ]
                if params:
                    params_str = ", ".join(params)
                    lines.append(
                        f"{indent}[{params_str}] = await {func_name}({params_str});  // pass-by-ref"
                    )
                else:
                    lines.append(f"{indent}await {func_name}();")
            else:
                lines.append(f"{indent}await {func_name}();")

        elif node.type == LogicNodeType.RETURN:
            lines.append(f"{indent}return;")

        elif node.type == LogicNodeType.FILE_IO:
            original_upper = node.original_code.upper()
            parts = node.original_code.split()
            if "READ" in original_upper and "FROM" in original_upper:
                record_var = _pick_to_js_name(parts[1]) if len(parts) > 1 else "record"
                from_idx = next((i for i, p in enumerate(parts) if p.upper() == "FROM"), -1)
                if from_idx >= 0 and from_idx + 1 < len(parts):
                    file_handle = _pick_to_js_name(parts[from_idx + 1].replace(",", ""))
                    repo_var = f"{file_handle}Repo"
                    id_var = f"{record_var}Id"
                    lines.append(f"{indent}const {record_var} = await {repo_var}.read({id_var});")
                else:
                    lines.append(f"{indent}// TODO: READ — {node.original_code}")
            elif "WRITE" in original_upper and "ON" in original_upper:
                record_var = _pick_to_js_name(parts[1]) if len(parts) > 1 else "record"
                on_idx = next((i for i, p in enumerate(parts) if p.upper() == "ON"), -1)
                if on_idx >= 0 and on_idx + 1 < len(parts):
                    file_handle = _pick_to_js_name(parts[on_idx + 1].replace(",", ""))
                    repo_var = f"{file_handle}Repo"
                    lines.append(f"{indent}await {repo_var}.write({record_var});")
                else:
                    lines.append(f"{indent}// TODO: WRITE — {node.original_code}")
            elif "DELETE" in original_upper and len(parts) >= 2:
                file_handle = _pick_to_js_name(parts[1].replace(",", ""))
                repo_var = f"{file_handle}Repo"
                id_var = _pick_to_js_name(parts[2]) if len(parts) > 2 else "recordId"
                lines.append(f"{indent}await {repo_var}.delete({id_var});")
            else:
                lines.append(f"{indent}// File I/O: {node.original_code}")

        elif node.type == LogicNodeType.PRINT:
            content = _pick_to_js_name(node.original_code)
            lines.append(f"{indent}console.log({content});")

        else:
            lines.append(f"{indent}// {node.type.value}: {node.original_code}")
            for child in node.children or []:
                lines.append(self.map_logic_flow_node(child, business_rules, indent_level))

        return "\n".join(lines)

    # ── Imports ───────────────────────────────────────────────────────────────

    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate JavaScript file header and multi-value helpers."""
        prog_name = yaml_data.metadata.original_filename or "unknown"
        ts = yaml_data.metadata.analysis_timestamp

        lines = [
            "/**",
            f" * Generated from: {prog_name}",
            f" * Generated at:   {ts}",
            " * Auto-generated by Legacy Code Migration System",
            " * @module",
            " */",
            "",
            "'use strict';",
            "",
        ]

        has_mv = any(v.multi_value for v in (yaml_data.variables or []))
        if has_mv:
            lines += [
                "// ── Multi-value field delimiters (Pick Basic compatibility) ─────────────────",
                "const VM = String.fromCharCode(253);  // Value Mark",
                "const SM = String.fromCharCode(252);  // Sub-Value Mark",
                "const TM = String.fromCharCode(251);  // Text Mark",
                "",
                "/**",
                " * Parse a Pick Basic multi-value string into an array.",
                " * @param {string} mvString",
                " * @param {string} [delimiter=VM]",
                " * @returns {string[]}",
                " */",
                "function parseMultivalue(mvString, delimiter = VM) {",
                "  if (!mvString) return [];",
                "  return mvString.includes(delimiter) ? mvString.split(delimiter) : [mvString];",
                "}",
                "",
                "/**",
                " * Build a multi-value string from an array.",
                " * @param {string[]} values",
                " * @param {string} [delimiter=VM]",
                " * @returns {string}",
                " */",
                "function buildMultivalue(values, delimiter = VM) {",
                "  return values.join(delimiter);",
                "}",
                "",
            ]

        return "\n".join(lines)

    # ── Repository class ──────────────────────────────────────────────────────

    def _generate_repository_class(self, file_handle: str) -> str:
        class_name = _pick_to_js_class(file_handle)
        repo_name = f"{class_name}Repository"
        lines = [
            f"/**",
            f" * Repository for {file_handle} file operations.",
            f" * Handles CRUD operations for {class_name} records.",
            f" */",
            f"class {repo_name} {{",
            f"  constructor() {{",
            f"    /** @private */",
            f"    this.fileHandle = '{file_handle}';",
            f"    this.connection = null;  // TODO: setup connection",
            f"  }}",
            "",
            "  /**",
            "   * @param {string} recordId",
            f"   * @returns {{Promise<Object|null>}}",
            "   */",
            "  async read(recordId) {",
            "    // TODO: implement read from Pick Basic file",
            "    return { id: recordId };",
            "  }",
            "",
            "  /**",
            "   * @param {Object} record",
            "   * @returns {Promise<boolean>}",
            "   */",
            "  async write(record) {",
            "    // TODO: implement write to Pick Basic file",
            "    return true;",
            "  }",
            "",
            "  /**",
            "   * @param {string} recordId",
            "   * @returns {Promise<boolean>}",
            "   */",
            "  async delete(recordId) {",
            "    // TODO: implement delete from Pick Basic file",
            "    return true;",
            "  }",
            "}",
        ]
        return "\n".join(lines)

    def _generate_subroutine_function(self, subroutine: SubroutineInfo) -> str:
        func_name = _pick_to_js_name(subroutine.name)
        params = [_pick_to_js_name(p) for p in subroutine.parameters]
        param_sig = ", ".join(params)

        lines = [
            "/**",
            f" * {subroutine.purpose or ('Subroutine: ' + subroutine.name)}",
        ]
        if subroutine.is_external:
            lines.append(" * @note External subroutine — implementation required.")
        for p in params:
            lines.append(f" * @param {{*}} {p}")
        if params:
            lines.append(f" * @returns {{Promise<Array>}} pass-by-ref tuple")
        lines.append(" */")
        lines.append(f"async function {func_name}({param_sig}) {{")
        if subroutine.is_external:
            lines.append(f"  // TODO: implement external subroutine {subroutine.name}")
        else:
            lines.append(f"  // TODO: implement {subroutine.name}")
        if params:
            lines.append(f"  return [{param_sig}];  // pass-by-ref")
        lines.append("}")
        return "\n".join(lines)

    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate full JavaScript module body."""
        lines: List[str] = []

        if yaml_data.file_operations:
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            if handles:
                lines.append("// ── Repository classes ─────────────────────────────────────────────────────────")
                for h in handles:
                    lines.append(self._generate_repository_class(h))
                    lines.append("")

        if yaml_data.subroutines:
            lines.append("// ── Subroutine definitions ─────────────────────────────────────────────────────")
            for sub in yaml_data.subroutines:
                lines.append(self._generate_subroutine_function(sub))
                lines.append("")

        prog_name = yaml_data.program_structure.name or "MigratedProgram"
        func_name = _pick_to_js_name(prog_name)

        lines.append("// ── Main program ────────────────────────────────────────────────────────────────")
        lines.append("/**")
        lines.append(f" * Migrated from Pick Basic: {prog_name}")
        lines.append(f" * Original complexity: {yaml_data.metadata.complexity_estimate or 'unknown'}")
        lines.append(" */")
        lines.append(f"async function {func_name}() {{")

        if yaml_data.variables:
            lines.append("  // Variable declarations")
            for var in yaml_data.variables:
                if var.scope in (VariableScope.LOCAL, VariableScope.PARAMETER):
                    lines.append(f"  {self.map_variable_declaration(var)}")
            lines.append("")

        if yaml_data.file_operations:
            lines.append("  // File handles")
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            for h in handles:
                var = _pick_to_js_name(h)
                cls = _pick_to_js_class(h)
                lines.append(f"  const {var}Repo = new {cls}Repository();")
            lines.append("")

        lines.append("  // Main program logic")
        for node in yaml_data.logic_flow:
            lines.append(self.map_logic_flow_node(node, yaml_data.business_rules, indent_level=1))
        lines.append("")
        lines.append("}")
        lines.append("")
        lines.append("// Entry point")
        lines.append(f"{func_name}().catch(console.error);")

        return "\n".join(lines)

    def _convert_condition(self, condition: str) -> str:
        cond = condition
        cond = cond.replace(" = ", " === ").replace(" <> ", " !== ")
        cond = cond.replace(" AND ", " && ").replace(" OR ", " || ").replace(" NOT ", " !")
        cond = cond.replace(".AND.", " && ").replace(".OR.", " || ").replace(".NOT.", " !")
        import re
        cond = re.sub(
            r"\b([A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+)\b",
            lambda m: _pick_to_js_name(m.group(0)),
            cond,
        )
        return cond


# Register
MappingLoader.register_mapper("JAVASCRIPT", JavaScriptMapper)
