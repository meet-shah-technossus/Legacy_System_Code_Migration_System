import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type JobsPageSize = 10 | 25 | 50 | 100;
export type AnalyticsTimeRange = '24h' | '48h' | '7d' | '30d';
export type AuditRefreshInterval = 10 | 15 | 30 | 60;

interface PrefsState {
  /** Default number of jobs shown per page in Jobs table */
  jobsPageSize: JobsPageSize;
  /** Default time range used on Analytics page */
  analyticsTimeRange: AnalyticsTimeRange;
  /** Audit log auto-refresh interval in seconds */
  auditRefreshInterval: AuditRefreshInterval;
  /** Show full ISO timestamps instead of relative "5 min ago" */
  useAbsoluteTimestamps: boolean;
  /** Compact table rows (less padding) */
  compactTables: boolean;
  /** Auto-expand first job detail panel on open */
  autoExpandDetails: boolean;

  setJobsPageSize: (v: JobsPageSize) => void;
  setAnalyticsTimeRange: (v: AnalyticsTimeRange) => void;
  setAuditRefreshInterval: (v: AuditRefreshInterval) => void;
  setUseAbsoluteTimestamps: (v: boolean) => void;
  setCompactTables: (v: boolean) => void;
  setAutoExpandDetails: (v: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULTS = {
  jobsPageSize: 25 as JobsPageSize,
  analyticsTimeRange: '24h' as AnalyticsTimeRange,
  auditRefreshInterval: 15 as AuditRefreshInterval,
  useAbsoluteTimestamps: false,
  compactTables: false,
  autoExpandDetails: true,
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setJobsPageSize: (v) => set({ jobsPageSize: v }),
      setAnalyticsTimeRange: (v) => set({ analyticsTimeRange: v }),
      setAuditRefreshInterval: (v) => set({ auditRefreshInterval: v }),
      setUseAbsoluteTimestamps: (v) => set({ useAbsoluteTimestamps: v }),
      setCompactTables: (v) => set({ compactTables: v }),
      setAutoExpandDetails: (v) => set({ autoExpandDetails: v }),
      resetToDefaults: () => set({ ...DEFAULTS }),
    }),
    { name: 'migration-app-prefs' }
  )
);
