# Design: Privacy Badge (#23) + Legend Layout Cleanup (#28)

**Date:** 2026-06-28  
**Issues:** #23, #28  
**Branch:** `feat/privacy-badge-legend-cleanup`

---

## Scope

Two independent, self-contained changes shipped in one branch:

1. **#23 — Local-first privacy badge**: a small lock icon fixed to the bottom-right of the app that opens a popover explaining that no data leaves the browser.
2. **#28 — Legend layout cleanup**: extract duplicated legend geometry constants into a shared module consumed by both `LegendLayer.tsx` and `svgExport.ts`; bump label width; fix a 4px SVG alignment bug on investigation rows.

These changes do not interact with each other. They are committed separately.

---

## Issue #23 — Privacy Badge

### What it does

A small 🔒 lock button fixed in the bottom-right corner. Clicking it opens an inline popover explaining the local-first privacy model. Clicking outside or pressing Escape dismisses it.

### Architecture

- **New component**: `src/components/ui/PrivacyBadge.tsx` + `PrivacyBadge.module.css`
- **Not** an `Island` — islands are toolbar controls. The badge is a standalone informational affordance with its own minimal chrome.
- Placed in `slotBottomRight` in `App.tsx`, listed **before** `HelpIsland` in JSX so it appears above it. The slot CSS gains `display: flex; flex-direction: column; align-items: flex-end; gap: 8px` — column direction means the last child (HelpIsland) sits at the very bottom edge and the badge stacks above it.
- The popover renders above the badge (upward direction) to avoid overflow off screen bottom.
- Uses `useEffect` + a `mousedown` listener on `document` for click-outside dismissal, and `keydown` for Escape. Both listeners are removed on unmount and when the popover closes.
- Zero impact on exports — this is a react-dom overlay, invisible to the Konva stage.

### Visual design

- Badge: same `border-radius`, `box-shadow`, and `border` as Island chrome (via CSS vars) but smaller — `28×28` button.
- Lock icon: inline SVG (no icon library dependency), matches `--color-text-secondary` colour, 16×16.
- Popover: white card anchored above-right of the badge, max-width 220px, two lines of copy, no close button (click-outside / Escape is sufficient).
- Popover copy:
  > **Your data stays on your device.**  
  > Nothing is ever sent to a server — all pedigree data is stored locally in your browser only.

### Component API

```tsx
// No props — fully self-contained.
export function PrivacyBadge(): React.JSX.Element
```

### Acceptance criteria

- [ ] Badge visible in bottom-right corner, above the `?` HelpIsland button.
- [ ] Click opens popover; click-outside or Escape closes it.
- [ ] Popover does not overflow viewport.
- [ ] Badge is excluded from exports (it is not on the canvas).
- [ ] No accessibility regressions — badge button has `aria-label="Privacy information"` and `aria-expanded` reflects popover state.

---

## Issue #28 — Legend Layout Cleanup

### What it does

Extracts the five duplicated legend layout constants and the row-Y calculations into a single shared module. Both renderers import from it. Also fixes a 4px vertical alignment bug in `svgExport.ts` investigation rows, and bumps the label width from 120 → 160 to reduce clipping of long investigation strings.

### Architecture

**New file: `src/utils/legendLayout.ts`**

Exports constants and two row-Y helpers:

```ts
export const LEGEND_PADDING = 12;
export const LEGEND_ROW_HEIGHT = 28;
export const LEGEND_TITLE_HEIGHT = 24;
export const LEGEND_SWATCH_SIZE = 20;
export const LEGEND_LABEL_WIDTH = 160;   // was 120 in both files

/** Y of the top-left corner of a condition entry row. */
export function legendEntryRowY(idx: number): number {
  return LEGEND_PADDING + LEGEND_TITLE_HEIGHT + idx * LEGEND_ROW_HEIGHT;
}

/**
 * Y of the top-left corner of an investigation row (continues below condition entries).
 * The +4 inner offset is applied at the call site for the text element itself.
 */
export function legendInvestigationRowY(entryCount: number, idx: number): number {
  return LEGEND_PADDING + LEGEND_TITLE_HEIGHT + (entryCount + idx) * LEGEND_ROW_HEIGHT;
}
```

**`src/components/canvas/LegendLayer.tsx`**

- Drop local `SWATCH_SIZE`, `PADDING`, `ROW_HEIGHT`, `TITLE_HEIGHT` constants.
- Import from `legendLayout`.
- Use `legendEntryRowY(idx)` and `legendInvestigationRowY(entries.length, idx)` for row positions.

**`src/io/svgExport.ts`**

- Drop the five `LEGEND_*` constants.
- Import from `legendLayout`.
- Use the same helpers.
- Fix: investigation rows change from `rowY + 12` → `rowY + 4 + 12` (matching the `+4` inner offset already used for condition rows and for investigation rows in Konva). This corrects the 4px upward drift.

### Investigations heading

Already removed in issue #31. No action needed.

### Acceptance criteria

- [ ] `legendLayout.ts` is the single source of truth for all five constants.
- [ ] `LegendLayer.tsx` and `svgExport.ts` have no local legend geometry constants.
- [ ] Legend renders identically on-canvas and in SVG export (including investigation row vertical position).
- [ ] Investigation text no longer clips on strings up to ~22 characters (`LEGEND_LABEL_WIDTH = 160`).
- [ ] Existing `svgExport.test.ts` tests continue to pass.

---

## Testing

- `svgExport.test.ts` — the legend SVG snapshot tests are the real test surface (Konva isn't jsdom-testable). Run `npm test` to verify both changes leave tests green.
- Manual browser check for #23: badge visible, popover opens/closes correctly.

---

## What is NOT in scope

- Twins UI (#42, deferred)
- Consanguinity rendering (#41) — needs a check for #16 overlap first
- Adoption denotation (#39)
- URL sharing (#24)
