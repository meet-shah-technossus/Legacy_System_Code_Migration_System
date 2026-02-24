// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: 'viewer' | 'developer' | 'reviewer' | 'admin';
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export type JobState =
  | 'CREATED'
  | 'YAML_GENERATED'
  | 'UNDER_REVIEW'
  | 'REGENERATE_REQUESTED'
  | 'APPROVED'
  | 'APPROVED_WITH_COMMENTS'
  | 'YAML_APPROVED_QUEUED'
  | 'CODE_GENERATED'
  | 'CODE_UNDER_REVIEW'
  | 'CODE_REGENERATE_REQUESTED'
  | 'CODE_ACCEPTED'
  | 'COMPLETED';

/** Whether a job is a YAML conversion (Job 1) or code conversion (Job 2) */
export type JobType = 'YAML_CONVERSION' | 'CODE_CONVERSION';

export type TargetLanguage = 'PYTHON' | 'TYPESCRIPT' | 'JAVASCRIPT' | 'JAVA' | 'CSHARP';

export interface MigrationJob {
  id: number;
  job_name: string | null;
  description: string | null;
  current_state: JobState;
  job_type: JobType;
  parent_job_id: number | null;
  target_language: TargetLanguage | null;
  source_filename: string | null;
  pick_basic_version: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  yaml_versions_count: number;
  reviews_count: number;
}

export interface MigrationJobWithSource extends MigrationJob {
  original_source_code: string;
}

export interface MigrationJobSummary {
  id: number;
  job_name: string | null;
  current_state: JobState;
  job_type: JobType;
  parent_job_id: number | null;
  target_language: TargetLanguage | null;
  source_filename: string | null;
  created_at: string;
  updated_at: string;
}

/** Create a Job 1 (Pick Basic → YAML). Target language is NOT set at this stage. */
export interface JobCreate {
  job_name?: string;
  description?: string;
  original_source_code: string;
  source_filename?: string;
  pick_basic_version?: string;
  /** @deprecated Will be removed in Phase 5. Send via Job2Create instead. */
  target_language?: TargetLanguage;
  created_by?: string;
}

/** Create a Job 2 (YAML → Target Language) from a queued Job 1. */
export interface Job2Create {
  parent_job_id: number;
  target_language: TargetLanguage;
  job_name?: string;
  description?: string;
  created_by?: string;
}

/** A single inline line comment left by a reviewer on a specific line of code. */
export interface LineComment {
  id: number;
  job_id: number;
  line_number: number;
  code_type: 'yaml' | 'generated_code';
  comment: string;
  reviewer: string | null;
  included_in_regeneration: boolean;
  review_round: number;
  created_at: string;
}

export interface LineCommentCreate {
  line_number: number;
  code_type: 'yaml' | 'generated_code';
  comment: string;
  reviewer?: string;
  review_round?: number;
}

export interface LineCommentResponse extends LineComment {}

/**
 * Unsaved (in-memory) line comment created by the reviewer before submitting a review.
 * Lifted to LandingPage so EditorPanel and ChatPanel share the same collection.
 */
export interface PendingLineComment {
  /** Browser-generated UUID — never persisted as-is */
  id: string;
  lineNumber: number;
  text: string;
  codeType: 'yaml' | 'generated_code';
}

/** Queued job summary for Job 2 creation flow */
export interface QueuedJob {
  id: number;
  job_name: string | null;
  source_filename: string | null;
  created_at: string;
  updated_at: string;
  current_state: JobState;
}

export interface JobUpdate {
  job_name?: string;
  description?: string;
}

export interface JobStateTransition {
  new_state: JobState;
  reason?: string;
}

export interface JobStatistics {
  total_jobs: number;
  by_state: Record<string, number>;
  by_language: Record<string, number>;
  queue_count: number;
  by_job_type: Record<string, number>;
}

export interface AllowedTransitions {
  current_state: string;
  allowed_transitions: string[];
  is_terminal: boolean;
}

export interface ListJobsParams {
  skip?: number;
  limit?: number;
  state?: JobState;
  target_language?: TargetLanguage;
  job_type?: JobType;
}

// ─── YAML ────────────────────────────────────────────────────────────────────

export interface YAMLVersion {
  id: number;
  job_id: number;
  version_number: number;
  yaml_content: string;
  is_valid: boolean;
  validation_errors: string[] | null;
  generated_by: string;
  created_at: string;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  approval_comments: string | null;
  generation_metadata: Record<string, unknown> | null;
  parent_version_id: number | null;
}

export interface YAMLVersionSummary {
  id: number;
  version_number: number;
  is_valid: boolean;
  generated_by: string;
  created_at: string;
  is_approved: boolean;
  approved_by: string | null;
  has_errors: boolean;
  error_count: number;
  parent_version_id: number | null;
}

export interface YAMLGenerationRequest {
  performed_by: string;
  force_regenerate?: boolean;
}

export interface YAMLApprovalRequest {
  approved_by: string;
  comments?: string;
}

export interface YAMLRegenerationRequest {
  performed_by: string;
  include_previous_comments?: boolean;
  additional_instructions?: string;
}

