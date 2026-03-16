"""
TypeScript language mapper — mirrors PythonMapper feature-for-feature.

Translates PickBasicYAMLSchema sections into idiomatic TypeScript:
  - Variables         → const / let with explicit type annotations
  - File operations   → Interface (Model) + class (Repository) with CRUD
  - Subroutines       → exported async functions; pass-by-reference via destructured array return
  - Multi-value       → VM/SM/TM constants + parseMultivalue() helper
  - Logic flow        → TypeScript control structures (if/for/while/switch)
  - Class structure   → ES-module file with top-level async main(); call at EOF
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

def _pick_to_ts_name(raw: str) -> str:
    """Convert PICK.BASIC.NAME → pickBasicName (camelCase)."""
    parts = raw.replace("-", ".").split(".")
    if not parts:
        return raw.lower()
    result = parts[0].lower()
    for p in parts[1:]:
        result += p.capitalize()
    return result


def _pick_to_ts_class(raw: str) -> str:
    """Convert FILE.HANDLE or FILE → FileHandle (PascalCase)."""
    name = raw.upper()
    for suffix in (".FILE", ".MASTER", ".DATA", "FILE", "MASTER", "DATA"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    parts = name.replace(".", "_").replace("-", "_").split("_")
    return "".join(p.capitalize() for p in parts if p) or "Record"


def _infer_ts_type(variable: VariableDeclaration) -> str:
    """Infer a TypeScript primitive type from variable metadata."""
    if variable.multi_value:
        return "string[]"
    vtype = (variable.type or "").lower()
    if "numeric" in vtype or "int" in vtype or "float" in vtype or "number" in vtype:
        return "number"
    if "bool" in vtype:
        return "boolean"
    if "array" in vtype or "list" in vtype:
        return "string[]"
    return "string"


def _infer_ts_default(variable: VariableDeclaration) -> str:
    """Return a TypeScript default value string."""
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


class TypeScriptMapper(BaseMapper):
    """Full TypeScript code mapper — idiomatic ES2020+, strict mode."""

    def __init__(self, target_language: str = "TypeScript"):
        super().__init__(target_language)

    # ── BaseMapper interface ──────────────────────────────────────────────────

    def get_language_name(self) -> str:
        return "TypeScript"

    def get_file_extension(self) -> str:
        return ".ts"

    def format_comment(self, comment: str, indent_level: int = 0) -> str:
        indent = self.get_indent(indent_level)
        return f"{indent}// {comment}"

    # ── Variable declarations ─────────────────────────────────────────────────

    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """Map a Pick Basic variable to a TypeScript const/let declaration."""
        var_name = _pick_to_ts_name(variable.name)
        ts_type = _infer_ts_type(variable)
        default_val = _infer_ts_default(variable)

        prefix = "const" if not variable.multi_value and ts_type not in ("string[]",) else "let"

        comment = f"  // {variable.description}" if variable.description else ""
        if variable.multi_value:
            comment = f"  // Multi-value field{': ' + variable.description if variable.description else ''}"

        return f"{prefix} {var_name}: {ts_type} = {default_val};{comment}"

    # ── File operations ───────────────────────────────────────────────────────

    def map_file_operation(self, operation: FileOperation) -> str:
        """Map a Pick Basic file operation to TypeScript using repository pattern."""
        file_handle = _pick_to_ts_name(operation.file_handle)
        repo_var = f"{file_handle}Repo"
        class_name = _pick_to_ts_class(operation.file_handle)
        indent = self.get_indent(1)

        if operation.operation == FileOperationType.OPEN:
            return (
                f"{indent}// Open file: {operation.semantic_intent}\n"
                f"{indent}const {repo_var} = new {class_name}Repository();"
            )
        if operation.operation == FileOperationType.READ:
            record_var = _pick_to_ts_name(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Read: {operation.semantic_intent}\n"
                f"{indent}const {record_var} = await {repo_var}.read({id_var});"
            )
        if operation.operation == FileOperationType.WRITE:
            record_var = _pick_to_ts_name(operation.record_id) if operation.record_id else "record"
            return (
                f"{indent}// Write: {operation.semantic_intent}\n"
                f"{indent}await {repo_var}.write({record_var});"
            )
        if operation.operation == FileOperationType.DELETE:
            record_var = _pick_to_ts_name(operation.record_id) if operation.record_id else "record"
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
        """Map a logic flow node to TypeScript."""
        indent = self.get_indent(indent_level)
        lines: List[str] = []

        # Business rule comments
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
            stmt = _pick_to_ts_name(node.original_code)
            lines.append(f"{indent}{stmt.replace(' = ', ': any = ').replace(' := ', ' = ')};")

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
                var = _pick_to_ts_name(node.loop_variable)
                lines.append(f"{indent}for (let {var} = 0; {var} < 10; {var}++) {{  // TODO: correct range")
            else:
                lines.append(f"{indent}while (true) {{  // TODO: add proper condition")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}break;  // TODO: implement body")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.SUBROUTINE_CALL:
            func_name = _pick_to_ts_name(node.target_label or "function")
            if "(" in node.original_code and ")" in node.original_code:
                param_section = node.original_code[
                    node.original_code.index("(") + 1: node.original_code.rindex(")")
                ]
                params = [
                    _pick_to_ts_name(p.strip())
                    for p in param_section.split(",")
                    if p.strip()
                ]
                if params:
                    params_str = ", ".join(params)
                    lines.append(
                        f"{indent}[{params_str}] = await {func_name}({params_str});  // pass-by-ref via array return"
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
                record_var = _pick_to_ts_name(parts[1]) if len(parts) > 1 else "record"
                from_idx = next((i for i, p in enumerate(parts) if p.upper() == "FROM"), -1)
                if from_idx >= 0 and from_idx + 1 < len(parts):
                    file_handle = _pick_to_ts_name(parts[from_idx + 1].replace(",", ""))
                    repo_var = f"{file_handle}Repo"
                    id_var = f"{record_var}Id"
                    lines.append(f"{indent}const {record_var} = await {repo_var}.read({id_var});")
                else:
                    lines.append(f"{indent}// TODO: READ — {node.original_code}")
            elif "WRITE" in original_upper and "ON" in original_upper:
                record_var = _pick_to_ts_name(parts[1]) if len(parts) > 1 else "record"
                on_idx = next((i for i, p in enumerate(parts) if p.upper() == "ON"), -1)
                if on_idx >= 0 and on_idx + 1 < len(parts):
                    file_handle = _pick_to_ts_name(parts[on_idx + 1].replace(",", ""))
                    repo_var = f"{file_handle}Repo"
                    lines.append(f"{indent}await {repo_var}.write({record_var});")
                else:
                    lines.append(f"{indent}// TODO: WRITE — {node.original_code}")
            elif "DELETE" in original_upper and len(parts) >= 2:
                file_handle = _pick_to_ts_name(parts[1].replace(",", ""))
                repo_var = f"{file_handle}Repo"
                id_var = _pick_to_ts_name(parts[2]) if len(parts) > 2 else "recordId"
                lines.append(f"{indent}await {repo_var}.delete({id_var});")
            else:
                lines.append(f"{indent}// File I/O: {node.original_code}")

        elif node.type == LogicNodeType.PRINT:
            content = _pick_to_ts_name(node.original_code)
            lines.append(f"{indent}console.log({content});")

        else:
            lines.append(f"{indent}// {node.type.value}: {node.original_code}")
            for child in node.children or []:
                lines.append(self.map_logic_flow_node(child, business_rules, indent_level))

        return "\n".join(lines)

    # ── Imports ───────────────────────────────────────────────────────────────

    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate TypeScript file header, imports, and multi-value helpers."""
        prog_name = yaml_data.metadata.original_filename or "unknown"
        ts = yaml_data.metadata.analysis_timestamp

        lines = [
            "/**",
            f" * Generated from: {prog_name}",
            f" * Generated at:   {ts}",
            " * Auto-generated by Legacy Code Migration System",
            " */",
            "",
        ]

        has_mv = any(v.multi_value for v in (yaml_data.variables or []))
        if has_mv:
            lines += [
                "// ── Multi-value field delimiters (Pick Basic compatibility) ─────────────────",
                "const VM = String.fromCharCode(253);  // Value Mark — separates values",
                "const SM = String.fromCharCode(252);  // Sub-Value Mark",
                "const TM = String.fromCharCode(251);  // Text Mark",
                "",
                "function parseMultivalue(mvString: string, delimiter: string = VM): string[] {",
                '  if (!mvString) return [];',
                "  return mvString.includes(delimiter) ? mvString.split(delimiter) : [mvString];",
                "}",
                "",
                "function buildMultivalue(values: string[], delimiter: string = VM): string {",
                "  return values.join(delimiter);",
                "}",
                "",
            ]

        return "\n".join(lines)

    # ── Model & Repository classes ────────────────────────────────────────────

    def _generate_model_interface(self, file_handle: str) -> str:
        """Generate a TypeScript interface (model) for a Pick Basic file handle."""
        class_name = _pick_to_ts_class(file_handle)
        lines = [
            f"// Data model for {file_handle}",
            f"interface {class_name} {{",
            "  id: string;",
            "  // TODO: add typed fields from file structure",
            "  [key: string]: unknown;",
            "}",
        ]
        return "\n".join(lines)

    def _generate_repository_class(self, file_handle: str) -> str:
        """Generate a TypeScript Repository class for a Pick Basic file handle."""
        class_name = _pick_to_ts_class(file_handle)
        repo_name = f"{class_name}Repository"
        lines = [
            f"class {repo_name} {{",
            f"  /** Repository for {file_handle} file operations. */",
            f"  private readonly fileHandle = '{file_handle}';",
            "",
            f"  async read(recordId: string): Promise<{class_name} | null> {{",
            "    // TODO: implement actual read from Pick Basic file",
            f"    return {{ id: recordId }};",
            "  }",
            "",
            f"  async write(record: {class_name}): Promise<boolean> {{",
            "    // TODO: implement actual write to Pick Basic file",
            "    return true;",
            "  }",
            "",
            "  async delete(recordId: string): Promise<boolean> {",
            "    // TODO: implement actual delete from Pick Basic file",
            "    return true;",
            "  }",
            "}",
        ]
        return "\n".join(lines)

    # ── Subroutine function ───────────────────────────────────────────────────

    def _generate_subroutine_function(self, subroutine: SubroutineInfo) -> str:
        """Generate an exported TypeScript async function for a subroutine."""
        func_name = _pick_to_ts_name(subroutine.name)
        params = [_pick_to_ts_name(p) for p in subroutine.parameters]
        param_sig = ", ".join(f"{p}: string" for p in params)
        return_type = f"[{', '.join('string' for _ in params)}]" if params else "void"

        lines = [
            f"/**",
            f" * {subroutine.purpose or ('Subroutine: ' + subroutine.name)}",
            (" * @note External subroutine — implementation required." if subroutine.is_external else ""),
            " */",
            f"export async function {func_name}({param_sig}): Promise<{return_type}> {{",
        ]
        if subroutine.is_external:
            lines.append(f"  // TODO: implement external subroutine {subroutine.name}")
        else:
            lines.append(f"  // TODO: implement subroutine logic — {subroutine.name}")
        if params:
            lines.append(f"  return [{', '.join(params)}];  // pass-by-ref: return all params")
        else:
            lines.append("  // no parameters")
        lines.append("}")
        return "\n".join(l for l in lines if l != "")

    # ── Class structure ───────────────────────────────────────────────────────

    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate the complete TypeScript module body."""
        lines: List[str] = []

        # Models + repositories
        if yaml_data.file_operations:
            handles = sorted({
                op.file_handle
                for op in yaml_data.file_operations
                if op.file_handle
            })
            if handles:
                lines.append("// ── Data models & repositories ────────────────────────────────────────────────")
                for h in handles:
                    lines.append(self._generate_model_interface(h))
                    lines.append("")
                    lines.append(self._generate_repository_class(h))
                    lines.append("")

        # Subroutines
        if yaml_data.subroutines:
            lines.append("// ── Subroutine definitions ─────────────────────────────────────────────────────")
            for sub in yaml_data.subroutines:
                lines.append(self._generate_subroutine_function(sub))
                lines.append("")

        # main()
        prog_name = yaml_data.program_structure.name or "MigratedProgram"
        func_name = _pick_to_ts_name(prog_name)

        lines.append("// ── Main program ────────────────────────────────────────────────────────────────")
        lines.append(f"export async function {func_name}(): Promise<void> {{")
        lines.append(f"  /**")
        lines.append(f"   * Migrated from Pick Basic: {prog_name}")
        lines.append(f"   * Original complexity: {yaml_data.metadata.complexity_estimate or 'unknown'}")
        lines.append(f"   */")
        lines.append("")

        # Variable declarations
        if yaml_data.variables:
            lines.append("  // Variable declarations")
            for var in yaml_data.variables:
                if var.scope in (VariableScope.LOCAL, VariableScope.PARAMETER):
                    lines.append(f"  {self.map_variable_declaration(var)}")
            lines.append("")

        # Repository instantiation (OPEN operations)
        if yaml_data.file_operations:
            lines.append("  // File handles — repository pattern")
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            for h in handles:
                var = _pick_to_ts_name(h)
                cls = _pick_to_ts_class(h)
                lines.append(f"  const {var}Repo = new {cls}Repository();")
            lines.append("")

        # Main logic
        lines.append("  // Main program logic")
        for node in yaml_data.logic_flow:
            lines.append(self.map_logic_flow_node(node, yaml_data.business_rules, indent_level=1))
        lines.append("")

        lines.append("}")
        lines.append("")
        lines.append("// Entry point")
        lines.append(f"{func_name}().catch(console.error);")

        return "\n".join(lines)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _convert_condition(self, condition: str) -> str:
        """Convert a Pick Basic condition string to TypeScript."""
        cond = condition
        cond = cond.replace(" = ", " === ").replace(" <> ", " !== ")
        cond = cond.replace(" AND ", " && ").replace(" OR ", " || ").replace(" NOT ", " !")
        cond = cond.replace(".AND.", " && ").replace(".OR.", " || ").replace(".NOT.", " !")
        # Convert UPPERCASE variable references to camelCase best-effort
        import re
        cond = re.sub(r"\b([A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+)\b", lambda m: _pick_to_ts_name(m.group(0)), cond)
        return cond


# Register
MappingLoader.register_mapper("TYPESCRIPT", TypeScriptMapper)
