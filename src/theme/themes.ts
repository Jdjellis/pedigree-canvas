/**
 * Comfort themes (light / warm / dim).
 *
 * These themes change the *luminance and colour temperature* of the editor to
 * ease all-day use — they do NOT invert the pedigree. In Bennett/NSGC
 * nomenclature symbol fill is semantic (filled = affected, open = unaffected),
 * so every theme keeps symbols **dark on a light surface**. Only the surface's
 * warmth/brightness changes between themes. See
 * `docs/superpowers/specs/2026-06-30-comfort-themes-design.md`.
 *
 * Two colour surfaces are themed independently:
 * - **Chrome** (toolbars, panels, menus) + the CSS-painted canvas background:
 *   driven by `--color-*` custom properties in `index.css`, switched via the
 *   `data-theme` attribute on `<html>`. Not modelled here.
 * - **Canvas symbols/grid** (drawn by Konva): the small palette below, threaded
 *   from `CanvasContainer` down to the Konva components as props (react-konva's
 *   reconciler does not reliably receive store subscriptions — see project
 *   memory).
 *
 * Document exports (`svgExport`, `captureClean`) deliberately ignore the theme
 * and always render the print-standard light constants.
 */

/** The available comfort themes. */
export type ThemeId = 'light' | 'warm' | 'dim';

/** `localStorage` key the active theme is persisted under (browser-local). */
export const THEME_STORAGE_KEY = 'pedigree-theme';

/** The theme used when nothing is stored / storage is blocked. */
export const DEFAULT_THEME: ThemeId = 'light';

/** Themes in display (and cycle) order, lightest to dimmest. */
export const THEME_ORDER: readonly ThemeId[] = ['light', 'warm', 'dim'] as const;

/** Human-facing labels for the theme picker. */
export const THEME_LABELS: Record<ThemeId, string> = {
  light: 'Light',
  warm: 'Warm',
  dim: 'Dim',
};

/**
 * The canvas colours that follow the active theme. Everything else on the
 * canvas (symbol stroke, line, label, the "affected" fill) stays the dark
 * constants in `constants.ts`, which read correctly on every light surface.
 */
export interface CanvasPalette {
  /**
   * Surface ("paper") fill of open/unaffected symbols. Kept a touch lighter
   * than the canvas background so symbols read as subtle cards, matching the
   * existing light look where white symbols sit on a near-white background.
   */
  symbolFill: string;
  /** Background grid dots. */
  gridColor: string;
  /** Generation guide lines. */
  generationLineColor: string;
}

/**
 * Per-theme canvas palettes. Surface fills are all high-luminance (light) by
 * design — enforced by `themes.test.ts` — so affected (dark) symbols always
 * read as affected.
 */
export const THEME_CANVAS_PALETTES: Record<ThemeId, CanvasPalette> = {
  // Unchanged from the pre-theme defaults (SYMBOL_FILL / GRID_COLOR).
  light: {
    symbolFill: '#ffffff',
    gridColor: '#e5e5e5',
    generationLineColor: '#d4d4d4',
  },
  // Pale amber "paper" from Excalidraw's Light Yellow (#fff3bf): reduced blue
  // light, much lighter than the old cream, everything stays clearly light.
  warm: {
    symbolFill: '#fffdf6',
    gridColor: '#e8ddc0',
    generationLineColor: '#ddd0a8',
  },
  // Low-luminance cool-grey "dimmed paper" for low-glare / dark-room work. Still
  // clearly light so dark symbols keep their meaning; the symbol fill sits a
  // touch lighter than the dimmed canvas so symbols read as subtle cards.
  dim: {
    symbolFill: '#e4e1db',
    gridColor: '#c2bfb8',
    generationLineColor: '#bdbab2',
  },
};

/** Narrowing type guard for values read from storage / untyped sources. */
export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' &&
    (THEME_ORDER as readonly string[]).includes(value)
  );
}
