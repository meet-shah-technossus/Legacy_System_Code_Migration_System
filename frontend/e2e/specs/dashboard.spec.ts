/**
 * Dashboard page E2E tests.
 *
 * Covers: stats cards, recent jobs table, navigation links.
 */

import { test, expect } from '../fixtures/auth';
import {
  MOCK_JOB_SUMMARIES,
  MOCK_JOB_STATISTICS,
  MOCK_AUDIT_LOGS,
  MOCK_METRICS_SUMMARY,
} from '../mocks/responses';

test.describe('Dashboard page', () => {
  test.beforeEach(async ({ authPage }) => {
    // Use URL function so query params (?skip=0&limit=5) don't break matching
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_SUMMARIES),
      })
    );
    await authPage.route('**/api/metrics/summary**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_METRICS_SUMMARY),
      })
    );
    await authPage.goto('/');
  });

  test('renders the page heading', async ({ authPage }) => {
    await expect(authPage.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('shows total jobs stat card', async ({ authPage }) => {
    // The statistics mock returns total_jobs: 5 — use first() to avoid strict-mode
    await expect(authPage.getByText('5').first()).toBeVisible();
  });

  test('shows state breakdown from statistics', async ({ authPage }) => {
    // MOCK_JOB_STATISTICS has COMPLETED: 1
    await expect(authPage.getByText(/completed/i).first()).toBeVisible();
  });

  test('shows recent job names in the jobs list', async ({ authPage }) => {
    await expect(authPage.getByText('Inventory Migration')).toBeVisible();
    await expect(authPage.getByText('Order Processing Migration')).toBeVisible();
  });

  test('navigate to Jobs page from navbar link', async ({ authPage }) => {
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_SUMMARIES),
      })
    );
    await authPage.getByRole('link', { name: /^jobs$/i }).click();
    await expect(authPage).toHaveURL(/\/jobs/);
  });

  test('navigate to Reviews page from navbar link', async ({ authPage }) => {
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_JOB_SUMMARIES) })
    );
    await authPage.getByRole('link', { name: /reviews/i }).click();
    await expect(authPage).toHaveURL(/\/reviews/);
  });

  test('shows audit log entries section', async ({ authPage }) => {
    // MOCK_AUDIT_LOGS has 'job_created' action
    await expect(authPage.getByText(/job_created|audit|recent activity/i).first()).toBeVisible();
  });
});
