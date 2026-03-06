"""
Code generation service for translating YAML to modern code.
Phase 6a: Minimal working code generator using LLM.
"""

from typing import Optional, Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime
import json
import logging

from app.models.job import MigrationJob
from app.models.yaml_version import YAMLVersion
from app.models.code import GeneratedCode
from app.core.enums import JobState, TargetLanguage, JobType
from app.llm.openai_client import OpenAIClient
from app.llm.prompts import build_code_generation_prompt, build_strict_code_generation_prompt, build_syntax_error_fix_prompt
from app.services.code_output_parser import CodeOutputParser
from app.services.job_manager import JobManager
from app.services.audit_service import AuditService
from app.services.metrics_service import MetricsService
from app.services.syntax_validator import SyntaxValidator, ValidationResult
from app.mapping.base_mapper import MappingLoader
from app.mapping.python_mapper import PythonMapper  # Import to register

logger = logging.getLogger(__name__)


class CodeGenerationResult:
    """Result of code generation attempt."""

    def __init__(
        self,
        success: bool,
        generated_code: Optional[str] = None,
        error_message: Optional[str] = None,
        llm_metadata: Optional[Dict[str, Any]] = None
    ):
        self.success = success
        self.generated_code = generated_code
        self.error_message = error_message
        self.llm_metadata = llm_metadata or {}
        self.timestamp = datetime.now()


