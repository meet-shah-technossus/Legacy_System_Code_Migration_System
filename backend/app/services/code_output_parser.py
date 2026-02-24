"""
Phase 1 (Structured Output) — Agent 2 output envelope parser.

Agent 2 is instructed to wrap every response in a structured delimiter envelope:

    <<<BEGIN_OUTPUT>>>
    {
      "language": "Python",
      "sections_covered": ["variables", "subroutines"],
      "external_stubs_included": ["format_date"],
      "warnings": []
    }
    <<<BEGIN_CODE>>>
    def main():
        ...
    <<<END_OUTPUT>>>

The delimiter format avoids JSON-escaping issues with multiline code while still
providing machine-readable metadata about what the LLM actually generated.

CodeOutputParser.parse() always succeeds — if the LLM does not comply (partially,
or uses a legacy raw-code response) it falls back to the pre-phase-1 raw-string
stripping path so nothing ever breaks.
"""

import json
import logging
from typing import List

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ─── Envelope delimiter constants ────────────────────────────────────────────

_BEGIN_MARKER = "<<<BEGIN_OUTPUT>>>"
_CODE_MARKER  = "<<<BEGIN_CODE>>>"
_END_MARKER   = "<<<END_OUTPUT>>>"


# ─── Output schema ────────────────────────────────────────────────────────────

class AgentOutputEnvelope(BaseModel):
    """
    Structured output contract for Agent 2.

    Every LLM response is parsed into this object before anything is stored.
    When the LLM complies with the delimiter envelope, all fields are populated.
    When it does not (legacy fallback), code is extracted from raw text and
    warnings[0] will be "Structured output envelope not found — legacy raw
    extraction used".
    """

    language: str = Field(..., description="Target language as reported by the LLM")
    code: str = Field(..., description="Clean code — no markdown fences")
    sections_covered: List[str] = Field(
        default_factory=list,
        description="YAML sections addressed by the generated code",
    )
    external_stubs_included: List[str] = Field(
        default_factory=list,
        description="External subroutine names whose stubs were included verbatim",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="LLM-reported caveats or structural warnings",
    )
    envelope_used: bool = Field(
        True,
        description="True if parsed from structured envelope; False if legacy fallback",
    )


# ─── Parser ──────────────────────────────────────────────────────────────────

class CodeOutputParser:
    """
    Parse raw LLM text into an AgentOutputEnvelope.

    Primary path  : structured delimiter envelope
                    (<<<BEGIN_OUTPUT>>> … <<<BEGIN_CODE>>> … <<<END_OUTPUT>>>)
    Fallback path : legacy raw-string / markdown-fence stripping
                    (guarantees zero breakage on partial LLM compliance)
    """

    @staticmethod
    def parse(raw_text: str, target_language: str) -> AgentOutputEnvelope:
        """
        Parse raw LLM output into a structured AgentOutputEnvelope.

        Always returns a valid envelope — never raises.

        Args:
            raw_text:        Raw text received from the LLM
            target_language: Expected target language (used for fallback labelling)

        Returns:
            AgentOutputEnvelope with code extracted and metadata populated
        """
        text = raw_text.strip()

        # ── Primary path: structured delimiter envelope ───────────────────────
        if (
            _BEGIN_MARKER in text
            and _CODE_MARKER in text
            and _END_MARKER in text
        ):
            try:
                meta_start = text.index(_BEGIN_MARKER) + len(_BEGIN_MARKER)
                code_start = text.index(_CODE_MARKER)
                code_end   = text.index(_END_MARKER)

                meta_raw = text[meta_start:code_start].strip()
                code_raw = text[code_start + len(_CODE_MARKER):code_end].strip()

                meta = json.loads(meta_raw)

                # Strip any accidental markdown fences inside the code block
                code_clean = CodeOutputParser._strip_fences(code_raw, target_language)

                logger.debug(
                    "CodeOutputParser: envelope parsed for %s — "
                    "sections=%s stubs=%s warnings=%d",
                    target_language,
                    meta.get("sections_covered", []),
                    meta.get("external_stubs_included", []),
                    len(meta.get("warnings", [])),
                )

                return AgentOutputEnvelope(
                    language=meta.get("language", target_language),
                    code=code_clean,
                    sections_covered=meta.get("sections_covered", []),
                    external_stubs_included=meta.get("external_stubs_included", []),
                    warnings=meta.get("warnings", []),
                    envelope_used=True,
                )

            except Exception as exc:
                logger.warning(
                    "CodeOutputParser: envelope markers present but parse failed "
                    "for %s — falling back. Error: %s",
                    target_language,
                    exc,
                )

        # ── Fallback path: legacy raw extraction ─────────────────────────────
        logger.info(
            "CodeOutputParser: envelope not found for %s — using legacy extraction",
            target_language,
        )
        code = CodeOutputParser._strip_fences(text, target_language)
        return AgentOutputEnvelope(
            language=target_language,
            code=code,
            sections_covered=[],
            external_stubs_included=[],
            warnings=["Structured output envelope not found — legacy raw extraction used"],
            envelope_used=False,
        )

    @staticmethod
    def _strip_fences(text: str, target_language: str) -> str:
        """
        Remove leading / trailing markdown code fences from LLM output.

        Handles the common variants the LLM emits:
          ```python, ```typescript, ```javascript, ```java, ```csharp, ```
        """
        lang = target_language.lower()
        for fence in (
            f"```{lang}",
            "```python",
            "```typescript",
            "```javascript",
            "```java",
            "```csharp",
            "```c#",
            "```",
        ):
            if text.startswith(fence):
                text = text[len(fence):].lstrip("\n")
                break
        if text.endswith("```"):
            text = text[:-3].rstrip("\n")
        return text.strip()
