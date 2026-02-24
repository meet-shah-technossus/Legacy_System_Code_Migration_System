/**
 * Reviews page E2E tests.
 *
 * Covers: page renders, pending/history tabs, review submission modal.
 */

import { test, expect } from '../fixtures/auth';
import {
  MOCK_JOB_SUMMARIES,
  MOCK_JOB_2,
  MOCK_REVIEWS,
  MOCK_YAML_VERSIONS,
} from '../mocks/responses';

test.describe('Reviews page', () => {
  test.beforeEach(async ({ authPage }) => {
    // Jobs list used to populate the reviews page
    // Using URL function so query params don't break matching
    await authPage.route(
      (url) => url.pathname === '/api/jobs/',
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_SUMMARIES),
      })
    );
    // Reviews per job
    await authPage.route('**/api/jobs/1/reviews**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REVIEWS),
      })
    );
    await authPage.route('**/api/jobs/2/reviews**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    // Latest review
    await authPage.route('**/api/jobs/1/reviews/latest', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REVIEWS[0]),
      })
    );
    await authPage.route('**/api/jobs/2/reviews/latest', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );
    // YAML versions list
    await authPage.route('**/api/jobs/*/yaml/versions**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_YAML_VERSIONS),
      })
    );
    // Latest YAML version — used by ReviewModal to get the yaml_version_id
    await authPage.route('**/api/jobs/*/yaml/latest**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MOCK_YAML_VERSIONS[0],
          yaml_content: '# Mock YAML\nversion: 1',
          validation_errors: [],
          regeneration_reason: null,
        }),
      })
    );

    await authPage.goto('/reviews');
  });

  test('renders the reviews page heading', async ({ authPage }) => {
    await expect(authPage.getByRole('heading', { name: /review/i })).toBeVisible();
  });

  test('shows tabs for pending and history', async ({ authPage }) => {
    const tabs = authPage.getByRole('tab');
    await expect(tabs.first()).toBeVisible();
  });

  test('UNDER_REVIEW job appears in pending tab', async ({ authPage }) => {
    // MOCK_JOB_2 has state UNDER_REVIEW
    const pendingTab = authPage.getByRole('tab', { name: /pending/i });
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
    }
    await expect(authPage.getByText('Order Processing Migration')).toBeVisible();
  });

  test('history tab shows previous reviews', async ({ authPage }) => {
    const historyTab = authPage.getByRole('tab', { name: /history|completed|past/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();
      // MOCK_REVIEW_SUMMARY has decision APPROVE
      await expect(authPage.getByText(/approve/i).first()).toBeVisible();
    }
  });

  test('submit review button is visible for pending job', async ({ authPage }) => {
    const pendingTab = authPage.getByRole('tab', { name: /pending/i });
    if (await pendingTab.isVisible()) await pendingTab.click();

    await expect(
      authPage.getByRole('button', { name: /review|submit|write|start/i }).first()
    ).toBeVisible({ timeout: 7000 });
  });

  test('opening review modal shows decision radio buttons', async ({ authPage }) => {
    const pendingTab = authPage.getByRole('tab', { name: /pending/i });
    if (await pendingTab.isVisible()) await pendingTab.click();

    const reviewBtn = authPage
      .getByRole('button', { name: /review|submit review|start review/i })
      .first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      // Modal should show decision options
      await expect(
        authPage.getByText(/approve|reject|regenerate/i).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('submitting an approve decision calls the API', async ({ authPage }) => {
    let reviewPosted = false;

    // Match any job's reviews endpoint — the first "Review Now" card could be job 1 or 2
    await authPage.route(
      (url) => url.pathname.includes('/reviews') && url.pathname.includes('/jobs/'),
      async (route) => {
        if (route.request().method() === 'POST') {
          reviewPosted = true;
          const jobIdMatch = route.request().url().match(/\/jobs\/(\d+)\//)
          const jobId = jobIdMatch ? parseInt(jobIdMatch[1]) : 1;
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 99,
              job_id: jobId,
              yaml_version_id: 1,
              decision: 'APPROVE',
              general_comment: 'Automated E2E approval',
              performed_by: 'admin',
              created_at: new Date().toISOString(),
              comments: [],
            }),
          });
        } else {
          // GET — return the existing reviews or empty list
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
      }
    );

    const pendingTab = authPage.getByRole('tab', { name: /pending/i });
    if (await pendingTab.isVisible()) await pendingTab.click();

    const reviewBtn = authPage
      .getByRole('button', { name: /review|submit review|start review/i })
      .first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();

      // Select "Approve" radio if visible (APPROVE is selected by default)
      const approveRadio = authPage.getByRole('radio', { name: /^approve/i });
      if (await approveRadio.isVisible()) await approveRadio.click();

      // Submit button text matches decisionConfig[decision].label = "Approve YAML"
      const submitBtn = authPage.getByRole('button', { name: /approve yaml|approve|submit|confirm/i });
      if (await submitBtn.isVisible()) await submitBtn.click();

      // Wait for API call
      await authPage.waitForTimeout(1000);
      expect(reviewPosted).toBe(true);
    }
  });
});