export interface YAMLStatistics {
  job_id: number;
  total_versions: number;
  valid_versions: number;
  invalid_versions: number;
  approved_versions: number;
  latest_version_number: number;
  has_approved_version: boolean;
}

// ─── Code ────────────────────────────────────────────────────────────────────

export interface GeneratedCode {
  id: number;
  job_id: number;
  yaml_version_id: number | null;
  code_content: string;
  target_language: string;
  llm_model_used: string | null;
  estimated_lines_of_code: number | null;
  generated_at: string;
  is_accepted: boolean;
  // Phase 3
  version_number: number | null;
  is_current: boolean | null;
}

export interface GeneratedCodeSummary {
  id: number;
  job_id: number;
  target_language: string;
  estimated_lines_of_code: number | null;
  llm_model_used: string | null;
  generated_at: string;
  // Phase 3
  version_number: number | null;
  is_current: boolean | null;
}

/** Per-version summary returned by GET /code/versions */
export interface CodeVersionSummary {
  id: number;
  job_id: number;
  version_number: number | null;
  target_language: string;
  estimated_lines_of_code: number | null;
  llm_model_used: string | null;
  is_accepted: boolean;
  is_current: boolean | null;
  // Phase 1
  sections_covered: string[] | null;
  generation_warnings: string[] | null;
  llm_envelope_used: boolean | null;
  // Phase 2
  validation_tool_available: boolean | null;
  validation_errors: string[] | null;
  generated_at: string;
}

/** Full detail returned by GET /code/versions/:vn */
export interface CodeVersionDetail extends CodeVersionSummary {
  code_content: string;
  generation_prompt: string | null;
  reviewer_constraints: string | null;
  external_stubs_included: string[] | null;
}

/** Response from POST /code/versions/:vn/restore */
export interface RestoreVersionResponse {
  restored_version_number: number;
  job_state: string;
  message: string;
}

export interface CodeGenerationRequest {
  target_language: TargetLanguage;
  performed_by: string;
  use_llm?: boolean;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export type ReviewDecision =
  | 'APPROVE'
  | 'APPROVE_WITH_COMMENTS'
  | 'REJECT_REGENERATE'
  | 'CODE_APPROVE'
  | 'CODE_REJECT_REGENERATE';

export interface ReviewComment {
  id: number;
  review_id: number;
  section: string | null;
  comment_text: string;
  severity: 'info' | 'warning' | 'error' | 'blocking';
  created_at: string;
}

export interface Review {
  id: number;
  job_id: number;
  yaml_version_id: number;
  decision: ReviewDecision;
  general_comment: string | null;
  performed_by: string | null;
  created_at: string;
  comments: ReviewComment[];
}

export interface ReviewSummary {
  id: number;
  job_id: number;
  yaml_version_id: number;
  decision: ReviewDecision;
  general_comment: string | null;
  performed_by: string | null;
  created_at: string;
  comments_count: number;
}

export interface ReviewSubmit {
  yaml_version_id: number;
  decision: ReviewDecision;
  general_comment?: string;
  comments?: Array<{
    section?: string;
    comment_text: string;
    severity?: 'info' | 'warning' | 'error' | 'blocking';
  }>;
}

export interface ReviewStatistics {
  total_reviews: number;
  approved: number;
  approved_with_comments: number;
  rejected: number;
  total_comments: number;
  blocking_comments: number;
}

// ─── Code Reviews ────────────────────────────────────────────────────────────

export interface CodeReview {
  id: number;
  job_id: number;
  generated_code_id: number;
  decision: 'CODE_APPROVE' | 'CODE_REJECT_REGENERATE';
  general_comment: string | null;
  reviewed_by: string | null;
  triggered_regeneration: boolean;
  reviewed_at: string;
}

export interface CodeReviewSubmit {
  decision: 'CODE_APPROVE' | 'CODE_REJECT_REGENERATE';
  general_comment?: string;
  reviewed_by?: string;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  job_id: number | null;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  tags: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogList {
  total: number;
  logs: AuditLog[];
}

export interface AuditQueryParams {
  action?: string;
  performed_by?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface SuccessRateResult {
  operation: string;
  success_count: number;
  failure_count: number;
  success_rate: number;
  hours: number;
}

export interface PerformanceStats {
  operation: string;
  min_seconds: number | null;
  max_seconds: number | null;
  avg_seconds: number | null;
  count: number;
}

export interface MetricAggregate {
  metric_name: string;
  aggregation: string;
  value: number;
  start_time?: string;
  end_time?: string;
}

export interface MetricsSummary {
  time_range_hours: number;
  jobs: { created: number; completed: number; failed: number };
  yaml_generation: {
    success_rate: {
      success_count: number;
      failure_count: number;
      total_count: number;
      success_rate: number;
    };
    performance: { min: number; max: number; avg: number; count: number };
  };
  code_generation: {
    success_rate: {
      success_count: number;
      failure_count: number;
      total_count: number;
      success_rate: number;
    };
    performance: { min: number; max: number; avg: number; count: number };
  };
  reviews: { submitted: number; approved: number; rejected: number };
  errors: { total: number };
}

// ─── API Pagination ──────────────────────────────────────────────────────────

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface ApiError {
  detail: string;
}
