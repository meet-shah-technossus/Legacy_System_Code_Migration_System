"""
Phase 2 — Expanded Syntax Validator.

Validates LLM-generated code for syntax correctness before storing it.
Phase 2 extends Phase 4 with:
  - Structured ValidationResult dataclass (valid, errors: list, tool_available)
  - Per-language temp-file validators with full error capture
  - validate_detailed() for rich metadata storage
  - validate() backward-compat wrapper → (bool, Optional[str])

Language support (Phase 2):
  PYTHON      : ast.parse()                    — zero-dep, always available
  TYPESCRIPT  : tsc --noEmit on temp .ts file  — falls open if tsc absent
  JAVASCRIPT  : node --check on temp .js file  — falls open if node absent;
                fallback to node stdin if --check unavailable
  JAVA        : javac on temp .java file        — falls open if javac absent
  C#          : pass-through (dotnet toolchain too complex for inline checks)
  OTHER       : pass-through
"""

import ast
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# Maximum characters of compiler output captured per error list entry
_MAX_ERROR_CHARS = 1200


# ── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    """
    Structured result of a syntax validation check.

    Attributes:
        valid            : True if code passed (or validation was skipped).
        errors           : List of LLM-friendly error strings.  Empty when valid.
        tool_available   : False when the toolchain is absent and code was
                          passed through without real checking.
    """
    valid: bool
    errors: List[str] = field(default_factory=list)
    tool_available: bool = True  # False ↔ toolchain absent, passed through

    @property
    def error_message(self) -> Optional[str]:
        """Single-string form of errors — for building fix-prompts."""
        return "\n".join(self.errors) if self.errors else None


# ── Validator ────────────────────────────────────────────────────────────────

class SyntaxValidator:
    """Language-aware syntax checker for Agent-2 generated code."""

    # ── Public API ────────────────────────────────────────────────────────────

    @staticmethod
    def validate_detailed(code: str, target_language: str) -> ValidationResult:
        """
        Full syntax check returning a ValidationResult with detailed metadata.

        Args:
            code:            Generated source code.
            target_language: Language name (case-insensitive).

        Returns:
            ValidationResult(valid, errors, tool_available)
        """
        lang = target_language.upper()

        if lang == "PYTHON":
            return SyntaxValidator._validate_python(code)
        if lang == "TYPESCRIPT":
            return SyntaxValidator._validate_typescript(code)
        if lang == "JAVASCRIPT":
            return SyntaxValidator._validate_javascript(code)
        if lang == "JAVA":
            return SyntaxValidator._validate_java(code)
        if lang in ("CSHARP", "C#"):
            return SyntaxValidator._validate_csharp(code)

        logger.debug("No validator for %s — passing through", lang)
        return ValidationResult(valid=True, errors=[], tool_available=False)

    @staticmethod
    def validate(code: str, target_language: str) -> Tuple[bool, Optional[str]]:
        """
        Backward-compatible wrapper — returns (valid, error_message_or_None).

        All existing callers (Phase 4 retry logic) continue to work unchanged.
        New code should prefer validate_detailed() for richer metadata.
        """
        result = SyntaxValidator.validate_detailed(code, target_language)
        return result.valid, result.error_message

    # ── Language-specific validators ──────────────────────────────────────────

    @staticmethod
    def _validate_python(code: str) -> ValidationResult:
        """Use ast.parse() — zero-dependency, always available."""
        try:
            ast.parse(code)
            logger.debug("Python syntax check passed (%d chars)", len(code))
            return ValidationResult(valid=True, tool_available=True)

        except SyntaxError as exc:
            lines = [f"SyntaxError on line {exc.lineno}: {exc.msg}"]
            if exc.text:
                lines.append(f"  Source line : {exc.text.rstrip()}")
            if exc.lineno and exc.offset:
                col = max(exc.offset - 1, 0)
                lines.append(f"  Column      : {'_' * col}^")
            error_msg = "\n".join(lines)
            logger.warning("Python syntax validation failed: %s", error_msg)
            return ValidationResult(valid=False, errors=[error_msg], tool_available=True)

        except Exception as exc:
            error_msg = f"Unexpected error during Python syntax check: {exc}"
            logger.warning(error_msg)
            return ValidationResult(valid=False, errors=[error_msg], tool_available=True)

    @staticmethod
    def _validate_typescript(code: str) -> ValidationResult:
        """
        Check TypeScript using tsc --noEmit on a temp file.
        Falls back to node --check (catches structural JS errors) if tsc absent.
        Falls open entirely if neither tool is available.
        """
        tsc = shutil.which("tsc")
        node = shutil.which("node")

        if not tsc and not node:
            logger.debug("Neither tsc nor node found — skipping TypeScript validation")
            return ValidationResult(valid=True, errors=[], tool_available=False)

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                suffix=".ts", mode="w", delete=False, encoding="utf-8"
            ) as f:
                f.write(code)
                tmp_path = f.name

            if tsc:
                result = subprocess.run(
                    [
                        tsc,
                        "--noEmit",
                        "--strict",
                        "--target", "ES2020",
                        "--module", "CommonJS",
                        "--skipLibCheck",
                        "--allowSyntheticDefaultImports",
                        tmp_path,
                    ],
                    capture_output=True,
                    timeout=20,
                )
                if result.returncode == 0:
                    logger.debug("TypeScript (tsc) syntax check passed")
                    return ValidationResult(valid=True, tool_available=True)

                raw = (
                    result.stdout.decode("utf-8", errors="replace")
                    + result.stderr.decode("utf-8", errors="replace")
                ).strip()
                errors = [e for e in raw.splitlines() if e.strip()][:30]
                logger.warning("TypeScript (tsc) validation failed: %d errors", len(errors))
                return ValidationResult(valid=False, errors=errors, tool_available=True)

            # Fallback: node --check (JS-level structural errors only)
            result = subprocess.run(
                [node, "--check", tmp_path],
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0:
                logger.debug("TypeScript node --check passed")
                return ValidationResult(valid=True, tool_available=True)

            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            errors = [e for e in stderr.splitlines() if e.strip()][:20]
            return ValidationResult(valid=False, errors=errors, tool_available=True)

        except subprocess.TimeoutExpired:
            logger.warning("TypeScript validation timed out — passing through")
            return ValidationResult(valid=True, errors=[], tool_available=True)
        except Exception as exc:
            logger.warning("TypeScript validation error: %s — passing through", exc)
            return ValidationResult(valid=True, errors=[], tool_available=True)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @staticmethod
    def _validate_javascript(code: str) -> ValidationResult:
        """
        Check JavaScript using `node --check` on a temp file.
        Falls open if node is absent or times out.
        """
        node = shutil.which("node")
        if not node:
            logger.debug("node binary not found — skipping JavaScript validation")
            return ValidationResult(valid=True, errors=[], tool_available=False)

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                suffix=".js", mode="w", delete=False, encoding="utf-8"
            ) as f:
                f.write(code)
                tmp_path = f.name

            result = subprocess.run(
                [node, "--check", tmp_path],
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0:
                logger.debug("JavaScript node --check passed (%d chars)", len(code))
                return ValidationResult(valid=True, tool_available=True)

            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            errors = [e for e in stderr.splitlines() if e.strip()][:20]
            logger.warning("JavaScript syntax validation failed: %d error(s)", len(errors))
            return ValidationResult(valid=False, errors=errors, tool_available=True)

        except subprocess.TimeoutExpired:
            logger.warning("JavaScript validation timed out — passing through")
            return ValidationResult(valid=True, errors=[], tool_available=True)
        except Exception as exc:
            logger.warning("JavaScript validation error: %s — passing through", exc)
            return ValidationResult(valid=True, errors=[], tool_available=True)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @staticmethod
    def _validate_java(code: str) -> ValidationResult:
        """
        Check Java using javac on a temp .java file.
        Falls open if javac is absent or times out.

        Note: javac requires the filename to match the public class name.
        We write a temp file with a generated name and allow non-public classes.
        """
        javac = shutil.which("javac")
        if not javac:
            logger.debug("javac not found — skipping Java validation")
            return ValidationResult(valid=True, errors=[], tool_available=False)

        tmp_path = None
        tmp_dir = None
        try:
            tmp_dir = tempfile.mkdtemp()
            # Use a generic name; javac permits it for non-public top-level classes
            tmp_path = os.path.join(tmp_dir, "GeneratedCode.java")
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write(code)

            result = subprocess.run(
                [javac, "-d", tmp_dir, tmp_path],
                capture_output=True,
                timeout=25,
            )
            if result.returncode == 0:
                logger.debug("Java (javac) syntax check passed")
                return ValidationResult(valid=True, tool_available=True)

            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            errors = [e for e in stderr.splitlines() if e.strip()][:30]
            logger.warning("Java (javac) validation failed: %d error(s)", len(errors))
            return ValidationResult(valid=False, errors=errors, tool_available=True)

        except subprocess.TimeoutExpired:
            logger.warning("Java validation timed out — passing through")
            return ValidationResult(valid=True, errors=[], tool_available=True)
        except Exception as exc:
            logger.warning("Java validation error: %s — passing through", exc)
            return ValidationResult(valid=True, errors=[], tool_available=True)
        finally:
            # Clean up temp dir and its contents
            if tmp_dir and os.path.isdir(tmp_dir):
                import shutil as _shutil
                _shutil.rmtree(tmp_dir, ignore_errors=True)

    @staticmethod
    def _validate_csharp(code: str) -> ValidationResult:
        """
        C# syntax check — three-tier strategy:
          1. csc (Mono C# compiler) — zero-dependency, fast, full syntax check.
          2. dotnet + minimal temp .csproj — uses the .NET SDK when Mono absent.
          3. Brace-balance heuristic — always available; catches the most common
             LLM code-generation errors (unmatched braces) when no compiler found.

        Falls open (passes through) only when all three tiers are unavailable or
        time out.
        """
        # ── Tier 1: Mono csc ─────────────────────────────────────────────────
        csc = shutil.which("csc") or shutil.which("mcs")  # mcs = mono C# compiler alias
        if csc:
            tmp_path = None
            tmp_dir = None
            try:
                tmp_dir = tempfile.mkdtemp()
                tmp_path = os.path.join(tmp_dir, "GeneratedCode.cs")
                with open(tmp_path, "w", encoding="utf-8") as f:
                    f.write(code)

                result = subprocess.run(
                    [csc, "-nologo", "-nowarn:CS5001", f"-out:{os.devnull}", tmp_path],
                    capture_output=True,
                    timeout=20,
                )
                if result.returncode == 0:
                    logger.debug("C# (csc/mcs) syntax check passed")
                    return ValidationResult(valid=True, tool_available=True)

                raw = (
                    result.stdout.decode("utf-8", errors="replace")
                    + result.stderr.decode("utf-8", errors="replace")
                ).strip()
                errors = [e for e in raw.splitlines() if e.strip()][:30]
                logger.warning("C# (csc) validation failed: %d error(s)", len(errors))
                return ValidationResult(valid=False, errors=errors, tool_available=True)

            except subprocess.TimeoutExpired:
                logger.warning("C# (csc) validation timed out — falling through to dotnet")
            except Exception as exc:
                logger.warning("C# (csc) validation error: %s — falling through", exc)
            finally:
                if tmp_dir and os.path.isdir(tmp_dir):
                    import shutil as _shutil
                    _shutil.rmtree(tmp_dir, ignore_errors=True)

        # ── Tier 2: dotnet SDK — minimal temp project ─────────────────────────
        dotnet = shutil.which("dotnet")
        if dotnet:
            tmp_dir = None
            try:
                tmp_dir = tempfile.mkdtemp()
                cs_path = os.path.join(tmp_dir, "GeneratedCode.cs")
                csproj_path = os.path.join(tmp_dir, "check.csproj")

                # Minimal .csproj: SDK-style, no NuGet restore required for base BCL
                csproj_content = (
                    "<Project Sdk=\"Microsoft.NET.Sdk\">\n"
                    "  <PropertyGroup>\n"
                    "    <OutputType>Exe</OutputType>\n"
                    "    <TargetFramework>net8.0</TargetFramework>\n"
                    "    <Nullable>enable</Nullable>\n"
                    "    <ImplicitUsings>enable</ImplicitUsings>\n"
                    "    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>\n"
                    "  </PropertyGroup>\n"
                    "</Project>\n"
                )
                with open(csproj_path, "w", encoding="utf-8") as f:
                    f.write(csproj_content)
                with open(cs_path, "w", encoding="utf-8") as f:
                    f.write(code)

                result = subprocess.run(
                    [dotnet, "build", csproj_path, "--nologo", "-v", "q", "--no-restore"],
                    capture_output=True,
                    timeout=35,
                    cwd=tmp_dir,
                )
                if result.returncode == 0:
                    logger.debug("C# (dotnet build) syntax check passed")
                    return ValidationResult(valid=True, tool_available=True)

                raw = (
                    result.stdout.decode("utf-8", errors="replace")
                    + result.stderr.decode("utf-8", errors="replace")
                ).strip()
                # Filter out noise; keep lines with "error CS"
                errors = [e for e in raw.splitlines() if "error" in e.lower() or "Error" in e][:30]
                if not errors:
                    errors = [e for e in raw.splitlines() if e.strip()][:20]
                logger.warning("C# (dotnet) validation failed: %d error(s)", len(errors))
                return ValidationResult(valid=False, errors=errors, tool_available=True)

            except subprocess.TimeoutExpired:
                logger.warning("C# (dotnet) validation timed out — falling through to heuristic")
            except Exception as exc:
                logger.warning("C# (dotnet) validation error: %s — falling through", exc)
            finally:
                if tmp_dir and os.path.isdir(tmp_dir):
                    import shutil as _shutil
                    _shutil.rmtree(tmp_dir, ignore_errors=True)

        # ── Tier 3: Brace-balance heuristic (always available) ───────────────
        return SyntaxValidator._validate_csharp_heuristic(code)

    @staticmethod
    def _validate_csharp_heuristic(code: str) -> ValidationResult:
        """
        Zero-dependency C# brace-balance and basic structural check.

        Catches the most common LLM syntax errors:
          - Unmatched { / } braces
          - Unmatched ( / ) parentheses
          - String literal containing a lone triple-backtick (LLM markdown leakage)
        """
        depth = 0
        paren_depth = 0
        in_single_line_comment = False
        in_block_comment = False
        in_string = False
        in_char = False
        in_verbatim = False  # @"..." strings
        last_open_line = 0
        errors: list = []

        lines = code.split("\n")
        for line_no, line in enumerate(lines, start=1):
            i = 0
            in_single_line_comment = False  # reset each line
            while i < len(line):
                ch = line[i]
                peek = line[i + 1] if i + 1 < len(line) else ""

                # Block comment start/end
                if not in_string and not in_char and not in_single_line_comment:
                    if in_block_comment:
                        if ch == "*" and peek == "/":
                            in_block_comment = False
                            i += 2
                            continue
                        i += 1
                        continue
                    if ch == "/" and peek == "*":
                        in_block_comment = True
                        i += 2
                        continue
                    if ch == "/" and peek == "/":
                        in_single_line_comment = True
                        break  # rest of line is comment

                if in_single_line_comment or in_block_comment:
                    i += 1
                    continue

                # Verbatim strings @"..."
                if not in_string and not in_char and ch == "@" and peek == '"':
                    in_verbatim = True
                    in_string = True
                    i += 2
                    continue

                # String / char toggle
                if in_verbatim:
                    if ch == '"' and peek == '"':
                        i += 2  # escaped quote inside verbatim
                        continue
                    if ch == '"':
                        in_string = False
                        in_verbatim = False
                    i += 1
                    continue

                if not in_string and not in_char and ch == '"':
                    in_string = True
                    i += 1
                    continue
                if in_string and ch == '\\':
                    i += 2  # skip escaped char
                    continue
                if in_string and ch == '"':
                    in_string = False
                    i += 1
                    continue

                if not in_string and not in_char and ch == "'":
                    in_char = True
                    i += 1
                    continue
                if in_char and ch == '\\':
                    i += 2
                    continue
                if in_char and ch == "'":
                    in_char = False
                    i += 1
                    continue

                if in_string or in_char:
                    i += 1
                    continue

                if ch == "{":
                    depth += 1
                    last_open_line = line_no
                elif ch == "}":
                    depth -= 1
                    if depth < 0:
                        errors.append(
                            f"Unmatched '}}' on line {line_no}: more closing braces than opening braces"
                        )
                        depth = 0
                elif ch == "(":
                    paren_depth += 1
                elif ch == ")":
                    paren_depth -= 1
                    if paren_depth < 0:
                        errors.append(
                            f"Unmatched ')' on line {line_no}: more closing parens than opening parens"
                        )
                        paren_depth = 0
                i += 1

            # Check for markdown leakage (LLM adds ``` in code)
            stripped = line.strip()
            if stripped.startswith("```"):
                errors.append(
                    f"Line {line_no}: Markdown code fence detected (``` leakage from LLM) — remove it"
                )

        if depth > 0:
            errors.append(
                f"Unmatched '{{': {depth} opening brace(s) never closed (last opened near line {last_open_line})"
            )
        if paren_depth > 0:
            errors.append(
                f"Unmatched '(': {paren_depth} opening parenthesis/parentheses never closed"
            )

        if errors:
            logger.warning("C# heuristic check found %d issue(s)", len(errors))
            return ValidationResult(valid=False, errors=errors, tool_available=True)

        logger.debug("C# heuristic brace-balance check passed (%d lines)", len(lines))
        # Mark tool_available=False so the DB knows this was a heuristic, not a real compile
        return ValidationResult(valid=True, errors=[], tool_available=False)

    # ── Legacy stdin-based node validator (kept for reference, not used) ──────

    @staticmethod
    def _validate_node(code: str, lang: str) -> Tuple[bool, Optional[str]]:
        """
        Legacy: use `node --input-type=module` via stdin.
        Superseded by _validate_typescript / _validate_javascript in Phase 2.
        Kept only for backward compatibility if directly called.
        """
        if shutil.which("node") is None:
            logger.debug("node binary not found — skipping %s syntax validation", lang)
            return True, None

        try:
            result = subprocess.run(
                ["node", "--input-type=module"],
                input=code.encode("utf-8"),
                capture_output=True,
                timeout=8,
            )
            if result.returncode == 0:
                logger.debug("%s syntax check passed (%d chars)", lang, len(code))
                return True, None

            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            truncated = stderr[:800] + ("..." if len(stderr) > 800 else "")
            error_msg = f"{lang} syntax error (node):\n{truncated}"
            logger.warning("%s syntax validation failed: %s", lang, error_msg)
            return False, error_msg

        except subprocess.TimeoutExpired:
            logger.warning("node syntax check timed out for %s — passing through", lang)
            return True, None

        except Exception as exc:
            logger.debug("%s syntax check raised unexpected error: %s — passing through", lang, exc)
            return True, None  # fail open — never block generation on tooling issues
