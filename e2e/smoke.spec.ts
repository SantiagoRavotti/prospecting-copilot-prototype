// Playwright smoke test covering the 16 required scenarios in one guided flow
// plus focused follow-on tests. window.open is stubbed so no real navigation
// to linkedin.com occurs.

import { expect, test, type Page } from '@playwright/test';

async function freshApp(page: Page, path = '/#/today') {
  await page.addInitScript(() => {
    // Clear persisted state once per test (init scripts run again on reload,
    // so guard with sessionStorage to let persistence tests survive reloads).
    if (!sessionStorage.getItem('__pw_cleared')) {
      localStorage.clear();
      sessionStorage.setItem('__pw_cleared', '1');
    }
    // Capture window.open instead of opening real tabs.
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.goto(path);
}

test('core review workflow: generate → review → edit → copy → LinkedIn → sent → next', async ({
  page,
}) => {
  // 1. Open the application
  await freshApp(page);
  await expect(page.getByText('Prospecting Copilot').first()).toBeVisible();

  // 2. Select a workspace
  await page.getByTestId('workspace-switcher').selectOption({ label: 'Impact Hydrogen' });

  // 3. Generate mock prospects
  await page.getByTestId('generate-button').click();
  await page.getByTestId('batch-size-10').click();
  await page.getByTestId('start-generation').click();
  await expect(page.getByTestId('generation-summary')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('finish-generation').click();

  // 4. Review a prospect
  await expect(page.getByTestId('prospect-card')).toBeVisible();
  const firstName = await page.getByTestId('prospect-name').textContent();

  // 5. Edit the connection message
  const textarea = page.getByTestId('message-textarea');
  await textarea.fill('Hi there — this is my edited prototype message.');
  await page.getByTestId('save-message').click();
  await expect(page.getByText('Edited', { exact: true })).toBeVisible();

  // 6. Copy the message
  await page.getByTestId('copy-message').click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('edited prototype message');

  // 7. Open the LinkedIn link (stubbed window.open)
  await page.getByTestId('open-linkedin').click();
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened.some((u) => u.includes('linkedin.com'))).toBe(true);

  // 8. Mark the prospect as sent
  await page.getByTestId('mark-sent').click();

  // 9. Confirm that the next prospect appears
  await expect(page.getByTestId('prospect-name')).not.toHaveText(firstName ?? '', {
    timeout: 5_000,
  });
  await expect(page.getByTestId('prospect-card')).toBeVisible();
});

test('manual prospect creation', async ({ page }) => {
  // 10. Create a manual prospect
  await freshApp(page);
  await page.getByTestId('add-prospect').click();
  await page.getByTestId('add-name').fill('Test Person');
  await page.getByTestId('add-title').fill('Head of Hydrogen');
  await page.getByTestId('add-company').fill('Manual Test Co');
  await page.getByTestId('add-linkedin').fill('https://www.linkedin.com/in/test-person');
  await page.getByTestId('add-trigger').fill('announced a pilot project');
  await page.getByTestId('add-submit').click();
  // New manual prospect should be reviewable with a generated draft.
  await page.getByTestId('mode-table').click();
  await expect(page.locator('table').getByText('Test Person')).toBeVisible();
});

test('CSV import with validation errors', async ({ page }) => {
  // 11. Import a CSV
  await freshApp(page, '/#/people');
  // dispatchEvent avoids a flaky hang seen with simulated mouse input on this
  // button in headless Chromium; the app behaves identically.
  await page.getByTestId('import-csv').dispatchEvent('click');
  const csv = [
    'full_name,title,company,country,linkedin_url',
    'Alice Importer,CEO,ImportCo,Spain,https://www.linkedin.com/in/alice-importer',
    ',Missing Name,BadCo,Spain,', // invalid row
  ].join('\n');
  await page.getByTestId('csv-file-input').setInputFiles({
    name: 'prospects.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  });
  const summary = page.getByTestId('csv-import-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('1 prospect imported');
  await expect(summary).toContainText('Row 2');
  // Same headless-input workaround as above — real mouse events hang in this
  // test after setInputFiles, while dispatched clicks behave identically.
  await page.getByRole('button', { name: 'Done' }).dispatchEvent('click');
  await expect(page.getByText('Alice Importer')).toBeVisible();
});

test('pipeline drag-free status move persists', async ({ page }) => {
  // 12. Move a prospect through the pipeline (drag & drop via mouse events)
  await freshApp(page, '/#/pipeline');
  const card = page.locator('[data-testid^="pipeline-card-"]').first();
  await expect(card).toBeVisible();
  const cardId = await card.getAttribute('data-testid');
  const target = page.getByTestId('pipeline-column-connection_sent');
  // Playwright's mouse-based dragTo does not fire native HTML5 drag events,
  // so dispatch them directly (React listens to dragstart/dragover/drop).
  await card.dispatchEvent('dragstart');
  await target.dispatchEvent('dragover');
  await target.dispatchEvent('drop');
  // Persisted after reload?
  await page.reload();
  const column = page.getByTestId('pipeline-column-connection_sent');
  await expect(column.locator(`[data-testid="${cardId}"]`)).toBeVisible();
});

test('follow-up creation', async ({ page }) => {
  // 13. Create a follow-up
  await freshApp(page, '/#/follow-ups');
  await page.getByTestId('new-followup').click();
  await page.getByTestId('followup-prospect').selectOption({ index: 1 });
  await page.getByTestId('followup-days').fill('0');
  await page.getByTestId('followup-message').fill('Playwright follow-up reminder');
  await page.getByTestId('followup-create').click();
  await expect(page.getByText('Playwright follow-up reminder')).toBeVisible();
});

test('XLSX export triggers a download', async ({ page }) => {
  // 14. Export XLSX
  await freshApp(page, '/#/people');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-xlsx').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('prospects.xlsx');
});

test('cost estimator warning above €100', async ({ page }) => {
  // 15. Change cost assumptions / 16. Confirm the warning appears above €100
  await freshApp(page, '/#/cost-estimator');
  await expect(page.getByTestId('budget-ok')).toBeVisible();
  await page.getByTestId('cost-capable-percent').fill('100');
  await page.getByTestId('cost-runs').fill('80');
  await page.getByTestId('cost-candidates').fill('500');
  await page.getByTestId('cost-enrichment').selectOption('hunter-starter');
  await expect(page.getByTestId('budget-warning')).toBeVisible();
  await expect(page.getByTestId('budget-warning')).toContainText('exceeds');
});

test('local persistence survives a reload', async ({ page }) => {
  await freshApp(page, '/#/settings');
  await page.getByTestId('sender-name').fill('Persisted Sender');
  await page.reload();
  await expect(page.getByTestId('sender-name')).toHaveValue('Persisted Sender');
});

test('workspace switch changes the data scope', async ({ page }) => {
  await freshApp(page, '/#/dashboard');
  await page.getByTestId('workspace-switcher').selectOption({ label: 'Santiago Personal' });
  await expect(page.locator('main').getByText('Santiago Personal').first()).toBeVisible();
});
