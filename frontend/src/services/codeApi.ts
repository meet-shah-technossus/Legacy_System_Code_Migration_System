import api from './api';
import type {
  GeneratedCode,
  GeneratedCodeSummary,
  CodeGenerationRequest,
  CodeReview,
  CodeReviewSubmit,
  CodeVersionSummary,
  CodeVersionDetail,
  RestoreVersionResponse,
} from '../types';

export const codeApi = {
  /** Generate code from approved YAML */
  generate: (jobId: number, data: CodeGenerationRequest): Promise<GeneratedCode> =>
    api.post<GeneratedCode>(`/jobs/${jobId}/code/generate`, data).then((r) => r.data),

  /** Get the latest generated code for a job */
  get: (jobId: number, codeId?: number): Promise<GeneratedCode> =>
    api
      .get<GeneratedCode>(`/jobs/${jobId}/code`, { params: codeId ? { code_id: codeId } : {} })
      .then((r) => r.data),

  /** Get code generation history for a job */
  history: (jobId: number): Promise<GeneratedCodeSummary[]> =>
    api.get<GeneratedCodeSummary[]>(`/jobs/${jobId}/code/history`).then((r) => r.data),

  /** Get code generation statistics */
  statistics: (jobId: number): Promise<Record<string, unknown>> =>
    api.get<Record<string, unknown>>(`/jobs/${jobId}/code/statistics`).then((r) => r.data),

  /** Get the download URL for generated code */
  downloadUrl: (jobId: number, codeId?: number): string => {
    const base = `/api/jobs/${jobId}/code/download`;
    return codeId ? `${base}?code_id=${codeId}` : base;
  },

  // ── Phase 3: Code Version Control ────────────────────────────────────────

  /** List all code versions for a job, newest first */
  getVersions: (jobId: number): Promise<CodeVersionSummary[]> =>
    api.get<CodeVersionSummary[]>(`/jobs/${jobId}/code/versions`).then((r) => r.data),

  /** Get full detail for a specific version number */
  getVersion: (jobId: number, versionNumber: number): Promise<CodeVersionDetail> =>
    api.get<CodeVersionDetail>(`/jobs/${jobId}/code/versions/${versionNumber}`).then((r) => r.data),

  /** Restore a previous code version as the current active one */
  restoreVersion: (jobId: number, versionNumber: number): Promise<RestoreVersionResponse> =>
    api
      .post<RestoreVersionResponse>(`/jobs/${jobId}/code/versions/${versionNumber}/restore`)
      .then((r) => r.data),

  // ── Code Review ──────────────────────────────────────────────────────────────

  /** Submit a code review (approve or reject with regeneration) */
  submitReview: (jobId: number, data: CodeReviewSubmit): Promise<CodeReview> =>
    api.post<CodeReview>(`/jobs/${jobId}/code/review`, data).then((r) => r.data),

  /** Get all code reviews for a job */
  getReviews: (jobId: number): Promise<CodeReview[]> =>
    api.get<CodeReview[]>(`/jobs/${jobId}/code/reviews`).then((r) => r.data),

  /** Manually edit the generated code content */
  editCode: (
    jobId: number,
    data: { code_content: string; edited_by: string; edit_reason?: string }
  ): Promise<GeneratedCode> =>
    api.patch<GeneratedCode>(`/jobs/${jobId}/code`, data).then((r) => r.data),

  /** Create a brand-new code version (never overwrites; auto-increments version_number) */
  createVersion: (
    jobId: number,
    data: { code_content: string; edited_by: string; edit_reason?: string }
  ): Promise<CodeVersionDetail> =>
    api.post<CodeVersionDetail>(`/jobs/${jobId}/code/versions`, data).then((r) => r.data),
};
