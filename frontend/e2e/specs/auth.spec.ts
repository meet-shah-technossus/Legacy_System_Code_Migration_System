/**
 * Auth flow E2E tests.
 *
 * Covers: login success, login failure, protected-route redirect,
 * register, and logout.
 */

import { test, expect } from '@playwright/test';
import { MOCK_AUTH_RESPONSE, MOCK_USER } from '../mocks/responses';

// ─── Login ────────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test('redirects unauthenticated users from "/" to "/login"', async ({ page }) => {
    // No token in localStorage — authStore.isAuthenticated will be false
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form elements', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('successful login stores token and navigates to dashboard', async ({ page }) => {
    // Mock the login endpoint
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AUTH_RESPONSE),
      })
    );
    // Mock /me and statistics for the dashboard that loads after login
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
    );
    await page.route('**/api/jobs/statistics', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total_jobs: 0, by_state: {}, by_language: {} }),
      })
    );
    await page.route('**/api/jobs/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/audit-logs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, logs: [] }) })
    );
    await page.route('**/api/metrics/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto('/login');
    await page.getByLabel(/username/i).fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Should navigate away from /login
    await expect(page).not.toHaveURL(/\/login/);

    // Token saved in localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBe(MOCK_AUTH_RESPONSE.access_token);
  });

  test('shows error message on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        // Use 400 (not 401) so the global 401 interceptor doesn't redirect
        // before the LoginPage error handler fires
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Incorrect username or password' }),
      })
    );

    await page.goto('/login');
    await page.getByLabel(/username/i).fill('wronguser');
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // A toast or inline error should appear
    await expect(
      page.getByText(/incorrect|invalid|wrong|failed|unauthorized/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('prevents submission with empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should stay on login page — no navigation occurred
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Register ─────────────────────────────────────────────────────────────────

test.describe('Register page', () => {
  test('shows register form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
  });

  test('successful registration navigates to dashboard', async ({ page }) => {
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AUTH_RESPONSE),
      })
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
    );
    await page.route('**/api/jobs/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/audit-logs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, logs: [] }) })
    );
    await page.route('**/api/metrics/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto('/register');
    await page.getByLabel(/username/i).fill('newuser');
    await page.getByLabel(/email/i).fill('new@example.com');
    // Fill all password fields (password + confirm password if present)
    const passwordInputs = page.locator('input[type="password"]');
    const pwCount = await passwordInputs.count();
    for (let i = 0; i < pwCount; i++) {
      await passwordInputs.nth(i).fill('Password123!');
    }

    const fullNameInput = page.getByLabel(/full name/i);
    if (await fullNameInput.isVisible()) {
      await fullNameInput.fill('New User');
    }

    await page.getByRole('button', { name: /register|sign up|create/i }).click();
    await expect(page).not.toHaveURL(/\/register/, { timeout: 10000 });
  });

  test('has link to login page', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('link', { name: /sign in|log in|already have/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('clears token and redirects to login', async ({ page }) => {
    // Seed auth
    await page.addInitScript(
      ({ token, user }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));
      },
      { token: MOCK_AUTH_RESPONSE.access_token, user: MOCK_USER }
    );

    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
    );
    await page.route('**/api/jobs/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.route('**/api/audit-logs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, logs: [] }) })
    );
    await page.route('**/api/metrics/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto('/');

    // Open the avatar menu and click logout
    await page.getByRole('button', { name: /admin user|admin/i }).first().click();
    await page.getByRole('menuitem', { name: /logout/i }).click();

    await expect(page).toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });
});
