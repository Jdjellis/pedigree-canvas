import { test, expect } from '@playwright/test';
import { farApartCrossBranchCouple } from '../src/utils/__fixtures__/pedigrees';

/**
 * End-to-end guard for the "reformat to tidy" suggestion nudge — the discovery
 * gap closer (see ReformatSuggestion.tsx).
 *
 * The order-preserving per-edit engine cannot clear a foreign node wedged between
 * a couple, and reformat is never applied automatically (it would blow away the
 * manual arrangement). So the app instead *suggests* a reformat when it detects
 * that tangle. `farApartCrossBranchCouple` is a synthetic fixture that seeds
 * exactly that state — a sibling sitting between a cross-branch couple.
 *
 * Strategy (mirrors reformat-pedigree.spec.ts):
 * 1. Seed the tangled fixture into localStorage BEFORE the app boots.
 * 2. Load the app; the nudge must appear (no auto-reformat happened).
 * 3a. Clicking Reformat untangles the chart and the nudge disappears.
 * 3b. Clicking Dismiss hides the nudge without reformatting.
 */

/** localStorage key the app autosaves the document under (see useAutoSave.ts). */
const AUTOSAVE_KEY = 'pedigree-editor-autosave';
/** localStorage flag recording that first-run onboarding has been dismissed. */
const ONBOARDED_KEY = 'pedigree-onboarded';

/** A full PedigreeDocument JSON built from the tangled synthetic fixture. */
function tangledDocJson(): string {
  const f = farApartCrossBranchCouple();
  return JSON.stringify({
    metadata: {
      id: 'reformat-suggestion-e2e',
      title: 'reformat-suggestion-e2e',
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
  });
}

async function seedTangled(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ([autosaveKey, onboardedKey, docJson]) => {
      window.localStorage.setItem(autosaveKey, docJson);
      window.localStorage.setItem(onboardedKey, '1');
    },
    [AUTOSAVE_KEY, ONBOARDED_KEY, tangledDocJson()] as const,
  );
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test.describe('reformat suggestion nudge', () => {
  test('appears for a tangled chart, then Reformat untangles it and dismisses it', async ({
    page,
  }) => {
    await seedTangled(page);

    const nudge = page.getByText('Layout looks tangled', { exact: true });
    await expect(nudge).toBeVisible();
    const reformat = page.getByRole('button', { name: 'Reformat', exact: true });
    await expect(reformat).toBeVisible();

    await reformat.click();

    // The tangle is gone, so the derived nudge disappears on its own.
    await expect(nudge).toBeHidden();
  });

  test('the Dismiss button hides the nudge without reformatting', async ({ page }) => {
    await seedTangled(page);

    const nudge = page.getByText('Layout looks tangled', { exact: true });
    await expect(nudge).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss layout suggestion' }).click();

    await expect(nudge).toBeHidden();
    // The Actions-island Reformat control is still available for later use.
    await expect(
      page.getByRole('button', { name: 'Reformat pedigree', exact: true }),
    ).toBeVisible();
  });
});
