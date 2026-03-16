"""
C# language mapper — mirrors PythonMapper feature-for-feature.

Translates PickBasicYAMLSchema sections into idiomatic C# (C# 10 / .NET 6+):
  - Variables         → typed declarations (var keyword for locals)
  - File operations   → record (model) + class (Repository) with CRUD methods
  - Subroutines       → static methods; pass-by-reference via ref parameters
  - Multi-value       → VM/SM/TM constants + ParseMultivalue() helper
  - Logic flow        → C# control structures (if/for/foreach/while)
  - Class structure   → static Program class with static void Main()
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

def _pick_to_cs_local(raw: str) -> str:
    """Convert PICK.BASIC.NAME → pickBasicName (camelCase local variable)."""
    parts = raw.replace("-", ".").split(".")
    if not parts:
        return raw.lower()
    result = parts[0].lower()
    for p in parts[1:]:
        result += p.capitalize()
    return result


def _pick_to_cs_method(raw: str) -> str:
    """Convert PICK.BASIC.NAME → PickBasicName (PascalCase method/class)."""
    parts = raw.replace("-", ".").split(".")
    return "".join(p.capitalize() for p in parts if p) or "Method"


def _pick_to_cs_class(raw: str) -> str:
    """Convert FILE.HANDLE → FileHandle (PascalCase class name)."""
    name = raw.upper()
    for suffix in (".FILE", ".MASTER", ".DATA", "FILE", "MASTER", "DATA"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    parts = name.replace(".", "_").replace("-", "_").split("_")
    return "".join(p.capitalize() for p in parts if p) or "Record"


def _infer_cs_type(variable: VariableDeclaration) -> str:
    if variable.multi_value:
        return "List<string>"
    vtype = (variable.type or "").lower()
    if "numeric" in vtype or "int" in vtype:
        return "int"
    if "float" in vtype or "double" in vtype or "decimal" in vtype:
        return "decimal"
    if "bool" in vtype:
        return "bool"
    if "array" in vtype or "list" in vtype:
        return "List<string>"
    return "string"


def _infer_cs_default(variable: VariableDeclaration) -> str:
    if variable.multi_value:
        return "new List<string>()"
    if variable.initial_value:
        cstype = _infer_cs_type(variable)
        if cstype in ("int", "decimal"):
            return variable.initial_value
        if cstype == "bool":
            return variable.initial_value.lower()
        return f'"{variable.initial_value}"'
    cstype = _infer_cs_type(variable)
    if cstype == "int":
        return "0"
    if cstype == "decimal":
        return "0m"
    if cstype == "bool":
        return "false"
    if "List" in cstype:
        return "new List<string>()"
    return '""'


class CSharpMapper(BaseMapper):
    """Full C# code mapper — idiomatic C# 10 / .NET 6+, repository pattern."""

    USINGS = [
        "using System;",
        "using System.Collections.Generic;",
        "using System.Linq;",
        "using System.Text;",
    ]

    def __init__(self, target_language: str = "CSharp"):
        super().__init__(target_language)

    # ── BaseMapper interface ──────────────────────────────────────────────────

    def get_language_name(self) -> str:
        return "CSharp"

    def get_file_extension(self) -> str:
        return ".cs"

    def format_comment(self, comment: str, indent_level: int = 0) -> str:
        indent = self.get_indent(indent_level)
        return f"{indent}// {comment}"

    # ── Variable declarations ─────────────────────────────────────────────────

    def map_variable_declaration(self, variable: VariableDeclaration) -> str:
        """Map a Pick Basic variable to a C# local declaration."""
        var_name = _pick_to_cs_local(variable.name)
        cs_type = _infer_cs_type(variable)
        default_val = _infer_cs_default(variable)
        comment = f"  // {variable.description}" if variable.description else ""
        if variable.multi_value:
            comment = f"  // Multi-value field{': ' + variable.description if variable.description else ''}"
        return f"var {var_name} = ({cs_type}){default_val};{comment}"

    # ── File operations ───────────────────────────────────────────────────────

    def map_file_operation(self, operation: FileOperation) -> str:
        """Map a Pick Basic file operation to C# using repository pattern."""
        file_handle = _pick_to_cs_local(operation.file_handle)
        repo_var = f"{file_handle}Repo"
        class_name = _pick_to_cs_class(operation.file_handle)
        indent = self.get_indent(2)

        if operation.operation == FileOperationType.OPEN:
            return (
                f"{indent}// Open file: {operation.semantic_intent}\n"
                f"{indent}var {repo_var} = new {class_name}Repository();"
            )
        if operation.operation == FileOperationType.READ:
            record_var = _pick_to_cs_local(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Read: {operation.semantic_intent}\n"
                f"{indent}var {record_var} = {repo_var}.Read({id_var});"
            )
        if operation.operation == FileOperationType.WRITE:
            record_var = _pick_to_cs_local(operation.record_id) if operation.record_id else "record"
            return (
                f"{indent}// Write: {operation.semantic_intent}\n"
                f"{indent}{repo_var}.Write({record_var});"
            )
        if operation.operation == FileOperationType.DELETE:
            record_var = _pick_to_cs_local(operation.record_id) if operation.record_id else "record"
            id_var = f"{record_var}Id"
            return (
                f"{indent}// Delete: {operation.semantic_intent}\n"
                f"{indent}{repo_var}.Delete({id_var});"
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
            stmt = _pick_to_cs_local(node.original_code)
            lines.append(f"{indent}{stmt};")

        elif node.type == LogicNodeType.CONDITIONAL:
            cond = self._convert_condition(node.condition or "true")
            lines.append(f"{indent}if ({cond})")
            lines.append(f"{indent}{{")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}// TODO: implement branch")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.LOOP:
            if node.loop_variable:
                var = _pick_to_cs_local(node.loop_variable)
                lines.append(f"{indent}for (int {var} = 0; {var} < 10; {var}++)  // TODO: correct range")
                lines.append(f"{indent}{{")
            else:
                lines.append(f"{indent}while (true)  // TODO: add proper condition")
                lines.append(f"{indent}{{")
            if node.children:
                for child in node.children:
                    lines.append(self.map_logic_flow_node(child, business_rules, indent_level + 1))
            else:
                lines.append(f"{self.get_indent(indent_level + 1)}break;  // TODO: implement body")
            lines.append(f"{indent}}}")

        elif node.type == LogicNodeType.SUBROUTINE_CALL:
            # C# pass-by-reference via ref parameters
            method_name = _pick_to_cs_method(node.target_label or "Method")
            if "(" in node.original_code and ")" in node.original_code:
                param_section = node.original_code[
                    node.original_code.index("(") + 1: node.original_code.rindex(")")
                ]
                params = [_pick_to_cs_local(p.strip()) for p in param_section.split(",") if p.strip()]
                if params:
                    ref_params = ", ".join(f"ref {p}" for p in params)
                    lines.append(f"{indent}{method_name}({ref_params});  // pass-by-ref via ref")
                else:
                    lines.append(f"{indent}{method_name}();")
            else:
                lines.append(f"{indent}{method_name}();")

        elif node.type == LogicNodeType.RETURN:
            lines.append(f"{indent}return;")

        elif node.type == LogicNodeType.FILE_IO:
            original_upper = node.original_code.upper()
            parts = node.original_code.split()
            if "READ" in original_upper and "FROM" in original_upper:
                record_var = _pick_to_cs_local(parts[1]) if len(parts) > 1 else "record"
                from_idx = next((i for i, p in enumerate(parts) if p.upper() == "FROM"), -1)
                if from_idx >= 0 and from_idx + 1 < len(parts):
                    fh = _pick_to_cs_local(parts[from_idx + 1].replace(",", ""))
                    cls = _pick_to_cs_class(parts[from_idx + 1].replace(",", ""))
                    repo_var = f"{fh}Repo"
                    id_var = f"{record_var}Id"
                    lines.append(f"{indent}var {record_var} = {repo_var}.Read({id_var});")
                else:
                    lines.append(f"{indent}// TODO: READ — {node.original_code}")
            elif "WRITE" in original_upper and "ON" in original_upper:
                record_var = _pick_to_cs_local(parts[1]) if len(parts) > 1 else "record"
                on_idx = next((i for i, p in enumerate(parts) if p.upper() == "ON"), -1)
                if on_idx >= 0 and on_idx + 1 < len(parts):
                    fh = _pick_to_cs_local(parts[on_idx + 1].replace(",", ""))
                    repo_var = f"{fh}Repo"
                    lines.append(f"{indent}{repo_var}.Write({record_var});")
                else:
                    lines.append(f"{indent}// TODO: WRITE — {node.original_code}")
            elif "DELETE" in original_upper and len(parts) >= 2:
                fh = _pick_to_cs_local(parts[1].replace(",", ""))
                repo_var = f"{fh}Repo"
                id_var = _pick_to_cs_local(parts[2]) if len(parts) > 2 else "recordId"
                lines.append(f"{indent}{repo_var}.Delete({id_var});")
            else:
                lines.append(f"{indent}// File I/O: {node.original_code}")

        elif node.type == LogicNodeType.PRINT:
            content = _pick_to_cs_local(node.original_code)
            lines.append(f"{indent}Console.WriteLine({content});")

        else:
            lines.append(f"{indent}// {node.type.value}: {node.original_code}")
            for child in node.children or []:
                lines.append(self.map_logic_flow_node(child, business_rules, indent_level))

        return "\n".join(lines)

    # ── Imports ───────────────────────────────────────────────────────────────

    def generate_imports(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate C# using directives, header comment, and MV helpers."""
        prog_name = yaml_data.metadata.original_filename or "unknown"
        ts = yaml_data.metadata.analysis_timestamp
        has_mv = any(v.multi_value for v in (yaml_data.variables or []))

        lines = list(self.USINGS)
        lines.append("")

        if has_mv:
            lines += [
                "// ── Multi-value field helpers (Pick Basic compatibility) ────────────────────",
                "static class MultiValueHelper",
                "{",
                "    public const char VM = (char)253;  // Value Mark",
                "    public const char SM = (char)252;  // Sub-Value Mark",
                "    public const char TM = (char)251;  // Text Mark",
                "",
                "    public static List<string> ParseMultivalue(string mvString, char delimiter = VM)",
                "    {",
                "        if (string.IsNullOrEmpty(mvString)) return new List<string>();",
                "        return new List<string>(mvString.Split(delimiter));",
                "    }",
                "",
                "    public static string BuildMultivalue(List<string> values, char delimiter = VM)",
                "        => string.Join(delimiter, values);",
                "}",
                "",
            ]

        lines += [
            "/// <summary>",
            f"/// Generated from: {prog_name}",
            f"/// Generated at:   {ts}",
            "/// Auto-generated by Legacy Code Migration System",
            "/// </summary>",
        ]

        return "\n".join(lines)

    # ── Model & Repository classes ────────────────────────────────────────────

    def _generate_model_record(self, file_handle: str) -> str:
        class_name = _pick_to_cs_class(file_handle)
        lines = [
            f"    /// <summary>Data model for {file_handle}.</summary>",
            f"    record {class_name}(string Id, Dictionary<string, object?> Data)",
            f"    {{",
            f"        public {class_name}(string id) : this(id, new Dictionary<string, object?>()) {{ }}",
            f"        public override string ToString() => $\"{class_name}[Id={{Id}}]\";",
            f"    }}",
        ]
        return "\n".join(lines)

    def _generate_repository_class(self, file_handle: str) -> str:
        class_name = _pick_to_cs_class(file_handle)
        repo_name = f"{class_name}Repository"
        lines = [
            f"    /// <summary>Repository for {file_handle} operations.</summary>",
            f"    class {repo_name}",
            f"    {{",
            f"        private readonly string _fileHandle = \"{file_handle}\";",
            f"",
            f"        /// <summary>Read a record by ID.</summary>",
            f"        public {class_name}? Read(string recordId)",
            f"        {{",
            f"            // TODO: implement read from Pick Basic file",
            f"            return new {class_name}(recordId);",
            f"        }}",
            f"",
            f"        /// <summary>Write a record.</summary>",
            f"        public bool Write({class_name} record)",
            f"        {{",
            f"            // TODO: implement write to Pick Basic file",
            f"            return true;",
            f"        }}",
            f"",
            f"        /// <summary>Delete a record by ID.</summary>",
            f"        public bool Delete(string recordId)",
            f"        {{",
            f"            // TODO: implement delete from Pick Basic file",
            f"            return true;",
            f"        }}",
            f"    }}",
        ]
        return "\n".join(lines)

    def _generate_subroutine_method(self, subroutine: SubroutineInfo) -> str:
        method_name = _pick_to_cs_method(subroutine.name)
        params = [_pick_to_cs_local(p) for p in subroutine.parameters]
        # ref parameters for pass-by-reference
        param_sig = ", ".join(f"ref string {p}" for p in params) if params else ""
        lines = [
            f"    /// <summary>",
            f"    /// {subroutine.purpose or ('Subroutine: ' + subroutine.name)}",
        ]
        if subroutine.is_external:
            lines.append(f"    /// <para>External subroutine — implementation required.</para>")
        lines.append(f"    /// </summary>")
        for p in params:
            lines.append(f"    /// <param name=\"{p}\">Pass-by-reference parameter.</param>")
        lines.append(f"    static void {method_name}({param_sig})")
        lines.append(f"    {{")
        if subroutine.is_external:
            lines.append(f"        // TODO: implement external subroutine {subroutine.name}")
        else:
            lines.append(f"        // TODO: implement subroutine — {subroutine.name}")
        if params:
            example_p = params[0]
            lines.append(f"        // Access/modify parameters directly: {example_p} = \"new value\";")
        lines.append(f"    }}")
        return "\n".join(lines)

    # ── Class structure ───────────────────────────────────────────────────────

    def generate_class_structure(self, yaml_data: PickBasicYAMLSchema) -> str:
        """Generate the complete C# class body."""
        prog_name = yaml_data.program_structure.name or "MigratedProgram"
        class_name_raw = prog_name.replace(".", "_").replace("-", "_")
        parts = class_name_raw.split("_")
        class_name = "".join(p.capitalize() for p in parts if p) or "MigratedProgram"

        lines: List[str] = [f"class {class_name}", "{"]

        # Model records + Repository classes
        if yaml_data.file_operations:
            handles = sorted({op.file_handle for op in yaml_data.file_operations if op.file_handle})
            if handles:
                lines.append("    // ── Data models & repositories ─────────────────────────────────────────────")
                for h in handles:
                    lines.append(self._generate_model_record(h))
                    lines.append("")
                    lines.append(self._generate_repository_class(h))
                    lines.append("")

        # Subroutine methods
        if yaml_data.subroutines:
            lines.append("    // ── Subroutine methods ─────────────────────────────────────────────────────────")
            for sub in yaml_data.subroutines:
                lines.append(self._generate_subroutine_method(sub))
                lines.append("")

        # Main method
        lines.append("    // ── Main entry point ───────────────────────────────────────────────────────────")
        lines.append("    static void Main(string[] args)")
        lines.append("    {")

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
                fv = _pick_to_cs_local(h)
                cls = _pick_to_cs_class(h)
                lines.append(f"        var {fv}Repo = new {cls}Repository();")
            lines.append("")

        lines.append("        // Main program logic")
        for node in yaml_data.logic_flow:
            lines.append(self.map_logic_flow_node(node, yaml_data.business_rules, indent_level=2))

        lines.append("    }")
        lines.append("}")
        return "\n".join(lines)

    def _convert_condition(self, condition: str) -> str:
        cond = condition
        # = → == in C# (but not !=, >=, <=)
        import re
        cond = re.sub(r"(?<![!<>])=(?!=)", "==", cond)
        cond = cond.replace(" <> ", " != ")
        cond = cond.replace(" AND ", " && ").replace(" OR ", " || ").replace(" NOT ", " !")
        cond = cond.replace(".AND.", " && ").replace(".OR.", " || ").replace(".NOT.", " !")
        cond = re.sub(
            r"\b([A-Z][A-Z0-9]*(?:\.[A-Z][A-Z0-9]*)+)\b",
            lambda m: _pick_to_cs_local(m.group(0)),
            cond,
        )
        return cond


# Register
MappingLoader.register_mapper("CSHARP", CSharpMapper)
MappingLoader.register_mapper("C#", CSharpMapper)
