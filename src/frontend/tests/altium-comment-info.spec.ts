import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The Altium component Comment (Texts6 isComment record) shows in the Info
// panel as the part's Value, next to Package, and the board search finds a
// part by it. Checked-in fixture, so this always runs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD = path.resolve(__dirname, 'fixtures/altium-comments.PcbDoc');

async function openBoard(page: Page) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(BOARD);
  await expect(page.getByTestId('statusbar')).toContainText('Components:', { timeout: 60000 });
  await page.locator('.board-sidebar-toggle').first().click();
}

async function selectRef(page: Page, ref: string) {
  await page.evaluate((r) => {
    // DEV-only global the board store exposes for tests.
    const bs = (window as unknown as {
      __boardStore: { board: { parts: { name: string }[] }; selectPart(i: number): void };
    }).__boardStore;
    bs.selectPart(bs.board.parts.findIndex(p => p.name === r));
  }, ref);
}

test('Info panel shows the Comment as Value beside Package', async ({ page }) => {
  await openBoard(page);
  await page.locator('[data-board-tab="info"]').click();

  for (const [ref, comment, pkg] of [
    ['U1', 'TPS70933DRV', 'DRV0006A'],
    ['R11', '33KR2F', 'RESC0402(1005)_L'],
  ] as const) {
    await selectRef(page, ref);
    const meta = page.getByTestId('part-meta');
    await expect(meta.locator('tr', { hasText: 'Value' })).toContainText(comment);
    await expect(meta.locator('tr', { hasText: 'Package' })).toContainText(pkg);
  }
});
