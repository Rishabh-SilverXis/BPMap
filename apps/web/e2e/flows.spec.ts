/** Core user flows on the production build (Increment 2.1). */
import { expect, test } from '@playwright/test';
import { freshApp, importFile } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await importFile(page, 'change-job-workday-layout.xlsx');
  await expect(page.locator('[data-testid=step]')).toHaveCount(26);
});

test('steps follow Workday order and approvals get decision diamonds', async ({ page }) => {
  const labels = await page.locator('[data-testid=step]').evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label') ?? ''));
  const orderOf = (l: string) => /step (\w+),/.exec(l)![1];
  expect(labels.slice(0, 6).map(orderOf)).toEqual(['a', 'ba', 'bb', 'bc', 'bd', 'd']);
  await expect(page.locator('svg g[data-role=decisions] polygon')).toHaveCount(4);
});

test('scenario: answering No removes the steps it guards and collapses lanes (SCN-01)', async ({ page }) => {
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await page.getByRole('radiogroup', { name: 'Answer for C6' }).getByRole('radio', { name: 'No', exact: true }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(22);
  await expect(page.locator('footer')).toContainText('Scenario: C6 no · 4 steps skipped');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(26);
});

test('views: Configurator shows detail lines, Executive shows stage cards (VW-01, VW-03)', async ({ page }) => {
  await page.getByRole('radio', { name: 'Configurator', exact: true }).click();
  await expect(page.locator('[data-testid=step] .flex-col').first()).toContainText('validations');
  await page.getByRole('radio', { name: 'Executive', exact: true }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(0);
  await expect(page.locator('svg g[data-role=stage-card]')).toHaveCount(26);
});

test('health: dismiss with a reason, survives reload, can be restored (HLT-02)', async ({ page }) => {
  await page.getByRole('tab', { name: /Health/ }).click();
  const group = page.locator('details', { hasText: 'Approval not restricted from the initiator' });
  await group.getByRole('button', { name: 'Dismiss…' }).click();
  await group.getByLabel('Reason for dismissing').fill('CHRO approvals are audited separately');
  await group.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByText('Dismissed (1)')).toBeVisible();
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await page.getByRole('tab', { name: /Health/ }).click();
  await page.getByText('Dismissed (1)').click();
  await expect(page.getByText('Reason: CHRO approvals are audited separately')).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Dismissed (1)')).toHaveCount(0);
});

test('viewer: fixed diagram scrolls natively, lane column stays frozen, zoom controls work (DEC-042)', async ({ page }) => {
  const scroller = page.getByRole('region', { name: /^Diagram of/ });
  const frozen = page.getByTestId('frozen-lanes');
  await expect(frozen).toBeVisible();
  await scroller.evaluate((el) => (el.scrollLeft = 1500));
  const [s, f] = await Promise.all([scroller.boundingBox(), frozen.boundingBox()]);
  expect(Math.round(f!.x - s!.x)).toBe(0); // still pinned to the left edge after scrolling
  await expect(page.getByTestId('zoom-level')).toHaveText(/%$/);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
});
