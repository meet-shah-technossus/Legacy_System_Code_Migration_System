"""
BRD Generator Service.

Generates a Business Requirements Document (BRD) for a migration job from one
of two independent input sources:

  - ``generation_source='yaml'``        — uses only the approved YAML version.
  - ``generation_source='source_code'`` — uses only the original Pick Basic
                                          source code.

Each source produces a separately stored record so both can coexist for the same
job.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import LLMProvider
from app.llm.llm_router import get_llm_client, get_default_llm_client
from app.llm.prompts import build_brd_from_yaml_prompt, build_brd_from_source_prompt
from app.models.job import MigrationJob
from app.models.yaml_version import YAMLVersion
from app.models.brd import JobBRD
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

BRD_MAX_TOKENS = 32_000
BRD_TEMPERATURE = 0.2

GenerationSource = Literal["yaml", "source_code"]


class BRDGenerator:
    """
    Generates and caches a Business Requirements Document from either the
    approved YAML or the original source code — never both at the same time.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_brd(
        self,
        db: Session,
        job_id: int,
        performed_by: str,
        generation_source: GenerationSource = "yaml",
        force_regenerate: bool = False,
    ) -> JobBRD:
        """
        Generate (or return a cached) BRD for *job_id*.

        Args:
            db: SQLAlchemy database session.
            job_id: The migration job to document.
            performed_by: Username of the requesting user.
            generation_source: ``'yaml'`` to use the approved YAML only;
                               ``'source_code'`` to use the original source code only.
            force_regenerate: When True, always regenerate even if a cached record exists.

        Returns:
            The :class:`JobBRD` ORM record (new or existing).

        Raises:
            HTTPException 404: Job not found.
            HTTPException 400: Required input not available for the chosen source.
            HTTPException 502: LLM call failed.
        """
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found.",
            )

        # ── Validate inputs for the chosen generation source ────────────
        approved_yaml: Optional[YAMLVersion] = None

        if generation_source == "yaml":
            approved_yaml = self._get_approved_yaml(db, job_id)
            if not approved_yaml:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "No approved YAML version found for this job. "
                        "Approve a YAML version before generating a BRD from YAML."
                    ),
                )
        else:  # source_code
            if not job.original_source_code or not job.original_source_code.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "No original source code found for this job. "
                        "Source code must be uploaded before generating a BRD from source."
                    ),
                )

        # ── Return cached record if available ───────────────────────────
        if not force_regenerate:
            existing = self._get_existing_brd(db, job_id, generation_source)
            if existing:
                logger.info(
                    "Returning cached BRD id=%s job_id=%s source=%s",
                    existing.id,
                    job_id,
                    generation_source,
                )
                return existing

        # ── Resolve LLM client ──────────────────────────────────────────
        llm_client = self._resolve_llm_client(job)
        provider_name = self._resolve_provider_name(job)
        model_name = job.yaml_llm_model or getattr(llm_client, "model", None)

        # ── Build prompt based on source ────────────────────────────────
        source_filename = job.source_filename or "unknown.bp"
        if generation_source == "yaml":
            prompt = build_brd_from_yaml_prompt(
                raw_yaml=approved_yaml.yaml_content,  # type: ignore[union-attr]
                source_filename=source_filename,
            )
        else:
            prompt = build_brd_from_source_prompt(
                original_source_code=job.original_source_code,
                source_filename=source_filename,
            )

        # ── Call LLM ────────────────────────────────────────────────────
        logger.info(
            "Generating BRD job_id=%s source=%s provider=%s model=%s",
            job_id,
            generation_source,
            provider_name,
            model_name,
        )
        try:
            result = llm_client.generate_with_retry(
                prompt=prompt,
                max_retries=2,
                temperature=BRD_TEMPERATURE,
                max_output_tokens=BRD_MAX_TOKENS,
            )
        except Exception as exc:
            logger.error("LLM call failed for BRD job_id=%s source=%s: %s", job_id, generation_source, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM call failed while generating BRD: {exc}",
            ) from exc

        brd_text = result.get("text", "").strip()
        if not brd_text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM returned an empty BRD. Please try again.",
            )

        # ── Persist (upsert: delete existing, insert fresh) ────────────
        self._delete_existing_brd(db, job_id, generation_source)

        record = JobBRD(
            job_id=job_id,
            yaml_version_id=approved_yaml.id if approved_yaml else None,
            generation_source=generation_source,
            brd_text=brd_text,
            llm_provider=provider_name,
            llm_model=model_name,
            generated_by=performed_by,
            generated_at=datetime.now(),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Audit
        try:
            AuditService.log_brd_generated(
                db=db,
                job_id=job_id,
                yaml_version_id=approved_yaml.id if approved_yaml else None,
                performed_by=performed_by,
                llm_model=model_name,
            )
        except Exception:
            pass

        logger.info(
            "BRD saved id=%s job_id=%s source=%s chars=%s",
            record.id,
            job_id,
            generation_source,
            len(brd_text),
        )
        return record

    def get_existing_brd(
        self,
        db: Session,
        job_id: int,
        generation_source: GenerationSource = "yaml",
    ) -> Optional[JobBRD]:
        """Return the cached BRD for *job_id*/*generation_source*, or None."""
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            return None
        return self._get_existing_brd(db, job_id, generation_source)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_approved_yaml(db: Session, job_id: int) -> Optional[YAMLVersion]:
        return (
            db.query(YAMLVersion)
            .filter(YAMLVersion.job_id == job_id, YAMLVersion.is_approved == True)  # noqa: E712
            .order_by(YAMLVersion.version_number.desc())
            .first()
        )

    @staticmethod
    def _get_existing_brd(
        db: Session, job_id: int, generation_source: GenerationSource
    ) -> Optional[JobBRD]:
        return (
            db.query(JobBRD)
            .filter(JobBRD.job_id == job_id, JobBRD.generation_source == generation_source)
            .order_by(JobBRD.generated_at.desc())
            .first()
        )

    @staticmethod
    def _delete_existing_brd(
        db: Session, job_id: int, generation_source: GenerationSource
    ) -> None:
        db.query(JobBRD).filter(
            JobBRD.job_id == job_id,
            JobBRD.generation_source == generation_source,
        ).delete(synchronize_session=False)

    @staticmethod
    def _resolve_llm_client(job: MigrationJob):
        provider = job.yaml_llm_provider
        if provider:
            try:
                return get_llm_client(provider)
            except Exception:
                logger.warning(
                    "Could not resolve provider %s for job %s — falling back to default",
                    provider,
                    job.id,
                )
        return get_default_llm_client()

    @staticmethod
    def _resolve_provider_name(job: MigrationJob) -> Optional[LLMProvider]:
        return job.yaml_llm_provider

