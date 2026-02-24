import api from './api';
import type {
  MigrationJob,
  MigrationJobSummary,
  MigrationJobWithSource,
  JobCreate,
  Job2Create,
  JobUpdate,
  JobStateTransition,
  JobStatistics,
  AllowedTransitions,
  ListJobsParams,
  QueuedJob,
  LineComment,
  LineCommentCreate,
  JobType,
} from '../types';

export const jobsApi = {
  /** Create a new migration job */
  create: (data: JobCreate): Promise<MigrationJob> =>
    api.post<MigrationJob>('/jobs/', data).then((r) => r.data),

  /** List all jobs with optional filters */
  list: (params?: ListJobsParams): Promise<MigrationJobSummary[]> =>
    api.get<MigrationJobSummary[]>('/jobs/', { params }).then((r) => r.data),

  /** Get overall job statistics */
  statistics: (): Promise<JobStatistics> =>
    api.get<JobStatistics>('/jobs/statistics').then((r) => r.data),

  /** Get a single job (without source code) */
  get: (jobId: number): Promise<MigrationJob> =>
    api.get<MigrationJob>(`/jobs/${jobId}`).then((r) => r.data),

  /** Get a single job including original source code */
  getWithSource: (jobId: number): Promise<MigrationJobWithSource> =>
    api.get<MigrationJobWithSource>(`/jobs/${jobId}/with-source`).then((r) => r.data),

  /** Update job metadata (name / description) */
  update: (jobId: number, data: JobUpdate): Promise<MigrationJob> =>
    api.patch<MigrationJob>(`/jobs/${jobId}`, data).then((r) => r.data),

  /** Transition job to a new state */
  transition: (jobId: number, data: JobStateTransition): Promise<MigrationJob> =>
    api.post<MigrationJob>(`/jobs/${jobId}/transition`, data).then((r) => r.data),

  /** Get allowed state transitions for a job */
  allowedTransitions: (jobId: number): Promise<AllowedTransitions> =>
    api.get<AllowedTransitions>(`/jobs/${jobId}/allowed-transitions`).then((r) => r.data),

  /** Delete a job and all its related data */
  delete: (jobId: number): Promise<void> =>
    api.delete(`/jobs/${jobId}`).then(() => undefined),

  /** Get state machine workflow info */
  workflowInfo: (jobId: number): Promise<Record<string, unknown>> =>
    api.get<Record<string, unknown>>(`/jobs/${jobId}/workflow`).then((r) => r.data),

  // ─── Two-Job Architecture ──────────────────────────────────────────────────

  /** Get all Job 1s waiting in the queue (state: YAML_APPROVED_QUEUED) */
  getQueuedJobs: (): Promise<QueuedJob[]> =>
    api.get<QueuedJob[]>('/jobs/queue').then((r) => r.data),

  /** Create a Job 2 (YAML → Target Language) from a queued Job 1 */
  createJob2: (data: Job2Create): Promise<MigrationJob> =>
    api.post<MigrationJob>('/jobs/job2', data).then((r) => r.data),

  /** Get the parent Job 1 for a given Job 2 */
  getParentJob: (jobId: number): Promise<MigrationJob> =>
    api.get<MigrationJob>(`/jobs/${jobId}/parent`).then((r) => r.data),

  /** Fetch inline line comments for a job */
  getLineComments: (
    jobId: number,
    params?: { code_type?: 'yaml' | 'generated_code'; review_round?: number },
  ): Promise<LineComment[]> =>
    api.get<LineComment[]>(`/jobs/${jobId}/line-comments`, { params }).then((r) => r.data),

  /** Add an inline line comment to a job */
  addLineComment: (jobId: number, data: LineCommentCreate): Promise<LineComment> =>
    api.post<LineComment>(`/jobs/${jobId}/line-comments`, data).then((r) => r.data),

  /** List jobs, optionally filtered by job_type */
  listByType: (jobType: JobType, params?: Omit<ListJobsParams, 'job_type'>): Promise<MigrationJobSummary[]> =>
    api
      .get<MigrationJobSummary[]>('/jobs/', { params: { ...params, job_type: jobType } })
      .then((r) => r.data),
};
