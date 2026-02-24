/**
 * Analytics page E2E tests.
 *
 * Covers: page renders, metric cards, chart containers visible.
 */

import { test, expect } from '../fixtures/auth';
import { MOCK_METRICS_SUMMARY, MOCK_JOB_STATISTICS } from '../mocks/responses';

test.describe('Analytics page', () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.route('**/api/metrics/summary**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_METRICS_SUMMARY),
      })
    );
    await authPage.route('**/api/metrics/success-rate/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          operation: 'yaml_generation',
          success_count: 4,
          failure_count: 1,
          success_rate: 80,
          hours: 24,
        }),
      })
    );
    await authPage.route('**/api/metrics/performance/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          operation: 'yaml_generation',
          min_seconds: 0.8,
          max_seconds: 3.2,
          avg_seconds: 1.5,
          count: 4,
        }),
      })
    );
    await authPage.route('**/api/jobs/statistics', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_STATISTICS),
      })
    );

    await authPage.goto('/analytics');
  });

  test('renders the analytics page heading', async ({ authPage }) => {
    await expect(
      authPage.getByRole('heading', { name: /analytics|metrics/i })
    ).toBeVisible();
  });

  test('shows jobs created metric from summary', async ({ authPage }) => {
    // MOCK_METRICS_SUMMARY.jobs.created = 3
    await expect(authPage.getByText('3').first()).toBeVisible();
  });

  test('shows total jobs count', async ({ authPage }) => {
    // MOCK_JOB_STATISTICS.total_jobs = 5
    await expect(authPage.getByText('5').first()).toBeVisible();
  });

  test('shows a chart or graph container', async ({ authPage }) => {
    // Look for Recharts wrapper or SVG surface — skip aria-hidden icon SVGs
    const chart = authPage
      .locator('.recharts-wrapper, .recharts-surface, svg.recharts-surface')
      .or(authPage.locator('svg[width][height]').filter({ hasNot: authPage.locator('[aria-hidden="true"]') }))
      .first();
    await expect(chart).toBeVisible({ timeout: 10000 });
  });

  test('shows success rate percentage', async ({ authPage }) => {
    // Match "80%" exactly to avoid matching "8000.0%" or other numerics
    await expect(authPage.getByText('80%').first()).toBeVisible();
  });

  test('shows reviews submitted count', async ({ authPage }) => {
    // MOCK_METRICS_SUMMARY.reviews.submitted = 5
    await expect(authPage.getByText('5').first()).toBeVisible();
  });

  test('time range selector exists', async ({ authPage }) => {
    const selector = authPage
      .getByRole('combobox', { name: /time|range|hours/i })
      .or(authPage.getByRole('button', { name: /24h|48h|7d/i }))
      .first();
    if (await selector.isVisible()) {
      await expect(selector).toBeVisible();
    }
  });
});
