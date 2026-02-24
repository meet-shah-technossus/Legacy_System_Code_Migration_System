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
    mutationFn: (data: YAMLGenerationRequest) => yamlApi.generate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('YAML generated successfully');
    },
    onError: (err) => {
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
      toast.success('YAML version approved');
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
    mutationFn: (data: YAMLRegenerationRequest) => yamlApi.regenerate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('YAML regenerated with feedback');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
