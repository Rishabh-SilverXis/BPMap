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
  expect((pdf.bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(2); // diagram + conditions
  const pptx = await grab(/^PowerPoint Editable/);
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
  // cover + (diagram + conditions page) for each of the 2 definitions (PCK-03, DEC-051)
  expect((packPdf.bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(5);
  const packPptx = await grab(/^PowerPoint pack/);
  expect(packPptx.bytes.subarray(0, 2).toString()).toBe('PK');
  const { unzipSync } = await import('fflate');
  const slides = Object.keys(unzipSync(new Uint8Array(packPptx.bytes))).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides).toHaveLength(5);
  const packXlsx = await grab(/^Excel pack/);
  expect(packXlsx.name).toBe('bpmap-pack.xlsx');
  expect(packXlsx.bytes.subarray(0, 2).toString()).toBe('PK');
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

test('focus on a role scrolls to its first step; ‹ › walks through its steps (VIS-08)', async ({ page }) => {
  const scroller = page.getByLabel(/^Diagram of /);
  expect(await scroller.evaluate((e) => e.scrollLeft)).toBe(0);
  await page.getByLabel('Focus on a role').selectOption({ label: 'Payroll Partner' });
  const first = page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' });
  await expect(first).toBeInViewport();
  expect(await scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(500);
  const count = page.getByTestId('role-step-count');
  await expect(count).toHaveText(/^\d+ steps?$/);
  await page.getByRole('button', { name: 'Next step for this role' }).click();
  await expect(count).toHaveText(/^1 \/ \d+$/);
  await expect(page.getByRole('tabpanel')).toContainText('Payroll Partner');
});

test('closing a definition removes it at once and Undo brings it back with its edits', async ({ page }) => {
  await page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).click();
  await page.getByLabel('Note (shows as N on the step)').fill('Keep me');
  await page.getByRole('button', { name: /^Close / }).click();
  await expect(page.getByTestId('removed-toast')).toBeVisible();
  await expect(page.locator('[data-testid=step]')).toHaveCount(0); // last definition → import screen
  await page.getByTestId('removed-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(26);
  await page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).click();
  await expect(page.getByLabel('Note (shows as N on the step)')).toHaveValue('Keep me');
  await page.getByRole('button', { name: /^Close / }).click();
  await page.reload();
  await expect(page.locator('[data-testid=step]')).toHaveCount(0); // stays closed after reload
});

const grabDownload = async (page: import('@playwright/test').Page, item: RegExp) => {
  const { readFileSync } = await import('node:fs');
  await page.getByText('Export', { exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: item }).click();
  const d = await dl;
  return { name: d.suggestedFilename(), path: (await d.path())!, bytes: readFileSync((await d.path())!) };
};

test('plain-word conditions show in the condition list, survive re-import and reach Excel (CUS-01, US-07, EXP-08)', async ({ page }) => {
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await page.getByLabel('Plain words for C1', { exact: true }).fill('Transfer was requested');
  const list = page.locator('svg g[data-role=conditions]').first();
  await expect(list).toContainText('Transfer was requested');
  await expect(list).toContainText('Workday: ');
  await page.waitForTimeout(700); // autosave
  await importFile(page, 'change-job-workday-layout.xlsx'); // same export again
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await expect(page.getByLabel('Plain words for C1', { exact: true })).toHaveValue('Transfer was requested');

  const xlsx = await grabDownload(page, /^Excel Steps/);
  expect(xlsx.name).toMatch(/\.xlsx$/);
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(xlsx.bytes));
  const workbook = strFromU8(files['xl/workbook.xml']!);
  expect(workbook).toContain('name="Steps"');
  expect(workbook).toContain('name="Conditions"');
  expect(workbook).toContain('name="Health"');
  expect(strFromU8(files['xl/worksheets/sheet2.xml']!)).toContain('Transfer was requested');
  expect((strFromU8(files['xl/worksheets/sheet1.xml']!).match(/<row /g) ?? []).length).toBe(27); // header + 26 steps
});

test('customisations file carries edits (not Workday data) to another browser (CUS-03)', async ({ page, browser }) => {
  await page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).click();
  await page.getByLabel('Note (shows as N on the step)').fill('Payroll owns this');
  await page.getByRole('tab', { name: /Scenario/ }).click();
  await page.getByLabel('Plain words for C1', { exact: true }).fill('Transfer was requested');
  const file = await grabDownload(page, /^Customisations only/);
  expect(file.name).toMatch(/\.customisations\.json$/);
  const json = JSON.parse(file.bytes.toString());
  expect(json.format).toBe('bpmap-customisations');
  expect(json).not.toHaveProperty('steps');
  expect(JSON.stringify(json)).not.toContain('Payroll Partner'); // no security groups / Workday rows

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await freshApp(p2);
  await importFile(p2, 'change-job-synthetic.xlsx'); // a different definition first
  await p2.locator('input[type=file][accept*="json"]').setInputFiles(file.path);
  await expect(p2.getByRole('status')).toContainText('Import that definition first');
  await importFile(p2, 'change-job-workday-layout.xlsx');
  await expect(p2.locator('[data-testid=step]')).toHaveCount(26);
  await p2.locator('input[type=file][accept*="json"]').setInputFiles(file.path);
  await expect(p2.getByRole('status')).toContainText('Opened');
  await p2.locator('[data-testid=step]', { hasText: 'Assign Pay Group' }).click();
  await expect(p2.getByLabel('Note (shows as N on the step)')).toHaveValue('Payroll owns this');
  await expect(p2.locator('svg g[data-role=conditions]').first()).toContainText('Transfer was requested');
  await ctx.close();
});

test('multi-file import links subprocesses; Open and Back navigate between them (IMP-04)', async ({ page }) => {
  const { fixture } = await import('./helpers.ts');
  await page.getByRole('button', { name: 'Add file' }).click();
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles([fixture('hire-with-subprocesses.xlsx'), fixture('propose-compensation-hire.xlsx')]);
  await expect(page.getByRole('button', { name: /^Close Propose Compensation Hire/ })).toBeVisible();
  // the subprocess tab is marked
  await expect(page.locator('button[title^="Subprocess of Hire"]')).toContainText('Propose Compensation Hire');

  await page.getByRole('button', { name: /^Hire \(Default Definition\)/ }).click();
  await expect(page.locator('[data-testid=step]')).toHaveCount(5);
  await page.getByRole('tab', { name: /^Import/ }).click();
  const summary = page.getByTestId('subprocess-summary');
  await expect(summary).toContainText('Calls 2 · 1 not loaded');
  await expect(summary).toContainText('Request Onboarding (Default Definition)');

  await page.locator('[data-testid=step]', { hasText: 'Propose Compensation Hire' }).click();
  const link = page.getByTestId('subprocess-link');
  await link.getByRole('button', { name: /^Open Propose Compensation Hire/ }).click();
  await expect(page.locator('[aria-current=page]')).toContainText('Propose Compensation Hire');
  await expect(page.locator('[data-testid=step]')).toHaveCount(3);

  await page.getByTestId('back-from-subprocess').click();
  await expect(page.locator('[aria-current=page]')).toContainText('Hire (Default Definition)');
  await expect(page.getByRole('tabpanel')).toContainText('Runs a subprocess'); // the calling step is selected again
  await page.locator('[data-testid=step]', { hasText: 'Request Onboarding' }).click();
  await expect(page.getByTestId('subprocess-link')).toContainText('Not loaded');
});

test('more than 20 files: the first 20 are imported and the rest are named (IMP-04)', async ({ page }) => {
  const { fixture } = await import('./helpers.ts');
  await page.getByRole('button', { name: 'Add file' }).click();
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles(Array.from({ length: 21 }, () => fixture('propose-compensation-hire.xlsx')));
  await expect(page.getByTestId('import-notice')).toContainText('Only 20 files can be imported at once. 1 was left out');
});

test('arrange: arrow keys and drag move a step, edges follow, kept after reload, Reset restores (VIS-11)', async ({ page }) => {
  const step = page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' });
  const before = (await step.boundingBox())!;
  await page.getByRole('button', { name: 'Arrange' }).click();
  await step.focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await step.boundingBox())!.y).toBeGreaterThan(before.y + 30);
  await expect(page.getByRole('button', { name: 'Reset layout' })).toBeVisible();

  // drag right by ~120 screen px
  const b = (await step.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await step.boundingBox())!.x).toBeGreaterThan(b.x + 80);

  await page.waitForTimeout(700); // autosave
  await page.reload();
  const again = page.locator('[data-testid=step]', { hasText: 'Assign Pay Group' });
  await expect.poll(async () => (await again.boundingBox())!.y).toBeGreaterThan(before.y + 30);
  await page.getByRole('button', { name: 'Arrange' }).click();
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await expect.poll(async () => Math.round((await again.boundingBox())!.y)).toBe(Math.round(before.y));
  await expect(page.getByRole('button', { name: 'Reset layout' })).toHaveCount(0);
});
