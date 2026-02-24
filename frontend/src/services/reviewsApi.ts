import api from './api';
import type {
  Review,
  ReviewSummary,
  ReviewSubmit,
  ReviewStatistics,
} from '../types';

export const reviewsApi = {
  /** Submit a review for a YAML version */
  submit: (jobId: number, data: ReviewSubmit, performedBy?: string): Promise<Review> =>
    api
      .post<Review>(`/jobs/${jobId}/reviews`, data, {
        params: performedBy ? { performed_by: performedBy } : {},
      })
      .then((r) => r.data),

  /** List all reviews for a job */
  list: (jobId: number, skip = 0, limit = 100): Promise<ReviewSummary[]> =>
    api
      .get<ReviewSummary[]>(`/jobs/${jobId}/reviews`, { params: { skip, limit } })
      .then((r) => r.data),

  /** Get a specific review by ID */
  get: (jobId: number, reviewId: number): Promise<Review> =>
    api.get<Review>(`/jobs/${jobId}/reviews/${reviewId}`).then((r) => r.data),

  /** Get the latest review for a job */
  getLatest: (jobId: number): Promise<Review | null> =>
    api.get<Review | null>(`/jobs/${jobId}/reviews/latest`).then((r) => r.data),

  /** Get reviews for a specific YAML version */
  listForYamlVersion: (jobId: number, yamlVersionId: number): Promise<ReviewSummary[]> =>
    api
      .get<ReviewSummary[]>(`/jobs/${jobId}/yaml/versions/${yamlVersionId}/reviews`)
      .then((r) => r.data),

  /** Get review statistics for a job */
  statistics: (jobId: number): Promise<ReviewStatistics> =>
    api.get<ReviewStatistics>(`/jobs/${jobId}/reviews/statistics`).then((r) => r.data),

  /** Request YAML regeneration with feedback context */
  requestRegeneration: (
    jobId: number,
    data: { include_previous_comments?: boolean; additional_instructions?: string },
    performedBy?: string
  ): Promise<Record<string, unknown>> =>
    api
      .post<Record<string, unknown>>(`/jobs/${jobId}/yaml/regenerate`, data, {
        params: performedBy ? { performed_by: performedBy } : {},
      })
      .then((r) => r.data),
};
