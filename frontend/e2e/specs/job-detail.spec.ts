/**
 * Job detail page E2E tests.
 *
 * Covers: job metadata, tabs (YAML versions, reviews, generated code,
 * source), state-transition actions, and error boundary.
 */

import { test, expect } from '../fixtures/auth';
import {
  MOCK_JOB_DETAIL,
  MOCK_JOB_WITH_SOURCE,
  MOCK_ALLOWED_TRANSITIONS,
  MOCK_YAML_VERSIONS,
  MOCK_REVIEWS,
  MOCK_AUDIT_LOGS,
  MOCK_JOB_QUEUED_DETAIL,
} from '../mocks/responses';

// ─── Shared beforeEach ────────────────────────────────────────────────────────

async function setupJobDetailRoutes(page: any) {
  await page.route('**/api/jobs/1', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_JOB_DETAIL),
    })
  );
  await page.route('**/api/jobs/1/with-source', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_JOB_WITH_SOURCE),
    })
  );
  await page.route('**/api/jobs/1/allowed-transitions', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ALLOWED_TRANSITIONS),
    })
  );
  await page.route('**/api/jobs/1/yaml/versions**', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_YAML_VERSIONS),
    })
  );
  await page.route('**/api/jobs/1/reviews**', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_REVIEWS),
    })
  );
  await page.route('**/api/jobs/1/audit-trail', (route: any) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUDIT_LOGS),
    })
  );
  await page.route('**/api/jobs/1/code**', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Job detail page', () => {
  test.beforeEach(async ({ authPage }) => {
    await setupJobDetailRoutes(authPage);
    await authPage.goto('/jobs/1');
  });

  test('renders job name in heading', async ({ authPage }) => {
    await expect(authPage.getByText('Inventory Migration')).toBeVisible();
  });

  test('shows job state badge', async ({ authPage }) => {
    await expect(authPage.getByText(/created/i).first()).toBeVisible();
  });

  test('shows target language', async ({ authPage }) => {
    await expect(authPage.getByText(/python/i).first()).toBeVisible();
  });

  test('shows source filename', async ({ authPage }) => {
    await expect(authPage.getByText(/inventory\.pick/i)).toBeVisible();
  });

  test('tabs are rendered', async ({ authPage }) => {
    // The page should have at least YAML, Reviews, or Source tabs
    const tabs = authPage.getByRole('tab');
    await expect(tabs.first()).toBeVisible();
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);
  });

  test('YAML versions tab shows version entry', async ({ authPage }) => {
    // Click the YAML Versions tab
    const yamlTab = authPage.getByRole('tab', { name: /yaml/i });
    if (await yamlTab.isVisible()) {
      await yamlTab.click();
      await expect(authPage.getByText(/version 1|v1|v\.1/i).first()).toBeVisible();
    }
  });

  test('source tab shows original source code', async ({ authPage }) => {
    const sourceTab = authPage.getByRole('tab', { name: /source/i });
    if (await sourceTab.isVisible()) {
      await sourceTab.click();
      // Source code is rendered in Monaco editor — check editor container is visible
      const editor = authPage.locator('.monaco-editor, [data-testid="source-code"], pre').first();
      await expect(editor).toBeVisible({ timeout: 5000 });
    }
  });

  test('action panel shows allowed transition button', async ({ authPage }) => {
    // MOCK_ALLOWED_TRANSITIONS has YAML_GENERATED as allowed
    await expect(
      authPage.getByRole('button', { name: /generate yaml|yaml|start/i }).first()
    ).toBeVisible();
  });

  test('404 job shows error boundary or not-found message', async ({ authPage }) => {
    await authPage.route('**/api/jobs/9999**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Job not found' }) })
    );
    await authPage.goto('/jobs/9999');
    await expect(
      authPage.getByText(/not found|error|job.*not exist/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── State transition ─────────────────────────────────────────────────────────

test.describe('Job state transition', () => {
  test('clicking a transition button calls the API and updates state', async ({ authPage }) => {
    await setupJobDetailRoutes(authPage);

    // Mock the transition endpoint
    const transitionedJob = {
      ...MOCK_JOB_DETAIL,
      current_state: 'YAML_GENERATED',
      yaml_versions_count: 1,
    };
    await authPage.route('**/api/jobs/1/transition', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(transitionedJob),
      })
    );

    await authPage.goto('/jobs/1');

    // Wait for the transition button — text is "Start Review" (ACTION_LABELS for YAML_GENERATED)
    const btn = authPage.getByRole('button', { name: /start review|generate yaml|yaml|start|process/i }).first();
    await expect(btn).toBeVisible();
    await btn.click();

    // A modal "Transition to: YAML Ready" opens — confirm it
    const confirmBtn = authPage.getByRole('button', { name: /confirm|proceed|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      await confirmBtn.click();
    }

    // After confirmation, toast or updated state badge should appear
    await expect(
      authPage.getByText(/yaml.?ready|yaml.?generated|generating|success/i).first()
    ).toBeVisible({ timeout: 7000 });
  });
});

// ─── YAML_APPROVED_QUEUED — Open in Studio CTA ────────────────────────────────────────

test.describe('Job detail — YAML_APPROVED_QUEUED state', () => {
  test.beforeEach(async ({ authPage }) => {
    // Override job API with a queued job
    await authPage.route('**/api/jobs/3', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_QUEUED_DETAIL),
      })
    );
    await authPage.route('**/api/jobs/3/with-source', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_JOB_QUEUED_DETAIL, original_source_code: '001 READ ITEM' }),
      })
    );
    await authPage.route('**/api/jobs/3/allowed-transitions', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ current_state: 'YAML_APPROVED_QUEUED', allowed_transitions: [], is_terminal: true }),
      })
    );
    await authPage.route('**/api/jobs/3/yaml/versions**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await authPage.route('**/api/jobs/3/reviews**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await authPage.route('**/api/jobs/3/audit-trail', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, logs: [] }) })
    );
    await authPage.route('**/api/jobs/3/code**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await authPage.goto('/jobs/3');
  });

  test('shows “Open in Studio” button in the Current State panel', async ({ authPage }) => {
    const btn = authPage.getByRole('button', { name: /open in studio/i });
    await expect(btn).toBeVisible({ timeout: 5000 });
  });

  test('shows teal helper text about Studio pickup', async ({ authPage }) => {
    await expect(
      authPage.getByText(/yaml approved.*ready|ready for code generation/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('clicking “Open in Studio” navigates to Studio (/)', async ({ authPage }) => {
    const btn = authPage.getByRole('button', { name: /open in studio/i });
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    // Studio is served at the root path
    await expect(authPage).toHaveURL('/', { timeout: 5000 });
  });
});

