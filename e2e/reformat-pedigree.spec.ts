import { test, expect } from '@playwright/test';
import { readPersistedDoc } from './support/harness';
import { wideMultiFounderChart } from '../src/utils/__fixtures__/pedigrees';

/**
 * End-to-end guard for the "Reformat pedigree" action (issue #137, PR2).
 *
 * A very wide multi-founder chart is seeded into localStorage before the app
 * boots (the app does NOT auto-reformat on load — that is a deliberate product
 * decision), so the restored document keeps its wide seed positions. The user
 * then clicks the Reformat control in the top-right actions island and the whole
 * chart compacts.
 *
 * Strategy (mirrors layout-render-guard.spec.ts):
 * 1. Build a full PedigreeDocument from the `wideMultiFounderChart` fixture.
 * 2. Seed it into localStorage BEFORE the app boots (addInitScript).
 * 3. Load the app; assert the persisted doc is still wide (no auto-reformat).
 * 4. Click the real DOM "Reformat pedigree" button.
 * 5. Poll the debounced autosave until the persisted doc has compacted, and
 *    assert the widest generation row shrank well below its seeded span.
 */

/** localStorage key the app autosaves the document under (see useAutoSave.ts). */
const AUTOSAVE_KEY = 'pedigree-editor-autosave';
/** localStorage flag recording that first-run onboarding has been dismissed. */
const ONBOARDED_KEY = 'pedigree-onboarded';

/** Widest generation-row x-span in a persisted doc (rows keyed by rounded y). */
function maxRowSpan(doc: {
  individuals: Record<string, unknown>;
}): number {
  const byRow = new Map<number, number[]>();
  for (const ind of Object.values(doc.individuals) as Array<{
    position: { x: number; y: number };
  }>) {
    const key = Math.round(ind.position.y);
    const xs = byRow.get(key) ?? [];
    xs.push(ind.position.x);
    byRow.set(key, xs);
  }
  let widest = 0;
  for (const xs of byRow.values()) {
    if (xs.length < 2) continue;
    widest = Math.max(widest, Math.max(...xs) - Math.min(...xs));
  }
  return widest;
}

test.describe('reformat pedigree', () => {
  test('clicking Reformat compacts a wide multi-founder chart', async ({ page }) => {
    // --- 1. Build a full PedigreeDocument from the wide fixture --------------
    const f = wideMultiFounderChart();
    const fullDoc = {
      metadata: {
        id: 'reformat-e2e',
        title: 'reformat-e2e',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        version: '1.0.0',
      },
      individuals: f.doc.individuals,
      partnerships: f.doc.partnerships,
      parentChildLinks: f.doc.parentChildLinks,
      twinGroups: f.doc.twinGroups ?? {},
      textAnnotations: {},
      generationOrder: [],
      legendConfig: { entries: [], position: { x: 50, y: 50 } },
    };

    // --- 2. Seed into localStorage BEFORE the app boots ---------------------
    await page.addInitScript(
      ([autosaveKey, onboardedKey, docJson]) => {
        window.localStorage.setItem(autosaveKey, docJson);
        window.localStorage.setItem(onboardedKey, '1');
      },
      [AUTOSAVE_KEY, ONBOARDED_KEY, JSON.stringify(fullDoc)] as const,
    );

    // --- 3. Load the app; the wide seed must survive (no auto-reformat) ------
    await page.goto('/app/');
    await page.waitForLoadState('networkidle');

    const seeded = await readPersistedDoc(page);
    expect(seeded).not.toBeNull();
    const seededSpan = maxRowSpan(seeded!);
    // The fixture's founder row spans ~1720 px — sanity-check we really seeded
    // a wide chart before proving the reformat narrows it.
    expect(seededSpan).toBeGreaterThan(1500);

    // --- 4. Click the real DOM Reformat control -----------------------------
    const reformat = page.getByRole('button', { name: 'Reformat pedigree', exact: true });
    await expect(reformat).toBeVisible();
    await reformat.click();

    // --- 5. Poll the debounced autosave until the chart has compacted -------
    await expect
      .poll(
        async () => {
          const doc = await readPersistedDoc(page);
          return doc ? maxRowSpan(doc) : Number.POSITIVE_INFINITY;
        },
        { timeout: 10_000 },
      )
      // chartWidth bound for the 6-node founder row is 2×(6−1)×80 = 800 px;
      // allow a small tolerance and require it to be far below the seed.
      .toBeLessThanOrEqual(820);

    const after = await readPersistedDoc(page);
    expect(after).not.toBeNull();
    expect(maxRowSpan(after!)).toBeLessThan(seededSpan);
  });
});
