/**
 * Bottom-side defaults (2026-11-09):
 *  - the board turns over left–right (renderSettings.bottomFlip = 'horizontal'),
 *    measured on screen, so it holds whatever auto-rotation the board got;
 *  - on a layered board each side shows only its own copper layer's routing
 *    (renderSettings.routingFollowsSide), and turning the setting off shows
 *    every layer again.
 * Public KiCad sample (4 copper layers: F.Cu, In1.Cu, In2.Cu, B.Cu), so this
 * always runs.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOARD = path.resolve(HERE, '../public/samples/tomu-fpga.kicad_pcb');

type Pt = { x: number; y: number };
interface Probe {
  tabId: number;
  flipAxis: string;
  traceVisible: boolean[];
  screen: Pt[]; // projections of board points W, E, N, S
}

async function open(page: Page) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(BOARD);
  await expect(page.getByTestId('statusbar')).toContainText('Components:', { timeout: 60000 });
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __boardStore: { activeTabId: number; flipAxis: string; activeTab: { board: { bounds: { minX: number; minY: number; maxX: number; maxY: number } } } };
      __boardRenderer: { activeScene: {
        root: { toGlobal(p: Pt): Pt };
        traceLayerContainers: ({ visible: boolean } | null)[];
      } };
    };
    type Pt = { x: number; y: number };
    const b = w.__boardStore.activeTab.board.bounds;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const S = w.__boardRenderer.activeScene;
    const pts: Pt[] = [{ x: b.minX, y: cy }, { x: b.maxX, y: cy }, { x: cx, y: b.minY }, { x: cx, y: b.maxY }];
    return {
      tabId: w.__boardStore.activeTabId,
      flipAxis: w.__boardStore.flipAxis,
      traceVisible: S.traceLayerContainers.filter(Boolean).map(c => c!.visible),
      screen: pts.map(p => { const g = S.root.toGlobal(p); return { x: g.x, y: g.y }; }),
    };
  });
}

const setSide = (page: Page, tabId: number, top: boolean, bottom: boolean) =>
  page.evaluate(([id, t, bt]) => (window as unknown as {
    __boardStore: { setSideVisibility(id: number, t: boolean, b: boolean): void };
  }).__boardStore.setSideVisibility(id as number, t as boolean, bt as boolean), [tabId, top, bottom]);

test('the bottom side is a left–right mirror of the top', async ({ page }) => {
  await open(page);
  const top = await probe(page);
  await setSide(page, top.tabId, false, true);
  await expect.poll(async () => (await probe(page)).screen[0].x).not.toBeCloseTo(top.screen[0].x, 0);
  const bottom = await probe(page);
  // Screen vectors W→E and N→S of the board: a left–right mirror negates
  // their horizontal component and keeps the vertical one.
  for (const [a, b] of [[0, 1], [2, 3]]) {
    const vt = { x: top.screen[b].x - top.screen[a].x, y: top.screen[b].y - top.screen[a].y };
    const vb = { x: bottom.screen[b].x - bottom.screen[a].x, y: bottom.screen[b].y - bottom.screen[a].y };
    expect(vb.x).toBeCloseTo(-vt.x, 0);
    expect(vb.y).toBeCloseTo(vt.y, 0);
  }
});

test('each side shows only its own layer’s routing', async ({ page }) => {
  await open(page);
  const top = await probe(page);
  // Containers in layer order: F.Cu, In1.Cu, In2.Cu, B.Cu. Inner layers start
  // hidden (switchable in the Layers tab).
  expect(top.traceVisible).toEqual([true, false, false, false]);

  await setSide(page, top.tabId, false, true);
  await expect.poll(async () => (await probe(page)).traceVisible).toEqual([false, false, false, true]);

  await setSide(page, top.tabId, true, true);                 // both sides
  await expect.poll(async () => (await probe(page)).traceVisible).toEqual([true, false, false, true]);

  // Setting off: the side no longer decides — both outer layers show on Top.
  await setSide(page, top.tabId, true, false);
  await page.evaluate(() => {
    const rs = (window as unknown as {
      __renderSettings: { globalSettings: object; applyGlobal(s: object): void };
    }).__renderSettings;
    rs.applyGlobal({ ...rs.globalSettings, routingFollowsSide: false });
  });
  await expect.poll(async () => (await probe(page)).traceVisible).toEqual([true, false, false, true]);
});
