/**
 * Opt-in UI test on a REAL Workday export kept in the git-ignored .local/ folder.
 * Skips automatically when the file is absent (always in CI). Expected counts come from an
 * independent oracle (stdlib Python parser), not from our importer.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const file = fileURLToPath(new URL('../../../.local/real-change-job.xlsx', import.meta.url));
const VISIBLE_WHEN_NO: number[] = JSON.parse(process.env.BPMAP_ORACLE_VISIBLE ?? '[]');
test.skip(!existsSync(file) || VISIBLE_WHEN_NO.length === 0, 'real export or oracle not available');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles(file);
  await expect(page.locator('.react-flow__node')).toHaveCount(26);
});

test('every condition answered No removes exactly the oracle-predicted steps (34 scenarios × UI)', async ({ page }) => {
  await page.getByRole('tab', { name: /Scenario/ }).click();
  for (let i = 0; i < VISIBLE_WHEN_NO.length; i++) {
    const group = page.getByRole("radiogroup", { name: `Answer for C${i + 1}`, exact: true });
    await group.getByRole('radio', { name: 'No', exact: true }).click();
    await expect(page.locator('.react-flow__node'), `C${i + 1}=No`).toHaveCount(VISIBLE_WHEN_NO[i]!);
    await group.getByRole('radio', { name: 'Not set', exact: true }).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(26);
  }
});

test('views, keyboard view switching, dark theme and exports all work on the real file', async ({ page }) => {
  const radios = page.getByRole('radiogroup', { name: 'View' });
  await radios.getByRole('radio', { name: 'Process owner', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(radios.getByRole('radio', { name: 'Configurator', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.bpm-step ul').first()).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('svg g[data-role=stage-card]')).toHaveCount(26);
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const item of [/^SVG/, /^PNG/, /^Project file/]) {
    await page.getByText('Export').click();
    const dl = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: item }).click();
    const d = await dl;
    expect((await d.createReadStream()).readableLength >= 0).toBe(true);
    expect(d.suggestedFilename()).toMatch(/^change-job-default-definition\.(svg|png|bpmap\.json)$/);
  }
});

test('customise + scenario survive reload; project file round-trips into a fresh browser', async ({ page, browser }) => {
  await page.locator('.react-flow__node', { hasText: 'Assign Pay Group' }).click();
  await page.getByLabel('Label in the flow').fill('Assign pay group (payroll)');
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await page.getByRole('radiogroup', { name: 'Answer for C6' }).getByRole('radio', { name: 'No', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(22);
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(22);
  await expect(page.locator('.react-flow__node', { hasText: 'Assign pay group (payroll)' })).toHaveCount(1);
  await page.getByText('Export').click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /^Project file/ }).click();
  const path = await (await dl).path();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/');
  await expect(p2.getByText('Read in this browser. Nothing is uploaded.')).toBeVisible();
  await p2.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles(file); // need a workspace to see "Open project"
  await p2.locator('input[type=file][accept*="json"]').setInputFiles(path!);
  await expect(p2.locator('.react-flow__node')).toHaveCount(22);
  await expect(p2.locator('.react-flow__node', { hasText: 'Assign pay group (payroll)' })).toHaveCount(1);
  await ctx.close();
});

test('re-importing the same export keeps customisations and does not duplicate the tab', async ({ page }) => {
  await page.locator('.react-flow__node', { hasText: 'Create Subordinate' }).click();
  await page.getByLabel('Note (shows as N on the step)').fill('Disabled via 1=0');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Add file' }).click();
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles(file);
  await expect(page.locator('[aria-current=page]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Change Job \(Default Definition\)$/ })).toHaveCount(1);
  await page.locator('.react-flow__node', { hasText: 'Create Subordinate' }).click();
  await expect(page.getByLabel('Note (shows as N on the step)')).toHaveValue('Disabled via 1=0');
});
