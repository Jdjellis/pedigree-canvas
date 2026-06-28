# Privacy Badge + Legend Layout Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-first privacy badge to the app UI (#23) and extract duplicated legend layout constants into a shared module that both `LegendLayer.tsx` and `svgExport.ts` consume (#28).

**Architecture:** #23 is a standalone `PrivacyBadge` React component (react-dom layer, no canvas involvement). #28 creates `src/utils/legendLayout.ts` as the single source of truth for legend geometry, replacing five duplicated constant blocks and fixing a 4px SVG alignment bug for investigation rows. The two changes do not interact and are committed separately.

**Tech Stack:** React 18 + TypeScript, CSS Modules, Vitest + Testing Library, react-konva (canvas layer — not used here)

## Global Constraints

- Never `import ... from 'konva'` directly — only `from 'react-konva'` or `from 'konva/lib/...'`
- No `any` in TypeScript
- All new components need `aria-label` and appropriate ARIA attributes
- CSS uses design tokens: `--color-surface`, `--color-border`, `--color-text`, `--color-text-secondary`, `--color-primary`, `--radius-md`, `--radius-sm`
- Test command: `npm test` (runs vitest from project root)
- `svgExport.ts` and `LegendLayer.tsx` are parallel renderers — they must stay visually aligned

---

## Part A — #28: Legend Layout Shared Module

### Task 1: Create `src/utils/legendLayout.ts` with tests

