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
  const furniture = page.getByTestId('pinned-furniture'); // legend + conditions + title (DEC-043)
  await expect(furniture).toBeAttached();
  const fb = await furniture.boundingBox();
  expect(Math.round(fb!.x - s!.x)).toBe(0);
  await expect(page.locator('[role=region] svg g[data-role=legend]')).toHaveCount(1); // drawn once, not duplicated
  await expect(page.getByTestId('zoom-level')).toHaveText(/%$/);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByTestId('zoom-level').click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
});

test('exports: PDF, PowerPoint, draw.io, SVG, PNG and packs download as valid files (EXP-02..04, PCK-03)', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const grab = async (item: RegExp) => {
    await page.getByText('Export', { exact: true }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: item }).click();
    const d = await dl;
    return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
  };
  const pdf = await grab(/^PDF Vector/);
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const pptx = await grab(/^PowerPoint Every/);
  expect(pptx.bytes.subarray(0, 2).toString()).toBe('PK'); // OOXML zip
  const drawio = await grab(/^draw\.io \(for Visio\)/);
  expect(drawio.bytes.toString()).toContain('<mxfile');
  const svg = await grab(/^SVG/);
  expect(svg.bytes.toString()).toContain('<svg');
  // light theme in exports even when the app is dark (DEC-046)
  await page.emulateMedia({ colorScheme: 'dark' });
  const svgDark = await grab(/^SVG/);
  expect(svgDark.bytes.toString()).toContain('fill="#FFFFFF"');
  // a second definition makes the pack items appear
  await page.getByRole('button', { name: 'Add file' }).click();
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles((await import('./helpers.ts')).fixture('change-job-synthetic.xlsx'));
  await expect(page.locator('[aria-current=page]')).toContainText('Synthetic');
  const packPdf = await grab(/^PDF pack/);
  expect(packPdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect((packPdf.bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(2);
  const packPptx = await grab(/^PowerPoint pack/);
  expect(packPptx.bytes.subarray(0, 2).toString()).toBe('PK');
});

test('focus on a role dims every other lane (VIS-08)', async ({ page }) => {
  await page.getByLabel('Focus on a role').selectOption({ label: 'HR Partner' });
  const roles = (await page.getByLabel('Focus on a role').locator('option').count()) - 1; // minus "All roles"
  expect(roles).toBeGreaterThan(2);
  await expect(page.getByTestId('dimmed-lane')).toHaveCount(roles - 1);
  const hrOpacity = await page.locator('[data-testid=step]', { hasText: 'Manage Union Membership' }).evaluate((e) => getComputedStyle(e).opacity);
  const otherOpacity = await page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).evaluate((e) => getComputedStyle(e).opacity);
  expect([hrOpacity, otherOpacity]).toEqual(['1', '0.3']);
  await page.getByLabel('Focus on a role').selectOption({ label: 'All roles' });
  await expect(page.getByTestId('dimmed-lane')).toHaveCount(0);
});

test('accessible step list shows every step in Workday order and selects on click (NFR-A11Y)', async ({ page }) => {
  await page.getByRole('button', { name: 'Step list' }).click();
  const table = page.getByRole('region', { name: 'Step list' }).getByRole('table');
  await expect(table.locator('tbody')).toHaveCount(26); // one row group per stage
  await expect(table.getByRole('rowheader').first()).toContainText('1 · a');
  await expect(table.getByRole('rowheader').nth(1)).toContainText('2 · ba');
  await table.getByRole('button', { name: 'Assign Pay Group' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Payroll Partner');
  await expect(table).toContainText('Process complete after this step');
  await page.getByRole('button', { name: 'Step list' }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(26);
});

test('re-import: customisations on a removed step are kept and can be removed (IMP-06)', async ({ page }) => {
  await page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).click();
  await page.getByLabel('Note (shows as N on the step)').fill('Payroll owns this');
  await page.waitForTimeout(700);
  await importFile(page, 'change-job-workday-layout-v2.xlsx'); // same definition, step o removed
  await expect(page.locator('[data-testid=step]')).toHaveCount(25);
  await page.getByRole('tab', { name: /^Import/ }).click();
  const notice = page.getByTestId('orphans');
  await expect(notice).toContainText('1 customisation no longer match a step');
  await expect(notice).toContainText('Payroll owns this');
  await notice.getByRole('button', { name: /Remove it/ }).click();
  await expect(page.getByTestId('orphans')).toHaveCount(0);
});
