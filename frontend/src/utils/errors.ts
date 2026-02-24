import type { AxiosError } from 'axios';

export interface ApiErrorDetail {
  message: string;
  status?: number;
}

/** Extract a user-friendly error message from any thrown error */
export function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    const detail = responseData?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // Pydantic validation errors → [{loc, msg, type}]
      return (detail as Array<Record<string, unknown>>)
        .map((d) => (typeof d.msg === 'string' ? d.msg : JSON.stringify(d)))
        .join('; ');
    }
    if (error.response?.status === 422) return 'Validation error — check your input.';
    if (error.response?.status === 401) return 'Not authenticated.';
    if (error.response?.status === 403) return 'You do not have permission.';
    if (error.response?.status === 404) return 'Resource not found.';
    if (error.response?.status === 409) return 'Conflict — resource already exists.';
    if (error.response?.status === 500) return 'Server error — please try again.';
    return error.message ?? 'An unexpected error occurred.';
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}

/** Type guard for Axios errors */
export function isAxiosError(error: unknown): error is AxiosError {
  return !!(error && typeof error === 'object' && 'isAxiosError' in error);
}

/** Returns true if the error was a 404 */
export function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** Returns true if the error was a 401 */
export function isUnauthorized(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401;
}

/** Returns true if the error was a state machine violation (422 with detail about state) */
export function isStateError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const responseData = error.response?.data as Record<string, unknown> | undefined;
  const detail = responseData?.detail ?? '';
  return typeof detail === 'string' && detail.toLowerCase().includes('transition');
}
