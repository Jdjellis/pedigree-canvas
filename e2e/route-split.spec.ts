import { test, expect } from '@playwright/test';
import { seedFreshStart } from './support/harness';

/**
 * Route-split guard for the two-page build: the marketing landing page is served
 * at "/" and the canvas editor SPA at "/app/".
 *
 * These checks are deliberately shallow — they don't drive the canvas, they only
 * pin the split so a future `rollupOptions.input` change or hosting-rewrite
 * regression can't silently swap the two pages back. The discriminator is the
 * render technology: the landing page is static HTML/SVG (no `<canvas>`), while
 * the editor mounts Konva, which paints onto stacked `<canvas>` layers.
 */
test.describe('route split', () => {
  test('/ serves the marketing landing page, not the editor', async ({ page }) => {
    await page.goto('/');

    // The hero headline ("Clinical pedigrees, drawn to the standard.") is unique
    // to the landing page.
    await expect(page.locator('h1')).toContainText('drawn to the');
    // A prominent call-to-action points into the editor at /app/.
    await expect(
      page.getByRole('link', { name: 'Open the canvas' }).first(),
    ).toHaveAttribute('href', '/app/');
    // The editor never mounts here: Konva paints no canvas onto the static page.
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('/app/ mounts the canvas editor, not the landing page', async ({ page }) => {
    await seedFreshStart(page);
    await page.goto('/app/');
    await page.waitForLoadState('networkidle');

    // Konva paints the pedigree onto stacked <canvas> layers — present only in
    // the editor, absent from the static landing page.
    await expect(page.locator('canvas').first()).toBeVisible();
    // And the landing hero is absent, confirming we didn't get the marketing page.
    await expect(
      page.getByRole('heading', { name: /drawn to the/i }),
    ).toHaveCount(0);
  });
});
