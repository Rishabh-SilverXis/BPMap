/**
 * NFR-PRIV-01: with default settings, importing, viewing, simulating and exporting a definition
 * makes ZERO requests to any other origin, and nothing is ever sent with a request body.
 */
import { expect, test } from '@playwright/test';
import { freshApp, importFile } from './helpers.ts';

test('no tenant data leaves the browser', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const offOrigin: string[] = [];
  const withBody: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) offOrigin.push(req.url());
    if (req.postData()) withBody.push(`${req.method()} ${req.url()}`);
  });
  const csp: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
  });

  await freshApp(page);
  await importFile(page, 'change-job-workday-layout.xlsx');
  await expect(page.locator('[data-testid=step]')).toHaveCount(26);

  for (const view of ['Configurator', 'Executive', 'Process owner']) await page.getByRole('radio', { name: view, exact: true }).click();
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await page.getByRole('radiogroup', { name: 'Answer for C6' }).getByRole('radio', { name: 'No', exact: true }).click();
  await page.getByRole('tab', { name: /Health/ }).click();

  await page.getByText('Export').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^SVG/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);

  expect(offOrigin, 'requests to other origins').toEqual([]);
  expect(withBody, 'requests carrying a body').toEqual([]);
  expect(csp, 'CSP violations').toEqual([]);
});
