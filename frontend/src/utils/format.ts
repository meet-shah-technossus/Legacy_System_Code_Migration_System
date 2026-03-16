import { formatDistanceToNow, format, parseISO } from 'date-fns';
import type { JobState, TargetLanguage, ReviewDecision } from '../types';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** "5 minutes ago" style relative time */
export function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

/** "Feb 19, 2026 13:45" absolute time */
export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy HH:mm');
  } catch {
    return dateStr;
  }
}

/** ISO date only: "2026-02-19" */
export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ─── Job State Helpers ───────────────────────────────────────────────────────

const STATE_LABELS: Record<JobState, string> = {
  CREATED: 'Created',
  YAML_GENERATED: 'YAML Ready',
  UNDER_REVIEW: 'Under Review',
  REGENERATE_REQUESTED: 'Regeneration Requested',
  APPROVED: 'Approved',
  APPROVED_WITH_COMMENTS: 'Approved ✱',
  YAML_APPROVED_QUEUED: 'Queued for Code',
  CODE_GENERATED: 'Code Ready',
  CODE_UNDER_REVIEW: 'Code Under Review',
  CODE_REGENERATE_REQUESTED: 'Code Regeneration Requested',
  CODE_ACCEPTED: 'Code Accepted',
  COMPLETED: 'Completed',
  // Direct Conversion states
  DIRECT_CODE_GENERATED: 'Direct Code Ready',
  DIRECT_CODE_UNDER_REVIEW: 'Direct Code Review',
  DIRECT_CODE_REGENERATE_REQUESTED: 'Direct Regen Requested',
  DIRECT_CODE_ACCEPTED: 'Direct Code Accepted',
  DIRECT_COMPLETED: 'Direct Completed',
};

export function stateLabel(state: JobState): string {
  return STATE_LABELS[state] ?? state;
}

/** Chakra UI color scheme to use for the given state badge */
export function stateColorScheme(state: JobState): string {
  switch (state) {
    case 'CREATED':
      return 'gray';
    case 'YAML_GENERATED':
      return 'cyan';
    case 'UNDER_REVIEW':
      return 'orange';
    case 'REGENERATE_REQUESTED':
      return 'yellow';
    case 'APPROVED':
    case 'APPROVED_WITH_COMMENTS':
      return 'teal';
    case 'YAML_APPROVED_QUEUED':
      return 'cyan';
    case 'CODE_GENERATED':
      return 'blue';
    case 'CODE_UNDER_REVIEW':
      return 'purple';
    case 'CODE_REGENERATE_REQUESTED':
      return 'pink';
    case 'CODE_ACCEPTED':
      return 'teal';
    case 'COMPLETED':
      return 'green';
    // Direct Conversion states
    case 'DIRECT_CODE_GENERATED':
      return 'purple';
    case 'DIRECT_CODE_UNDER_REVIEW':
      return 'violet';
    case 'DIRECT_CODE_REGENERATE_REQUESTED':
      return 'yellow';
    case 'DIRECT_CODE_ACCEPTED':
      return 'teal';
    case 'DIRECT_COMPLETED':
      return 'green';
    default:
      return 'gray';
  }
}

/** Whether the state represents an in-progress operation (spin / pulse) */
export function isInProgressState(_state: JobState): boolean {
  return false; // No async in-progress states in current backend
}

/** Whether the state is terminal (no further transitions) */
export function isTerminalState(state: JobState): boolean {
  return state === 'COMPLETED' || state === 'DIRECT_COMPLETED' || state === 'YAML_APPROVED_QUEUED';
}

// ─── Language Helpers ─────────────────────────────────────────────────────────

const LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  PYTHON: 'Python',
  TYPESCRIPT: 'TypeScript',
  JAVASCRIPT: 'JavaScript',
  JAVA: 'Java',
  CSHARP: 'C#',
};

export function languageLabel(lang: string | null | undefined): string {
  if (lang == null) return '—';
  return LANGUAGE_LABELS[lang as TargetLanguage] ?? lang;
}

/** Monaco Editor language ID */
export function monacoLanguage(lang: string): string {
  const map: Record<string, string> = {
    PYTHON: 'python',
    TYPESCRIPT: 'typescript',
    JAVASCRIPT: 'javascript',
    JAVA: 'java',
    CSHARP: 'csharp',
  };
  return map[lang] ?? 'plaintext';
}

// ─── Review Helpers ───────────────────────────────────────────────────────────

const DECISION_LABELS: Record<ReviewDecision, string> = {
  APPROVE: 'Approved',
  APPROVE_WITH_COMMENTS: 'Approved with Comments',
  REJECT_REGENERATE: 'Rejected — Regenerate',
  CODE_APPROVE: 'Code Approved',
  CODE_REJECT_REGENERATE: 'Code Rejected — Regenerate',
};

export function reviewDecisionLabel(decision: ReviewDecision): string {
  return DECISION_LABELS[decision] ?? decision;
}

export function reviewDecisionColorScheme(decision: ReviewDecision): string {
  switch (decision) {
    case 'APPROVE':
      return 'green';
    case 'APPROVE_WITH_COMMENTS':
      return 'teal';
    case 'REJECT_REGENERATE':
      return 'red';
    case 'CODE_APPROVE':
      return 'green';
    case 'CODE_REJECT_REGENERATE':
      return 'red';
    default:
      return 'gray';
  }
}

// ─── Number Helpers ───────────────────────────────────────────────────────────

/** "1.23 s" or "456 ms" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds.toFixed(2)} s`;
}

/** "87.5%" */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

/** Truncate long strings for table cells */
export function truncate(str: string, maxLength = 60): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}
