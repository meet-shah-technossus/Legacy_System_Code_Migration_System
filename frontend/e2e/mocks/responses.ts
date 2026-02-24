/**
 * Centralised mock API response payloads reused across all specs.
 * Shapes mirror the TypeScript types in src/types/index.ts.
 */

import type {
  User,
  AuthResponse,
  MigrationJob,
  MigrationJobSummary,
  MigrationJobWithSource,
  JobStatistics,
  AllowedTransitions,
  ReviewSummary,
  YAMLVersionSummary,
  AuditLogList,
  MetricsSummary,
} from '../../src/types';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const MOCK_TOKEN = 'e2e-mock-token-abc123';

export const MOCK_USER: User = {
  id: 1,
  username: 'admin',
  email: 'admin@example.com',
  full_name: 'Admin User',
  role: 'admin',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
};

export const MOCK_AUTH_RESPONSE: AuthResponse = {
  access_token: MOCK_TOKEN,
  token_type: 'bearer',
  user: MOCK_USER,
};

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const MOCK_JOB_1: MigrationJobSummary = {
  id: 1,
  job_name: 'Inventory Migration',
  current_state: 'CREATED',
  job_type: 'YAML_CONVERSION',
  parent_job_id: null,
  target_language: 'PYTHON',
  source_filename: 'inventory.pick',
  created_at: '2025-06-01T10:00:00Z',
  updated_at: '2025-06-01T10:00:00Z',
};

export const MOCK_JOB_2: MigrationJobSummary = {
  id: 2,
  job_name: 'Order Processing Migration',
  current_state: 'UNDER_REVIEW',
  job_type: 'YAML_CONVERSION',
  parent_job_id: null,
  target_language: 'TYPESCRIPT',
  source_filename: 'orders.pick',
  created_at: '2025-06-02T09:00:00Z',
  updated_at: '2025-06-02T14:00:00Z',
};

export const MOCK_JOB_SUMMARIES: MigrationJobSummary[] = [MOCK_JOB_1, MOCK_JOB_2];

/** A Job 1 that has been approved and is waiting in the queue for Studio pickup. */
export const MOCK_QUEUED_JOB_SUMMARY: MigrationJobSummary = {
  id: 3,
  job_name: 'Queued Batch Migration',
  current_state: 'YAML_APPROVED_QUEUED',
  job_type: 'YAML_CONVERSION',
  parent_job_id: null,
  target_language: 'PYTHON',
  source_filename: 'batch.pick',
  created_at: '2025-06-03T08:00:00Z',
  updated_at: '2025-06-03T09:00:00Z',
};

export const MOCK_JOB_SUMMARIES_WITH_QUEUED: MigrationJobSummary[] = [
  MOCK_JOB_1,
  MOCK_JOB_2,
  MOCK_QUEUED_JOB_SUMMARY,
];

/** Full job detail for a YAML_APPROVED_QUEUED job used in job-detail tests. */
export const MOCK_JOB_QUEUED_DETAIL: MigrationJob = {
  id: 3,
  job_name: 'Queued Batch Migration',
  description: 'Batch job ready for Studio',
  current_state: 'YAML_APPROVED_QUEUED',
  job_type: 'YAML_CONVERSION',
  parent_job_id: null,
  target_language: 'PYTHON',
  source_filename: 'batch.pick',
  pick_basic_version: '1.0',
  created_by: 'admin',
  completed_at: null,
  created_at: '2025-06-03T08:00:00Z',
  updated_at: '2025-06-03T09:00:00Z',
  yaml_versions_count: 1,
  reviews_count: 1,
};

export const MOCK_JOB_DETAIL: MigrationJob = {
  id: 1,
  job_name: 'Inventory Migration',
  description: 'Migrating legacy Pick Basic inventory code to Python',
  current_state: 'CREATED',
  job_type: 'YAML_CONVERSION',
  parent_job_id: null,
  target_language: 'PYTHON',
  source_filename: 'inventory.pick',
  pick_basic_version: '1.0',
  created_by: 'admin',
  completed_at: null,
  created_at: '2025-06-01T10:00:00Z',
  updated_at: '2025-06-01T10:00:00Z',
  yaml_versions_count: 1,
  reviews_count: 0,
};

