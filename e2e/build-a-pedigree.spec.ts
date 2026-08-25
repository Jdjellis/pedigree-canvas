import { test, expect } from '@playwright/test';
import { seedFreshStart, readPersistedDoc, openRadialOnSeed } from './support/harness';

/**
 * The core creation loop: a user seeds a founder, sets their sex, adds a
 * partner via the radial menu, and sets the partner's sex. This exercises the
 * most-used interaction path through the real react-konva canvas — the surface
 * that unit tests cannot cover — and guards against regressions in it.
 *
 * The assertion reads the app's own persisted autosave document (no test-only
 * production seam) and polls the debounced write instead of sleeping.
 */
test.describe('build a pedigree', () => {
  test('adding a partner to the founder persists two joined individuals', async ({ page }) => {
    await seedFreshStart(page);
    await page.goto('/app/');

    // Fresh seed → the gender picker auto-opens on the founder. Choosing a sex
    // is the first real step of building a pedigree.
    const genderDialog = page.getByRole('dialog', { name: 'Choose gender identity' });
    await expect(genderDialog).toBeVisible();
    // `exact` matters: the default substring match makes "Man" ⊂ "Woman", so a
    // non-exact name would ambiguously resolve to both sex buttons.
    await genderDialog.getByRole('button', { name: 'Woman', exact: true }).click();
    await expect(genderDialog).toBeHidden();

    // Open the radial add-menu on the founder and add a partner.
    await openRadialOnSeed(page);
    await page.getByTitle('Add Partner').click();

    // Adding a partner selects the new person and re-opens the gender picker on
    // them — set their sex to complete the couple.
    await expect(genderDialog).toBeVisible();
    await genderDialog.getByRole('button', { name: 'Man', exact: true }).click();
    await expect(genderDialog).toBeHidden();

    // The document now holds two individuals joined by one partnership. Poll the
    // persisted autosave doc so we wait on the real debounced write.
    await expect
      .poll(async () => {
        const doc = await readPersistedDoc(page);
        return doc ? Object.keys(doc.individuals).length : 0;
      })
      .toBe(2);

    const doc = await readPersistedDoc(page);
    expect(doc).not.toBeNull();
    expect(Object.keys(doc!.partnerships)).toHaveLength(1);
  });
});
