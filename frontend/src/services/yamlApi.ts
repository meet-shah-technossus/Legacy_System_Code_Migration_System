import api from './api';
import type {
  YAMLVersion,
  YAMLVersionSummary,
  YAMLGenerationRequest,
  YAMLApprovalRequest,
  YAMLRegenerationRequest,
  YAMLStatistics,
  YAMLDescription,
  SourceDescription,
  JobBRD,
  DescriptionFormat,
} from '../types';

export const yamlApi = {
  /** Generate YAML for a job using LLM */
  generate: (jobId: number, data: YAMLGenerationRequest): Promise<YAMLVersion> =>
    api.post<YAMLVersion>(`/jobs/${jobId}/yaml/generate`, data).then((r) => r.data),

  /** List all YAML versions for a job */
  listVersions: (jobId: number, includeInvalid = false): Promise<YAMLVersionSummary[]> =>
    api
      .get<YAMLVersionSummary[]>(`/jobs/${jobId}/yaml/versions`, {
        params: { include_invalid: includeInvalid },
      })
      .then((r) => r.data),

  /** Get a specific YAML version by version number */
  getVersion: (jobId: number, versionNumber: number): Promise<YAMLVersion> =>
    api
      .get<YAMLVersion>(`/jobs/${jobId}/yaml/versions/${versionNumber}`)
      .then((r) => r.data),

  /** Get the latest YAML version for a job */
  getLatest: (jobId: number, onlyValid = true): Promise<YAMLVersion> =>
    api
      .get<YAMLVersion>(`/jobs/${jobId}/yaml/latest`, {
        params: { only_valid: onlyValid },
      })
      .then((r) => r.data),

  /** Approve a YAML version */
  approve: (jobId: number, versionNumber: number, data: YAMLApprovalRequest): Promise<YAMLVersion> =>
    api
      .post<YAMLVersion>(`/jobs/${jobId}/yaml/versions/${versionNumber}/approve`, data)
      .then((r) => r.data),

  /** Get the version lineage (parent chain) */
  lineage: (jobId: number, versionNumber: number): Promise<YAMLVersionSummary[]> =>
    api
      .get<YAMLVersionSummary[]>(`/jobs/${jobId}/yaml/versions/${versionNumber}/lineage`)
      .then((r) => r.data),

  /** Get YAML statistics for a job */
  statistics: (jobId: number): Promise<YAMLStatistics> =>
    api.get<YAMLStatistics>(`/jobs/${jobId}/yaml/statistics`).then((r) => r.data),

  /** Regenerate YAML with review feedback */
  regenerate: (jobId: number, data: YAMLRegenerationRequest): Promise<YAMLVersion> =>
    api.post<YAMLVersion>(`/jobs/${jobId}/yaml/regenerate`, data).then((r) => r.data),

  /** Manually edit a specific YAML version's content */
  editVersion: (
    jobId: number,
    versionNumber: number,
    data: { yaml_content: string; edited_by: string; edit_reason?: string }
  ): Promise<YAMLVersion> =>
    api
      .patch<YAMLVersion>(`/jobs/${jobId}/yaml/versions/${versionNumber}`, data)
      .then((r) => r.data),

  /** Create a brand-new YAML version (never overwrites; auto-increments version_number) */
  createVersion: (
    jobId: number,
    data: { yaml_content: string; edited_by: string; edit_reason?: string }
  ): Promise<YAMLVersion> =>
    api
      .post<YAMLVersion>(`/jobs/${jobId}/yaml/versions`, data)
      .then((r) => r.data),

  // ── Description endpoints ─────────────────────────────────────────────────

  /** Generate (or re-generate) the plain-English description for the job's approved YAML */
  generateDescription: (
    jobId: number,
    forceRegenerate = false
  ): Promise<YAMLDescription> =>
    api
      .post<YAMLDescription>(`/jobs/${jobId}/yaml/description/generate`, {
        force_regenerate: forceRegenerate,
      })
      .then((r) => r.data),

  /** Get the cached description (404 if not yet generated) */
  getDescription: (jobId: number): Promise<YAMLDescription> =>
    api
      .get<YAMLDescription>(`/jobs/${jobId}/yaml/description`)
      .then((r) => r.data),

  /**
   * Download the description as a DOCX or PDF blob.
   * The caller is responsible for triggering the browser download.
   */
  downloadDescription: (jobId: number, format: DescriptionFormat): Promise<Blob> =>
    api
      .get(`/jobs/${jobId}/yaml/description/download`, {
        params: { format },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  // ── Source (Pick Basic) description endpoints ────────────────────────────

  /** Generate (or re-generate) the plain-English description from Pick Basic source code */
  generateSourceDescription: (
    jobId: number,
    forceRegenerate = false
  ): Promise<SourceDescription> =>
    api
      .post<SourceDescription>(`/jobs/${jobId}/source/description/generate`, {
        force_regenerate: forceRegenerate,
      })
      .then((r) => r.data),

  /** Get the cached source description (404 if not yet generated) */
  getSourceDescription: (jobId: number): Promise<SourceDescription> =>
    api
      .get<SourceDescription>(`/jobs/${jobId}/source/description`)
      .then((r) => r.data),

  /** Download the source description as a DOCX, PDF, or Markdown blob */
  downloadSourceDescription: (jobId: number, format: DescriptionFormat): Promise<Blob> =>
    api
      .get(`/jobs/${jobId}/source/description/download`, {
        params: { format },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  // ── Business Requirements Document (BRD) endpoints ──────────────────────

  /** Generate (or re-generate) the BRD from the approved YAML only */
  generateBRDFromYAML: (
    jobId: number,
    forceRegenerate = false
  ): Promise<JobBRD> =>
    api
      .post<JobBRD>(`/jobs/${jobId}/brd/generate`, {
        generation_source: 'yaml',
        force_regenerate: forceRegenerate,
      })
      .then((r) => r.data),

  /** Generate (or re-generate) the BRD from the original source code only */
  generateBRDFromSource: (
    jobId: number,
    forceRegenerate = false
  ): Promise<JobBRD> =>
    api
      .post<JobBRD>(`/jobs/${jobId}/brd/generate`, {
        generation_source: 'source_code',
        force_regenerate: forceRegenerate,
      })
      .then((r) => r.data),

  /** Get the cached YAML-based BRD (404 if not yet generated) */
  getBRDFromYAML: (jobId: number): Promise<JobBRD> =>
    api
      .get<JobBRD>(`/jobs/${jobId}/brd`, { params: { source: 'yaml' } })
      .then((r) => r.data),

  /** Get the cached source-code-based BRD (404 if not yet generated) */
  getBRDFromSource: (jobId: number): Promise<JobBRD> =>
    api
      .get<JobBRD>(`/jobs/${jobId}/brd`, { params: { source: 'source_code' } })
      .then((r) => r.data),

  /** Download the YAML-based BRD as a DOCX, PDF, or Markdown blob */
  downloadBRDFromYAML: (jobId: number, format: DescriptionFormat): Promise<Blob> =>
    api
      .get(`/jobs/${jobId}/brd/download`, {
        params: { source: 'yaml', format },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  /** Download the source-code-based BRD as a DOCX, PDF, or Markdown blob */
  downloadBRDFromSource: (jobId: number, format: DescriptionFormat): Promise<Blob> =>
    api
      .get(`/jobs/${jobId}/brd/download`, {
        params: { source: 'source_code', format },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),
};
