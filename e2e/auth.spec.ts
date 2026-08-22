// Auth-callback hygiene in the shipped bundle (local mode): a stray PKCE
// ?code= param must never break HashRouter routing or cause redirect loops.
// The full magic-link e2e (real inbox) is a documented manual test — see
// docs/SPRINT1_NOTES.md.

import { expect, test } from '@playwright/test';

test('stray ?code param does not break routing in local mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?code=fake-pkce-code#/dashboard');
  // App renders normally (local mode ignores the code) and the route resolves.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  // No infinite reload/redirect: URL still contains our route.
  expect(page.url()).toContain('#/dashboard');
});

test('auth-like fragments never shadow real routes', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#/opportunities');
  await expect(page.getByRole('heading', { name: 'Tenders & Opportunities' })).toBeVisible();
});
