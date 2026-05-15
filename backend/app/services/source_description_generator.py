"""
Source Description Generator Service.

Generates a detailed plain-English, Markdown-formatted description directly
from the original Pick Basic source code of a migration job — analogous to
DescriptionGenerator (which works from the approved YAML).

Behaviour:
- Uses the same LLM provider/model that was configured on the job (falls back
  to the default client if unavailable).
- Caches the result in the ``source_descriptions`` table so repeated downloads
  do not trigger additional LLM calls.
- If a description already exists for the given job, it is returned immediately
  unless ``force_regenerate=True``.
- The only prerequisite is that the job has source code stored — there is no
  requirement for an approved YAML or any particular job state.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import LLMProvider, AuditAction
from app.llm.llm_router import get_llm_client, get_default_llm_client
from app.llm.prompts import build_pickbasic_description_prompt
from app.models.job import MigrationJob
from app.models.source_description import SourceDescription
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

# Maximum tokens to request from the LLM — descriptions can be very long
DESCRIPTION_MAX_TOKENS = 32_000
# Temperature kept low for factual/analytical content
DESCRIPTION_TEMPERATURE = 0.2


class SourceDescriptionGenerator:
    """
    Generates and caches a detailed plain-English description of a migration
    job's Pick Basic source code.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_description(
        self,
        db: Session,
        job_id: int,
        performed_by: str,
        force_regenerate: bool = False,
    ) -> SourceDescription:
        """
        Generate (or return a cached) plain-English description for the
        Pick Basic source code of *job_id*.

        Args:
            db: SQLAlchemy database session.
            job_id: The migration job whose source code we are documenting.
            performed_by: Username of the requesting user (stored for audit).
            force_regenerate: When True, always regenerate even if a cached
                              description already exists.

        Returns:
            The :class:`SourceDescription` ORM record (new or existing).

        Raises:
            HTTPException 404: Job not found.
            HTTPException 400: Job has no source code.
            HTTPException 502: LLM call failed.
        """
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found.",
            )

        if not job.original_source_code or not job.original_source_code.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No Pick Basic source code found for this job. "
                    "Source code must be uploaded before generating a description."
                ),
            )

        # Return cached description if available and not forcing regeneration
        if not force_regenerate:
            existing = self._get_existing(db, job_id)
            if existing:
                logger.info(
                    "Returning cached source description id=%s for job_id=%s",
                    existing.id,
                    job_id,
                )
                return existing

        # Determine which LLM client to use
        llm_client = self._resolve_llm_client(job)
        provider_name = self._resolve_provider_name(job)
        model_name = job.yaml_llm_model or getattr(llm_client, "model", None)

        # Build prompt
        prompt = build_pickbasic_description_prompt(
            source_code=job.original_source_code,
            source_filename=job.source_filename or "unknown.bp",
        )

        # Call the LLM
        logger.info(
            "Generating source description for job_id=%s using provider=%s model=%s",
            job_id,
            provider_name,
            model_name,
        )
        try:
            result = llm_client.generate_with_retry(
                prompt=prompt,
                max_retries=2,
                temperature=DESCRIPTION_TEMPERATURE,
                max_output_tokens=DESCRIPTION_MAX_TOKENS,
            )
        except Exception as exc:
            logger.error(
                "LLM call failed for source description generation job_id=%s: %s",
                job_id,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM call failed while generating source description: {exc}",
            ) from exc

        description_text = result.get("text", "").strip()
        if not description_text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM returned an empty description. Please try again.",
            )

        # Persist — upsert pattern: delete old record if present, insert new
        self._delete_existing(db, job_id)

        record = SourceDescription(
            job_id=job_id,
            description_text=description_text,
            llm_provider=provider_name,
            llm_model=model_name,
            generated_by=performed_by,
            generated_at=datetime.now(),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Audit
        AuditService.log_source_description_generated(
            db=db,
            job_id=job_id,
            performed_by=performed_by,
            llm_model=model_name,
        )

        logger.info(
            "Source description generated and saved: id=%s job_id=%s chars=%s",
            record.id,
            job_id,
            len(description_text),
        )
        return record

    def get_existing_description(
        self,
        db: Session,
        job_id: int,
    ) -> Optional[SourceDescription]:
        """
        Return the cached source description for *job_id* if one exists,
        else None. Does NOT trigger any LLM call.
        """
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            return None
        return self._get_existing(db, job_id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_existing(db: Session, job_id: int) -> Optional[SourceDescription]:
        """Return an existing cached description record, if present."""
        return (
            db.query(SourceDescription)
            .filter(SourceDescription.job_id == job_id)
            .order_by(SourceDescription.generated_at.desc())
            .first()
        )

    @staticmethod
    def _delete_existing(db: Session, job_id: int) -> None:
        """Remove any existing source description records for this job."""
        db.query(SourceDescription).filter(
            SourceDescription.job_id == job_id,
        ).delete(synchronize_session=False)

    @staticmethod
    def _resolve_llm_client(job: MigrationJob):
        """
        Return the LLM client configured on the job.
        Falls back to the default client if the provider is not stored.
        """
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
        """Return the LLMProvider enum value stored on the job, or None."""
        return job.yaml_llm_provider
