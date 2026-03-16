import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { yamlApi } from '../services/yamlApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import type { YAMLGenerationRequest, YAMLApprovalRequest, YAMLRegenerationRequest } from '../types';

export const YAML_KEYS = {
  all: (jobId: number) => ['yaml', jobId] as const,
  versions: (jobId: number, includeInvalid?: boolean) =>
    [...YAML_KEYS.all(jobId), 'versions', { includeInvalid }] as const,
  version: (jobId: number, versionNumber: number) =>
    [...YAML_KEYS.all(jobId), 'version', versionNumber] as const,
  latest: (jobId: number, onlyValid?: boolean) =>
    [...YAML_KEYS.all(jobId), 'latest', { onlyValid }] as const,
  lineage: (jobId: number, versionNumber: number) =>
    [...YAML_KEYS.all(jobId), 'lineage', versionNumber] as const,
  statistics: (jobId: number) => [...YAML_KEYS.all(jobId), 'statistics'] as const,
};

/** List YAML versions for a job */
export function useYAMLVersions(jobId: number, includeInvalid = false) {
  return useQuery({
    queryKey: YAML_KEYS.versions(jobId, includeInvalid),
    queryFn: () => yamlApi.listVersions(jobId, includeInvalid),
    enabled: !!jobId,
  });
}

/** Get a specific YAML version */
export function useYAMLVersion(jobId: number, versionNumber: number) {
  return useQuery({
    queryKey: YAML_KEYS.version(jobId, versionNumber),
    queryFn: () => yamlApi.getVersion(jobId, versionNumber),
    enabled: !!jobId && !!versionNumber,
  });
}

/** Get the latest YAML version for a job */
export function useLatestYAML(jobId: number, onlyValid = true) {
  return useQuery({
    queryKey: YAML_KEYS.latest(jobId, onlyValid),
    queryFn: () => yamlApi.getLatest(jobId, onlyValid),
    enabled: !!jobId,
    retry: false, // 404 is expected when no YAML yet
  });
}

/** Get the version lineage */
export function useYAMLLineage(jobId: number, versionNumber: number) {
  return useQuery({
    queryKey: YAML_KEYS.lineage(jobId, versionNumber),
    queryFn: () => yamlApi.lineage(jobId, versionNumber),
    enabled: !!jobId && !!versionNumber,
  });
}

/** Get YAML statistics for a job */
export function useYAMLStatistics(jobId: number) {
  return useQuery({
    queryKey: YAML_KEYS.statistics(jobId),
    queryFn: () => yamlApi.statistics(jobId),
    enabled: !!jobId,
  });
}

/** Generate YAML for a job */
export function useGenerateYAML(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['generate-yaml', jobId],
    mutationFn: (data: YAMLGenerationRequest) => yamlApi.generate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('YAML generated successfully');
    },
    onError: (err) => {
      // Refresh job state so the retry button reflects actual backend state after failure
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}

/** Approve a YAML version */
export function useApproveYAML(jobId: number, versionNumber: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: YAMLApprovalRequest) => yamlApi.approve(jobId, versionNumber, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      // Invalidate the jobs list and queue so the Studio Explorer and Queue panel
      // immediately see the job move to YAML_APPROVED_QUEUED state.
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
      qc.invalidateQueries({ queryKey: JOB_KEYS.queue() });
      toast.success('YAML version approved — job queued for code generation');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Regenerate YAML with review feedback */
export function useRegenerateYAML(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['generate-yaml', jobId],
    mutationFn: (data: YAMLRegenerationRequest) => yamlApi.regenerate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('YAML regenerated with feedback');
    },
    onError: (err) => {
      // Refresh job state so the Regenerate YAML button re-enables after a failed attempt
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}

/** Manually edit a YAML version's content */
export function useEditYAMLVersion(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionNumber,
      data,
    }: {
      versionNumber: number;
      data: { yaml_content: string; edited_by: string; edit_reason?: string };
    }) => yamlApi.editVersion(jobId, versionNumber, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('YAML saved — approval reset, please re-review');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/**
 * Create a brand-new YAML version (never overwrites an existing version).
 * The new version_number is auto-incremented by the backend.
 */
export function useCreateYAMLVersion(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { yaml_content: string; edited_by: string; edit_reason?: string }) =>
      yamlApi.createVersion(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('New YAML version saved — approval required');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
