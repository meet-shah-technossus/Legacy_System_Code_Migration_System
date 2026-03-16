import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { codeApi } from '../services/codeApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import type { CodeGenerationRequest, LLMProvider, TargetLanguage } from '../types';

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
    mutationKey: ['generate-code', jobId],
    mutationFn: (data: CodeGenerationRequest) => codeApi.generate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('Code generated successfully');
    },
    onError: (err) => {
      // Refresh job state so the UI shows the correct retry button even after a failure
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}

/** Manually edit the generated code content */
export function useEditCode(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code_content: string; edited_by: string; edit_reason?: string }) =>
      codeApi.editCode(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('Code saved — please re-review');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/**
 * Create a brand-new code version (never overwrites; auto-increments version_number).
 * The new version becomes is_current=True and resets is_accepted=False.
 */
export function useCreateCodeVersion(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code_content: string; edited_by: string; edit_reason?: string }) =>
      codeApi.createVersion(jobId, data),
    onSuccess: (newVersion) => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success(`Code version ${newVersion.version_number} saved — please re-review`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

// ── Direct Conversion Hooks ────────────────────────────────────────────────────

/** Trigger initial direct code generation (Pick Basic → target language) */
export function useDirectGenerateCode(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['direct-generate-code', jobId],
    mutationFn: (data: {
      target_language: TargetLanguage;
      performed_by: string;
      llm_provider?: LLMProvider;
      llm_model_override?: string;
    }) => codeApi.directGenerate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('Code generated successfully');
    },
    onError: (err) => {
      // Refresh job state so the retry banner/button reflects the actual backend state
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}

/** Regenerate direct code after a rejection */
export function useDirectRegenerateCode(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['direct-regenerate-code', jobId],
    mutationFn: (data: {
      target_language: TargetLanguage;
      performed_by: string;
      general_feedback?: string;
      line_comment_context?: string;
      llm_provider?: LLMProvider;
      llm_model_override?: string;
    }) => codeApi.directRegenerate(jobId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.success('Code regenerated successfully');
    },
    onError: (err) => {
      // Refresh job state so the retry banner re-enables even after a failed attempt
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}

/** Submit accept/reject review for a direct conversion job */
export function useDirectReviewCode(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      decision: 'DIRECT_APPROVE' | 'DIRECT_REJECT_REGENERATE';
      general_feedback?: string;
      reviewed_by?: string;
      /** Version number the reviewer was looking at — pinned so the correct version is accepted */
      version_number?: number;
    }) => codeApi.directReview(jobId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CODE_KEYS.all(jobId) });
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      if (vars.decision === 'DIRECT_APPROVE') {
        toast.success('Code accepted — job completed!');
      } else {
        toast.success('Rejected — queued for regeneration');
      }
    },
    onError: (err) => {
      // Re-fetch job so the regeneration banner shows the actual state after any error
      qc.invalidateQueries({ queryKey: JOB_KEYS.detail(jobId) });
      toast.error(getErrorMessage(err));
    },
  });
}
