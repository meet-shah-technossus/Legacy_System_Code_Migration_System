/**
 * Jobs list and create-job E2E tests.
 *
 * Covers: jobs list renders, filter by state, create job form
 * validation and submission.
 */

import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import {
  MOCK_JOB_SUMMARIES,
  MOCK_JOB_DETAIL,
  MOCK_JOB_STATISTICS,
} from '../mocks/responses';

// ─── Shared route helper ──────────────────────────────────────────────────────

async function mockJobRoutes(page: Page) {
  await page.route('**/api/jobs/', async (route: any) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_SUMMARIES),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_DETAIL),
      });
    } else {
      await route.continue();
    }
  });
}

// ─── Jobs list ────────────────────────────────────────────────────────────────

test.describe('Jobs list page', () => {
  test.beforeEach(async ({ authPage }) => {
    // URL function ensures query params (?skip=0&limit=20) don't break matching
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(MOCK_JOB_DETAIL) });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_JOB_SUMMARIES) });
        }
      }
    );
    await authPage.goto('/jobs');
  });

  test('renders the page heading', async ({ authPage }) => {
    await expect(authPage.getByRole('heading', { name: /migration jobs/i })).toBeVisible();
  });

  test('displays job names from the API', async ({ authPage }) => {
    await expect(authPage.getByText('Inventory Migration')).toBeVisible();
    await expect(authPage.getByText('Order Processing Migration')).toBeVisible();
  });

  test('displays job state badges', async ({ authPage }) => {
    // Target Chakra badges specifically to avoid matching hidden <option> elements
    await expect(authPage.locator('.chakra-badge').filter({ hasText: /created/i }).first()).toBeVisible();
    await expect(authPage.locator('.chakra-badge').filter({ hasText: /under.?review/i }).first()).toBeVisible();
  });

  test('displays target language labels', async ({ authPage }) => {
    await expect(authPage.locator('.chakra-badge').filter({ hasText: /python/i }).first()).toBeVisible();
  });

  test('shows "New Job" / "Create Job" button', async ({ authPage }) => {
    // Button or link that opens the create-job form
    await expect(
      authPage.getByRole('button', { name: /new|create/i })
        .or(authPage.getByRole('link', { name: /new|create/i }))
        .first()
    ).toBeVisible();
  });

  test('clicking a job row navigates to job detail', async ({ authPage }) => {
    await authPage.route('**/api/jobs/1**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_DETAIL),
      })
    );
    // Click the first job link
    await authPage.getByText('Inventory Migration').click();
    await expect(authPage).toHaveURL(/\/jobs\/1/);
  });

  test('empty state shown when no jobs returned', async ({ authPage }) => {
    // Override with URL function that also covers query-param variants
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await authPage.goto('/jobs');
    await expect(authPage.getByText(/no jobs|no migration|empty/i).first()).toBeVisible();
  });
});

// ─── Create job form ─────────────────────────────────────────────────────────

test.describe('Create job page', () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.goto('/jobs/new');
  });

  test('renders the create job form', async ({ authPage }) => {
    // Heading text may vary — check for any heading or the page container
    await expect(
      authPage.getByRole('heading').or(authPage.locator('h1, h2, h3')).first()
    ).toBeVisible();
  });

  test('shows source code textarea', async ({ authPage }) => {
    // Monaco editor or a textarea for Pick Basic code
    const editor = authPage.locator('textarea, .monaco-editor').first();
    await expect(editor).toBeVisible();
  });

  test('shows job details section heading', async ({ authPage }) => {
    // Target language is set in the Studio (Job 2), not the create-job page (Job 1).
    // Verify the "Job Details" card is present as a proxy for a fully rendered form.
    await expect(
      authPage.getByText(/job details|new migration|source code/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('submit with valid data creates job and redirects', async ({ authPage }) => {
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_JOB_DETAIL),
          });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_JOB_SUMMARIES) });
        }
      }
    );
    await authPage.route('**/api/jobs/1**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_DETAIL),
      })
    );

    // Fill job name if the field exists
    const jobNameInput = authPage.getByPlaceholder(/job name|name/i).first();
    if (await jobNameInput.isVisible()) {
      await jobNameInput.fill('E2E Test Job');
    }

    // Fill source code via "Load sample" button (bypasses Monaco editor state)
    // Falls back to directly filling the visible Pick Basic textarea
    const loadSampleBtn = authPage.getByRole('button', { name: /load sample/i });
    if (await loadSampleBtn.isVisible({ timeout: 2000 })) {
      await loadSampleBtn.click();
    } else {
      const textarea = authPage.locator('textarea[placeholder*="Pick Basic"]').first();
      if (await textarea.isVisible()) {
        await textarea.fill('001 READ VAR FROM FILE COBOL');
      }
    }

    await authPage.getByRole('button', { name: /create|submit|save/i }).click();

    // Should redirect to the job detail page
    await expect(authPage).toHaveURL(/\/jobs\/1/);
  });

  test('shows validation error if source code is empty', async ({ authPage }) => {
    await authPage.getByRole('button', { name: /create|submit|save/i }).click();
    // Inline validation or toast error
    await expect(
      authPage.getByText(/required|source code|cannot be empty/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Open in Studio icon button on queued rows ────────────────────────────────────

import { MOCK_JOB_SUMMARIES_WITH_QUEUED } from '../mocks/responses';

test.describe('Jobs list — Studio icon on queued rows', () => {
  test.beforeEach(async ({ authPage }) => {
    // Return a list that includes a YAML_APPROVED_QUEUED job
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_JOB_SUMMARIES_WITH_QUEUED),
        })
    );
    await authPage.goto('/jobs');
  });

  test('shows the queued job in the list', async ({ authPage }) => {
    await expect(authPage.getByText('Queued Batch Migration')).toBeVisible();
  });

  test('queued row has a Queued state badge', async ({ authPage }) => {
    await expect(
      authPage.locator('.chakra-badge').filter({ hasText: /queued/i }).first()
    ).toBeVisible();
  });

  test('queued row shows the “Open in Studio” icon button', async ({ authPage }) => {
    const studioBtn = authPage.getByRole('button', { name: /open in studio/i });
    await expect(studioBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking Studio icon on queued row navigates to Studio (/)', async ({ authPage }) => {
    const studioBtn = authPage.getByRole('button', { name: /open in studio/i }).first();
    await expect(studioBtn).toBeVisible({ timeout: 5000 });
    await studioBtn.click();
    await expect(authPage).toHaveURL('/', { timeout: 5000 });
  });

  test('non-queued rows do NOT have a Studio icon button', async ({ authPage }) => {
    // Only the queued row (#3) should show the Studio button; rows #1 and #2 should not
    // Count Studio buttons — there should be exactly 1 (for the queued row)
    const studioBtns = authPage.getByRole('button', { name: /open in studio/i });
    await expect(studioBtns).toHaveCount(1);
  });
});

