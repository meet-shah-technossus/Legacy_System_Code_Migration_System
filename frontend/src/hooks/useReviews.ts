import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { reviewsApi } from '../services/reviewsApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import { YAML_KEYS } from './useYaml';
import type { ReviewSubmit } from '../types';

export const REVIEW_KEYS = {
  all: (jobId: number) => ['reviews', jobId] as const,
  list: (jobId: number) => [...REVIEW_KEYS.all(jobId), 'list'] as const,
  detail: (jobId: number, reviewId: number) =>
    [...REVIEW_KEYS.all(jobId), 'detail', reviewId] as const,
  latest: (jobId: number) => [...REVIEW_KEYS.all(jobId), 'latest'] as const,
  forVersion: (jobId: number, yamlVersionId: number) =>
    [...REVIEW_KEYS.all(jobId), 'version', yamlVersionId] as const,
  statistics: (jobId: number) => [...REVIEW_KEYS.all(jobId), 'statistics'] as const,
};

/** List all reviews for a job */
export function useReviews(jobId: number) {
  return useQuery({
    queryKey: REVIEW_KEYS.list(jobId),
    queryFn: () => reviewsApi.list(jobId),
    enabled: !!jobId,
  });
}

/** Get a specific review */
export function useReview(jobId: number, reviewId: number) {
  return useQuery({
    queryKey: REVIEW_KEYS.detail(jobId, reviewId),
    queryFn: () => reviewsApi.get(jobId, reviewId),
    enabled: !!jobId && !!reviewId,
  });
}

/** Get the latest review for a job */
export function useLatestReview(jobId: number) {
  return useQuery({
    queryKey: REVIEW_KEYS.latest(jobId),
    queryFn: () => reviewsApi.getLatest(jobId),
    enabled: !!jobId,
    retry: false,
  });
}

/** Get reviews for a specific YAML version */
export function useReviewsForYAMLVersion(jobId: number, yamlVersionId: number) {
  return useQuery({
    queryKey: REVIEW_KEYS.forVersion(jobId, yamlVersionId),
    queryFn: () => reviewsApi.listForYamlVersion(jobId, yamlVersionId),
    enabled: !!jobId && !!yamlVersionId,
  });
}

/** Get review statistics for a job */
export function useReviewStatistics(jobId: number) {
  return useQuery({
    queryKey: REVIEW_KEYS.statistics(jobId),
    queryFn: () => reviewsApi.statistics(jobId),
    enabled: !!jobId,
  });
}

/** Submit a new review */
export function useSubmitReview(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      performedBy,
    }: {
      data: ReviewSubmit;
      performedBy?: string;
    }) => reviewsApi.submit(jobId, data, performedBy),
    onSuccess: (review) => {
      qc.invalidateQueries({ queryKey: REVIEW_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      const decisionMsg =
        review.decision === 'APPROVE'
          ? 'YAML approved ✓'
          : review.decision === 'APPROVE_WITH_COMMENTS'
          ? 'Approved with comments'
          : 'Review submitted — regeneration requested';
      toast.success(decisionMsg);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
