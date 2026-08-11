// Playwright smoke tests for the Tenders & Opportunities module.

import { expect, test, type Page } from '@playwright/test';

async function freshApp(page: Page, path = '/#/opportunities') {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__pw_cleared')) {
      localStorage.clear();
      sessionStorage.setItem('__pw_cleared', '1');
    }
  });
  await page.goto(path);
}

test('browse, filter and open an opportunity', async ({ page }) => {
  await freshApp(page);
  await expect(page.getByRole('heading', { name: 'Tenders & Opportunities' })).toBeVisible();
  const cards = page.getByTestId('opportunity-card');
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(20);

  // Keyword filter narrows the list.
  await page.getByTestId('opp-filter-keyword').fill('roadmap');
  await expect.poll(async () => page.getByTestId('opportunity-card').count()).toBeLessThan(total);

  // Min score filter.
  await page.getByTestId('opp-filter-keyword').fill('');
  await page.getByTestId('opp-filter-minscore').selectOption('80');
  const highCount = await page.getByTestId('opportunity-card').count();
  expect(highCount).toBeGreaterThan(0);
  expect(highCount).toBeLessThan(total);

  // Open the detail: executive record shows match analysis.
  await page.getByTestId('open-opportunity').first().click();
  await expect(page.getByTestId('opportunity-detail')).toBeVisible();
  await expect(page.getByText('Match analysis (demo score)')).toBeVisible();
  await expect(page.getByText('Demo opportunity — fictional data').first()).toBeVisible();
});

test('save an opportunity and find it in Saved', async ({ page }) => {
  await freshApp(page);
  const firstTitle = await page.getByTestId('opportunity-card').first().locator('h3').textContent();
  await page.getByTestId('save-opportunity').first().click();
  await page.getByRole('tab', { name: /Saved/ }).click();
  await expect(page.getByTestId('opportunity-card').first().locator('h3')).toHaveText(
    firstTitle ?? '',
  );
});

test('delivery cost estimate computes margin and persists', async ({ page }) => {
  await freshApp(page);
  await page.getByTestId('open-opportunity').first().click();
  await page.getByTestId('open-delivery-estimate').click();
  await expect(page.getByTestId('delivery-estimate')).toBeVisible();
  await expect(page.getByTestId('delivery-total')).not.toHaveText('');
  await expect(page.getByTestId('delivery-margin')).toBeVisible();
  await page.getByTestId('save-delivery-estimate').click();
  // Reload: the estimate is stored with the opportunity.
  await page.reload();
  await page.getByTestId('open-opportunity').first().click();
  await expect(page.getByTestId('delivery-estimate')).toBeVisible();
});

test('pipeline drag persists opportunity status', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('tab', { name: 'Pipeline' }).click();
  const card = page.locator('[data-testid^="opp-card-"]').first();
  await expect(card).toBeVisible();
  const cardId = await card.getAttribute('data-testid');
  const target = page.getByTestId('opp-column-go');
  await card.dispatchEvent('dragstart');
  await target.dispatchEvent('dragover');
  await target.dispatchEvent('drop');
  await page.reload();
  await page.getByRole('tab', { name: 'Pipeline' }).click();
  await expect(
    page.getByTestId('opp-column-go').locator(`[data-testid="${cardId}"]`),
  ).toBeVisible();
});

test('manual add creates an opportunity with simulated analysis', async ({ page }) => {
  await freshApp(page);
  await page.getByTestId('add-opportunity').click();
  await page.getByTestId('opp-title').fill('National Hydrogen Strategy Support — Testland');
  await page.getByTestId('opp-url').fill('https://example.org/tenders/hydrogen-testland');
  await page.getByTestId('opp-organization').fill('Ministry of Energy of Testland');
  await page.getByTestId('opp-country').fill('Spain');
  await page.getByTestId('opp-deadline-days').fill('25');
  await page.getByTestId('opp-topics').fill('green hydrogen, roadmap, energy transition');
  await page.getByTestId('opp-submit').click();
  // Detail opens automatically with the simulated analysis.
  await expect(page.getByTestId('opportunity-detail')).toBeVisible();
  await expect(page.getByText('Prototype analysis — simulated, no live AI')).toBeVisible();
});

test('sources registry is editable', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('tab', { name: /Sources/ }).click();
  await page.getByTestId('source-name').fill('National Procurement Portal — Testland');
  await page.getByTestId('source-url').fill('https://tenders.example.org');
  await page.getByTestId('add-source').click();
  await expect(page.getByTestId('sources-table')).toContainText(
    'National Procurement Portal — Testland',
  );
});

test('alerts count matches and link to filtered search', async ({ page }) => {
  await freshApp(page);
  await page.getByRole('tab', { name: /Alerts/ }).click();
  await page.getByTestId('alert-name').fill('Hydrogen high priority');
  await page.getByTestId('alert-keyword').fill('hydrogen');
  await page.getByTestId('add-alert').click();
  const alertCard = page.getByTestId('alerts-list').locator('div').first();
  await expect(alertCard).toContainText('match');
  await page.getByRole('button', { name: 'View matches' }).click();
  await expect(page.getByTestId('opportunity-list')).toBeVisible();
});

test('opportunities XLSX export downloads', async ({ page }) => {
  await freshApp(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-opportunities-xlsx').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('opportunities.xlsx');
});
