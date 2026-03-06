import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { jobsApi } from '../services/jobsApi';
import { getErrorMessage } from '../utils/errors';
import type {
  JobCreate,
  Job2Create,
  JobUpdate,
  JobStateTransition,
  ListJobsParams,
  LineCommentCreate,
} from '../types';

export const JOB_KEYS = {
  all: ['jobs'] as const,
  lists: () => [...JOB_KEYS.all, 'list'] as const,
  list: (params?: ListJobsParams) => [...JOB_KEYS.lists(), params] as const,
  details: () => [...JOB_KEYS.all, 'detail'] as const,
  detail: (id: number) => [...JOB_KEYS.details(), id] as const,
  withSource: (id: number) => [...JOB_KEYS.detail(id), 'source'] as const,
  statistics: () => [...JOB_KEYS.all, 'statistics'] as const,
  transitions: (id: number) => [...JOB_KEYS.detail(id), 'transitions'] as const,
  queue: () => [...JOB_KEYS.all, 'queue'] as const,
  parent: (id: number) => [...JOB_KEYS.detail(id), 'parent'] as const,
  lineComments: (id: number, params?: object) => [...JOB_KEYS.detail(id), 'line-comments', params] as const,
};

/** List migration jobs with optional filters */
export function useJobs(params?: ListJobsParams) {
  return useQuery({
    queryKey: JOB_KEYS.list(params),
    queryFn: () => jobsApi.list(params),
  });
}

/** Get job statistics */
export function useJobStatistics() {
  return useQuery({
    queryKey: JOB_KEYS.statistics(),
    queryFn: () => jobsApi.statistics(),
    staleTime: 30_000,
  });
}

/** Get a single job by ID */
export function useJob(jobId: number) {
  return useQuery({
    queryKey: JOB_KEYS.detail(jobId),
    queryFn: () => jobsApi.get(jobId),
    enabled: !!jobId,
  });
}

/** Get job including original source code */
export function useJobWithSource(jobId: number) {
  return useQuery({
    queryKey: JOB_KEYS.withSource(jobId),
    queryFn: () => jobsApi.getWithSource(jobId),
    enabled: !!jobId,
  });
}

/** Get allowed state transitions for a job */
export function useAllowedTransitions(jobId: number) {
  return useQuery({
    queryKey: JOB_KEYS.transitions(jobId),
    queryFn: () => jobsApi.allowedTransitions(jobId),
    enabled: !!jobId,
  });
}

/** Create a new migration job */
export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobCreate) => jobsApi.create(data),
    onSuccess: (newJob) => {
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.statistics() });
      toast.success(`Job #${newJob.id} created`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Update job metadata */
export function useUpdateJob(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobUpdate) => jobsApi.update(jobId, data),
    onSuccess: (updated) => {
      qc.setQueryData(JOB_KEYS.detail(jobId), updated);
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      toast.success('Job updated');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Transition job state */
export function useTransitionJob(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobStateTransition) => jobsApi.transition(jobId, data),
    onSuccess: (updated) => {
      qc.setQueryData(JOB_KEYS.detail(jobId), updated);
      qc.invalidateQueries({ queryKey: JOB_KEYS.transitions(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.statistics() });
      // Invalidate code queries so GeneratedCodePanel sees updated is_accepted flag
      // (CODE_KEYS.all(jobId) = ['code', jobId] — inlined to avoid circular import)
      qc.invalidateQueries({ queryKey: ['code', jobId] });
      toast.success(`State → ${updated.current_state}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Delete a job */
export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) => jobsApi.delete(jobId),
    onSuccess: (_data, jobId) => {
      qc.removeQueries({ queryKey: JOB_KEYS.detail(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.statistics() });
      toast.success('Job deleted');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

// ─── Two-Job Architecture Hooks ─────────────────────────────────────────────────

/** Get all Job 1s waiting in the queue (YAML_APPROVED_QUEUED) */
export function useQueuedJobs() {
  return useQuery({
    queryKey: JOB_KEYS.queue(),
    queryFn: () => jobsApi.getQueuedJobs(),
    staleTime: 15_000,
  });
}

/** Create a new Job 2 from a queued Job 1 */
export function useCreateJob2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Job2Create) => jobsApi.createJob2(data),
    onSuccess: (newJob) => {
      qc.invalidateQueries({ queryKey: JOB_KEYS.queue() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.statistics() });
      toast.success(`Job 2 #${newJob.id} created`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Get the parent Job 1 for a given Job 2 */
export function useParentJob(jobId: number) {
  return useQuery({
    queryKey: JOB_KEYS.parent(jobId),
    queryFn: () => jobsApi.getParentJob(jobId),
    enabled: !!jobId,
  });
}

/** Get inline line comments for a job */
export function useLineComments(
  jobId: number,
  params?: { code_type?: 'yaml' | 'generated_code'; review_round?: number },
) {
  return useQuery({
    queryKey: JOB_KEYS.lineComments(jobId, params),
    queryFn: () => jobsApi.getLineComments(jobId, params),
    enabled: !!jobId,
  });
}

/** Add a line comment to a job */
export function useAddLineComment(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LineCommentCreate) => jobsApi.addLineComment(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: JOB_KEYS.lineComments(jobId) });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
