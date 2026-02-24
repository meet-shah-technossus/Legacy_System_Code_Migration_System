/**
 * Custom Playwright fixtures.
 *
 * `authenticatedPage` — a Page that has auth tokens pre-seeded in
 * localStorage so Zustand's authStore initialises as "logged in" before
 * any page script runs.
 */

import { test as base, expect, type Page } from '@playwright/test';
import { MOCK_TOKEN, MOCK_USER, MOCK_JOB_STATISTICS, MOCK_AUDIT_LOGS } from '../mocks/responses';

// ─── Helper: mock the endpoints that almost every page calls ──────────────────

export async function mockCommonRoutes(page: Page) {
  // Auth
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  );
  // Statistics (used by Dashboard & Navbar badges)
  await page.route('**/api/jobs/statistics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_JOB_STATISTICS),
    })
  );
  // Audit recent (used by Dashboard & Audit page)
  await page.route('**/api/audit-logs/recent**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUDIT_LOGS),
    })
  );
}

// ─── Fixture types ────────────────────────────────────────────────────────────

type CustomFixtures = {
  /** A page with auth localStorage pre-seeded and common routes mocked. */
  authPage: Page;
};

// ─── Extended test ────────────────────────────────────────────────────────────

export const test = base.extend<CustomFixtures>({
  authPage: async ({ page }, use) => {
    // addInitScript runs BEFORE any page script — Zustand picks up the token
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      { token: MOCK_TOKEN, user: MOCK_USER }
    );

    await mockCommonRoutes(page);
    await use(page);
  },
});

export { expect };
