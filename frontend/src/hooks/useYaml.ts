import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { yamlApi } from '../services/yamlApi';
import { getErrorMessage } from '../utils/errors';
import { JOB_KEYS } from './useJobs';
import type {
  YAMLGenerationRequest,
  YAMLApprovalRequest,
  YAMLRegenerationRequest,
  DescriptionFormat,
} from '../types';

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
  description: (jobId: number) => [...YAML_KEYS.all(jobId), 'description'] as const,
  sourceDescription: (jobId: number) => ['source-description', jobId] as const,
  brdYaml: (jobId: number) => ['brd-yaml', jobId] as const,
  brdSource: (jobId: number) => ['brd-source', jobId] as const,
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

// ─── Description hooks ────────────────────────────────────────────────────────

/**
 * Query: fetch the cached plain-English description for a job's approved YAML.
 * Returns undefined (and does NOT throw) when no description has been generated yet —
 * the 404 is handled by setting `retry: false` and checking `isError` in the UI.
 */
export function useYamlDescription(jobId: number) {
  return useQuery({
    queryKey: YAML_KEYS.description(jobId),
    queryFn: () => yamlApi.getDescription(jobId),
    enabled: !!jobId,
    retry: false, // 404 (not yet generated) is expected — don't hammer the server
  });
}

/**
 * Mutation: call the generate endpoint; invalidates the description query on success
 * so `useYamlDescription` immediately reflects the new result.
 */
export function useGenerateDescription(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceRegenerate: boolean) =>
      yamlApi.generateDescription(jobId, forceRegenerate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.description(jobId) });
      toast.success('Description generated successfully');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/**
 * Mutation: download the description as DOCX or PDF.
 * On success, creates an object URL and programmatically clicks a hidden anchor
 * to trigger the browser's native file download — no extra UI required.
 */
export function useDownloadDescription(jobId: number, sourceFilename?: string | null) {
  return useMutation({
    mutationFn: (format: DescriptionFormat) =>
      yamlApi.downloadDescription(jobId, format),
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = sourceFilename
        ? sourceFilename.replace(/\.[^.]+$/, '')
        : `job_${jobId}`;
      anchor.download = `${baseName}_YAML_Description.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      // Clean up: remove anchor and revoke the object URL after a short delay
      // so the browser has time to start the download.
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 200);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}


// ─── Source (Pick Basic) description hooks ─────────────────────────────────

/**
 * Query: fetch the cached plain-English description generated from the job's
 * Pick Basic source code. Returns undefined when not yet generated.
 */
export function useSourceDescription(jobId: number) {
  return useQuery({
    queryKey: YAML_KEYS.sourceDescription(jobId),
    queryFn: () => yamlApi.getSourceDescription(jobId),
    enabled: !!jobId,
    retry: false,
  });
}

/**
 * Mutation: generate (or regenerate) the source description.
 * Invalidates the query cache on success.
 */
export function useGenerateSourceDescription(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceRegenerate: boolean) =>
      yamlApi.generateSourceDescription(jobId, forceRegenerate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.sourceDescription(jobId) });
      toast.success('Source description generated successfully');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/**
 * Mutation: download the source description as DOCX, PDF, or Markdown.
 */
export function useDownloadSourceDescription(jobId: number, sourceFilename?: string | null) {
  return useMutation({
    mutationFn: (format: DescriptionFormat) =>
      yamlApi.downloadSourceDescription(jobId, format),
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = sourceFilename
        ? sourceFilename.replace(/\.[^.]+$/, '')
        : `job_${jobId}`;
      anchor.download = `${baseName}_Source_Description.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 200);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}


// ─── Business Requirements Document (BRD) hooks ──────────────────────────────

// ── BRD from YAML ────────────────────────────────────────────────────────────

/** Query: fetch the cached BRD generated from the approved YAML. */
export function useBRDFromYAML(jobId: number) {
  return useQuery({
    queryKey: YAML_KEYS.brdYaml(jobId),
    queryFn: () => yamlApi.getBRDFromYAML(jobId),
    enabled: !!jobId,
    retry: false,
  });
}

/** Mutation: generate (or re-generate) the YAML-based BRD. */
export function useGenerateBRDFromYAML(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceRegenerate: boolean) =>
      yamlApi.generateBRDFromYAML(jobId, forceRegenerate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.brdYaml(jobId) });
      toast.success('BRD (from YAML) generated successfully');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Mutation: download the YAML-based BRD as DOCX, PDF, or Markdown. */
export function useDownloadBRDFromYAML(jobId: number, sourceFilename?: string | null) {
  return useMutation({
    mutationFn: (format: DescriptionFormat) =>
      yamlApi.downloadBRDFromYAML(jobId, format),
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = sourceFilename
        ? sourceFilename.replace(/\.[^.]+$/, '')
        : `job_${jobId}`;
      anchor.download = `${baseName}_BRD_YAML.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => { document.body.removeChild(anchor); URL.revokeObjectURL(url); }, 200);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

// ── BRD from Source Code ──────────────────────────────────────────────────────

/** Query: fetch the cached BRD generated from the original source code. */
export function useBRDFromSource(jobId: number) {
  return useQuery({
    queryKey: YAML_KEYS.brdSource(jobId),
    queryFn: () => yamlApi.getBRDFromSource(jobId),
    enabled: !!jobId,
    retry: false,
  });
}

/** Mutation: generate (or re-generate) the source-code-based BRD. */
export function useGenerateBRDFromSource(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceRegenerate: boolean) =>
      yamlApi.generateBRDFromSource(jobId, forceRegenerate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: YAML_KEYS.brdSource(jobId) });
      toast.success('BRD (from Source) generated successfully');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}

/** Mutation: download the source-code-based BRD as DOCX, PDF, or Markdown. */
export function useDownloadBRDFromSource(jobId: number, sourceFilename?: string | null) {
  return useMutation({
    mutationFn: (format: DescriptionFormat) =>
      yamlApi.downloadBRDFromSource(jobId, format),
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = sourceFilename
        ? sourceFilename.replace(/\.[^.]+$/, '')
        : `job_${jobId}`;
      anchor.download = `${baseName}_BRD_Source.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => { document.body.removeChild(anchor); URL.revokeObjectURL(url); }, 200);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
