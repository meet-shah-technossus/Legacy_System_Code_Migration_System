import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { codeApi } from '../services/codeApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import type { CodeReviewSubmit } from '../types';

export const CODE_REVIEW_KEYS = {
  all: (jobId: number) => ['code-reviews', jobId] as const,
  list: (jobId: number) => [...CODE_REVIEW_KEYS.all(jobId), 'list'] as const,
};

/**
 * Fetch all code reviews for a job
 * Shows the history of accept/reject decisions for generated code
 */
export function useCodeReviews(jobId: number) {
  return useQuery({
    queryKey: CODE_REVIEW_KEYS.list(jobId),
    queryFn: () => codeApi.getReviews(jobId),
    enabled: !!jobId,
  });
}

/**
 * Submit a code review decision
 * - CODE_APPROVE: Accept the code and transition to CODE_ACCEPTED → COMPLETED
 * - CODE_REJECT_REGENERATE: Reject and trigger LLM regeneration with feedback
 */
export function useSubmitCodeReview(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CodeReviewSubmit) => codeApi.submitReview(jobId, data),
    onSuccess: (review) => {
      // Invalidate all related queries
      qc.invalidateQueries({ queryKey: CODE_REVIEW_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.all });

      const successMsg =
        review.decision === 'CODE_APPROVE'
          ? 'Code approved ✓ — Job completed!'
          : 'Code rejected — Regenerating with feedback...';
      toast.success(successMsg);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