**Files:**
- Create: `src/utils/legendLayout.ts`
- Create: `src/utils/legendLayout.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2 and 3):
  ```ts
  export const PADDING: number          // 12
  export const ROW_HEIGHT: number       // 28
  export const TITLE_HEIGHT: number     // 24
  export const SWATCH_SIZE: number      // 20
  export const LABEL_WIDTH: number      // 160 (was 120)

  export function legendSwatchWidth(hasBothGender: boolean): number
  export function legendContentWidth(hasBothGender: boolean): number
  export function legendContentHeight(entryCount: number, investigationCount: number): number
  export function legendEntryRowY(idx: number): number
  export function legendInvestigationRowY(entryCount: number, idx: number): number
  ```

- [ ] **Step 1: Write failing tests**

  Create `src/utils/legendLayout.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    PADDING,
    ROW_HEIGHT,
    TITLE_HEIGHT,
    SWATCH_SIZE,
    LABEL_WIDTH,
    legendSwatchWidth,
    legendContentWidth,
    legendContentHeight,
    legendEntryRowY,
    legendInvestigationRowY,
  } from './legendLayout';

  describe('legendLayout constants', () => {
    it('exports expected values', () => {
      expect(PADDING).toBe(12);
      expect(ROW_HEIGHT).toBe(28);
      expect(TITLE_HEIGHT).toBe(24);
      expect(SWATCH_SIZE).toBe(20);
      expect(LABEL_WIDTH).toBe(160);
    });
  });

  describe('legendSwatchWidth', () => {
    it('returns single swatch size for one gender', () => {
      expect(legendSwatchWidth(false)).toBe(20);
    });

    it('returns double swatch size with gap for both genders', () => {
      expect(legendSwatchWidth(true)).toBe(44); // 20*2 + 4
    });
  });

  describe('legendContentWidth', () => {
    it('is correct for single gender', () => {
      // PADDING*2 + SWATCH_SIZE + 8 + LABEL_WIDTH = 24 + 20 + 8 + 160 = 212
      expect(legendContentWidth(false)).toBe(212);
    });

    it('is correct for both genders', () => {
      // PADDING*2 + (SWATCH_SIZE*2+4) + 8 + LABEL_WIDTH = 24 + 44 + 8 + 160 = 236
      expect(legendContentWidth(true)).toBe(236);
    });
  });

  describe('legendContentHeight', () => {
    it('returns only padding + title when there are no rows', () => {
      // PADDING*2 + TITLE_HEIGHT = 24 + 24 = 48
      expect(legendContentHeight(0, 0)).toBe(48);
    });

    it('adds ROW_HEIGHT per entry and per investigation', () => {
      // 48 + 2*28 + 1*28 = 48 + 84 = 132
      expect(legendContentHeight(2, 1)).toBe(132);
    });
  });

  describe('legendEntryRowY', () => {
    it('returns correct Y for the first entry', () => {
      // PADDING + TITLE_HEIGHT = 12 + 24 = 36
      expect(legendEntryRowY(0)).toBe(36);
    });

    it('returns correct Y for subsequent entries', () => {
      // 36 + ROW_HEIGHT = 36 + 28 = 64
      expect(legendEntryRowY(1)).toBe(64);
    });
  });

  describe('legendInvestigationRowY', () => {
    it('starts at the same Y as a first entry when there are no entries', () => {
      expect(legendInvestigationRowY(0, 0)).toBe(legendEntryRowY(0));
    });

    it('continues immediately after all entry rows', () => {
      // After 2 entries: 36 + 2*28 = 92
      expect(legendInvestigationRowY(2, 0)).toBe(92);
    });

    it('increments by ROW_HEIGHT for each investigation', () => {
      expect(legendInvestigationRowY(2, 1)).toBe(120); // 92 + 28
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  npm test -- legendLayout
  ```

  Expected: all tests in `legendLayout.test.ts` fail with module-not-found or import errors.

- [ ] **Step 3: Implement `src/utils/legendLayout.ts`**

  ```ts
  /** Shared legend layout constants and row-position helpers.
   *
   * Both `LegendLayer.tsx` (Konva canvas) and `svgExport.ts` (SVG export)
   * consume these so their renderers stay visually aligned. Change values here
   * and both renderers update automatically.
   */

  export const PADDING = 12;
  export const ROW_HEIGHT = 28;
  export const TITLE_HEIGHT = 24;
  export const SWATCH_SIZE = 20;
  /** Label text area width. Bumped from 120 to accommodate longer investigation strings. */
  export const LABEL_WIDTH = 160;

  /** Width of the swatch column (one or two swatches with gap). */
  export function legendSwatchWidth(hasBothGender: boolean): number {
    return hasBothGender ? SWATCH_SIZE * 2 + 4 : SWATCH_SIZE;
  }

  /** Total width of the legend box. */
  export function legendContentWidth(hasBothGender: boolean): number {
    return PADDING * 2 + legendSwatchWidth(hasBothGender) + 8 + LABEL_WIDTH;
  }

  /** Total height of the legend box. */
  export function legendContentHeight(
    entryCount: number,
    investigationCount: number,
  ): number {
    return PADDING * 2 + TITLE_HEIGHT + (entryCount + investigationCount) * ROW_HEIGHT;
  }

  /** Y of the top edge of a condition entry row (0-based index). */
  export function legendEntryRowY(idx: number): number {
    return PADDING + TITLE_HEIGHT + idx * ROW_HEIGHT;
  }

  /**
   * Y of the top edge of an investigation row, continuing below all condition entries.
   * Apply a +4 inner offset at the call site for the text element itself.
   */
  export function legendInvestigationRowY(entryCount: number, idx: number): number {
    return PADDING + TITLE_HEIGHT + (entryCount + idx) * ROW_HEIGHT;
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npm test -- legendLayout
  ```

  Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/legendLayout.ts src/utils/legendLayout.test.ts
  git commit -m "feat(legend): shared layout constants and row-Y helpers"
  ```

---

### Task 2: Wire `LegendLayer.tsx` to use `legendLayout`

**Files:**
- Modify: `src/components/canvas/LegendLayer.tsx`

**Interfaces:**
- Consumes: `legendLayout.ts` exports from Task 1
- Produces: nothing new (Konva component — not jsdom-testable)

- [ ] **Step 1: Replace local constants and update imports**

  Open `src/components/canvas/LegendLayer.tsx`. Make the following changes:

  **Remove lines 24–27** (the four local constants):
  ```ts
  const SWATCH_SIZE = 20;
  const PADDING = 12;
  const ROW_HEIGHT = 28;
  const TITLE_HEIGHT = 24;
  ```

  **Add an import** after the existing imports (e.g. after line 16):
  ```ts
  import {
    PADDING,
    ROW_HEIGHT,
    TITLE_HEIGHT,
    SWATCH_SIZE,
    legendSwatchWidth,
    legendContentWidth,
    legendContentHeight,
    legendEntryRowY,
    legendInvestigationRowY,
  } from '../../utils/legendLayout';
  ```

- [ ] **Step 2: Replace the three derived-value lines in the component body**

  Inside `LegendLayer` (currently lines 100–107), replace:
  ```ts
  const hasBothGender = legendConfig.entries.some((e) => !e.applicableTo);
  const swatchWidth = hasBothGender ? SWATCH_SIZE * 2 + 4 : SWATCH_SIZE;
  const contentWidth = PADDING * 2 + swatchWidth + 8 + 120;
  const contentHeight =
    PADDING * 2 +
    TITLE_HEIGHT +
    legendConfig.entries.length * ROW_HEIGHT +
    investigations.length * ROW_HEIGHT;
  ```

  With:
  ```ts
  const hasBothGender = legendConfig.entries.some((e) => !e.applicableTo);
  const swatchWidth = legendSwatchWidth(hasBothGender);
  const contentWidth = legendContentWidth(hasBothGender);
  const contentHeight = legendContentHeight(legendConfig.entries.length, investigations.length);
  ```

- [ ] **Step 3: Replace the entry row-Y calculation**

  Inside the `entries.map` callback (currently `const rowY = PADDING + TITLE_HEIGHT + idx * ROW_HEIGHT;`), replace with:
  ```ts
  const rowY = legendEntryRowY(idx);
  ```

- [ ] **Step 4: Replace the investigation row-Y expression**

  The `y` prop on the investigation `<Text>` element currently evaluates:
  ```ts
  PADDING + TITLE_HEIGHT + (legendConfig.entries.length + idx) * ROW_HEIGHT + 4
  ```

  Replace with:
  ```ts
  legendInvestigationRowY(legendConfig.entries.length, idx) + 4
  ```

- [ ] **Step 5: Run the full test suite to catch any regressions**

  ```bash
  npm test
  ```

  Expected: all tests PASS (Konva canvas isn't jsdom-testable, but `svgExport.test.ts` and all other suites must remain green).

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/canvas/LegendLayer.tsx
  git commit -m "refactor(legend): use shared legendLayout module in LegendLayer"
  ```

---

### Task 3: Wire `svgExport.ts` to use `legendLayout` + fix alignment bug

`svgExport.ts` is the real test surface for legend rendering (Konva can't be tested in jsdom). After this task the two renderers share identical geometry and the 4px investigation-row misalignment is fixed.

**Files:**
- Modify: `src/io/svgExport.ts`

**Interfaces:**
- Consumes: `legendLayout.ts` exports from Task 1

The 4 px bug: condition text in `renderLegend` uses `rowY + 4 + 12` (4px inner offset + 12px SVG baseline). Investigation text mistakenly uses `rowY + 12` — missing the `+4` inner offset. This makes investigation rows sit 4px higher in exported SVGs than on the canvas.

- [ ] **Step 1: Replace the five `LEGEND_*` constant declarations with an import**

  Remove lines 57–61:
  ```ts
  const LEGEND_SWATCH_SIZE = 20;
  const LEGEND_PADDING = 12;
  const LEGEND_ROW_HEIGHT = 28;
  const LEGEND_TITLE_HEIGHT = 24;
  const LEGEND_LABEL_WIDTH = 120;
  ```

  Add the following import at the top of the imports block (near the other utils imports):
  ```ts
  import {
    PADDING as LEGEND_PADDING,
    ROW_HEIGHT as LEGEND_ROW_HEIGHT,
    TITLE_HEIGHT as LEGEND_TITLE_HEIGHT,
    SWATCH_SIZE as LEGEND_SWATCH_SIZE,
    LABEL_WIDTH as LEGEND_LABEL_WIDTH,
    legendSwatchWidth,
    legendContentWidth,
    legendContentHeight,
    legendEntryRowY,
    legendInvestigationRowY,
  } from '../utils/legendLayout';
  ```

  The aliased names (`LEGEND_PADDING` etc.) preserve all downstream references in the file so only the three calculation blocks below need to change.

- [ ] **Step 2: Replace derived-value calculations in `renderLegend`**

  Inside `renderLegend` (around line 657), replace:
  ```ts
  const hasBothGender = entries.some((e) => !e.applicableTo);
  const swatchWidth = hasBothGender ? LEGEND_SWATCH_SIZE * 2 + 4 : LEGEND_SWATCH_SIZE;
  const contentWidth = LEGEND_PADDING * 2 + swatchWidth + 8 + LEGEND_LABEL_WIDTH;

  const contentHeight =
    LEGEND_PADDING * 2 +
    LEGEND_TITLE_HEIGHT +
    entries.length * LEGEND_ROW_HEIGHT +
    investigations.length * LEGEND_ROW_HEIGHT;
  ```

  With:
  ```ts
  const hasBothGender = entries.some((e) => !e.applicableTo);
  const swatchWidth = legendSwatchWidth(hasBothGender);
  const contentWidth = legendContentWidth(hasBothGender);
  const contentHeight = legendContentHeight(entries.length, investigations.length);
  ```

- [ ] **Step 3: Replace the entry row-Y calculation**

  Inside the `entries.forEach` callback, replace:
  ```ts
  const rowY = LEGEND_PADDING + LEGEND_TITLE_HEIGHT + idx * LEGEND_ROW_HEIGHT;
  ```

  With:
  ```ts
  const rowY = legendEntryRowY(idx);
  ```

- [ ] **Step 4: Replace the investigation block and fix the 4 px alignment bug**

  Replace the entire investigation block:
  ```ts
  // OLD
  const baseY = LEGEND_PADDING + LEGEND_TITLE_HEIGHT + entries.length * LEGEND_ROW_HEIGHT;
  investigations.forEach((investigation, idx) => {
    const rowY = baseY + idx * LEGEND_ROW_HEIGHT;
    parts.push(
      `<text x="${LEGEND_PADDING}" y="${num(
        rowY + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${SYMBOL_COLOR}">${escapeXml(formatInvestigation(investigation))}</text>`,
    );
  });
  ```

  With (note `rowY + 4 + 12` — the `+4` matches the inner offset used by condition rows and by Konva):
  ```ts
  // NEW
  investigations.forEach((investigation, idx) => {
    const rowY = legendInvestigationRowY(entries.length, idx);
    parts.push(
      `<text x="${LEGEND_PADDING}" y="${num(
        rowY + 4 + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${SYMBOL_COLOR}">${escapeXml(formatInvestigation(investigation))}</text>`,
    );
  });
  ```

- [ ] **Step 5: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: all tests PASS — the existing `svgExport.test.ts` suite acts as the regression guard. Pay attention to any test that asserts specific `y=` attribute values in SVG output.

- [ ] **Step 6: Commit**

  ```bash
  git add src/io/svgExport.ts
  git commit -m "refactor(legend): use shared legendLayout in svgExport; fix investigation row +4 alignment"
  ```

---

## Part B — #23: Local-First Privacy Badge

### Task 4: `PrivacyBadge` component + App wiring

**Files:**
- Create: `src/components/ui/PrivacyBadge.tsx`
- Create: `src/components/ui/PrivacyBadge.module.css`
- Create: `src/components/ui/PrivacyBadge.test.tsx`
- Modify: `src/App.tsx` (import + mount)
- Modify: `src/App.module.css` (flex layout for `slotBottomRight`)

**Interfaces:**
- Consumes: nothing (self-contained component, no store access)
- Produces: `export function PrivacyBadge(): React.JSX.Element`

- [ ] **Step 1: Write failing tests**

  Create `src/components/ui/PrivacyBadge.test.tsx`:

  ```tsx
  import { render, screen, fireEvent } from '@testing-library/react';
  import { PrivacyBadge } from './PrivacyBadge';

  test('renders a button with accessible name "Privacy information"', () => {
    render(<PrivacyBadge />);
    expect(
      screen.getByRole('button', { name: 'Privacy information' }),
    ).toBeInTheDocument();
  });

  test('popover is not visible on initial render', () => {
    render(<PrivacyBadge />);
    expect(
      screen.queryByText(/your data stays on your device/i),
    ).not.toBeInTheDocument();
  });

  test('clicking the badge opens the privacy popover', () => {
    render(<PrivacyBadge />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy information' }));
    expect(
      screen.getByText(/your data stays on your device/i),
    ).toBeInTheDocument();
  });

  test('clicking the badge a second time closes the popover', () => {
    render(<PrivacyBadge />);
    const btn = screen.getByRole('button', { name: 'Privacy information' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(
      screen.queryByText(/your data stays on your device/i),
    ).not.toBeInTheDocument();
  });

  test('pressing Escape while popover is open closes it', () => {
    render(<PrivacyBadge />);
    fireEvent.click(screen.getByRole('button', { name: 'Privacy information' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByText(/your data stays on your device/i),
    ).not.toBeInTheDocument();
  });

  test('aria-expanded reflects popover open/closed state', () => {
    render(<PrivacyBadge />);
    const btn = screen.getByRole('button', { name: 'Privacy information' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  npm test -- PrivacyBadge
  ```

  Expected: all 6 tests fail with module-not-found errors.

- [ ] **Step 3: Create `src/components/ui/PrivacyBadge.tsx`**

  ```tsx
  import { useState, useEffect, useRef } from 'react';
  import styles from './PrivacyBadge.module.css';

  function LockIcon(): React.JSX.Element {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="6"
          width="10"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /**
   * Floating badge indicating local-first data privacy.
   *
   * Renders a small lock button in the bottom-right chrome. Clicking it opens
   * an inline popover explaining that pedigree data never leaves the browser.
   * Dismissed by clicking outside, pressing Escape, or clicking the badge again.
   */
  export function PrivacyBadge(): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;

      const handleMouseDown = (e: MouseEvent): void => {
        if (
          wrapperRef.current &&
          !wrapperRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      const handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') setOpen(false);
      };

      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [open]);

    return (
      <div ref={wrapperRef} className={styles.wrapper}>
        {open && (
          <div className={styles.popover} role="status" aria-live="polite">
            <p className={styles.heading}>Your data stays on your device.</p>
            <p className={styles.body}>
              Nothing is ever sent to a server — all pedigree data is stored
              locally in your browser only.
            </p>
          </div>
        )}
        <button
          type="button"
          className={styles.badge}
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Privacy information"
          aria-expanded={open}
          title="Privacy information"
        >
          <LockIcon />
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 4: Create `src/components/ui/PrivacyBadge.module.css`**

  ```css
  .wrapper {
    position: relative;
    pointer-events: auto;
  }

  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background-color 0.1s;
  }

  .badge:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  .badge:active {
    background: rgba(0, 0, 0, 0.08);
  }

  .popover {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    width: 220px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
    padding: 12px;
  }

  .heading {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 4px;
  }

  .body {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }
  ```

- [ ] **Step 5: Run the tests to confirm they pass**

  ```bash
  npm test -- PrivacyBadge
  ```

  Expected: all 6 tests PASS.

- [ ] **Step 6: Wire `PrivacyBadge` into `App.tsx`**

  Add the import at the top of `src/App.tsx` alongside the other UI imports:
  ```tsx
  import { PrivacyBadge } from './components/ui/PrivacyBadge';
  ```

  Update the `slotBottomRight` div to include `PrivacyBadge` **before** `HelpIsland` (so it stacks above it):
  ```tsx
  <div className={styles.slotBottomRight}>
    <PrivacyBadge />
    <HelpIsland />
  </div>
  ```

- [ ] **Step 7: Add flex layout to `slotBottomRight` in `App.module.css`**

  Update the `.slotBottomRight` rule:
  ```css
  .slotBottomRight {
    position: absolute;
    bottom: 14px;
    right: 14px;
    z-index: 10;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  ```

  `flex-direction: column` with `PrivacyBadge` listed first in JSX means `HelpIsland` sits at the very bottom edge and the badge stacks above it.

- [ ] **Step 8: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: all tests PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add src/components/ui/PrivacyBadge.tsx \
          src/components/ui/PrivacyBadge.module.css \
          src/components/ui/PrivacyBadge.test.tsx \
          src/App.tsx \
          src/App.module.css
  git commit -m "feat(ui): add local-first privacy badge with popover (#23)"
  ```

---

## Self-Review Checklist

- **Spec coverage:**
  - #23 badge visible bottom-right ✓ (Task 4, App.tsx wiring)
  - #23 click opens popover ✓ (Task 4 tests)
  - #23 click-outside / Escape closes ✓ (Task 4 component useEffect)
  - #23 aria-expanded ✓ (Task 4 test step 1)
  - #23 no export interference ✓ (react-dom only, not on canvas)
  - #28 single source of truth for constants ✓ (Tasks 1–3)
  - #28 both renderers visually aligned ✓ (Tasks 2–3)
  - #28 investigation text width improved ✓ (LABEL_WIDTH 120→160 in Task 1)
  - #28 investigation +4 alignment bug fixed ✓ (Task 3, step 4)
  - #28 existing tests still pass ✓ (verified in Task 3, step 5)
  - Investigations heading: already removed in #31, no action needed ✓

- **No placeholders:** All steps contain complete code. ✓
- **Type consistency:** `legendInvestigationRowY(entryCount, idx)` name and signature consistent across Tasks 1, 2, 3. ✓