class CodeGenerationService:
    """
    Service for generating modern code from approved YAML.
    Phase 6a: Minimal working implementation.
    """

    def __init__(self):
        self.llm_client = OpenAIClient()
        self.job_manager = JobManager()

    def generate_code_for_job(
        self,
        db: Session,
        job_id: int,
        target_language: str,
        performed_by: str,
        use_llm: bool = True
    ) -> GeneratedCode:
        """
        Generate modern code from approved YAML.
        Phase 6a: Basic LLM-based generation.

        Args:
            db: Database session
            job_id: Migration job ID
            target_language: Target language (Python, TypeScript, etc.)
            performed_by: User/system performing the action
            use_llm: Whether to use LLM (True) or pure mapper (False)

        Returns:
            Created GeneratedCode object

        Raises:
            HTTPException: If job not found or in invalid state
        """
        # Get the job
        job = self.job_manager.get_job_or_404(db, job_id)

        # Validate job state - must be APPROVED or APPROVED_WITH_COMMENTS
        allowed_states = [
            JobState.APPROVED,
            JobState.APPROVED_WITH_COMMENTS,
            JobState.YAML_APPROVED_QUEUED,
            JobState.CREATED,
            JobState.CODE_REGENERATE_REQUESTED,
        ]
        if job.current_state not in allowed_states:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot generate code. Job is in state {job.current_state.value}. "
                    f"Must be in one of: {[s.value for s in allowed_states]}."
                )
            )

        # For Job 2 (CODE_CONVERSION), fetch YAML from parent job
        yaml_job_id = job_id
        if job.job_type == JobType.CODE_CONVERSION and job.parent_job_id:
            yaml_job_id = job.parent_job_id
        yaml_version = self._get_approved_yaml_version(db, yaml_job_id)

        if not yaml_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No approved YAML version found for job {job_id}"
            )

        logger.info(f"Starting code generation for job {job_id}, target: {target_language}")

        # Generate code (track timing)
        start_time = datetime.now()
        if use_llm:
            result = self._generate_with_llm(
                yaml_content=yaml_version.yaml_content,
                target_language=target_language
            )
        else:
            result = self._generate_with_mapper(
                yaml_content=yaml_version.yaml_content,
                target_language=target_language
            )
        generation_time = (datetime.now() - start_time).total_seconds()

        if not result.success:
            # Record failure metrics
            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.CODE_GENERATION_FAILURE,
                job_id=job_id,
                tags={"target_language": target_language, "use_llm": str(use_llm)}
            )

            MetricsService.record_counter(
                db=db,
                metric_name=MetricsService.ERROR_COUNT,
                job_id=job_id,
                tags={"error_type": "code_generation"}
            )

            # Log code generation failure
            AuditService.log_code_generation_failed(
                db=db,
                job_id=job_id,
                target_language=target_language,
                error_message=result.error_message or "Unknown error",
                llm_model=result.llm_metadata.get("model")
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Code generation failed: {result.error_message}"
            )

        # Phase 3: assign version_number and set is_current
        max_ver = db.query(func.max(GeneratedCode.version_number)).filter(
            GeneratedCode.job_id == job_id
        ).scalar() or 0
        new_version_number = max_ver + 1
        db.query(GeneratedCode).filter(
            GeneratedCode.job_id == job_id, GeneratedCode.is_current.is_(True)
        ).update({"is_current": False}, synchronize_session="fetch")

        # Create GeneratedCode record
        generated_code = GeneratedCode(
            job_id=job_id,
            yaml_version_id=yaml_version.id,
            code_content=result.generated_code,
            target_language=target_language.upper(),
            generation_prompt=result.llm_metadata.get("prompt"),
            llm_model_used=result.llm_metadata.get("model"),
            llm_tokens_used=result.llm_metadata.get("tokens_used"),
            estimated_lines_of_code=len(result.generated_code.split("\n")),
            generated_at=datetime.now(),
            # Phase 1 (Structured Output) metadata
            sections_covered=json.dumps(result.llm_metadata.get("sections_covered") or []),
            external_stubs_included=json.dumps(result.llm_metadata.get("external_stubs_included") or []),
            generation_warnings=json.dumps(result.llm_metadata.get("generation_warnings") or []),
            llm_envelope_used=result.llm_metadata.get("envelope_used"),
            # Phase 2 (Language-Specific Validation) metadata
            validation_tool_available=result.llm_metadata.get("validation_tool_available"),
            validation_errors=json.dumps(result.llm_metadata.get("validation_errors") or []),
            # Phase 3 (Code Version Control)
            version_number=new_version_number,
            is_current=True,
        )

        db.add(generated_code)

        # Update job state to CODE_GENERATED
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_GENERATED,
            performed_by=performed_by,
            reason=f"Code generated successfully for {target_language}"
        )

        # Immediately move to CODE_UNDER_REVIEW — code needs human sign-off
        self.job_manager.transition_state(
            db=db,
            job_id=job_id,
            new_state=JobState.CODE_UNDER_REVIEW,
            performed_by="SYSTEM",
            reason="Awaiting reviewer acceptance of generated code"
        )

        # Audit log
        AuditService.log_code_generated(
            db=db,
            job_id=job_id,
            code_id=generated_code.id,
            target_language=target_language,
            llm_model=result.llm_metadata.get("model"),
            generation_time=generation_time
        )

        # Record success metrics
        MetricsService.record_counter(
            db=db,
            metric_name=MetricsService.CODE_GENERATION_SUCCESS,
            job_id=job_id,
            tags={"target_language": target_language, "use_llm": str(use_llm)}
        )

        MetricsService.record_timer(
            db=db,
            metric_name=MetricsService.CODE_GENERATION_TIME,
            duration_seconds=generation_time,
            job_id=job_id,
            tags={"target_language": target_language, "success": "true"}
        )

        # Track code size
        code_size = len(result.generated_code.encode('utf-8'))
        line_count = generated_code.estimated_lines_of_code

        MetricsService.record_gauge(
            db=db,
            metric_name=MetricsService.CODE_SIZE,
            value=code_size,
            unit="bytes",
            job_id=job_id,
            tags={"target_language": target_language}
        )

        MetricsService.record_gauge(
            db=db,
            metric_name=MetricsService.CODE_LINES,
            value=line_count,
            unit="lines",
            job_id=job_id,
            tags={"target_language": target_language}
        )

        db.commit()
        db.refresh(generated_code)

        logger.info(f"Code generation successful for job {job_id}, {generated_code.estimated_lines_of_code} lines")

        return generated_code

    def _get_approved_yaml_version(self, db: Session, job_id: int) -> Optional[YAMLVersion]:
        """Get the approved YAML version for a job."""
        return db.query(YAMLVersion).filter(
            YAMLVersion.job_id == job_id,
            YAMLVersion.is_approved == True,
            YAMLVersion.is_valid == True
        ).order_by(YAMLVersion.generated_at.desc()).first()

    def _generate_with_llm(
        self,
        yaml_content: str,
        target_language: str
    ) -> CodeGenerationResult:
        """
        Generate code using LLM.
        Phase 6a: Direct LLM generation from YAML.

        Args:
            yaml_content: YAML to translate
            target_language: Target language

        Returns:
            CodeGenerationResult
        """
        try:
            # Phase 3: use strict YAML-aware prompt with conditional section directives
            prompt = build_strict_code_generation_prompt(
                yaml_content=yaml_content,
                target_language=target_language,
            )

            # Call LLM
            response = self.llm_client.generate_content(prompt)

            if not response or not response.get("text"):
                return CodeGenerationResult(
                    success=False,
                    error_message="LLM returned empty response"
                )

            # Phase 1 (Structured Output): parse envelope; falls back to legacy extraction
            parsed = CodeOutputParser.parse(response["text"].strip(), target_language)
            code = parsed.code

            # Phase 2 + 4: detailed multi-language validation + one-shot auto-retry
            val: ValidationResult = SyntaxValidator.validate_detailed(code, target_language)
            syntax_retry_attempted = False

            if not val.valid:
                logger.warning(
                    "Syntax error in initial generation for %s — retrying once: %s",
                    target_language, val.error_message
                )
                syntax_retry_attempted = True
                fix_prompt = build_syntax_error_fix_prompt(
                    yaml_content=yaml_content,
                    target_language=target_language,
                    broken_code=code,
                    syntax_error=val.error_message or "",
                )
                retry_response = self.llm_client.generate_content(fix_prompt)
                if retry_response and retry_response.get("text"):
                    retry_parsed = CodeOutputParser.parse(
                        retry_response["text"].strip(), target_language
                    )
                    retry_code = retry_parsed.code
                    retry_val = SyntaxValidator.validate_detailed(retry_code, target_language)
                    if retry_val.valid:
                        logger.info("Syntax-fix retry succeeded for %s", target_language)
                    else:
                        logger.warning(
                            "Syntax-fix retry still has errors (%s) — using anyway",
                            retry_val.error_message
                        )
                    # Use retry code regardless — it's at least closer to correct
                    code = retry_code
                    val = retry_val

            return CodeGenerationResult(
                success=True,
                generated_code=code,
                llm_metadata={
                    "model": response.get("model"),
                    "prompt": prompt,
                    "prompt_length": len(prompt),
                    "response_length": len(code),
                    "tokens_used": response.get("usage", {}).get("total_tokens"),
                    "syntax_validated": val.valid,
                    "syntax_retry_attempted": syntax_retry_attempted,
                    # Phase 1 (Structured Output) metadata
                    "sections_covered": parsed.sections_covered,
                    "external_stubs_included": parsed.external_stubs_included,
                    "generation_warnings": parsed.warnings,
                    "envelope_used": parsed.envelope_used,
                    # Phase 2 (Language-Specific Validation) metadata
                    "validation_tool_available": val.tool_available,
                    "validation_errors": val.errors,
                }
            )

        except Exception as e:
            logger.error(f"LLM code generation failed: {str(e)}")
            return CodeGenerationResult(
                success=False,
                error_message=str(e)
            )

    def _generate_with_mapper(
        self,
        yaml_content: str,
        target_language: str
    ) -> CodeGenerationResult:
        """
        Generate code using pure mapper (no LLM).
        Phase 6a: Basic mapper-based generation.

        Args:
            yaml_content: YAML to translate
            target_language: Target language

        Returns:
            CodeGenerationResult
        """
        try:
            # Load mapper
            mapper = MappingLoader.get_mapper(target_language)

            # Parse YAML
            from app.schemas.yaml_schema import PickBasicYAMLSchema
            import yaml

            yaml_data = yaml.safe_load(yaml_content)
            parsed_yaml = PickBasicYAMLSchema(**yaml_data)

            # Generate code using mapper
            imports = mapper.generate_imports(parsed_yaml)
            structure = mapper.generate_class_structure(parsed_yaml)

            code = f"{imports}\n\n{structure}"

            return CodeGenerationResult(
                success=True,
                generated_code=code,
                llm_metadata={
                    "model": f"mapper_{target_language.lower()}",
                    "method": "pure_mapper"
                }
            )

        except Exception as e:
            logger.error(f"Mapper code generation failed: {str(e)}")
            return CodeGenerationResult(
                success=False,
                error_message=str(e)
            )

    def _clean_code_output(self, code: str, target_language: str) -> str:
        """
        Clean up LLM output to remove markdown code blocks.

        Args:
            code: Raw LLM output
            target_language: Target language

        Returns:
            Cleaned code
        """
        # Remove markdown code blocks
        lang_lower = target_language.lower()

        # Remove opening code block
        if code.startswith(f"```{lang_lower}"):
            code = code[len(f"```{lang_lower}"):].lstrip("\n")
        elif code.startswith("```python"):
            code = code[len("```python"):].lstrip("\n")
        elif code.startswith("```"):
            code = code[3:].lstrip("\n")

        # Remove closing code block
        if code.endswith("```"):
            code = code[:-3].rstrip("\n")

        return code.strip()

    def get_generated_code(
        self,
        db: Session,
        job_id: int,
        code_id: Optional[int] = None
    ) -> Optional[GeneratedCode]:
        """
        Get generated code for a job.

        Args:
            db: Database session
            job_id: Migration job ID
            code_id: Specific code ID (optional, gets latest if not provided)

        Returns:
            GeneratedCode object or None
        """
        query = db.query(GeneratedCode).filter(GeneratedCode.job_id == job_id)

        if code_id:
            return query.filter(GeneratedCode.id == code_id).first()
        else:
            return query.order_by(GeneratedCode.generated_at.desc()).first()
