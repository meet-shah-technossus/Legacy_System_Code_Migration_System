import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { JOB_KEYS } from './useJobs';
import type { MigrationJob } from '../types';

interface SSEEvent {
  type: string;
  data: unknown;
}

interface UseSSEOptions {
  /** Called on each SSE message */
  onMessage?: (event: SSEEvent) => void;
  /** Called when the connection opens */
  onOpen?: () => void;
  /** Called on SSE error / reconnect */
  onError?: (err: Event) => void;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
}

/**
 * Generic SSE hook.
 * Connects to the given URL and calls `onMessage` for each event.
 * Auto-reconnects on error.
 *
 * Usage:
 *   useSSE('/api/jobs/42/events', { onMessage: (e) => console.log(e) });
 */
export function useSSE(url: string | null, options: UseSSEOptions = {}) {
  const { onMessage, onOpen, onError, reconnectDelay = 3000 } = options;
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!url) return;

    const token = localStorage.getItem('auth_token');
    // EventSource doesn't support custom headers natively in the browser;
    // we pass the token as a query param (?token=...) or rely on cookies.
    const fullUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

    const es = new EventSource(fullUrl);
    esRef.current = es;

    es.onopen = () => {
      onOpen?.();
    };

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as SSEEvent;
        onMessage?.(parsed);
      } catch {
        onMessage?.({ type: 'raw', data: ev.data });
      }
    };

    es.onerror = (ev) => {
      onError?.(ev);
      es.close();
      esRef.current = null;
      // Auto-reconnect
      reconnectTimer.current = setTimeout(connect, reconnectDelay);
    };
  }, [url, onMessage, onOpen, onError, reconnectDelay]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
  }, []);

  return { close };
}

// ─── Job-specific: polling fallback ──────────────────────────────────────────
// Until the backend exposes a /api/jobs/{id}/events SSE endpoint,
// we use React Query's refetchInterval to poll for state changes.

/**
 * Poll a single job's state in real-time.
 *
 * Stops polling automatically once the job reaches a terminal state.
 * Used in Job Detail page and the jobs table.
 *
 * @param jobId - the job to watch
 * @param enabled - set false to pause polling
 * @param intervalMs - polling interval (default 5 s)
 */
export function useJobPolling(
  jobId: number,
  enabled = true,
  intervalMs = 5000
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !jobId) return;

    const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'APPROVED', 'APPROVED_WITH_COMMENTS']);

    const interval = setInterval(async () => {
      // Silently refetch — React Query merges into existing cache
      const data = await qc.fetchQuery({
        queryKey: JOB_KEYS.detail(jobId),
        staleTime: 0,
      });

      const job = data as MigrationJob | undefined;
      if (job && TERMINAL.has(job.current_state)) {
        clearInterval(interval);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [jobId, enabled, intervalMs, qc]);
}

/**
 * Poll the jobs list periodically so the table stays fresh
 * while any jobs are in active (non-terminal) states.
 */
export function useJobsListPolling(hasActiveJobs: boolean, intervalMs = 8000) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: JOB_KEYS.lists() });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [hasActiveJobs, intervalMs, qc]);
}
