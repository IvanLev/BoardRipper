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

test('Info panel shows the Part number and Manufacturer parameters', async ({ page }) => {
  await openBoard(page);
  await page.locator('[data-board-tab="info"]').click();
  await selectRef(page, 'U4');
  const meta = page.getByTestId('part-meta');
  await expect(meta.locator('tr', { hasText: 'Part number' })).toContainText('13104');
  await expect(meta.locator('tr', { hasText: 'Manufacturer' })).toContainText('PNI');
  // U1 has no such parameters in the file: no rows, not empty ones.
  await selectRef(page, 'U1');
  await expect(meta.locator('tr', { hasText: 'Value' })).toContainText('TPS70933DRV');
  await expect(meta.locator('tr', { hasText: 'Manufacturer' })).toHaveCount(0);
  await expect(meta.locator('tr', { hasText: 'Part number' })).toHaveCount(0);
});

test('board search finds parts by their Comment', async ({ page }) => {
  await openBoard(page);
  const results = (q: string) => page.evaluate((query) => {
    const bs = (window as unknown as {
      __boardStore: { setSearch(q: string): void; searchResults: { name: string }[] };
    }).__boardStore;
    bs.setSearch(query);
    return bs.searchResults.map(p => p.name).sort();
  }, q);
  // Case-insensitive, substring — like the refdes and net matches.
  expect(await results('tps70933')).toEqual(['U1']);
  expect(await results('33KR2F')).toEqual(['R11']);
  expect(await results('SC1U25V2KX')).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
  // Reference matching is unchanged.
  expect(await results('CN1')).toEqual(['CN1']);
});

test('Search tab lists each part with its Comment and filters by it', async ({ page }) => {
  await openBoard(page);
  await page.locator('[data-board-tab="search"]').click();
  const row = (ref: string) =>
    page.locator('.part-item').filter({ has: page.locator('.result-name', { hasText: new RegExp(`^${ref}$`) }) });
  await expect(row('U1').getByTestId('search-part-value')).toHaveText('TPS70933DRV');
  await expect(row('CN1').getByTestId('search-part-value')).toHaveText('BM23FR0.6-12DP-0.35V');

  await page.locator('.search-tab-input').fill('121R2F');
  await expect(page.locator('.part-item .result-name')).toHaveText(['R3', 'R4', 'R5', 'R6', 'R9', 'R10']);
});

test('Search tab sorts and groups the component list', async ({ page }) => {
  await openBoard(page);
  await page.locator('[data-board-tab="search"]').click();
  const names = () => page.locator('.part-item .result-name').allTextContents();

  // Default reference order is natural: R2 before R10.
  const ref = await names();
  expect(ref.indexOf('R2')).toBeLessThan(ref.indexOf('R10'));

  await page.getByTestId('part-sort-select').selectOption('pins');
  expect((await names()).slice(0, 3)).toEqual(['U2', 'CN1', 'U1']);

  await page.getByTestId('part-group-select').selectOption('value');
  const group = (label: string) => page.getByTestId('part-group')
    .filter({ has: page.locator('.part-group-label', { hasText: new RegExp(`^${label.replace(/[.()]/g, '\\$&')}$`) }) });
  await expect(group('121R2F').getByTestId('part-group-count')).toHaveText('6');
  await expect(group('SC1U25V2KX').locator('.result-name')).toHaveText(['C1', 'C2', 'C3', 'C4', 'C5']);

  // Folding a group hides its rows only.
  await group('121R2F').locator('.part-group-header').click();
  await expect(group('121R2F').locator('.part-item')).toHaveCount(0);
  await expect(group('0R2J').locator('.part-item')).toHaveCount(4);

  // The choice is remembered for the next visit.
  expect(await page.evaluate(() => [
    localStorage.getItem('boardripper-part-list-sort'),
    localStorage.getItem('boardripper-part-list-group'),
  ])).toEqual(['pins', 'value']);
});