export const MOCK_JOB_WITH_SOURCE: MigrationJobWithSource = {
  ...MOCK_JOB_DETAIL,
  original_source_code:
    '* Inventory module\n001 READ ITEM FROM INV.FILE ELSE STOP\n002 PRINT ITEM<1>',
};

export const MOCK_JOB_STATISTICS: JobStatistics = {
  total_jobs: 5,
  queue_count: 1,
  by_state: {
    CREATED: 2,
    UNDER_REVIEW: 1,
    APPROVED: 1,
    COMPLETED: 1,
  },
  by_language: {
    PYTHON: 3,
    TYPESCRIPT: 2,
  },
  by_job_type: {
    YAML_CONVERSION: 4,
    CODE_CONVERSION: 1,
  },
};

export const MOCK_ALLOWED_TRANSITIONS: AllowedTransitions = {
  current_state: 'CREATED',
  allowed_transitions: ['YAML_GENERATED'],
  is_terminal: false,
};

// ─── YAML ─────────────────────────────────────────────────────────────────────

export const MOCK_YAML_VERSION: YAMLVersionSummary = {
  id: 1,
  version_number: 1,
  is_valid: true,
  generated_by: 'gemini-1.5-pro',
  created_at: '2025-06-01T10:05:00Z',
  is_approved: false,
  approved_by: null,
  has_errors: false,
  error_count: 0,
  parent_version_id: null,
};

export const MOCK_YAML_VERSIONS: YAMLVersionSummary[] = [MOCK_YAML_VERSION];

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const MOCK_REVIEW_SUMMARY: ReviewSummary = {
  id: 1,
  job_id: 1,
  yaml_version_id: 1,
  decision: 'APPROVE',
  general_comment: 'Mapping looks correct.',
  performed_by: 'reviewer1',
  created_at: '2025-06-01T12:00:00Z',
  comments_count: 0,
};

export const MOCK_REVIEWS: ReviewSummary[] = [MOCK_REVIEW_SUMMARY];

// ─── Audit ────────────────────────────────────────────────────────────────────

export const MOCK_AUDIT_LOGS: AuditLogList = {
  total: 3,
  logs: [
    {
      id: 1,
      job_id: 1,
      action: 'job_created',
      performed_by: 'admin',
      details: { job_name: 'Inventory Migration' },
      tags: null,
      created_at: '2025-06-01T10:00:00Z',
    },
    {
      id: 2,
      job_id: 1,
      action: 'yaml_generated',
      performed_by: 'admin',
      details: { version: 1 },
      tags: null,
      created_at: '2025-06-01T10:05:00Z',
    },
    {
      id: 3,
      job_id: 2,
      action: 'review_submitted',
      performed_by: 'reviewer1',
      details: { decision: 'APPROVE' },
      tags: null,
      created_at: '2025-06-02T14:30:00Z',
    },
  ],
};

// ─── Metrics ──────────────────────────────────────────────────────────────────

export const MOCK_METRICS_SUMMARY: MetricsSummary = {
  time_range_hours: 24,
  jobs: { created: 3, completed: 1, failed: 0 },
  yaml_generation: {
    success_rate: {
      success_count: 4,
      failure_count: 1,
      total_count: 5,
      success_rate: 80,
    },
    performance: { min: 0.8, max: 3.2, avg: 1.5, count: 4 },
  },
  code_generation: {
    success_rate: {
      success_count: 2,
      failure_count: 0,
      total_count: 2,
      success_rate: 100,
    },
    performance: { min: 1.2, max: 4.5, avg: 2.8, count: 2 },
  },
  reviews: { submitted: 5, approved: 3, rejected: 2 },
  errors: { total: 1 },
};
