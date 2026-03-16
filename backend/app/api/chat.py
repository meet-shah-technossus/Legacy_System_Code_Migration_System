"""
Chat API — AI assistant endpoint.
Provides a conversational interface backed by the OpenAI LLM,
optionally enriched with job context (YAML schema, code, state).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.config import settings
from app.llm.openai_client import get_openai_client
from app.models.job import MigrationJob
from app.models.yaml_version import YAMLVersion
from app.core.exceptions import LLMServiceException, ConfigurationException
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Schemas ──────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class LineCommentContext(BaseModel):
    """A single inline line comment attached by the user to provide code context."""
    line_number: int
    text: str           # The user's typed annotation / question about this line
    code_line: Optional[str] = None  # The actual source code at this line
    code_type: Optional[str] = None  # 'yaml' or 'generated_code'


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    job_id: Optional[int] = None
    performed_by: str = "user"
    line_comments: Optional[List[LineCommentContext]] = None


class ChatResponse(BaseModel):
    reply: str
    model: str

# ─── System prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert AI assistant for a legacy code migration platform called **Legacy Migration Studio**.

You help engineers understand, review, and migrate **Pick Basic** (Universe BASIC / D3 BASIC) legacy code to modern programming languages such as Python, TypeScript, Java, and C#.

Your expertise includes:
- Pick Basic / UniVerse BASIC syntax, patterns, and idioms
- YAML-based intermediate schema representation for code analysis
- Business logic extraction and documentation from legacy systems
- Migration strategies, common pitfalls, and best practices
- Python, TypeScript, Java, C# idiomatic code
- Code review, quality assessment, and bug identification

## Response guidelines
- Be precise, helpful, and concise
- Use markdown formatting: **bold**, `inline code`, and fenced code blocks (```language ... ```)
- When referencing code from the job context, quote the relevant section
- If you don't know something with certainty, say so clearly
- Keep responses focused — if a question is broad, ask for clarification
- **When the user has pinned specific code lines (via inline comments), always answer directly about that code. Never ask "what code are you referring to?" when inline line references have been provided.**
"""

# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    """
    AI assistant chat endpoint.

    Accepts a conversation history and an optional job_id.
    When job_id is supplied the assistant receives the job's state,
    source filename, YAML version, and target language as context.
    """
    # ── Get LLM client ────────────────────────────────────────────────────────
    try:
        llm = get_openai_client()
    except (ConfigurationException, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM service unavailable: {str(e)}",
        )

    # ── Build system message with optional job context ─────────────────────────
    system_content = _SYSTEM_PROMPT

    if request.job_id:
        job: Optional[MigrationJob] = (
            db.query(MigrationJob).filter(MigrationJob.id == request.job_id).first()
        )
        if job:
            job_type_label = (
                "Job 1 — Pick Basic → YAML"
                if job.job_type and job.job_type.value == "YAML_CONVERSION"
                else "Direct Conversion — Pick Basic → Code (no intermediate YAML)"
                if job.job_type and job.job_type.value == "DIRECT_CONVERSION"
                else "Job 2 — YAML → Code"
            )
            ctx_lines: List[str] = [
                "\n\n---\n## Active Job Context",
                f"- **Job ID**: #{job.id}",
                f"- **Name**: {job.job_name or 'Unnamed'}",
                f"- **Type**: {job_type_label}",
                f"- **State**: {job.current_state.value if job.current_state else 'UNKNOWN'}",
                f"- **Source file**: {job.source_filename or 'N/A'}",
            ]
            if job.target_language:
                ctx_lines.append(f"- **Target language**: {job.target_language.value}")
            if job.description:
                ctx_lines.append(f"- **Description**: {job.description}")

            # Include latest YAML (truncated)
            try:
                yaml_ver: Optional[YAMLVersion] = (
                    db.query(YAMLVersion)
                    .filter(YAMLVersion.job_id == request.job_id, YAMLVersion.is_valid == True)
                    .order_by(YAMLVersion.version_number.desc())
                    .first()
                )
                if yaml_ver and yaml_ver.yaml_content:
                    # Truncate to keep prompt within token budget (~2 000 chars)
                    yaml_snippet = yaml_ver.yaml_content[:2000]
                    ellipsis = "\n# ... (truncated)" if len(yaml_ver.yaml_content) > 2000 else ""
                    ctx_lines.append(
                        f"\n### Latest YAML schema (v{yaml_ver.version_number})\n"
                        f"```yaml\n{yaml_snippet}{ellipsis}\n```"
                    )
            except Exception as yaml_err:
                logger.debug(f"Could not fetch YAML for chat context: {yaml_err}")

            system_content += "\n".join(ctx_lines)

    # ── Inject inline line comment context ────────────────────────────────────
    # These are the chips the user attached in the editor before asking their
    # question. Each entry includes both the actual code line and the user's
    # annotation so the LLM has full context to answer without guessing.
    if request.line_comments:
        lc_lines: List[str] = [
            "\n\n---\n## Code Lines Referenced by the User",
            "The user pinned the following lines from the code editor. "
            "Their question refers specifically to this code:",
        ]
        for lc in request.line_comments:
            artifact = f" ({lc.code_type})" if lc.code_type else ""
            lc_lines.append(f"\n### Line {lc.line_number}{artifact}")
            if lc.code_line:
                lc_lines.append(f"```\n{lc.code_line}\n```")
            lc_lines.append(f"**User's annotation:** {lc.text}")
        lc_lines.append(
            "\nAnswer the user's question **using the code shown above** as the "
            "primary reference. Do not ask for clarification about which code they "
            "mean — it has been provided above."
        )
        system_content += "\n".join(lc_lines)

    # ── Compose messages list ─────────────────────────────────────────────────
    messages: List[dict] = [{"role": "system", "content": system_content}]
    for msg in request.messages:
        if msg.role in ("user", "assistant"):
            messages.append({"role": msg.role, "content": msg.content})

    # ── Call OpenAI ───────────────────────────────────────────────────────────
    try:
        response = llm.client.chat.completions.create(
            model=llm.model_name,
            messages=messages,
            temperature=0.4,
            max_completion_tokens=1024,
        )
        reply = response.choices[0].message.content or ""
        if not reply.strip():
            raise LLMServiceException("Empty response from LLM", model_name=llm.model_name)

        return ChatResponse(reply=reply, model=llm.model_name)

    except LLMServiceException as e:
        logger.error(f"LLM service error in chat: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected error in chat endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat error: {str(e)}",
        )
