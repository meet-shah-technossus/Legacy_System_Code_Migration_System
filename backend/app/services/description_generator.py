"""
Description Generator Service.

Generates a detailed plain-English, Markdown-formatted description of an
approved YAML version for a migration job.

Behaviour:
- Uses the same LLM provider/model that produced the YAML (falls back to the
  default OpenAI client if that information is not stored on the job).
- Caches the result in the ``yaml_descriptions`` table so repeated downloads
  do not trigger additional LLM calls.
- If a description already exists for the given job's approved YAML version,
  it is returned immediately unless ``force_regenerate=True``.
- Works for both new jobs and existing approved YAMLs — there is no
  dependency on job state beyond having an approved YAML version.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import LLMProvider, AuditAction
from app.llm.llm_router import get_llm_client, get_default_llm_client
from app.llm.prompts import build_yaml_description_prompt
from app.models.job import MigrationJob
from app.models.yaml_version import YAMLVersion
from app.models.yaml_description import YAMLDescription
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

# Maximum tokens to request from the LLM — descriptions can be very long
DESCRIPTION_MAX_TOKENS = 32_000
# Temperature kept low for factual/analytical content
DESCRIPTION_TEMPERATURE = 0.2


class DescriptionGenerator:
    """
    Generates and caches a detailed plain-English description of an approved
    YAML version.
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
    ) -> YAMLDescription:
        """
        Generate (or return a cached) plain-English description for the
        approved YAML version of *job_id*.

        Args:
            db: SQLAlchemy database session.
            job_id: The migration job whose approved YAML we are documenting.
            performed_by: Username of the requesting user (stored for audit).
            force_regenerate: When True, always regenerate even if a cached
                              description already exists.

        Returns:
            The :class:`YAMLDescription` ORM record (new or existing).

        Raises:
            HTTPException 404: Job not found.
            HTTPException 400: Job has no approved YAML version.
            HTTPException 502: LLM call failed.
        """
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found.",
            )

        # Locate the approved YAML version for this job
        approved_yaml = self._get_approved_yaml(db, job_id)
        if not approved_yaml:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "No approved YAML version found for this job. "
                    "The YAML must be approved before generating a description."
                ),
            )

        # Return cached description if available and not forcing regeneration
        if not force_regenerate:
            existing = self._get_existing_description(db, job_id, approved_yaml.id)
            if existing:
                logger.info(
                    "Returning cached description id=%s for job_id=%s",
                    existing.id,
                    job_id,
                )
                return existing

        # Determine which LLM client to use
        llm_client = self._resolve_llm_client(job)
        provider_name = self._resolve_provider_name(job)
        model_name = job.yaml_llm_model or getattr(llm_client, "model", None)

        # Build prompt
        prompt = build_yaml_description_prompt(
            raw_yaml=approved_yaml.yaml_content,
            original_source_code=job.original_source_code or "",
            source_filename=job.source_filename or "unknown.bp",
        )

        # Call the LLM
        logger.info(
            "Generating description for job_id=%s using provider=%s model=%s",
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
                "LLM call failed for description generation job_id=%s: %s",
                job_id,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM call failed while generating description: {exc}",
            ) from exc

        description_text = result.get("text", "").strip()
        if not description_text:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM returned an empty description. Please try again.",
            )

        # Persist — upsert pattern: delete old record if present, insert new
        self._delete_existing_description(db, job_id, approved_yaml.id)

        record = YAMLDescription(
            job_id=job_id,
            yaml_version_id=approved_yaml.id,
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
        AuditService.log_description_generated(
            db=db,
            job_id=job_id,
            yaml_version_id=approved_yaml.id,
            performed_by=performed_by,
            llm_model=model_name,
        )

        logger.info(
            "Description generated and saved: id=%s job_id=%s chars=%s",
            record.id,
            job_id,
            len(description_text),
        )
        return record

    def get_existing_description(
        self,
        db: Session,
        job_id: int,
    ) -> Optional[YAMLDescription]:
        """
        Return the cached description for *job_id* if one exists, else None.
        Does NOT trigger any LLM call.
        """
        job = db.query(MigrationJob).filter(MigrationJob.id == job_id).first()
        if not job:
            return None
        approved_yaml = self._get_approved_yaml(db, job_id)
        if not approved_yaml:
            return None
        return self._get_existing_description(db, job_id, approved_yaml.id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_approved_yaml(db: Session, job_id: int) -> Optional[YAMLVersion]:
        """Return the most recent approved YAML version for a job."""
        return (
            db.query(YAMLVersion)
            .filter(
                YAMLVersion.job_id == job_id,
                YAMLVersion.is_approved == True,  # noqa: E712
            )
            .order_by(YAMLVersion.version_number.desc())
            .first()
        )

    @staticmethod
    def _get_existing_description(
        db: Session,
        job_id: int,
        yaml_version_id: int,
    ) -> Optional[YAMLDescription]:
        """Return an existing cached description record, if present."""
        return (
            db.query(YAMLDescription)
            .filter(
                YAMLDescription.job_id == job_id,
                YAMLDescription.yaml_version_id == yaml_version_id,
            )
            .order_by(YAMLDescription.generated_at.desc())
            .first()
        )

    @staticmethod
    def _delete_existing_description(
        db: Session,
        job_id: int,
        yaml_version_id: int,
    ) -> None:
        """Remove any existing description records for this job+version."""
        db.query(YAMLDescription).filter(
            YAMLDescription.job_id == job_id,
            YAMLDescription.yaml_version_id == yaml_version_id,
        ).delete(synchronize_session=False)

    @staticmethod
    def _resolve_llm_client(job: MigrationJob):
        """
        Return the LLM client that was used for YAML generation on this job.
        Falls back to the default (OpenAI) client if the provider is not stored.
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
