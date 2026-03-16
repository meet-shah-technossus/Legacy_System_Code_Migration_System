"""
Java language mapper — mirrors PythonMapper feature-for-feature.

Translates PickBasicYAMLSchema sections into idiomatic Java (Java 11+):
  - Variables         → typed field declarations with Javadoc
  - File operations   → model class (POJO) + Repository class per file handle
  - Subroutines       → static methods; pass-by-reference via single-element array wrappers
  - Multi-value       → VM/SM/TM constants + parseMultivalue() helper
  - Logic flow        → Java control structures (if/for/while/switch)
  - Class structure   → single .java file with nested static classes + main()
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

def _pick_to_java_field(raw: str) -> str:
    """Convert PICK.BASIC.NAME → pickBasicName (camelCase)."""
    parts = raw.replace("-", ".").split(".")
    if not parts:
        return raw.lower()
    result = parts[0].lower()
    for p in parts[1:]:
        result += p.capitalize()
    return result


def _pick_to_java_class(raw: str) -> str:
    """Convert FILE.HANDLE → FileHandle (PascalCase)."""
    name = raw.upper()
    for suffix in (".FILE", ".MASTER", ".DATA", "FILE", "MASTER", "DATA"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    parts = name.replace(".", "_").replace("-", "_").split("_")
    return "".join(p.capitalize() for p in parts if p) or "Record"


def _infer_java_type(variable: VariableDeclaration) -> str:
    if variable.multi_value:
        return "List<String>"
    vtype = (variable.type or "").lower()
    if "numeric" in vtype or "int" in vtype:
        return "int"
    if "float" in vtype or "double" in vtype:
        return "double"
    if "bool" in vtype:
        return "boolean"
    if "array" in vtype or "list" in vtype:
        return "List<String>"
    return "String"


def _infer_java_default(variable: VariableDeclaration) -> str:
    if variable.multi_value:
        return "new ArrayList<>()"
    if variable.initial_value:
        jtype = _infer_java_type(variable)
        if jtype in ("int", "double"):
            return variable.initial_value
        if jtype == "boolean":
            return variable.initial_value.lower()
        return f'"{variable.initial_value}"'
    jtype = _infer_java_type(variable)
    if jtype == "int":
        return "0"
    if jtype == "double":
        return "0.0"
    if jtype == "boolean":
        return "false"
    if "List" in jtype:
        return "new ArrayList<>()"
    return '""'


class JavaMapper(BaseMapper):
    """Full Java code mapper — idiomatic Java 11+, repository pattern."""

    IMPORTS = [
        "import java.util.ArrayList;",
        "import java.util.Arrays;",
        "import java.util.HashMap;",
        "import java.util.List;",
        "import java.util.Map;",
        "import java.util.Optional;",
    ]

    def __init__(self, target_language: str = "Java"):
        super().__init__(target_language)

    # ── BaseMapper interface ──────────────────────────────────────────────────

    def get_language_name(self) -> str:
        return "Java"

    def get_file_extension(self) -> str:
        return ".java"

    def format_comment(self, comment: str, indent_level: int = 0) -> str:
        indent = self.get_indent(indent_level)
        return f"{indent}// {comment}"

    # ── Variable declarations ─────────────────────────────────────────────────

    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """Map a Pick Basic variable to a Java typed declaration."""
        var_name = _pick_to_java_field(variable.name)
        java_type = _infer_java_type(variable)
        default_val = _infer_java_default(variable)
        comment = f"  // {variable.description}" if variable.description else ""
        if variable.multi_value:
            comment = f"  // Multi-value field{': ' + variable.description if variable.description else ''}"
        return f"{java_type} {var_name} = {default_val};{comment}"

    # ── File operations ───────────────────────────────────────────────────────

    def map_file_operation(self, operation: FileOperation) -> str:
        """Map a Pick Basic file operation to Java using repository pattern."""
        file_handle = _pick_to_java_field(operation.file_handle)
        repo_var = f"{file_handle}Repo"
        class_name = _pick_to_java_class(operation.file_handle)
        indent = self.get_indent(2)

        if operation.operation == FileOperationType.OPEN:
            return (
                f"{indent}// Open file: {operation.semantic_intent}\n"
                f"{indent}{class_name}Repository {repo_var} = new {class_name}Repository();"
            )
        if operation.operation == FileOperationType.READ:
            record_var = _pick_to_java_field(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Read: {operation.semantic_intent}\n"
                f"{indent}Optional<{class_name}> {record_var}Opt = {repo_var}.read({id_var});\n"
                f"{indent}{class_name} {record_var} = {record_var}Opt.orElse(null);"
            )
        if operation.operation == FileOperationType.WRITE:
            record_var = _pick_to_java_field(operation.record_id) if operation.record_id else "record"
            return (
                f"{indent}// Write: {operation.semantic_intent}\n"
                f"{indent}{repo_var}.write({record_var});"
            )
        if operation.operation == FileOperationType.DELETE:
            record_var = _pick_to_java_field(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Delete: {operation.semantic_intent}\n"
                f"{indent}{repo_var}.delete({id_var});"
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
            stmt = _pick_to_java_field(node.original_code)
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
                var = _pick_to_java_field(node.loop_variable)
                lines.append(f"{indent}for (int {var} = 0; {var} < 10; {var}++) {{  // TODO: correct range")
            else:
                lines.append(f"{indent}while (true) {{  // TODO: add proper condition")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}break;  // TODO: implement loop body")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.SUBROUTINE_CALL:
            # Java: pass-by-reference via single-element arrays ref wrapper
            func_name = _pick_to_java_field(node.target_label or "function")
            if "(" in node.original_code and ")" in node.original_code:
                param_section = node.original_code[
                    node.original_code.index("(") + 1: node.original_code.rindex(")")
                ]
                params = [_pick_to_java_field(p.strip()) for p in param_section.split(",") if p.strip()]
                if params:
                    params_str = ", ".join(params)
                    lines.append(
                        f"{indent}{func_name}({params_str});  // subroutine call"
                    )
                else:
                    lines.append(f"{indent}{func_name}();")
            else:
                lines.append(f"{indent}{func_name}();")

        elif node.type == LogicNodeType.RETURN:
            lines.append(f"{indent}return;")

        elif node.type == LogicNodeType.FILE_IO:
            original_upper = node.original_code.upper()
            parts = node.original_code.split()
            if "READ" in original_upper and "FROM" in original_upper:
                record_var = _pick_to_java_field(parts[1]) if len(parts) > 1 else "record"
                from_idx = next((i for i, p in enumerate(parts) if p.upper() == "FROM"), -1)
                if from_idx >= 0 and from_idx + 1 < len(parts):
                    fh = _pick_to_java_field(parts[from_idx + 1].replace(",", ""))
                    cls = _pick_to_java_class(parts[from_idx + 1].replace(",", ""))
                    repo_var = f"{fh}Repo"
                    id_var = f"{record_var}Id"
                    lines.append(
                        f"{indent}Optional<{cls}> {record_var}Opt = {repo_var}.read({id_var});"
                    )
                else:
                    lines.append(f"{indent}// TODO: READ — {node.original_code}")
            elif "WRITE" in original_upper and "ON" in original_upper:
                record_var = _pick_to_java_field(parts[1]) if len(parts) > 1 else "record"
                on_idx = next((i for i, p in enumerate(parts) if p.upper() == "ON"), -1)
                if on_idx >= 0 and on_idx + 1 < len(parts):
                    fh = _pick_to_java_field(parts[on_idx + 1].replace(",", ""))
                    repo_var = f"{fh}Repo"
                    lines.append(f"{indent}{repo_var}.write({record_var});")
                else:
                    lines.append(f"{indent}// TODO: WRITE — {node.original_code}")
            elif "DELETE" in original_upper and len(parts) >= 2:
                fh = _pick_to_java_field(parts[1].replace(",", ""))
                repo_var = f"{fh}Repo"
                id_var = _pick_to_java_field(parts[2]) if len(parts) > 2 else "recordId"
                lines.append(f"{indent}{repo_var}.delete({id_var});")
            else:
                lines.append(f"{indent}// File I/O: {node.original_code}")

        elif node.type == LogicNodeType.PRINT:
            content = _pick_to_java_field(node.original_code)
            lines.append(f"{indent}System.out.println({content});")

        else:
            lines.append(f"{indent}// {node.type.value}: {node.original_code}")
            for child in node.children or []:
                lines.append(self.map_logic_flow_node(child, business_rules, indent_level))

        return "\n".join(lines)

    # ── Imports ───────────────────────────────────────────────────────────────

    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate Java file header with package, imports, and MV helpers."""
        prog_name = yaml_data.metadata.original_filename or "unknown"
        ts = yaml_data.metadata.analysis_timestamp

        has_mv = any(v.multi_value for v in (yaml_data.variables or []))

        lines = [
            f"/**",
            f" * Generated from: {prog_name}",
            f" * Generated at:   {ts}",
            f" * Auto-generated by Legacy Code Migration System",
            f" */",
            "",
        ]
        lines += self.IMPORTS
        lines.append("")

        if has_mv:
            lines += [
                "// ── Multi-value field helper constants (Pick Basic compatibility) ─────────────",
                "class MultiValueConstants {",
                "    static final char VM = (char) 253;  // Value Mark",
                "    static final char SM = (char) 252;  // Sub-Value Mark",
                "    static final char TM = (char) 251;  // Text Mark",
                "",
                "    static List<String> parseMultivalue(String mvString, char delimiter) {",
                "        if (mvString == null || mvString.isEmpty()) return new ArrayList<>();",
                "        return new ArrayList<>(Arrays.asList(mvString.split(String.valueOf(delimiter), -1)));",
                "    }",
                "",
                "    static String buildMultivalue(List<String> values, char delimiter) {",
                "        StringBuilder sb = new StringBuilder();",
                "        for (int i = 0; i < values.size(); i++) {",
                "            if (i > 0) sb.append(delimiter);",
                "            sb.append(values.get(i));",
                "        }",
                "        return sb.toString();",
                "    }",
                "}",
                "",
            ]
        return "\n".join(lines)

    # ── Model & Repository classes ────────────────────────────────────────────

    def _generate_model_class(self, file_handle: str) -> str:
        class_name = _pick_to_java_class(file_handle)
        lines = [
            f"    /** Data model for {file_handle}. */",
            f"    static class {class_name} {{",
            f"        String id;",
            f"        Map<String, Object> data;",
            "",
            f"        {class_name}(String id) {{",
            f"            this.id = id;",
            f"            this.data = new HashMap<>();",
            f"        }}",
            "",
            f"        @Override",
            f"        public String toString() {{",
            f'            return "{class_name}[id=" + id + "]";',
            f"        }}",
            f"    }}",
        ]
        return "\n".join(lines)

    def _generate_repository_class(self, file_handle: str) -> str:
        class_name = _pick_to_java_class(file_handle)
        repo_name = f"{class_name}Repository"
        lines = [
            f"    /** Repository for {file_handle} file operations. */",
            f"    static class {repo_name} {{",
            f"        private final String fileHandle = \"{file_handle}\";",
            "",
            f"        /** Read a record by ID. */",
            f"        Optional<{class_name}> read(String recordId) {{",
            f"            // TODO: implement read from Pick Basic file",
            f"            return Optional.of(new {class_name}(recordId));",
            f"        }}",
            "",
            f"        /** Write a record. */",
            f"        boolean write({class_name} record) {{",
            f"            // TODO: implement write to Pick Basic file",
            f"            return true;",
            f"        }}",
            "",
            f"        /** Delete a record by ID. */",
            f"        boolean delete(String recordId) {{",
            f"            // TODO: implement delete from Pick Basic file",
            f"            return true;",
            f"        }}",
            f"    }}",
        ]
        return "\n".join(lines)

    def _generate_subroutine_method(self, subroutine: SubroutineInfo) -> str:
        func_name = _pick_to_java_field(subroutine.name)
        params = [_pick_to_java_field(p) for p in subroutine.parameters]
        # Java pass-by-reference: wrap each param in String[]
        param_sig = ", ".join(f"String[] {p}" for p in params) if params else ""
        lines = [
            f"    /**",
            f"     * {subroutine.purpose or ('Subroutine: ' + subroutine.name)}",
        ]
        if subroutine.is_external:
            lines.append(f"     * <p>External subroutine — implementation required.</p>")
        for p in params:
            lines.append(f"     * @param {p} pass-by-ref wrapper (use {p}[0] to read/write)")
        lines.append(f"     */")
        lines.append(f"    static void {func_name}({param_sig}) {{")
        if subroutine.is_external:
            lines.append(f"        // TODO: implement external subroutine {subroutine.name}")
        else:
            lines.append(f"        // TODO: implement subroutine — {subroutine.name}")
        if params:
            lines.append(f"        // Access each parameter value via p[0], assign via p[0] = newValue;")
        lines.append(f"    }}")
        return "\n".join(lines)

    # ── Class structure ───────────────────────────────────────────────────────

    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate the full Java class body."""
        prog_name = yaml_data.program_structure.name or "MigratedProgram"
        # Java class name must be PascalCase, no dots
        class_name_raw = prog_name.replace(".", "_").replace("-", "_")
        parts = class_name_raw.split("_")
        class_name = "".join(p.capitalize() for p in parts if p) or "MigratedProgram"

        lines: List[str] = [f"public class {class_name} {{", ""]

        # Model + Repository nested static classes
        if yaml_data.file_operations:
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            if handles:
                lines.append("    // ── Data models & repositories ─────────────────────────────────────────────")
                for h in handles:
                    lines.append(self._generate_model_class(h))
                    lines.append("")
                    lines.append(self._generate_repository_class(h))
                    lines.append("")

        # Subroutine methods
        if yaml_data.subroutines:
            lines.append("    // ── Subroutine methods ─────────────────────────────────────────────────────────")
            for sub in yaml_data.subroutines:
                lines.append(self._generate_subroutine_method(sub))
                lines.append("")

        # main method
        lines.append("    // ── Main entry point ───────────────────────────────────────────────────────────")
        lines.append("    public static void main(String[] args) {")
        lines.append(f'        /**')
        lines.append(f'         * Migrated from Pick Basic: {prog_name}')
        lines.append(f'         * Original complexity: {yaml_data.metadata.complexity_estimate or "unknown"}')
        lines.append(f'         */')

        if yaml_data.variables:
            lines.append("        // Variable declarations")
            for var in yaml_data.variables:
                if var.scope in (VariableScope.LOCAL, VariableScope.PARAMETER):
                    lines.append(f"        {self.map_variable_declaration(var)}")
            lines.append("")

        if yaml_data.file_operations:
            lines.append("        // Repository instantiation")
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            for h in handles:
                fv = _pick_to_java_field(h)
                cls = _pick_to_java_class(h)
                lines.append(f"        {cls}Repository {fv}Repo = new {cls}Repository();")
            lines.append("")

        lines.append("        // Main program logic")
        for node in yaml_data.logic_flow:
            lines.append(self.map_logic_flow_node(node, yaml_data.business_rules, indent_level=2))

        lines.append("    }")
        lines.append("}")
        return "\n".join(lines)

    def _convert_condition(self, condition: str) -> str:
        cond = condition
        cond = cond.replace(" = ", " == ").replace(" <> ", " != ")
        cond = cond.replace(" AND ", " && ").replace(" OR ", " || ").replace(" NOT ", " !")
        cond = cond.replace(".AND.", " && ").replace(".OR.", " || ").replace(".NOT.", " !")
        import re
        cond = re.sub(
            r"\b([A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+)\b",
            lambda m: _pick_to_java_field(m.group(0)),
            cond,
        )
        return cond


# Register
MappingLoader.register_mapper("JAVA", JavaMapper)
