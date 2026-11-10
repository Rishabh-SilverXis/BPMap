import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) => fileURLToPath(new URL(`../../../packages/fixtures/data/${name}`, import.meta.url));

/** Import a workbook through the real file input (worker, zod gate, persistence). */
export async function importFile(page: Page, name: string) {
  const addFile = page.getByRole('button', { name: 'Add file' });
  if (await addFile.isVisible().catch(() => false)) await addFile.click();
  await page.locator('input[type=file][accept*=".xlsx"]').first().setInputFiles(fixture(name));
}

export async function freshApp(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Read in this browser. Nothing is uploaded.')).toBeVisible();
}
