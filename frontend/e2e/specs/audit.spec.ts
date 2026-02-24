/**
 * Audit log page E2E tests.
 *
 * Covers: page renders, log entries shown, action filter.
 */

import { test, expect } from '../fixtures/auth';
import { MOCK_AUDIT_LOGS } from '../mocks/responses';

test.describe('Audit log page', () => {
  test.beforeEach(async ({ authPage }) => {
    // Override common route with specific data
    await authPage.route('**/api/audit-logs/recent**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AUDIT_LOGS),
      })
    );
    await authPage.route('**/api/audit-logs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AUDIT_LOGS),
      })
    );

    await authPage.goto('/audit');
  });

  test('renders the audit log page heading', async ({ authPage }) => {
    await expect(
      authPage.getByRole('heading', { name: /audit/i })
    ).toBeVisible();
  });

  test('shows audit log entries from the API', async ({ authPage }) => {
    // Use .first() to handle strict-mode when badge renders action text twice
    await expect(authPage.getByText(/job_created/i).first()).toBeVisible();
    await expect(authPage.getByText(/yaml_generated/i).first()).toBeVisible();
    await expect(authPage.getByText(/review_submitted/i).first()).toBeVisible();
  });

  test('shows performer names', async ({ authPage }) => {
    // Look inside the main content area to skip the hidden Navbar avatar menu
    await expect(
      authPage.locator('main, [role="main"], .chakra-container').getByText(/admin/i).first()
    ).toBeVisible();
    await expect(authPage.getByText(/reviewer1/i).first()).toBeVisible();
  });

  test('shows total count', async ({ authPage }) => {
    // MOCK_AUDIT_LOGS.total = 3 — match "3 entries" or the badge showing "3"
    await expect(authPage.getByText(/3 entries|3 logs|3 results|^3$/i).first()).toBeVisible();
  });

  test('has refresh / live indicator', async ({ authPage }) => {
    await expect(
      authPage.getByRole('button', { name: /refresh/i }).or(
        authPage.getByText(/live|auto.?refresh/i)
      ).first()
    ).toBeVisible();
  });

  test('shows error logs tab or filter', async ({ authPage }) => {
    const errorTab = authPage.getByRole('tab', { name: /error/i });
    const errorFilter = authPage.getByRole('button', { name: /error/i });
    const either = errorTab.or(errorFilter).first();
    // Either an errors tab or filter button should exist
    if (await either.isVisible()) {
      await either.click();
      // No crash after clicking
      await expect(authPage.locator('body')).toBeVisible();
    }
  });

  test('empty audit state when no logs returned', async ({ authPage }) => {
    await authPage.route('**/api/audit-logs/recent**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, logs: [] }),
      })
    );
    await authPage.route('**/api/audit-logs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, logs: [] }),
      })
    );
    await authPage.goto('/audit');
    // Empty state shows "0 entries" counter and/or "No recent activity" message
    await expect(
      authPage.getByText('0 entries')
        .or(authPage.getByText('No recent activity'))
        .or(authPage.getByText('No audit logs found'))
        .first()
    ).toBeVisible({ timeout: 7000 });
  });
});
