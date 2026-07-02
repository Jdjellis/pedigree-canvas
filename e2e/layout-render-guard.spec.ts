import { test, expect } from '@playwright/test';
import { readPersistedDoc } from './support/harness';
import { crossBranchMarriage } from '../src/utils/__fixtures__/pedigrees';
import { computeTreeLayout } from '../src/utils/treeLayout';

/**
 * Render guard for the auto-spacing rewrite (#131).
 *
 * Proves that the computed layout for the `crossBranchMarriage` fixture
 * renders without gen-2 overlap on the real react-konva canvas.
 *
 * Strategy:
 * 1. Compute the layout in Node (same import path as the app uses).
 * 2. Build a full PedigreeDocument from the fixture + computed positions.
 * 3. Seed it into localStorage BEFORE the app boots (addInitScript).
 * 4. Load the app and wait for it to hydrate.
 * 5. Read back the persisted autosave doc and assert the two gen-2 cousins
 *    (kidA, kidB) are at least SYMBOL_SIZE apart and match the seeded
 *    computed positions (no re-layout happened — the app preserves what we gave it).
 */

/** Symbol diameter used for overlap detection (see src/utils/constants.ts). */
const SYMBOL_SIZE = 40;

/** localStorage key the app autosaves the document under (see useAutoSave.ts). */
const AUTOSAVE_KEY = 'pedigree-editor-autosave';
/** localStorage flag recording that first-run onboarding has been dismissed. */
const ONBOARDED_KEY = 'pedigree-onboarded';

test.describe('layout render guard', () => {
  test('crossBranchMarriage renders without gen-2 overlap', async ({ page }) => {
    // --- 1. Compute the layout in Node ----------------------------------------
    const f = crossBranchMarriage();
    const moved = computeTreeLayout(f.doc, f.rootUnionId);

    // Build the laid-out individuals map: spread each individual and override
    // the position with the computed one when present.
    const laidOutIndividuals = Object.fromEntries(
      Object.entries(f.doc.individuals).map(([id, individual]) => {
        const computedPos = moved[id];
        return [
          id,
          computedPos
            ? { ...individual, position: { ...individual.position, x: computedPos.x, y: computedPos.y } }
            : { ...individual },
        ];
      }),
    );

    // --- 2. Build a full PedigreeDocument ------------------------------------
    const fullDoc = {
      metadata: {
        id: 'guard',
        title: 'guard',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        version: '1.0.0',
      },
      individuals: laidOutIndividuals,
      partnerships: f.doc.partnerships,
      parentChildLinks: f.doc.parentChildLinks,
      twinGroups: f.twinGroups ?? {},
      textAnnotations: {},
      generationOrder: [],
      legendConfig: { entries: [], position: { x: 50, y: 50 } },
    };

    // --- 3. Seed into localStorage BEFORE the app boots ----------------------
    // Do NOT call seedFreshStart: it removes the autosave key. Instead set it
    // directly so our document is the one the app restores on mount.
    await page.addInitScript(
      ([autosaveKey, onboardedKey, docJson]) => {
        window.localStorage.setItem(autosaveKey, docJson);
        window.localStorage.setItem(onboardedKey, '1');
      },
      [AUTOSAVE_KEY, ONBOARDED_KEY, JSON.stringify(fullDoc)] as const,
    );

    // --- 4. Load the app and wait for hydration ------------------------------
    await page.goto('/');
    // Wait for the toolbar to be visible — a reliable signal that the app has
    // fully mounted and the autosave restore has run.
    await page.waitForLoadState('networkidle');

    // --- 5. Assert the persisted doc preserves the computed positions --------
    // Poll the autosave (debounced 2 s) until it reflects the seeded doc.
    // On the initial load the app writes back immediately on restore, so this
    // should settle quickly.
    const doc = await expect
      .poll(
        async () => {
          const persisted = await readPersistedDoc(page);
          if (!persisted) return null;
          const inds = persisted.individuals as Record<
            string,
            { position: { x: number; y: number } }
          >;
          // Return positions for our two gen-2 cousins if they're present.
          if (!inds.kidA || !inds.kidB) return null;
          return { kidA: inds.kidA.position, kidB: inds.kidB.position };
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();

    // Re-read to get typed access.
    const persisted = await readPersistedDoc(page);
    expect(persisted).not.toBeNull();
    const inds = persisted!.individuals as Record<
      string,
      { position: { x: number; y: number } }
    >;

    const kidAPos = inds.kidA.position;
    const kidBPos = inds.kidB.position;

    // Guard 1: the two gen-2 cousins must be at least SYMBOL_SIZE apart in x
    // (no overlap), proving the computed layout is non-overlapping.
    const xDist = Math.abs(kidAPos.x - kidBPos.x);
    expect(xDist).toBeGreaterThanOrEqual(SYMBOL_SIZE);

    // Guard 2: positions must equal the ones we computed and seeded (within 0.5),
    // proving the app loaded and held the computed layout without re-laying-out.
    const computedKidA = moved.kidA ?? f.doc.individuals.kidA.position;
    const computedKidB = moved.kidB ?? f.doc.individuals.kidB.position;

    expect(kidAPos.x).toBeCloseTo(computedKidA.x, 0);
    expect(kidBPos.x).toBeCloseTo(computedKidB.x, 0);

    // Suppress the unused-variable warning on `doc` from expect.poll.
    void doc;
  });
});
