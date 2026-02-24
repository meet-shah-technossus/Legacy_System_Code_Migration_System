import api from './api';
import type {
  YAMLVersion,
  YAMLVersionSummary,
  YAMLGenerationRequest,
  YAMLApprovalRequest,
  YAMLRegenerationRequest,
  YAMLStatistics,
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
};
