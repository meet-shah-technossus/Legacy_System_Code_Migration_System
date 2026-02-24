import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { codeApi } from '../services/codeApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import type { CodeGenerationRequest } from '../types';

export const CODE_KEYS = {
  all: (jobId: number) => ['code', jobId] as const,
  current: (jobId: number, codeId?: number) => [...CODE_KEYS.all(jobId), 'current', codeId] as const,
  history: (jobId: number) => [...CODE_KEYS.all(jobId), 'history'] as const,
  versions: (jobId: number) => [...CODE_KEYS.all(jobId), 'versions'] as const,
  version: (jobId: number, vn: number) => [...CODE_KEYS.all(jobId), 'versions', vn] as const,
  statistics: (jobId: number) => [...CODE_KEYS.all(jobId), 'statistics'] as const,
};

/** Get the latest/specific generated code for a job */
export function useGeneratedCode(jobId: number, codeId?: number) {
  return useQuery({
    queryKey: CODE_KEYS.current(jobId, codeId),
    queryFn: () => codeApi.get(jobId, codeId),
    enabled: !!jobId,
    retry: false, // 404 expected when no code generated yet
  });
}

/** Get code generation history for a job */
export function useCodeHistory(jobId: number) {
  return useQuery({
    queryKey: CODE_KEYS.history(jobId),
    queryFn: () => codeApi.history(jobId),
    enabled: !!jobId,
  });
}

/** Get code generation statistics */
export function useCodeStatistics(jobId: number) {
  return useQuery({
    queryKey: CODE_KEYS.statistics(jobId),
    queryFn: () => codeApi.statistics(jobId),
    enabled: !!jobId,
  });
}

// ── Phase 3: Code Version Control ─────────────────────────────────────────────

/** List all code versions for a job (newest first) */
export function useCodeVersions(jobId: number) {
  return useQuery({
    queryKey: CODE_KEYS.versions(jobId),
    queryFn: () => codeApi.getVersions(jobId),
    enabled: !!jobId,
  });
}

/** Get full content for a specific code version */
export function useCodeVersion(jobId: number, versionNumber: number | null) {
  return useQuery({
    queryKey: CODE_KEYS.version(jobId, versionNumber ?? 0),
    queryFn: () => codeApi.getVersion(jobId, versionNumber!),
    enabled: !!jobId && versionNumber != null,
  });
}

/** Restore a previous code version as the current active one */
export function useRestoreCodeVersion(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionNumber: number) => codeApi.restoreVersion(jobId, versionNumber),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success(`Version ${data.restored_version_number} restored — awaiting re-review`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Generate code from approved YAML */
export function useGenerateCode(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CodeGenerationRequest) => codeApi.generate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('Code generated successfully');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
