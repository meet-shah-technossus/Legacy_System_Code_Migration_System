"""
LineComment Service.
Manages line-level inline comments made by reviewers on YAML or generated code.
These comments are bundled into the LLM regeneration prompt for targeted improvements.
"""

from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException, status

from app.models.line_comment import LineComment
from app.schemas.job import LineCommentCreate
from app.services.audit_service import AuditService
from app.services.job_manager import JobManager


class LineCommentService:
    """Service for managing line-level reviewer comments."""

    @staticmethod
    def add_line_comment(
        db: Session,
        job_id: int,
        comment_data: LineCommentCreate
    ) -> LineComment:
        """
        Save a line-level comment pinned to a specific line number.

        Args:
            db: Database session
            job_id: The job being reviewed
            comment_data: Line comment payload

        Returns:
            Created LineComment instance
        """
        # Ensure job exists
        JobManager.get_job_or_404(db, job_id)

        comment = LineComment(
            job_id=job_id,
            line_number=comment_data.line_number,
            code_type=comment_data.code_type,
            comment=comment_data.comment,
            reviewer=comment_data.reviewer,
            review_round=comment_data.review_round,
            included_in_regeneration=False
        )

        db.add(comment)
        db.commit()
        db.refresh(comment)

        AuditService.log_line_comment_added(
            db=db,
            job_id=job_id,
            line_number=comment_data.line_number,
            code_type=comment_data.code_type,
            added_by=comment_data.reviewer
        )

        return comment

    @staticmethod
    def get_line_comments(
        db: Session,
        job_id: int,
        code_type: Optional[str] = None,
        review_round: Optional[int] = None
    ) -> List[LineComment]:
        """
        Fetch all line comments for a job, with optional filters.

        Args:
            db: Database session
            job_id: The job ID
            code_type: Filter by 'yaml' or 'generated_code'
            review_round: Filter by review round number

        Returns:
            List of LineComment instances ordered by line number
        """
        JobManager.get_job_or_404(db, job_id)

        query = db.query(LineComment).filter(LineComment.job_id == job_id)

        if code_type:
            query = query.filter(LineComment.code_type == code_type)
        if review_round is not None:
            query = query.filter(LineComment.review_round == review_round)

        return query.order_by(LineComment.line_number.asc()).all()

    @staticmethod
    def mark_comments_included(
        db: Session,
        job_id: int,
        review_round: Optional[int] = None
    ) -> int:
        """
        Mark all (or round-specific) line comments as included in a regeneration request.
        Called when a reviewer submits a rejection \u2014 before LLM regeneration starts.

        Args:
            db: Database session
            job_id: The job ID
            review_round: If provided, only mark comments for this round

        Returns:
            Number of comments marked
        """
        query = db.query(LineComment).filter(
            LineComment.job_id == job_id,
            LineComment.included_in_regeneration == False  # noqa: E712
        )
        if review_round is not None:
            query = query.filter(LineComment.review_round == review_round)

        comments = query.all()
        for comment in comments:
            comment.included_in_regeneration = True

        db.commit()
        return len(comments)

    @staticmethod
    def build_line_comment_context(
        db: Session,
        job_id: int,
        code_type: str = "yaml"
    ) -> str:
        """
        Build a formatted string of all line comments for a job and code type.
        Used to inject specific feedback into the LLM regeneration prompt.

        Returns:
            Multi-line string formatted for LLM consumption
        """
        comments = LineCommentService.get_line_comments(db, job_id, code_type=code_type)
        if not comments:
            return ""

        lines = ["\n=== INLINE LINE COMMENTS FROM REVIEWER ==="]
        for c in comments:
            round_tag = f"[Round {c.review_round}]" if c.review_round > 1 else ""
            lines.append(f"  Line {c.line_number} {round_tag}: {c.comment}")
        lines.append("===========================================\n")
        return "\n".join(lines)
