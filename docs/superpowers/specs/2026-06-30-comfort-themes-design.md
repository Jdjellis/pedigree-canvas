# Comfort Themes (Light / Warm / Dim)

**Date:** 2026-06-30
**Status:** Approved (user delegated all decisions; build through PR)

## Problem

The editor's canvas is a large, bright (`#ffffff`/`#f7f7f9`) surface. A genetic
counselor working in the tool all day finds it harsh on the eyes. We want a way
to dim the surface and offer warmer colour temperatures, without compromising the
clinical correctness of the pedigree itself.

## The clinical constraint (the whole design hinges on this)

In Bennett/NSGC nomenclature, **symbol fill is semantic**: a filled (dark) symbol
means *affected*, an unfilled (open) symbol means *unaffected*. Therefore we must
never invert symbol colours for a theme — doing so visually flips the
affected/unaffected convention and invites misreading.

**Invariant:** symbols stay **dark stroke / dark "affected" fill on a light
surface** in every theme. Themes may change the *luminance and colour temperature*
of that surface, but the surface stays light. This is enforced by a test on every
theme's palette.

Consequently this is a **comfort-theming** feature, not a "dark mode" in the
invert-everything sense. A true inverted-dark canvas is explicitly out of scope.

## Themes shipped

| Id | Mood | Canvas surface | Chrome |
|------|------|----------------|--------|
| `light` | Current default | bright (`#f7f7f9`) | light |
| `warm` | Cozy paper / reduced blue light | warm cream (`#f2e9d8`) | light, warm-tinted |
| `dim` | Low-glare / dark-room | dimmed cool-grey (`#d6d3cd`) | light, dimmed cool-grey |

`warm` shifts colour *temperature* (cosy cream); `dim` shifts *luminance* (a
cooler, lower-brightness "dimmed paper"). Both keep the whole app **light with
dark text** — symbols dark-on-light, and crucially no light-on-light text.

A "dark chrome around a light canvas" variant was prototyped and rejected: any
text painted on the canvas background (e.g. the onboarding hints, which use
`--color-text`) would have been light-on-light. Keeping one coherent
text-on-light model across canvas *and* chrome avoids that whole class of bug,
and still fully serves the goal (a dimmer, lower-glare surface).

## Architecture

Two colour surfaces, themed independently:

### 1. Application chrome — CSS custom properties (already in place)

`src/index.css` already drives all chrome through `--color-*` variables on
`:root`. We add `[data-theme='warm']` and `[data-theme='dim']` blocks that
override those variables. A small effect mirrors `uiStore.theme` onto
`document.documentElement.dataset.theme`, so the chrome (and the CSS-painted
canvas background, which shows through the transparent Konva `Stage`) re-themes
for free. `light` is the bare `:root` (no attribute needed, but set for clarity).

### 2. Canvas symbols — props threaded through Konva

react-konva's custom reconciler means Zustand subscriptions / React context do
**not** reliably reach Konva components (see project memory). The established
pattern is: subscribe in `CanvasContainer` (react-dom) and pass values down as
props. We follow it.

`CanvasContainer` resolves a `CanvasPalette` from the active theme and passes:
- `symbolFill` → `PedigreeSymbol` → `BaseShape` (the "paper" fill of open symbols)
- `gridColor` + `generationLineColor` → `GridLayer`

Only the **open-symbol surface fill** and the **grid** follow the theme on the
canvas. Symbol *stroke*, line, label, and the "affected" fill stay the dark
constants — they read correctly on every (light) comfort surface, and keeping
them constant minimises threading and clinical risk.

### 3. Exports stay document-standard (unchanged)

`svgExport.ts` and `captureClean.ts` keep importing the light constants
(`SYMBOL_COLOR`, `SYMBOL_FILL`, `LINE_COLOR`, `LABEL_COLOR`). They take no theme
input, so an exported PNG/PDF/SVG is **always** the print-standard light document
regardless of the on-screen theme. A counselor emailing a pedigree never
accidentally sends a dimmed/warm-tinted one. A regression test locks this.

## Data model

`src/theme/themes.ts`:

```ts
export type ThemeId = 'light' | 'warm' | 'dim';

export interface CanvasPalette {
  /** Surface ("paper") fill of open/unaffected symbols. */
  symbolFill: string;
  /** Background grid dots. */
  gridColor: string;
  /** Generation guide lines. */
  generationLineColor: string;
}

export const THEME_CANVAS_PALETTES: Record<ThemeId, CanvasPalette>;
export const THEME_ORDER: readonly ThemeId[];        // ['light','warm','dim']
export const THEME_LABELS: Record<ThemeId, string>;  // 'Light' | 'Warm' | 'Dim'
```

Chrome variable values live in CSS (`index.css`), not JS — the chrome already
works that way and CSS is the right home for it. The JS module owns only what
Konva needs (canvas palette) plus the id/label/order metadata for the picker.

## State & persistence

`uiStore` gains `theme: ThemeId` + `setTheme(theme)`, persisted with `safeStorage`
under `THEME_STORAGE_KEY` (mirrors the existing `onboarded` pattern; storage-blocked
sessions degrade to in-memory). Initial value read from storage, default `'light'`.
Browser-local, consistent with the app's local-first model.

## UI

A "Theme" section in the existing `MenuIsland` ☰ dropdown, reusing the existing
`SegmentedControl` (Light · Warm · Dim). Changing it calls `setTheme`.

## Testing

react-konva is not jsdom-renderable, so canvas behaviour is tested through the
store-operating / pure modules (project convention):

1. `themes.test.ts`
   - Registry: a palette + label exists for every `THEME_ORDER` id.
   - **Clinical invariant:** every theme's `symbolFill` has high relative
     luminance (surface stays light), so dark symbols always read as affected.
2. `uiStore` theme: `setTheme` updates state and persists; init reads storage.
3. Export isolation: `svgExport` output uses the light constants and is
   unaffected by theme (it takes no theme argument) — regression guard.

## Out of scope (YAGNI)

- True inverted-dark canvas.
- User-customisable / arbitrary themes, theme editor.
- Per-document (vs per-browser) theme.
- Syncing theme to OS `prefers-color-scheme` (could be a later enhancement).
