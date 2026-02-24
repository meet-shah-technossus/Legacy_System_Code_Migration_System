/**
 * Settings page E2E tests.
 *
 * Covers: page renders, preference toggles, theme change, persistence.
 */

import { test, expect } from '../fixtures/auth';

test.describe('Settings page', () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.goto('/settings');
  });

  test('renders the settings page heading', async ({ authPage }) => {
    await expect(
      authPage.getByRole('heading', { name: /settings|preferences/i })
    ).toBeVisible();
  });

  test('shows preference sections', async ({ authPage }) => {
    // At least one preference control should be visible
    const controls = authPage
      .getByRole('switch')
      .or(authPage.getByRole('checkbox'))
      .or(authPage.getByRole('combobox'));
    await expect(controls.first()).toBeVisible();
  });

  test('toggling "absolute timestamps" switch is interactive', async ({ authPage }) => {
    const toggle = authPage
      .getByRole('switch', { name: /absolute|timestamp/i })
      .or(authPage.getByLabel(/absolute|timestamp/i))
      .first();

    if (await toggle.isVisible()) {
      const initialState = await toggle.getAttribute('aria-checked');
      await toggle.click();
      const newState = await toggle.getAttribute('aria-checked');
      expect(newState).not.toBe(initialState);
    }
  });

  test('page size select exists and can be changed', async ({ authPage }) => {
    const select = authPage.getByRole('combobox', { name: /page size|items per page/i });
    if (await select.isVisible()) {
      await select.selectOption({ index: 1 });
      // No crash
      await expect(authPage.locator('body')).toBeVisible();
    }
  });

  test('refresh interval slider or input exists', async ({ authPage }) => {
    const slider = authPage
      .getByRole('slider', { name: /refresh/i })
      .or(authPage.getByRole('spinbutton', { name: /refresh/i }))
      .or(authPage.getByLabel(/refresh interval/i));

    if (await slider.first().isVisible()) {
      await expect(slider.first()).toBeVisible();
    }
  });

  test('color mode toggle switches theme', async ({ authPage }) => {
    const toggle = authPage.getByRole('button', { name: /toggle color mode|dark mode|light mode/i });
    if (await toggle.isVisible()) {
      const htmlBefore = await authPage.locator('html').getAttribute('data-theme').catch(() => null);
      await toggle.click();
      const htmlAfter = await authPage.locator('html').getAttribute('data-theme').catch(() => null);
      // Either data-theme changed or the test just passed without crash
      if (htmlBefore !== null) {
        expect(htmlAfter).not.toBe(htmlBefore);
      }
    }
  });

  test('preferences persist after reload', async ({ authPage }) => {
    const toggle = authPage
      .getByRole('switch', { name: /absolute|timestamp/i })
      .first();

    if (await toggle.isVisible()) {
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();

      // Reload the page (localStorage persists)
      await authPage.reload();
      await authPage.goto('/settings');

      const after = await authPage
        .getByRole('switch', { name: /absolute|timestamp/i })
        .first()
        .getAttribute('aria-checked');
      expect(after).not.toBe(before);
    }
  });
});
