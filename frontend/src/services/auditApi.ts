import api from './api';
import type {
  AuditLog,
  AuditLogList,
  AuditQueryParams,
  MetricsSummary,
  SuccessRateResult,
  PerformanceStats,
  MetricAggregate,
} from '../types';

export const auditApi = {
  /** Get complete audit trail for a specific job */
  jobAuditTrail: (jobId: number): Promise<AuditLogList> =>
    api.get<AuditLogList>(`/jobs/${jobId}/audit-trail`).then((r) => r.data),

  /** Query audit logs with optional filters */
  query: (params?: AuditQueryParams): Promise<AuditLogList> =>
    api.get<AuditLogList>('/audit-logs', { params }).then((r) => r.data),

  /** Get most recent audit log entries */
  recent: (limit = 50): Promise<AuditLogList> =>
    api.get<AuditLogList>('/audit-logs/recent', { params: { limit } }).then((r) => r.data),

  /** Get error audit logs, optionally filtered by job */
  errors: (jobId?: number, limit = 100): Promise<AuditLogList> =>
    api
      .get<AuditLogList>('/audit-logs/errors', {
        params: { ...(jobId ? { job_id: jobId } : {}), limit },
      })
      .then((r) => r.data),
};

export const metricsApi = {
  /** Get comprehensive metrics summary for last N hours */
  summary: (hours = 24): Promise<MetricsSummary> =>
    api.get<MetricsSummary>('/metrics/summary', { params: { hours } }).then((r) => r.data),

  /** Get success rate for yaml_generation or code_generation */
  successRate: (operation: 'yaml_generation' | 'code_generation', hours = 24): Promise<SuccessRateResult> =>
    api
      .get<SuccessRateResult>(`/metrics/success-rate/${operation}`, { params: { hours } })
      .then((r) => r.data),

  /** Get performance stats for an operation */
  performance: (
    operation: 'yaml_generation' | 'code_generation' | 'review',
    hours = 24
  ): Promise<PerformanceStats> =>
    api
      .get<PerformanceStats>(`/metrics/performance/${operation}`, { params: { hours } })
      .then((r) => r.data),

  /** Get aggregated metric value */
  aggregate: (data: {
    metric_name: string;
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
    start_time?: string;
    end_time?: string;
    job_id?: number;
  }): Promise<MetricAggregate> =>
    api.post<MetricAggregate>('/metrics/aggregate', data).then((r) => r.data),
};
