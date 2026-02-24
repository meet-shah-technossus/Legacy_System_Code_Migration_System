import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi, metricsApi } from '../services/auditApi';
import type { AuditQueryParams } from '../types';

export const AUDIT_KEYS = {
  jobTrail: (jobId: number) => ['audit', 'job', jobId] as const,
  query: (params?: AuditQueryParams) => ['audit', 'query', params] as const,
  recent: (limit?: number) => ['audit', 'recent', limit] as const,
  errors: (jobId?: number, limit?: number) => ['audit', 'errors', jobId, limit] as const,
};

export const METRICS_KEYS = {
  summary: (hours?: number) => ['metrics', 'summary', hours] as const,
  successRate: (operation: string, hours?: number) =>
    ['metrics', 'success-rate', operation, hours] as const,
  performance: (operation: string, hours?: number) =>
    ['metrics', 'performance', operation, hours] as const,
};

/** Get audit trail for a specific job */
export function useJobAuditTrail(jobId: number) {
  return useQuery({
    queryKey: AUDIT_KEYS.jobTrail(jobId),
    queryFn: () => auditApi.jobAuditTrail(jobId),
    enabled: !!jobId,
  });
}

/** Query audit logs with filters */
export function useAuditLogs(params?: AuditQueryParams) {
  return useQuery({
    queryKey: AUDIT_KEYS.query(params),
    queryFn: () => auditApi.query(params),
  });
}

/** Get recent audit logs */
export function useRecentAuditLogs(limit = 50, refetchIntervalMs = 15_000) {
  return useQuery({
    queryKey: AUDIT_KEYS.recent(limit),
    queryFn: () => auditApi.recent(limit),
    refetchInterval: refetchIntervalMs,
  });
}

/** Get error audit logs */
export function useErrorAuditLogs(jobId?: number, limit = 100) {
  return useQuery({
    queryKey: AUDIT_KEYS.errors(jobId, limit),
    queryFn: () => auditApi.errors(jobId, limit),
  });
}

// ─── Metrics hooks ────────────────────────────────────────────────────────────

/** Get metrics summary for the last N hours */
export function useMetricsSummary(hours = 24) {
  return useQuery({
    queryKey: METRICS_KEYS.summary(hours),
    queryFn: () => metricsApi.summary(hours),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Get success rate for yaml_generation or code_generation */
export function useSuccessRate(
  operation: 'yaml_generation' | 'code_generation',
  hours = 24
) {
  return useQuery({
    queryKey: METRICS_KEYS.successRate(operation, hours),
    queryFn: () => metricsApi.successRate(operation, hours),
    staleTime: 30_000,
  });
}

/** Get performance stats for an operation */
export function usePerformanceStats(
  operation: 'yaml_generation' | 'code_generation' | 'review',
  hours = 24
) {
  return useQuery({
    queryKey: METRICS_KEYS.performance(operation, hours),
    queryFn: () => metricsApi.performance(operation, hours),
    staleTime: 30_000,
  });
}

/** Ad-hoc metric aggregate mutation */
export function useMetricAggregate() {
  return useMutation({
    mutationFn: metricsApi.aggregate,
  });
}
