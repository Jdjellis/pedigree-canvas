# Tool Model & First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-tool placement model with a seeded "grow from one person" model: remove the person/partnership placement tools, seed a first person on new documents, make the radial menu the sole way to add relatives (hover-preview + click-to-pin), add an always-visible default-sex control, repurpose Lock as an edit lock, and rework first-run onboarding.

**Architecture:** All changes live in the React/Zustand UI layer; the pedigree document schema is unchanged. Per the project's react-konva-in-jsdom constraint, canvas logic is exercised through extracted, store-operating helpers and pure functions (unit-tested with Vitest + jsdom + Testing Library); the thin Konva/JSX wiring is verified manually via `npm run dev`.

**Tech Stack:** React 19, TypeScript, Vite, react-konva, Zustand (+ zundo temporal), Vitest, @testing-library/react.

## Global Constraints

- TypeScript: never use `any`; type-annotate every function signature; JSDoc public interfaces. (Project rule.)
- Tests: `npm test` (alias for `vitest run`) must pass before every commit. Typecheck with `npm run typecheck`.
- Commits: Conventional Commits (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`), one logical change each. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- react-konva components cannot render under jsdom (Stage throws with no canvas). Do NOT write Vitest tests that render Konva components. Test extracted helpers/stores instead; verify Konva/JSX manually.
- `GenderIdentity` members are `Man`, `Woman`, `Unknown` (from `src/types/enums.ts`).
- The default sex is `'unknown'`. The seeded first person is NOT the proband (`isProband: false`).
- This worktree is branched from `main` and does NOT contain the separate "smaller toolbar bugs" round (ToolHint, etc.); ignore those files.

---

## Task 1: Sex→gender mapping helper + `defaultSex` UI state

**Files:**
- Create: `src/utils/sex.ts`
- Create: `src/utils/sex.test.ts`
- Modify: `src/stores/uiStore.ts` (add `defaultSex` + `setDefaultSex`)
- Create: `src/stores/uiStore.defaultSex.test.ts`

**Interfaces:**
- Produces: `type DefaultSex = 'male' | 'female' | 'unknown'`; `genderForSex(sex: DefaultSex): GenderIdentity`; UI store fields `defaultSex: DefaultSex` and `setDefaultSex(sex: DefaultSex): void`.

- [ ] **Step 1: Write the failing test for the mapping helper**

Create `src/utils/sex.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { genderForSex } from './sex';
import { GenderIdentity } from '../types/enums';

describe('genderForSex', () => {
  test('maps male -> Man, female -> Woman, unknown -> Unknown', () => {
    expect(genderForSex('male')).toBe(GenderIdentity.Man);
    expect(genderForSex('female')).toBe(GenderIdentity.Woman);
    expect(genderForSex('unknown')).toBe(GenderIdentity.Unknown);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/utils/sex.test.ts`
Expected: FAIL — cannot resolve `./sex`.

- [ ] **Step 3: Implement `src/utils/sex.ts`**

```ts
import { GenderIdentity } from '../types/enums';

/** The sex applied to a singly-added person (the seed and radial +Partner/+Child/+Sibling). */
export type DefaultSex = 'male' | 'female' | 'unknown';

/**
 * Map a {@link DefaultSex} UI selection to its document-model {@link GenderIdentity}.
 *
 * @param sex - The default-sex UI selection.
 * @returns The corresponding gender identity for a new individual.
 */
export function genderForSex(sex: DefaultSex): GenderIdentity {
  switch (sex) {
    case 'male':
      return GenderIdentity.Man;
    case 'female':
      return GenderIdentity.Woman;
    case 'unknown':
      return GenderIdentity.Unknown;
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/utils/sex.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the store field**

Create `src/stores/uiStore.defaultSex.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore defaultSex', () => {
  beforeEach(() => {
    useUIStore.getState().setDefaultSex('unknown');
  });

  test('defaults to unknown', () => {
    expect(useUIStore.getState().defaultSex).toBe('unknown');
  });

  test('setDefaultSex updates the value', () => {
    useUIStore.getState().setDefaultSex('female');
    expect(useUIStore.getState().defaultSex).toBe('female');
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npm test -- src/stores/uiStore.defaultSex.test.ts`
Expected: FAIL — `setDefaultSex` is not a function / `defaultSex` undefined.

- [ ] **Step 7: Add `defaultSex` to the UI store**

In `src/stores/uiStore.ts`, add the import at the top:

```ts
import type { DefaultSex } from '../utils/sex';
```

In the `UIState` interface, after `activeTool: ActiveTool;` add:

```ts
  /** The sex applied to singly-added people (seed + radial +Partner/+Child/+Sibling). */
  defaultSex: DefaultSex;
```

In the interface's actions block, after `setActiveTool: (tool: ActiveTool) => void;` add:

```ts
  /** Set the default sex used for singly-added people. */
  setDefaultSex: (sex: DefaultSex) => void;
```

In the store implementation, after `activeTool: 'select',` add:

```ts
  defaultSex: 'unknown',
```

After the `setActiveTool: (activeTool) => set({ activeTool }),` implementation add:

```ts
  setDefaultSex: (defaultSex) => set({ defaultSex }),
```

- [ ] **Step 8: Run it to confirm it passes**

Run: `npm test -- src/stores/uiStore.defaultSex.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

Run: `npm run typecheck` (expect no errors), then:

```bash
git add src/utils/sex.ts src/utils/sex.test.ts src/stores/uiStore.ts src/stores/uiStore.defaultSex.test.ts
git commit -m "feat: add defaultSex UI state and sex->gender mapping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Default-sex segmented control

**Files:**
- Create: `src/components/ui/islands/DefaultSexControl.tsx`
- Create: `src/components/ui/islands/DefaultSexControl.test.tsx`
- Modify: `src/components/ui/islands/islands.module.css` (add segmented-control styles)

**Interfaces:**
- Consumes: `useUIStore` `defaultSex` / `setDefaultSex` (Task 1); `SquareIcon`, `CircleIcon`, `DiamondIcon` from `./toolIcons`.
- Produces: `DefaultSexControl` (default React component) — a 3-segment control rendered inside the tool island.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/islands/DefaultSexControl.test.tsx`:

```tsx
import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefaultSexControl } from './DefaultSexControl';
import { useUIStore } from '../../../stores/uiStore';

describe('DefaultSexControl', () => {
  beforeEach(() => {
    useUIStore.getState().setDefaultSex('unknown');
  });

  test('marks the current default as pressed', () => {
    render(<DefaultSexControl />);
    expect(screen.getByRole('button', { name: 'Unknown' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Male' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a segment updates the store', () => {
    render(<DefaultSexControl />);
    screen.getByRole('button', { name: 'Female' }).click();
    expect(useUIStore.getState().defaultSex).toBe('female');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/components/ui/islands/DefaultSexControl.test.tsx`
Expected: FAIL — cannot resolve `./DefaultSexControl`.

- [ ] **Step 3: Implement the component**

Create `src/components/ui/islands/DefaultSexControl.tsx`:

```tsx
import clsx from 'clsx';
import { useUIStore } from '../../../stores/uiStore';
import type { DefaultSex } from '../../../utils/sex';
import { SquareIcon, CircleIcon, DiamondIcon } from './toolIcons';
import styles from './islands.module.css';

/** One segment's display metadata. */
interface SexSegment {
  sex: DefaultSex;
  label: string;
  icon: React.ReactNode;
}

const SEGMENTS: SexSegment[] = [
  { sex: 'male', label: 'Male', icon: <SquareIcon /> },
  { sex: 'female', label: 'Female', icon: <CircleIcon /> },
  { sex: 'unknown', label: 'Unknown', icon: <DiamondIcon /> },
];

/**
 * Always-visible segmented control beside the Select tool that sets the
 * {@link DefaultSex} applied to singly-added people. Lives in the react-dom
 * tree, so subscribing to the UI store here is safe.
 */
export function DefaultSexControl(): React.JSX.Element {
  const defaultSex = useUIStore((s) => s.defaultSex);
  const setDefaultSex = useUIStore((s) => s.setDefaultSex);

  return (
    <div className={styles.sexControl} role="group" aria-label="Default sex for new people">
      {SEGMENTS.map((seg) => (
        <button
          key={seg.sex}
          type="button"
          className={clsx(styles.sexSegment, defaultSex === seg.sex && styles.sexSegmentActive)}
          onClick={() => setDefaultSex(seg.sex)}
          title={`New people: ${seg.label}`}
          aria-label={seg.label}
          aria-pressed={defaultSex === seg.sex}
        >
          <span className={styles.toolIcon} aria-hidden="true">{seg.icon}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add styles**

Append to `src/components/ui/islands/islands.module.css`:

```css
/* Default-sex segmented control (sits beside the Select tool). */
.sexControl {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(120, 120, 140, 0.08);
}
.sexSegment {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 38px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #6b6e7a;
  cursor: pointer;
}
.sexSegment:hover {
  background: rgba(120, 120, 140, 0.12);
}
.sexSegmentActive {
  background: #ffffff;
  color: var(--accent, #6b73e1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `npm test -- src/components/ui/islands/DefaultSexControl.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 6: Mount it in the tool island (manual verify)**

In `src/components/ui/islands/ToolIsland.tsx`, add the import:

```ts
import { DefaultSexControl } from './DefaultSexControl';
```

Render `<DefaultSexControl />` immediately after the Select button. (The current `PLACEMENT_TOOLS.map` still renders the old person tools at this point — that's fine; Task 7 removes them. Place the control right after the `select` entry by rendering it conditionally inside the map, OR — simpler and final — leave a single insertion point that Task 7 keeps:)

Add, just before the closing `</Island>`:

```tsx
      <span className={styles.toolDivider} aria-hidden="true" />
      <DefaultSexControl />
```

Run: `npm run dev`, open the app. Expected: the toolbar shows the `▢ ● ◇` segmented control; clicking a segment highlights it. (Position is finalised in Task 7.)

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`, then:

```bash
git add src/components/ui/islands/DefaultSexControl.tsx src/components/ui/islands/DefaultSexControl.test.tsx src/components/ui/islands/islands.module.css src/components/ui/islands/ToolIsland.tsx
git commit -m "feat: add always-visible default-sex segmented control

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Radial menu uses the default sex

**Files:**
- Modify: `src/components/ui/RadialMenu.tsx` (+Partner, +Child, +Sibling use `genderForSex(defaultSex)`)
- Create: `src/components/ui/RadialMenu.defaultSex.test.tsx` (guards the wiring via a focused extraction)
- Modify: `src/components/ui/RadialMenu.tsx` (extract `createRelativeIndividual` helper)

**Interfaces:**
- Consumes: `genderForSex`, `DefaultSex` (Task 1); `createDefaultIndividual` (`src/stores/pedigreeStore`).
- Produces: exported helper `createRelativeIndividual(sex: DefaultSex, overrides: Partial<Individual>): Individual`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/RadialMenu.defaultSex.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest';
import { createRelativeIndividual } from './RadialMenu';
import { GenderIdentity } from '../../types/enums';

describe('createRelativeIndividual', () => {
  test('applies the default sex as the gender identity', () => {
    expect(createRelativeIndividual('male', {}).genderIdentity).toBe(GenderIdentity.Man);
    expect(createRelativeIndividual('female', {}).genderIdentity).toBe(GenderIdentity.Woman);
    expect(createRelativeIndividual('unknown', {}).genderIdentity).toBe(GenderIdentity.Unknown);
  });

  test('passes through position/generation overrides', () => {
    const ind = createRelativeIndividual('male', { generation: 2, position: { x: 10, y: 20 } });
    expect(ind.generation).toBe(2);
    expect(ind.position).toEqual({ x: 10, y: 20 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/components/ui/RadialMenu.defaultSex.test.tsx`
Expected: FAIL — `createRelativeIndividual` is not exported.

- [ ] **Step 3: Add the helper and use it for partner/child/sibling**

In `src/components/ui/RadialMenu.tsx`, update imports:

```ts
import { genderForSex, type DefaultSex } from '../../utils/sex';
import type { Individual } from '../../types/pedigree';
```

Add an exported helper above the component:

```ts
/**
 * Build a new singly-added relative (partner / child / sibling) whose sex is the
 * current default. +Parents does NOT use this — it always creates a fixed
 * father+mother pair.
 *
 * @param sex - The active default sex.
 * @param overrides - Position/generation (and any other) overrides.
 * @returns A new individual with the mapped gender identity.
 */
export function createRelativeIndividual(
  sex: DefaultSex,
  overrides: Partial<Individual>,
): Individual {
  return createDefaultIndividual({ genderIdentity: genderForSex(sex), ...overrides });
}
```

Inside the component, read the default sex (add near the other store reads, top of `RadialMenu`):

```ts
  const defaultSex = useUIStore((s) => s.defaultSex);
```

In `handleAddPartner`, replace the `const partner = createDefaultIndividual({...})` call with:

```ts
    const partner = createRelativeIndividual(defaultSex, {
      generation: target.generation,
      position: {
        x: target.position.x + PARTNER_SPACING,
        y: target.position.y,
      },
    });
```

In `handleAddChild`, replace the `const child = createDefaultIndividual({...})` call with:

```ts
    const child = createRelativeIndividual(defaultSex, {
      generation: (target.generation ?? 0) + 1,
      position: {
        x: midX + existingChildren * SIBLING_SPACING,
        y: target.position.y + GENERATION_SPACING,
      },
    });
```

In `handleAddSibling`, replace the `const sibling = createDefaultIndividual({...})` call with:

```ts
    const sibling = createRelativeIndividual(defaultSex, {
      generation: target.generation,
      position: {
        x: maxX + SIBLING_SPACING,
        y: target.position.y,
      },
    });
```

Add `defaultSex` to the dependency arrays of `handleAddPartner`, `handleAddChild`, and `handleAddSibling` (the `useCallback` deps). Leave `handleAddParent` unchanged (fixed Man/Woman pair).

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/components/ui/RadialMenu.defaultSex.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual verify**

Run: `npm run dev`. Set the default-sex control to Female, hover a person, click +Child. Expected: the new child renders as a circle. Switch to Male, add a sibling → square. Add Parents → always a square+circle pair regardless of the control.

- [ ] **Step 6: Typecheck, full test, commit**

Run: `npm run typecheck` and `npm test` (expect all pass), then:

```bash
git add src/components/ui/RadialMenu.tsx src/components/ui/RadialMenu.defaultSex.test.tsx
git commit -m "feat: radial +partner/+child/+sibling use the default sex

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Seed a first person on new documents

**Files:**
- Modify: `src/stores/pedigreeStore.ts` (add `createSeededDocument`)
- Create: `src/stores/pedigreeStore.seed.test.ts`
- Create: `src/utils/canvasCenter.ts` (extract the visible-centre helper; DRY with `addText`)
- Modify: `src/hooks/useAutoSave.ts` (extract `parseSavedDocument`; seed on restore-miss)
- Create: `src/hooks/useAutoSave.parse.test.ts`
- Modify: `src/commands/useEditorActions.ts` (`newDocument` seeds; `addText` reuses the helper)

**Interfaces:**
- Consumes: `genderForSex`, `DefaultSex` (Task 1); `useUIStore.defaultSex`.
- Produces: `createSeededDocument(sex: DefaultSex, position?: {x:number;y:number}): PedigreeDocument`; `parseSavedDocument(raw: string | null): PedigreeDocument | null`; `getVisibleCanvasCenter(): {x:number;y:number}`.

- [ ] **Step 1: Write the failing test for `createSeededDocument`**

Create `src/stores/pedigreeStore.seed.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createSeededDocument } from './pedigreeStore';
import { GenderIdentity } from '../types/enums';

describe('createSeededDocument', () => {
  test('contains exactly one non-proband individual of the default sex', () => {
    const doc = createSeededDocument('female', { x: 5, y: 7 });
    const people = Object.values(doc.individuals);
    expect(people).toHaveLength(1);
    expect(people[0].genderIdentity).toBe(GenderIdentity.Woman);
    expect(people[0].isProband).toBe(false);
    expect(people[0].position).toEqual({ x: 5, y: 7 });
  });

  test('defaults position to origin', () => {
    const doc = createSeededDocument('unknown');
    expect(Object.values(doc.individuals)[0].position).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/stores/pedigreeStore.seed.test.ts`
Expected: FAIL — `createSeededDocument` is not exported.

- [ ] **Step 3: Implement `createSeededDocument`**

In `src/stores/pedigreeStore.ts`, add the import:

```ts
import { genderForSex, type DefaultSex } from '../utils/sex';
```

After `createDefaultIndividual`, add:

```ts
/**
 * Build a fresh document seeded with a single starting person of the given
 * default sex, positioned at `position` (canvas coordinates). The seed is NOT
 * the proband. Used whenever the user starts a new pedigree.
 *
 * @param sex - The default sex for the seeded person.
 * @param position - Canvas-space position; defaults to the origin.
 * @returns A new document containing exactly one individual.
 */
export function createSeededDocument(
  sex: DefaultSex,
  position: { x: number; y: number } = { x: 0, y: 0 },
): PedigreeDocument {
  const doc = createDefaultDocument();
  const seed = createDefaultIndividual({
    genderIdentity: genderForSex(sex),
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  });
  doc.individuals[seed.id] = seed;
  return doc;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/stores/pedigreeStore.seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `parseSavedDocument`**

Create `src/hooks/useAutoSave.parse.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseSavedDocument } from './useAutoSave';

describe('parseSavedDocument', () => {
  test('returns null for missing or corrupt data', () => {
    expect(parseSavedDocument(null)).toBeNull();
    expect(parseSavedDocument('not json')).toBeNull();
    expect(parseSavedDocument('{"foo":1}')).toBeNull();
  });

  test('returns the document for a valid payload (with legend migration)', () => {
    const raw = JSON.stringify({ individuals: {}, partnerships: {} });
    const doc = parseSavedDocument(raw);
    expect(doc).not.toBeNull();
    expect(doc!.legendConfig).toEqual({ entries: [], position: { x: 50, y: 50 } });
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npm test -- src/hooks/useAutoSave.parse.test.ts`
Expected: FAIL — `parseSavedDocument` is not exported.

- [ ] **Step 7: Extract `parseSavedDocument` and seed on restore-miss**

In `src/hooks/useAutoSave.ts`, add the imports:

```ts
import { usePedigreeStore, createSeededDocument } from '../stores/pedigreeStore';
import type { PedigreeDocument } from '../types/pedigree';
import { getVisibleCanvasCenter } from '../utils/canvasCenter';
```

(Adjust the existing `usePedigreeStore` import to the combined form above.) Add the exported parser above `useAutoSave`:

```ts
/**
 * Parse and migrate a raw autosave payload from localStorage.
 *
 * @param raw - The raw JSON string (or null when nothing is stored).
 * @returns The migrated document, or null when absent/corrupt/invalid.
 */
export function parseSavedDocument(raw: string | null): PedigreeDocument | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !('individuals' in doc)) return null;
    if (!doc.legendConfig) {
      doc.legendConfig = { entries: [], position: { x: 50, y: 50 } };
    }
    for (const entry of doc.legendConfig.entries) {
      if (entry.conditionNames && !entry.name) {
        entry.name = entry.conditionNames.default;
        delete entry.conditionNames;
      }
    }
    for (const ind of Object.values(doc.individuals)) {
      const individual = ind as Record<string, unknown>;
      if (!individual.conditionIds) individual.conditionIds = [];
    }
    return doc as PedigreeDocument;
  } catch {
    return null;
  }
}
```

Replace the body of the restore-on-mount effect with:

```ts
  useEffect(() => {
    const doc = parseSavedDocument(localStorage.getItem(STORAGE_KEY));
    if (doc) {
      usePedigreeStore.getState().setDocument(doc);
    } else {
      // Genuinely fresh start (nothing valid to restore): seed a first person.
      const sex = useUIStore.getState().defaultSex;
      usePedigreeStore.getState().setDocument(
        createSeededDocument(sex, getVisibleCanvasCenter()),
      );
    }
  }, []);
```

- [ ] **Step 8: Create the visible-centre helper**

Create `src/utils/canvasCenter.ts`:

```ts
import { useViewportStore } from '../stores/viewportStore';

/**
 * Canvas-space position at the centre of the visible canvas area. Mirrors the
 * stage-local convention used across the app (0,0 = top-left of `.konvajs-content`).
 * Falls back to a 600x600 stage centre when the element is not yet measured.
 *
 * @returns The canvas-space {x, y} at the visible centre.
 */
export function getVisibleCanvasCenter(): { x: number; y: number } {
  const canvasEl = document.querySelector('.konvajs-content');
  let stageCenter = { x: 300, y: 300 };
  if (canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    stageCenter = { x: rect.width / 2, y: rect.height / 2 };
  }
  return useViewportStore.getState().screenToCanvas(stageCenter);
}
```

- [ ] **Step 9: Run both new test files to confirm they pass**

Run: `npm test -- src/hooks/useAutoSave.parse.test.ts src/stores/pedigreeStore.seed.test.ts`
Expected: PASS.

- [ ] **Step 10: Seed on explicit "New", and DRY `addText`**

In `src/commands/useEditorActions.ts`:

Add the imports:

```ts
import { createSeededDocument } from '../stores/pedigreeStore';
import { getVisibleCanvasCenter } from '../utils/canvasCenter';
```

Replace the `newDocument` body with a reset-then-seed-then-centre sequence:

```ts
  const newDocument = (): void => {
    if (window.confirm('Create a new pedigree? Unsaved changes will be lost.')) {
      useViewportStore.getState().resetView();
      const sex = useUIStore.getState().defaultSex;
      usePedigreeStore.getState().setDocument(
        createSeededDocument(sex, getVisibleCanvasCenter()),
      );
      useUIStore.getState().clearSelection();
    }
  };
```

In `addText`, replace the inline `.konvajs-content` centre computation (the `const canvasEl = ...` through `const fallback = screenToCanvas(stageCenter);` block) with:

```ts
    const fallback = getVisibleCanvasCenter();
```

(Keep the `computeAnnotationDropPosition(...)` call that uses `fallback`. Remove the now-unused local `screenToCanvas`/`canvasEl`/`stageCenter` lines in `addText` and drop the `screenToCanvas` destructure if it becomes unused.)

- [ ] **Step 11: Manual verify**

Run: `npm run dev`. Clear site data / use a fresh profile → on load, exactly one person appears centred. Reload → the same person persists (no second seed). Run "New document" from ⌘K → confirm dialog → a single fresh person appears centred.

- [ ] **Step 12: Typecheck, full test, commit**

Run: `npm run typecheck` and `npm test` (expect all pass), then:

```bash
git add src/stores/pedigreeStore.ts src/stores/pedigreeStore.seed.test.ts src/utils/canvasCenter.ts src/hooks/useAutoSave.ts src/hooks/useAutoSave.parse.test.ts src/commands/useEditorActions.ts
git commit -m "feat: seed a first person on fresh load and New document

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Rename Lock state to `editingLocked`

**Files:**
- Modify: `src/stores/uiStore.ts` (`toolLocked`→`editingLocked`, `toggleToolLocked`→`toggleEditingLocked`)
- Modify: `src/components/ui/islands/ToolIsland.tsx` (read `editingLocked`)
- Modify: `src/commands/useEditorActions.ts` (`toggleToolLock` body)
- Modify: `src/hooks/useKeyboardShortcuts.ts` (`l` key)
- Create: `src/stores/uiStore.editingLocked.test.ts`

**Interfaces:**
- Produces: UI store `editingLocked: boolean` and `toggleEditingLocked(): void` (replacing `toolLocked`/`toggleToolLocked`).

- [ ] **Step 1: Write the failing test**

Create `src/stores/uiStore.editingLocked.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore editingLocked', () => {
  beforeEach(() => {
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('defaults to false', () => {
    expect(useUIStore.getState().editingLocked).toBe(false);
  });

  test('toggles', () => {
    useUIStore.getState().toggleEditingLocked();
    expect(useUIStore.getState().editingLocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/stores/uiStore.editingLocked.test.ts`
Expected: FAIL — `editingLocked` undefined.

- [ ] **Step 3: Rename in the store**

In `src/stores/uiStore.ts`: rename the `toolLocked` interface field and its JSDoc to:

```ts
  /** When true, the pedigree is read-only: no structural or property edits. */
  editingLocked: boolean;
```

Rename the action declaration to:

```ts
  /** Toggle whether the pedigree is locked against editing. */
  toggleEditingLocked: () => void;
```

In the implementation, rename `toolLocked: false,` → `editingLocked: false,` and:

```ts
  toggleEditingLocked: () =>
    set((state) => ({ editingLocked: !state.editingLocked })),
```

- [ ] **Step 4: Update the three consumers**

In `src/components/ui/islands/ToolIsland.tsx`: replace `const toolLocked = useUIStore((s) => s.toolLocked);` with:

```ts
  const editingLocked = useUIStore((s) => s.editingLocked);
```

Update the Lock `ToolButton` to use the new flag/label:

```tsx
      <ToolButton
        label="Lock editing"
        icon={<Lock size={18} />}
        active={editingLocked}
        onClick={actions.toggleEditingLock}
      />
```

In `src/commands/useEditorActions.ts`: rename the `toggleToolLock` interface entry and body to:

```ts
  /** Toggle whether the pedigree is locked against editing. */
  toggleEditingLock: () => void;
```

```ts
  const toggleEditingLock = (): void => {
    useUIStore.getState().toggleEditingLocked();
  };
```

Update the `useMemo` return object: replace `toggleToolLock,` with `toggleEditingLock,`.

In `src/hooks/useKeyboardShortcuts.ts`: in the `'l'` case, replace `useUIStore.getState().toggleToolLocked();` with `useUIStore.getState().toggleEditingLocked();`. Update the JSDoc comment line `L toggle tool-lock` → `L toggle edit-lock`.

- [ ] **Step 5: Update the registry test stub**

In `src/commands/registry.test.ts`, in `makeNoopActions`, replace `toggleToolLock: vi.fn(),` with `toggleEditingLock: vi.fn(),`.

- [ ] **Step 6: Run tests and typecheck to confirm green**

Run: `npm run typecheck` and `npm test`
Expected: PASS (the store test passes; nothing references the old names).

- [ ] **Step 7: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.editingLocked.test.ts src/components/ui/islands/ToolIsland.tsx src/commands/useEditorActions.ts src/hooks/useKeyboardShortcuts.ts src/commands/registry.test.ts
git commit -m "refactor: rename tool-lock state to editingLocked

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Enforce the edit lock on every mutation

**Files:**
- Modify: `src/commands/editorActions.ts` (guard `deleteSelectedAction`)
- Create: `src/commands/editorActions.lock.test.ts`
- Modify: `src/components/canvas/eraserTool.ts` (no erase when locked)
- Create: `src/components/canvas/eraserTool.lock.test.ts`
- Modify: `src/components/canvas/symbols/PedigreeSymbol.tsx` (no drag when locked)
- Modify: `src/components/canvas/CanvasContainer.tsx` (no text placement when locked)
- Modify: `src/components/ui/RadialMenu.tsx` (do not open when locked)
- Modify: `src/components/ui/PropertiesPanel.tsx` (read-only when locked — disable inputs)

(Toolbar greying of Text/Eraser while locked is finalised in Task 7's island rewrite; the gates below make a locked Text/Eraser harmless regardless of toolbar state.)

**Interfaces:**
- Consumes: `useUIStore.editingLocked` (Task 5).
- Produces: `deleteSelectedAction` becomes a no-op while locked (others gate inline).

- [ ] **Step 1: Write the failing test for the delete guard**

Create `src/commands/editorActions.lock.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { deleteSelectedAction } from './editorActions';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';

describe('deleteSelectedAction respects the edit lock', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    useUIStore.getState().clearSelection();
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('does nothing while editing is locked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().select(ind.id);
    useUIStore.getState().toggleEditingLocked(); // lock

    deleteSelectedAction();

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeDefined();
  });

  test('deletes when unlocked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().select(ind.id);

    deleteSelectedAction();

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm the lock case fails**

Run: `npm test -- src/commands/editorActions.lock.test.ts`
Expected: FAIL — the locked individual is deleted (guard not yet present).

- [ ] **Step 3: Guard `deleteSelectedAction`**

In `src/commands/editorActions.ts`, at the very top of the `deleteSelectedAction` function body, add:

```ts
  if (useUIStore.getState().editingLocked) return;
```

(Ensure `useUIStore` is imported in this file; add `import { useUIStore } from '../stores/uiStore';` if absent.)

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/commands/editorActions.lock.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Write the failing test for the eraser guard**

Create `src/components/canvas/eraserTool.lock.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { eraseElementById } from './eraserTool';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';

describe('eraseElementById respects the edit lock', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('does nothing while editing is locked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().toggleEditingLocked(); // lock

    eraseElementById(ind.id);

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeDefined();
  });

  test('erases when unlocked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);

    eraseElementById(ind.id);

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run it to confirm the lock case fails**

Run: `npm test -- src/components/canvas/eraserTool.lock.test.ts`
Expected: FAIL — the locked individual is erased (guard not yet present).

- [ ] **Step 7: Guard `eraseElementById`**

In `src/components/canvas/eraserTool.ts`, at the very top of the `eraseElementById` function body, add:

```ts
  if (useUIStore.getState().editingLocked) return;
```

(Ensure `useUIStore` is imported in this file; add `import { useUIStore } from '../../stores/uiStore';` if absent.)

- [ ] **Step 8: Run it to confirm it passes**

Run: `npm test -- src/components/canvas/eraserTool.lock.test.ts`
Expected: PASS (both tests).

- [ ] **Step 9: Gate the remaining Konva/JSX mutation paths (manual verify)**

`src/components/canvas/symbols/PedigreeSymbol.tsx` — make nodes non-draggable while locked. Read the lock at the top of the component body:

```ts
    const editingLocked = useUIStore((s) => s.editingLocked);
```

Change the Konva node's `draggable={!panMode}` to:

```tsx
        draggable={!panMode && !editingLocked}
```

`src/components/canvas/CanvasContainer.tsx` — in `handleStageClick`, guard text placement. At the start of the `else if (currentTool === 'text')` branch body add:

```ts
          if (useUIStore.getState().editingLocked) return;
```

`src/components/ui/RadialMenu.tsx` — do not show the menu while locked. Change the early return:

```ts
  if (!visible || !target || useUIStore.getState().editingLocked) return null;
```

`src/components/ui/PropertiesPanel.tsx` — make the panel read-only while locked. Read `const editingLocked = useUIStore((s) => s.editingLocked);` and add `disabled={editingLocked}` to the panel's editable inputs/selects/checkboxes and buttons that mutate the document. (Inspection/visibility is unaffected.)

Run: `npm run dev`. Toggle Lock on. Verify: dragging a node does nothing; hovering a person does NOT open the radial menu; the eraser deletes nothing; Delete/Backspace does nothing on a selected node; the properties panel inputs are disabled. Toggle Lock off → all behaviours return.

- [ ] **Step 10: Typecheck, full test, commit**

Run: `npm run typecheck` and `npm test` (expect all pass), then:

```bash
git add src/commands/editorActions.ts src/commands/editorActions.lock.test.ts src/components/canvas/eraserTool.ts src/components/canvas/eraserTool.lock.test.ts src/components/canvas/symbols/PedigreeSymbol.tsx src/components/canvas/CanvasContainer.tsx src/components/ui/RadialMenu.tsx src/components/ui/PropertiesPanel.tsx
git commit -m "feat: enforce edit lock across mutation paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Remove the placement and partnership tools

**Files:**
- Modify: `src/stores/uiStore.ts` (narrow `ActiveTool`; drop `partnershipAnchorId`/`setPartnershipAnchor`)
- Modify: `src/components/ui/islands/toolDefs.tsx` (drop person/partnership tools; renumber)
- Modify: `src/components/ui/islands/ToolIsland.tsx` (final layout)
- Modify: `src/commands/useEditorActions.ts` (remove `maleTool`/`femaleTool`/`unknownTool`/`partnershipTool`/`addPerson`/`addPersonAt`)
- Modify: `src/commands/registry.ts` (remove `tools.addMale` and `edit.addPerson`)
- Modify: `src/commands/registry.test.ts` (update stub)
- Modify: `src/hooks/useKeyboardShortcuts.ts` (remove 2–7/m/f/u/r cases; renumber; drop partnership-anchor Escape branch)
- Modify: `src/components/canvas/symbols/PedigreeSymbol.tsx` (remove partnership/eraser-place click branches per below)
- Modify: `src/components/canvas/CanvasContainer.tsx` (remove person-placement branch)
- Modify: `src/components/canvas/toolPlacement.ts` (remove `placePersonAt`/`genderForTool`)
- Delete: `src/components/canvas/partnershipTool.ts`

**Interfaces:**
- Produces: `type ActiveTool = 'select' | 'hand' | 'text' | 'eraser'`. Removes `placePersonAt`, `genderForTool`, `createPartnershipBetween`, `handlePartnershipClick`, `addPerson`, `addPersonAt`, and the `maleTool`/`femaleTool`/`unknownTool`/`partnershipTool` actions.

> NOTE: This task changes the build in several files at once; keep going until the whole project typechecks and tests pass at Step 9 before committing. Do this task as one cohesive change.

- [ ] **Step 1: Remove the eraser-on-click usage from the symbol, keep eraser tool working via existing hover/stage paths**

In `src/components/canvas/symbols/PedigreeSymbol.tsx` `handleClick`, delete the `partnership` branch entirely:

```ts
        if (tool === 'partnership') {
          ui.hideRadialMenu();
          handlePartnershipClick(individual.id);
          return;
        }
```

Keep the `eraser` branch (it stays a valid tool). Remove the now-unused `import { handlePartnershipClick } from '../partnershipTool';` (or wherever it is imported).

- [ ] **Step 2: Remove the placement branch from the stage click**

In `src/components/canvas/CanvasContainer.tsx` `handleStageClick`, delete the `if (genderForTool(currentTool) !== null) { ... }` block (the person-placement branch). Keep the `text` and `select` branches. Remove `placePersonAt` and `genderForTool` from the import on line 16 (leave `placeTextAt`).

- [ ] **Step 3: Trim `toolPlacement.ts`**

In `src/components/canvas/toolPlacement.ts`, delete `genderForTool` and `placePersonAt` (and the now-unused `createDefaultIndividual`, `GenderIdentity`, `usePedigreeStore`, `useUIStore` imports if they become unused — keep whatever `placeTextAt` still needs). Keep `placeTextAt` exactly as-is.

- [ ] **Step 4: Delete the partnership tool module**

```bash
git rm src/components/canvas/partnershipTool.ts
```

If anything still imports `createPartnershipBetween`/`handlePartnershipClick`, remove those imports/usages (grep: `git grep -n partnershipTool`).

- [ ] **Step 5: Remove the actions and commands**

In `src/commands/useEditorActions.ts`: delete the `maleTool`, `femaleTool`, `unknownTool`, `partnershipTool`, `addPerson`, and `addPersonAt` declarations from the `EditorActions` interface, their function bodies, and their entries in the `useMemo` return. Remove now-unused imports (`createDefaultIndividual` if unused).

In `src/commands/registry.ts`: delete the `tools.addMale` command object and the `edit.addPerson` command object.

In `src/commands/registry.test.ts`: in `makeNoopActions`, delete the `addPerson`, `addPersonAt`, `maleTool`, `femaleTool`, `unknownTool`, and `partnershipTool` lines.

- [ ] **Step 6: Update keyboard shortcuts**

In `src/hooks/useKeyboardShortcuts.ts`:
- Delete the `case '2'`/`'m'` (male), `case '3'`/`'f'` (female), `case '4'`/`'u'` (unknown), and `case '5'`/`'r'` (partnership) blocks.
- Renumber the survivors so Text is `2`/`t` and Eraser is `3`/`e`:

```ts
      switch (e.key) {
        case '1':
        case 'v': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('select');
          return;
        }
        case 'h': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('hand');
          return;
        }
        case '2':
        case 't': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('text');
          return;
        }
        case '3':
        case 'e': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('eraser');
          return;
        }
        case 'l': {
          e.preventDefault();
          useUIStore.getState().toggleEditingLocked();
          return;
        }
        case '?': { /* unchanged */ }
        case 'Escape': { /* updated below */ }
        case 'Delete':
        case 'Backspace': { /* unchanged */ }
      }
```

- In the `Escape` case, delete the `else if (ui.partnershipAnchorId) { ui.setPartnershipAnchor(null); }` branch.
- Update the JSDoc shortcut list comment to: `1/V select, 2/T text, 3/E eraser, H hand, L toggle edit-lock`.

- [ ] **Step 7: Narrow `ActiveTool` and drop partnership-anchor state**

In `src/stores/uiStore.ts`:
- Replace the `ActiveTool` union with:

```ts
/**
 * The currently active canvas tool. `select`/`hand` are modal helpers
 * (pointer/marquee and pan); `text` places a text annotation at the click point;
 * `eraser` deletes nodes/connections under the pointer. People are added only
 * via the radial menu, so there are no person-placement tools.
 */
export type ActiveTool = 'select' | 'hand' | 'text' | 'eraser';
```

- Delete the `partnershipAnchorId` field + its JSDoc, the `setPartnershipAnchor` declaration, the `partnershipAnchorId: null,` initial value, and the `setPartnershipAnchor: (id) => set({ partnershipAnchorId: id }),` implementation.

- [ ] **Step 8: Final tool-island layout**

Rewrite `src/components/ui/islands/ToolIsland.tsx` to the final shape:

```tsx
import { Lock, Hand, MousePointer2, Type, Eraser } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { Island } from './Island';
import { ToolButton } from './ToolButton';
import { DefaultSexControl } from './DefaultSexControl';
import styles from './islands.module.css';

/**
 * Floating tool island: edit-lock and hand helpers, then Select with its
 * default-sex control, then Text and Eraser. Reads `activeTool`/`editingLocked`
 * reactively — safe here because this lives in the react-dom tree.
 */
export function ToolIsland(): React.JSX.Element {
  const activeTool = useUIStore((s) => s.activeTool);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const actions = useEditorActions();

  return (
    <Island aria-label="Tools">
      <ToolButton
        label="Lock editing"
        icon={<Lock size={18} />}
        active={editingLocked}
        onClick={actions.toggleEditingLock}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Hand"
        icon={<Hand size={19} />}
        active={activeTool === 'hand'}
        onClick={actions.handTool}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Select"
        shortcut="1"
        icon={<MousePointer2 size={19} />}
        active={activeTool === 'select'}
        onClick={actions.selectTool}
      />
      <DefaultSexControl />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Text"
        shortcut="2"
        icon={<Type size={19} />}
        active={activeTool === 'text'}
        onClick={editingLocked ? () => {} : actions.textTool}
      />
      <ToolButton
        label="Eraser"
        shortcut="3"
        icon={<Eraser size={19} />}
        active={activeTool === 'eraser'}
        onClick={editingLocked ? () => {} : actions.eraserTool}
      />
    </Island>
  );
}
```

Then reduce `src/components/ui/islands/toolDefs.tsx` to only the types still used elsewhere, or delete it if nothing imports it after this rewrite (grep: `git grep -n "toolDefs\|PLACEMENT_TOOLS\|PlacementToolId"`). If `PlacementToolId` is unused, delete the file and remove its imports.

- [ ] **Step 9: Typecheck, full test, manual verify**

Run: `npm run typecheck` (expect zero errors — this confirms every reference to the removed tools is gone) and `npm test` (expect all pass, including the updated `registry.test.ts`).

Run: `npm run dev`. Verify the toolbar is exactly `Lock · Hand · Select · [▢ ● ◇] · Text · Eraser`; keys `1` select, `2` text, `3` eraser, `H` hand, `L` lock work; no way to place a free person remains; ⌘K no longer lists "Add person" or "Add male tool".

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: remove person and partnership placement tools

People are now added only via the radial menu. Narrows ActiveTool to
select/hand/text/eraser, deletes placePersonAt/genderForTool, the partnership
tool, the Add person/Add male commands, and their shortcuts.

Refs #37

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Radial trigger — hover-zone preview + click-to-pin

**Files:**
- Modify: `src/stores/uiStore.ts` (`radialMenu.pinned`; `pinRadialMenu`/`unpinRadialMenu`)
- Create: `src/stores/uiStore.radialPin.test.ts`
- Modify: `src/components/canvas/symbols/PedigreeSymbol.tsx` (open on hover-zone enter without delay; click pins)
- Modify: `src/components/ui/RadialMenu.tsx` (dismiss logic: hide on zone-leave only when not pinned; Esc/outside unpins)
- Modify: `src/components/canvas/symbols/PedigreeSymbol.tsx` (remove `RADIAL_MENU_HOVER_DELAY` timer)

**Interfaces:**
- Consumes: existing `radialMenu` state, `showRadialMenu`, `hideRadialMenu`.
- Produces: `radialMenu.pinned: boolean`; `pinRadialMenu(): void`; `unpinRadialMenu(): void`. `hideRadialMenu` also clears `pinned`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/uiStore.radialPin.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('radial menu pin state', () => {
  beforeEach(() => useUIStore.getState().hideRadialMenu());

  test('starts unpinned', () => {
    useUIStore.getState().showRadialMenu('a', { x: 0, y: 0 });
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
  });

  test('pin/unpin toggle the flag; hide clears it', () => {
    useUIStore.getState().showRadialMenu('a', { x: 0, y: 0 });
    useUIStore.getState().pinRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(true);
    useUIStore.getState().unpinRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
    useUIStore.getState().pinRadialMenu();
    useUIStore.getState().hideRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
    expect(useUIStore.getState().radialMenu.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/stores/uiStore.radialPin.test.ts`
Expected: FAIL — `pinned`/`pinRadialMenu` missing.

- [ ] **Step 3: Add pin state to the store**

In `src/stores/uiStore.ts`, extend the `radialMenu` shape in both the interface and the initial state with `pinned: boolean`:

Interface:

```ts
  radialMenu: {
    visible: boolean;
    targetId: string | null;
    screenPosition: { x: number; y: number };
    pinned: boolean;
  };
```

Initial state:

```ts
  radialMenu: {
    visible: false,
    targetId: null,
    screenPosition: { x: 0, y: 0 },
    pinned: false,
  },
```

Update `showRadialMenu` to set `pinned: false`:

```ts
  showRadialMenu: (targetId, screenPosition) =>
    set({ radialMenu: { visible: true, targetId, screenPosition, pinned: false } }),
```

Update `hideRadialMenu` to include `pinned: false` in its reset object. Add declarations + implementations:

```ts
  /** Pin the radial menu open so it survives the pointer leaving the hot-zone. */
  pinRadialMenu: () => void;
  /** Release a pinned radial menu (it then follows hover rules again). */
  unpinRadialMenu: () => void;
```

```ts
  pinRadialMenu: () =>
    set((state) => ({ radialMenu: { ...state.radialMenu, pinned: true } })),

  unpinRadialMenu: () =>
    set((state) => ({ radialMenu: { ...state.radialMenu, pinned: false } })),
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/stores/uiStore.radialPin.test.ts`
Expected: PASS.

- [ ] **Step 5: Rework the symbol trigger (manual verify)**

In `src/components/canvas/symbols/PedigreeSymbol.tsx`:
- Remove the `RADIAL_MENU_HOVER_DELAY` timer: in `handleMouseEnter`, delete the `hoverTimerRef` setTimeout wrapper and instead open the menu immediately (still skipping when `panMode`, when `editingLocked`, or when the eraser tool is active):

```ts
    const handleMouseEnter = useCallback(() => {
      if (panMode) return;
      if (eraseOnHover && useUIStore.getState().activeTool === 'eraser') {
        eraseElementById(individual.id);
        return;
      }
      const uiState = useUIStore.getState();
      if (uiState.editingLocked) return;
      uiState.setHovered(individual.id);
      if (uiState.dragLink.active) uiState.setDragLinkTarget(individual.id);
      const stageEl = document.querySelector('canvas');
      if (stageEl) stageEl.style.cursor = 'pointer';
      const { canvasToScreen } = useViewportStore.getState();
      uiState.showRadialMenu(individual.id, canvasToScreen(individual.position));
    }, [individual.id, individual.position, panMode, eraseOnHover]);
```

- Replace `handleMouseLeave` in full (drops the now-defunct hover timer and hides the menu only when it is NOT pinned):

```ts
    const handleMouseLeave = useCallback(() => {
      const uiState = useUIStore.getState();
      uiState.setHovered(null);
      if (uiState.dragLink.active) {
        uiState.setDragLinkTarget(null);
      }
      if (!uiState.radialMenu.pinned) uiState.hideRadialMenu();
      const stage = document.querySelector('canvas');
      if (stage) stage.style.cursor = 'default';
    }, []);
```

(With both `handleMouseEnter` and `handleMouseLeave` rewritten, the `hoverTimerRef` declaration and the `RADIAL_MENU_HOVER_DELAY` import become unused — remove them.)

- In `handleClick`, when the active tool is `select` and editing is not locked, pin the menu for this individual (in addition to the existing selection behaviour). After the existing `select(individual.id)` path, add:

```ts
        if (!ui.editingLocked) {
          const { canvasToScreen } = useViewportStore.getState();
          ui.showRadialMenu(individual.id, canvasToScreen(individual.position));
          ui.pinRadialMenu();
        }
```

- [ ] **Step 6: Rework RadialMenu dismissal (manual verify)**

In `src/components/ui/RadialMenu.tsx`:
- Replace the `RADIAL_MENU_DISMISS_DISTANCE` mousemove auto-dismiss effect: only auto-dismiss when NOT pinned. Guard the handler body with `if (useUIStore.getState().radialMenu.pinned) return;` before the distance check. (A pinned menu ignores pointer drift.)
- In the Escape effect, call `unpinRadialMenu()` then `hideRadialMenu()`.
- Add an outside-click dismissal: when pinned, a click on empty canvas should unpin+hide. Wire this in `CanvasContainer.handleStageClick`'s `select` branch: before `clearSelection()`, add `useUIStore.getState().hideRadialMenu();` (which now also clears `pinned`).

- [ ] **Step 7: Manual verify**

Run: `npm run dev`. Hover toward a person → menu previews immediately (no delay), even before the cursor reaches the symbol's pixels (the Konva node's hit area is the trigger). Move away → it disappears. Click the person → menu stays pinned; move the mouse far away → it stays; press Esc or click empty canvas → it closes. With Lock on → hovering does not open it.

- [ ] **Step 8: Typecheck, full test, commit**

Run: `npm run typecheck` and `npm test` (expect all pass), then:

```bash
git add src/stores/uiStore.ts src/stores/uiStore.radialPin.test.ts src/components/canvas/symbols/PedigreeSymbol.tsx src/components/ui/RadialMenu.tsx src/components/canvas/CanvasContainer.tsx
git commit -m "feat: radial menu hover-preview with click-to-pin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Rework first-run onboarding

**Files:**
- Create: `src/components/canvas/onboarding.ts` (pure `shouldShowOnboarding` predicate)
- Create: `src/components/canvas/onboarding.test.ts`
- Modify: `src/components/canvas/OnboardingHints.tsx` (keep 3 corner arrows; replace centre; key off the predicate; one-time auto-preview + default-sex tip)
- Modify: `src/components/canvas/OnboardingHints.module.css` (only if copy/elements change require it)

**Interfaces:**
- Consumes: `usePedigreeStore` individual count; a localStorage first-run flag.
- Produces: `shouldShowOnboarding(individualCount: number, onboarded: boolean): boolean`; `ONBOARDED_STORAGE_KEY`.

- [ ] **Step 1: Write the failing test**

Create `src/components/canvas/onboarding.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { shouldShowOnboarding } from './onboarding';

describe('shouldShowOnboarding', () => {
  test('shows for a fresh, un-onboarded seed (0 or 1 individual)', () => {
    expect(shouldShowOnboarding(0, false)).toBe(true);
    expect(shouldShowOnboarding(1, false)).toBe(true);
  });
  test('hides once a relative is added', () => {
    expect(shouldShowOnboarding(2, false)).toBe(false);
  });
  test('hides permanently once onboarded', () => {
    expect(shouldShowOnboarding(1, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/components/canvas/onboarding.test.ts`
Expected: FAIL — cannot resolve `./onboarding`.

- [ ] **Step 3: Implement the predicate**

Create `src/components/canvas/onboarding.ts`:

```ts
/** localStorage key recording that first-run onboarding has been dismissed. */
export const ONBOARDED_STORAGE_KEY = 'pedigree-onboarded';

/**
 * Whether to show first-run onboarding. Shown only before the user has grown
 * the seed (<= 1 individual) and only until they've onboarded once.
 *
 * @param individualCount - Number of individuals in the document.
 * @param onboarded - Whether onboarding has already been dismissed.
 * @returns True when the onboarding layer should render.
 */
export function shouldShowOnboarding(individualCount: number, onboarded: boolean): boolean {
  return !onboarded && individualCount <= 1;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- src/components/canvas/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Rework `OnboardingHints.tsx` (manual verify)**

In `src/components/canvas/OnboardingHints.tsx`:
- Replace the gating: instead of `if (individualCount > 0) return null;`, compute:

```ts
  const individualCount = usePedigreeStore((s) => Object.keys(s.document.individuals).length);
  const [onboarded] = useState(() => localStorage.getItem(ONBOARDED_STORAGE_KEY) === '1');
  // Mark onboarded once the first relative is added, so it never returns.
  useEffect(() => {
    if (individualCount >= 2) localStorage.setItem(ONBOARDED_STORAGE_KEY, '1');
  }, [individualCount]);
  if (!shouldShowOnboarding(individualCount, onboarded)) return null;
```

(Add the imports: `useEffect`, `useState` from `react`; `shouldShowOnboarding`, `ONBOARDED_STORAGE_KEY` from `./onboarding`.)

- KEEP the three corner arrow blocks: top-left (`Menu, export, settings`), bottom-left (`Zoom & history`), bottom-right (`Shortcuts & help`).
- DELETE the top-center arrow block (the one whose label is `Pick a tool &amp; add your first person`).
- Replace the centre `cue` paragraph copy. Change:

```tsx
        <p className={styles.cue}>
          Pick a person tool (top center) to add your first person.
        </p>
```

to:

```tsx
        <p className={styles.cue}>
          This is your first person. Hover it to add relatives — parent, partner,
          child, or sibling.
        </p>
        <p className={styles.cue}>
          Set the sex of new people with the ▢ ● ◇ control next to Select.
        </p>
```

(Keep the wordmark, the "saved only in this browser" reassurance, the quick-links, and the ⌘K hint.)

- [ ] **Step 6: One-time radial auto-preview (manual verify)**

Still in `OnboardingHints.tsx`, when onboarding is showing and there is exactly one individual, open the radial menu once (preview, not pinned) on the seed so the mechanism is discovered. Add:

```ts
  const previewedRef = useRef(false);
  useEffect(() => {
    if (previewedRef.current) return;
    const ids = Object.keys(usePedigreeStore.getState().document.individuals);
    if (ids.length !== 1) return;
    previewedRef.current = true;
    const seedId = ids[0];
    const seed = usePedigreeStore.getState().document.individuals[seedId];
    const screen = useViewportStore.getState().canvasToScreen(seed.position);
    const t = setTimeout(() => useUIStore.getState().showRadialMenu(seedId, screen), 600);
    return () => clearTimeout(t);
  }, []);
```

(Add imports: `useRef`; `useViewportStore`; `useUIStore` if not present. The menu opens unpinned so it follows the new hover rules and closes on the first interaction.)

- [ ] **Step 7: Manual verify**

Run: `npm run dev` with a fresh profile. Expected: one seed person centred; the radial menu auto-previews once after ~0.6s; copy reads "This is your first person. Hover it to add relatives…" plus the default-sex tip; the three corner arrows (menu/export/settings, zoom/history, help) remain; no top-center arrow. Add a relative → onboarding disappears and does not return on reload.

- [ ] **Step 8: Typecheck, full test, commit**

Run: `npm run typecheck` and `npm test` (expect all pass), then:

```bash
git add src/components/canvas/onboarding.ts src/components/canvas/onboarding.test.ts src/components/canvas/OnboardingHints.tsx src/components/canvas/OnboardingHints.module.css
git commit -m "feat: rework first-run onboarding for the seeded model

Keeps the corner feature-arrows, replaces the top-center placement cue with a
seed-person 'hover to add family' message + default-sex tip, adds a one-time
radial auto-preview, and keys visibility off a first-run flag.

Refs #37

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all green.
- [ ] Typecheck: `npm run typecheck` — no errors.
- [ ] Lint: `npm run lint` — no new errors.
- [ ] Manual smoke (`npm run dev`, fresh profile): seed person appears centred; onboarding shows with corner arrows + hover cue + one-time preview; default-sex control changes new relatives' sex; +Parents always a square+circle pair; radial previews on hover and pins on click (Esc/outside closes); Lock makes everything read-only; toolbar is `Lock · Hand · Select · [▢ ● ◇] · Text · Eraser`; ⌘K has no "Add person"/"Add male".
- [ ] Confirm the seed never double-fires: reload with an existing document and verify no extra person is added.
