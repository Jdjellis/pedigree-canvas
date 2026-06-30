# Inline Gender Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the persistent toolbar "default sex" mode with a per-creation inline gender picker: every single free-gender person is created as an `Unknown` shape, then its gender is chosen from an icon picker anchored on the new node (click or `M`/`F`/`N`/`U`), with create+pick as one undo step.

**Architecture:** New react-dom overlay `InlineGenderPicker` (sibling of `RadialMenu`, never a Konva node) driven by a new `uiStore.genderPicker.targetId`. Creation paths (radial Partner/Child/Sibling + both seed paths) create `Unknown` and open the picker. The pick is committed through `commitGenderPick`, which pauses zundo's `temporal` so it amends the creation's undo entry — mirroring the existing `symbolDrag.ts`. The whole `defaultSex` translation layer is then deleted.

**Tech Stack:** React + TypeScript, Zustand (+ zundo `temporal` for undo), react-konva (canvas — untouched here), Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-29-inline-gender-picker-design.md`

## Global Constraints

- **TypeScript:** never use `any`; type-annotate every function signature; JSDoc on public/exported functions and components. (from `~/.claude/CLAUDE.md`)
- **react-konva + Zustand rule:** never subscribe to a Zustand store inside a Konva component. `InlineGenderPicker` is an HTML overlay, so subscriptions there are safe; canvas code reads via `getState()`.
- **Symbol shape = gender identity** (NSGC/Bennett 2022). The picker chooses `GenderIdentity`, identical in meaning to the Properties-panel control.
- **Neutral default = `GenderIdentity.Unknown`.** No sticky/last-used.
- **Hotkeys `M`/`F`/`N`/`U`** are collision-free against `useKeyboardShortcuts`; the picker's listener uses capture phase + `stopPropagation`.
- **Undo model:** one zundo history entry per `set()`. `temporal` is reached via `usePedigreeStore.temporal.getState()` (`.pause()`, `.resume()`, `.undo()`, `.redo()`, `.pastStates`).
- **Git:** Conventional Commits; one logical change per commit; run `npm test` before committing.
- **Commands:** test = `npm test` (single file: `npx vitest run <path>`); typecheck = `npm run typecheck`; build = `npm run build`; lint = `npm run lint`.

---

## File Structure

**New files**
- `src/components/ui/commitGenderPick.ts` — pause/resume amendment + close picker (store-operating, unit-tested).
- `src/components/ui/commitGenderPick.test.ts`
- `src/components/ui/InlineGenderPicker.tsx` — the overlay picker.
- `src/components/ui/InlineGenderPicker.module.css`
- `src/components/ui/InlineGenderPicker.test.tsx`
- `src/components/ui/RadialMenu.genderPicker.test.tsx` — render-level wiring test.
- `src/stores/uiStore.genderPicker.test.ts`

**Modified**
- `src/stores/uiStore.ts` — add `genderPicker` + actions (Task 1); remove `defaultSex`/`setDefaultSex` (Task 7).
- `src/components/ui/RadialMenu.tsx` — create Unknown + open picker; twin drops helper; visibility gate (Task 4).
- `src/App.tsx` — mount `<InlineGenderPicker />` (Task 5).
- `src/stores/pedigreeStore.ts` — `createSeededDocument` drops `sex` (Task 6).
- `src/commands/useEditorActions.ts` — `newDocument` re-seed (Task 6).
- `src/hooks/useAutoSave.ts` — first-run seed (Task 6).
- `src/components/ui/islands/ToolIsland.tsx` — remove `DefaultSexControl` (Task 7).

**Deleted (Task 7)**
- `src/utils/sex.ts`, `src/components/ui/radialActions.ts`, `src/components/ui/RadialMenu.defaultSex.test.tsx`, `src/components/ui/islands/DefaultSexControl.tsx`, `src/components/ui/islands/DefaultSexControl.test.tsx`, `src/components/ui/islands/toolIcons.tsx`.

---

## Task 1: uiStore — `genderPicker` state + actions

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.genderPicker.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `genderPicker: { targetId: string | null }`; `showGenderPicker(id: string): void`; `hideGenderPicker(): void`.

> Add only — do **not** remove `defaultSex` yet (its consumers are rewired in Tasks 4–6 and removed in Task 7), so the tree stays green.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/uiStore.genderPicker.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore genderPicker', () => {
  beforeEach(() => {
    useUIStore.getState().hideGenderPicker();
  });

  it('starts with no picker target', () => {
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('showGenderPicker sets the target id', () => {
    useUIStore.getState().showGenderPicker('ind-1');
    expect(useUIStore.getState().genderPicker.targetId).toBe('ind-1');
  });

  it('hideGenderPicker clears the target id', () => {
    useUIStore.getState().showGenderPicker('ind-1');
    useUIStore.getState().hideGenderPicker();
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/uiStore.genderPicker.test.ts`
Expected: FAIL — `hideGenderPicker is not a function` / `genderPicker` undefined.

- [ ] **Step 3: Add the state field**

In `src/stores/uiStore.ts`, in the `UIState` interface immediately after the `radialMenu: { … }` block, add:

```ts
  /** The individual whose gender is being chosen via the inline picker, or `null`. */
  genderPicker: { targetId: string | null };
```

- [ ] **Step 4: Add the action signatures**

In the `UIState` interface, alongside `hideRadialMenu`, add:

```ts
  /** Open the inline gender picker on the given individual. */
  showGenderPicker: (id: string) => void;
  /** Close the inline gender picker (keeps the individual's current shape). */
  hideGenderPicker: () => void;
```

- [ ] **Step 5: Add the initial value**

In the store creator's returned object, next to the initial `radialMenu: { … }` value, add:

```ts
  genderPicker: { targetId: null },
```

- [ ] **Step 6: Add the action implementations**

Next to the `hideRadialMenu:` implementation, add:

```ts
  showGenderPicker: (id) => set({ genderPicker: { targetId: id } }),

  hideGenderPicker: () => set({ genderPicker: { targetId: null } }),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/stores/uiStore.genderPicker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.genderPicker.test.ts
git commit -m "feat: add genderPicker state to uiStore"
```

---

## Task 2: `commitGenderPick` — single-step undo amendment

**Files:**
- Create: `src/components/ui/commitGenderPick.ts`
- Test: `src/components/ui/commitGenderPick.test.ts`

**Interfaces:**
- Consumes: `usePedigreeStore` (`updateIndividual`, `temporal`), `useUIStore.hideGenderPicker` (Task 1), `GenderIdentity`.
- Produces: `commitGenderPick(targetId: string, gender: GenderIdentity | null): void`.

> Reference implementation: `src/components/canvas/symbols/symbolDrag.ts` (`commitSymbolDrag`) and its test.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ui/commitGenderPick.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity } from '../../types/enums';
import { commitGenderPick } from './commitGenderPick';

const CHILD = 'child-1';

function seedUnknownChild(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  usePedigreeStore.temporal.getState().clear();
  // The creation is its own tracked undo entry, exactly as the radial/seed paths do.
  store.addIndividual(
    createDefaultIndividual({ id: CHILD, genderIdentity: GenderIdentity.Unknown }),
  );
}

function genderOf(id: string): GenderIdentity {
  return usePedigreeStore.getState().document.individuals[id].genderIdentity;
}

describe('commitGenderPick', () => {
  beforeEach(() => {
    seedUnknownChild();
    useUIStore.getState().showGenderPicker(CHILD);
  });

  it('sets the chosen gender and closes the picker', () => {
    commitGenderPick(CHILD, GenderIdentity.Woman);
    expect(genderOf(CHILD)).toBe(GenderIdentity.Woman);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('keeps create + pick as a single undo step', () => {
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);
    commitGenderPick(CHILD, GenderIdentity.Man);
    // The pick amended the creation entry rather than adding its own.
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);

    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals[CHILD]).toBeUndefined();
  });

  it('restores node and gender together on redo', () => {
    commitGenderPick(CHILD, GenderIdentity.Man);
    usePedigreeStore.temporal.getState().undo();
    usePedigreeStore.temporal.getState().redo();
    expect(genderOf(CHILD)).toBe(GenderIdentity.Man);
  });

  it('dismiss (null) keeps Unknown, adds no undo entry, still removes node on undo', () => {
    commitGenderPick(CHILD, null);
    expect(genderOf(CHILD)).toBe(GenderIdentity.Unknown);
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);
    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals[CHILD]).toBeUndefined();
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/commitGenderPick.test.ts`
Expected: FAIL — `commitGenderPick` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/ui/commitGenderPick.ts
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import type { GenderIdentity } from '../../types/enums';

/**
 * Commit (or dismiss) the inline gender picker for a just-created individual.
 *
 * The individual was created as its own tracked undo entry. To keep "create a
 * person + choose their gender" a SINGLE undo step, the gender change is applied
 * while zundo's temporal history is paused, so it amends the creation entry
 * instead of pushing a second one. Mirrors `commitSymbolDrag` in `symbolDrag.ts`.
 *
 * @param targetId - The individual whose gender is being set.
 * @param gender - The chosen gender identity, or `null` to dismiss (keep current shape).
 */
export function commitGenderPick(
  targetId: string,
  gender: GenderIdentity | null,
): void {
  if (gender !== null) {
    usePedigreeStore.temporal.getState().pause();
    usePedigreeStore.getState().updateIndividual(targetId, { genderIdentity: gender });
    usePedigreeStore.temporal.getState().resume();
  }
  useUIStore.getState().hideGenderPicker();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/commitGenderPick.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/commitGenderPick.ts src/components/ui/commitGenderPick.test.ts
git commit -m "feat: add commitGenderPick with single-step-undo amendment"
```

---

## Task 3: `InlineGenderPicker` component

**Files:**
- Create: `src/components/ui/InlineGenderPicker.tsx`
- Create: `src/components/ui/InlineGenderPicker.module.css`
- Test: `src/components/ui/InlineGenderPicker.test.tsx`

**Interfaces:**
- Consumes: `useUIStore` (`genderPicker`, `editingLocked`), `useViewportStore` (`scale`, `position`), `usePedigreeStore` (`document`), `GenderIconButtons`, `commitGenderPick` (Task 2), `GenderIdentity`.
- Produces: `InlineGenderPicker` (default-free named export, no props).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/InlineGenderPicker.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineGenderPicker } from './InlineGenderPicker';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity } from '../../types/enums';

const TARGET = 'target-1';

function seedTarget(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(
    createDefaultIndividual({ id: TARGET, genderIdentity: GenderIdentity.Unknown }),
  );
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
}

function genderOf(id: string): GenderIdentity {
  return usePedigreeStore.getState().document.individuals[id].genderIdentity;
}

describe('InlineGenderPicker', () => {
  beforeEach(() => {
    seedTarget();
  });

  it('renders nothing when no target is set', () => {
    const { container } = render(<InlineGenderPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the gender buttons when a target is set', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    expect(screen.getByRole('button', { name: 'Woman' })).toBeInTheDocument();
  });

  it('clicking a gender commits it and closes the picker', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Man' }));
    expect(genderOf(TARGET)).toBe(GenderIdentity.Man);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('pressing F commits Woman and closes', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.keyDown(window, { key: 'f' });
    expect(genderOf(TARGET)).toBe(GenderIdentity.Woman);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('Escape dismisses without changing the shape', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(genderOf(TARGET)).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('renders nothing when editing is locked', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    useUIStore.getState().toggleEditingLocked();
    const { container } = render(<InlineGenderPicker />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/InlineGenderPicker.test.tsx`
Expected: FAIL — cannot resolve `./InlineGenderPicker`.

- [ ] **Step 3: Write the component**

```tsx
// src/components/ui/InlineGenderPicker.tsx
import { useEffect, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { GenderIdentity } from '../../types/enums';
import { GenderIconButtons } from './GenderIconButtons';
import { commitGenderPick } from './commitGenderPick';
import styles from './InlineGenderPicker.module.css';

/** Screen-px gap between the node anchor and the picker sitting above it. */
const PICKER_GAP = 48;

/** Single-key shortcuts for quick gender selection. */
const KEY_TO_GENDER: Record<string, GenderIdentity> = {
  m: GenderIdentity.Man,
  f: GenderIdentity.Woman,
  n: GenderIdentity.NonBinary,
  u: GenderIdentity.Unknown,
};

/**
 * Inline gender picker: a small HTML overlay anchored above a just-created
 * individual, letting the user choose its gender identity by click or keystroke
 * (M/F/N/U) without visiting the Properties panel. Rendered in the react-dom
 * tree (sibling of the Konva stage), so subscribing to Zustand here is safe.
 *
 * Dismissal (Esc/Enter/click-away) keeps the current shape. The pick is routed
 * through `commitGenderPick` so create + pick collapse into one undo step.
 */
export function InlineGenderPicker(): React.JSX.Element | null {
  const targetId = useUIStore((s) => s.genderPicker.targetId);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const scale = useViewportStore((s) => s.scale);
  const viewportX = useViewportStore((s) => s.position.x);
  const viewportY = useViewportStore((s) => s.position.y);
  const target = usePedigreeStore((s) =>
    targetId ? s.document.individuals[targetId] : undefined,
  );

  const dismiss = useCallback(() => {
    if (targetId) commitGenderPick(targetId, null);
  }, [targetId]);

  // Capture-phase listener so M/F/N/U/Esc/Enter resolve the picker before any
  // global shortcut sees them.
  useEffect(() => {
    if (!targetId || editingLocked) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const gender = KEY_TO_GENDER[e.key.toLowerCase()];
      if (gender !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        commitGenderPick(targetId, gender);
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitGenderPick(targetId, null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [targetId, editingLocked]);

  if (!targetId || !target || editingLocked) return null;

  const left = target.position.x * scale + viewportX;
  const top = target.position.y * scale + viewportY - PICKER_GAP;

  return (
    <>
      <div className={styles.backdrop} onClick={dismiss} aria-hidden="true" />
      <div
        className={styles.picker}
        style={{ left, top }}
        role="dialog"
        aria-label="Choose gender identity"
      >
        <GenderIconButtons
          value={target.genderIdentity}
          onChange={(gender) => commitGenderPick(targetId, gender)}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Write the styles**

```css
/* src/components/ui/InlineGenderPicker.module.css */
/* Transparent catch-all: a click anywhere outside the picker dismisses it. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}

/* `left`/`top` are the node's screen centre; translate up-and-centred so the
   picker floats directly above the symbol. */
.picker {
  position: absolute;
  z-index: 100;
  transform: translate(-50%, -100%);
  padding: 6px;
  background: #ffffff;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ui/InlineGenderPicker.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/InlineGenderPicker.tsx src/components/ui/InlineGenderPicker.module.css src/components/ui/InlineGenderPicker.test.tsx
git commit -m "feat: add InlineGenderPicker overlay component"
```

---

## Task 4: Rewire `RadialMenu` + radial-precedence gate

**Files:**
- Modify: `src/components/ui/RadialMenu.tsx`
- Test: `src/components/ui/RadialMenu.genderPicker.test.tsx`

**Interfaces:**
- Consumes: `useUIStore` (`genderPicker`, `showGenderPicker` — Task 1), `createDefaultIndividual`, `GenderIdentity`.
- Produces: Partner/Child/Sibling create `Unknown` then `showGenderPicker(newId)`; radial hidden while a picker is open.

> `defaultSex` is still defined on the store at this point; this task simply stops `RadialMenu` from reading it. Removal happens in Task 7.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/RadialMenu.genderPicker.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity } from '../../types/enums';

const ROOT = 'root-1';

function seedRoot(): void {
  const pedigree = usePedigreeStore.getState();
  pedigree.resetDocument();
  pedigree.addIndividual(
    createDefaultIndividual({
      id: ROOT,
      genderIdentity: GenderIdentity.Woman,
      generation: 0,
      position: { x: 0, y: 0 },
    }),
  );
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(ROOT, { x: 0, y: 0 });
}

describe('RadialMenu gender-picker wiring', () => {
  beforeEach(() => {
    seedRoot();
  });

  it('Add Child creates an Unknown child and opens the gender picker on it', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Child' }));

    const doc = usePedigreeStore.getState().document;
    const newPeople = Object.values(doc.individuals).filter((i) => i.id !== ROOT);
    expect(newPeople).toHaveLength(1);
    expect(newPeople[0].genderIdentity).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBe(newPeople[0].id);
  });

  it('is hidden while a gender picker is open', () => {
    useUIStore.getState().showGenderPicker(ROOT);
    const { container } = render(<RadialMenu />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/RadialMenu.genderPicker.test.tsx`
Expected: FAIL — radial still renders while picker open / `genderPicker.targetId` stays null after click.

- [ ] **Step 3: Swap imports and store reads**

In `src/components/ui/RadialMenu.tsx`:

Remove the import line:
```ts
import { createRelativeIndividual } from './radialActions';
```

Replace the `defaultSex` subscription:
```ts
  const defaultSex = useUIStore((s) => s.defaultSex);
```
with:
```ts
  const showGenderPicker = useUIStore((s) => s.showGenderPicker);
  const genderPicker = useUIStore((s) => s.genderPicker);
```

- [ ] **Step 4: Partner/Child/Sibling — create Unknown + open picker**

In `handleAddPartner`, `handleAddChild`, `handleAddSibling`: every `createRelativeIndividual(defaultSex, { … })` becomes `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown, … })` (keep the same overrides object), and immediately after each existing `select(newId)` add `showGenderPicker(newId)`. Concretely, the four sites and their existing `select(...)` partners:

- `handleAddPartner` soleUnion branch → after `select(partner.id);` add `showGenderPicker(partner.id);`
- `handleAddPartner` fresh-partner branch → change `createRelativeIndividual(defaultSex, {` to `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown,` and after `select(partner.id);` add `showGenderPicker(partner.id);`
- `handleAddChild` no-union branch → after `select(child.id);` add `showGenderPicker(child.id);`
- `handleAddChild` existing-union branch → change to `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown,` and after `select(child.id);` add `showGenderPicker(child.id);`
- `handleAddSibling` has-parents branch → after `select(sibling.id);` add `showGenderPicker(sibling.id);`
- `handleAddSibling` no-parents branch → change to `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown,` and after `select(sibling.id);` add `showGenderPicker(sibling.id);`

In each of those three `useCallback` dependency arrays, remove `defaultSex` and add `showGenderPicker`.

- [ ] **Step 5: Twin — drop the helper, no picker**

In `handleAddTwin`, change the parentless-branch `createRelativeIndividual(defaultSex, {` to `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown,`. Do **not** add `showGenderPicker` (twins are deferred — #71). Remove `defaultSex` from its dependency array.

- [ ] **Step 6: Add the precedence gate**

Change the early return:
```ts
  if (!visible || !target || editingLocked) return null;
```
to:
```ts
  if (!visible || !target || editingLocked || genderPicker.targetId) return null;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/RadialMenu.genderPicker.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 8: Typecheck (catches any leftover `defaultSex` use in this file)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/RadialMenu.tsx src/components/ui/RadialMenu.genderPicker.test.tsx
git commit -m "feat: radial Partner/Child/Sibling create Unknown and open gender picker"
```

---

## Task 5: Mount `InlineGenderPicker` in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `InlineGenderPicker` (Task 3).
- Produces: the picker is live in the running app (end-to-end with Task 4).

> No new unit test: `App` renders `CanvasContainer` (Konva), which cannot mount under jsdom. The picker and its wiring are already unit-tested in Tasks 3–4; this task is composition, verified by build + a manual smoke.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, with the other component imports, add:
```ts
import { InlineGenderPicker } from './components/ui/InlineGenderPicker';
```

- [ ] **Step 2: Render it after `<RadialMenu />`**

In the `.canvasArea` block, immediately after `<RadialMenu />`, add:
```tsx
        <InlineGenderPicker />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds (tsc + vite), no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the app. With a fresh canvas (or after clearing site data), click a person → radial → **Child**. Expect: a new diamond (Unknown) appears, the radial closes, and a gender picker floats above the new node. Press `F` → it becomes a circle and the picker closes. Undo once → the whole node disappears.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount InlineGenderPicker overlay in App"
```

---

## Task 6: Seed paths — `Unknown` seed + open picker

**Files:**
- Modify: `src/stores/pedigreeStore.ts` (`createSeededDocument`)
- Modify: `src/commands/useEditorActions.ts` (`newDocument`)
- Modify: `src/hooks/useAutoSave.ts` (first-run seed)
- Test: `src/stores/pedigreeStore.test.ts` (add a case)

**Interfaces:**
- Consumes: `createDefaultIndividual`, `useUIStore.showGenderPicker` (Task 1).
- Produces: `createSeededDocument(position?: { x: number; y: number }): PedigreeDocument` (no `sex` param); both seeders open the picker on the seed.

- [ ] **Step 1: Write the failing test**

Add to `src/stores/pedigreeStore.test.ts` (import `createSeededDocument` and `GenderIdentity` if not already imported):

```ts
  it('createSeededDocument seeds a single Unknown individual at the given position', () => {
    const doc = createSeededDocument({ x: 5, y: 7 });
    const people = Object.values(doc.individuals);
    expect(people).toHaveLength(1);
    expect(people[0].genderIdentity).toBe(GenderIdentity.Unknown);
    expect(people[0].position).toEqual({ x: 5, y: 7 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/pedigreeStore.test.ts -t "createSeededDocument seeds a single Unknown"`
Expected: FAIL — `createSeededDocument` still requires a `sex` argument (TS/build error or wrong arity).

- [ ] **Step 3: Update `createSeededDocument`**

In `src/stores/pedigreeStore.ts`, replace the function with:

```ts
export function createSeededDocument(
  position: { x: number; y: number } = { x: 0, y: 0 },
): PedigreeDocument {
  const doc = createDefaultDocument();
  const seed = createDefaultIndividual({
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  });
  doc.individuals[seed.id] = seed;
  return doc;
}
```

Then remove the now-unused import at the top of the file:
```ts
import { genderForSex, type DefaultSex } from '../utils/sex';
```
(Delete the whole line — neither symbol is used elsewhere in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/pedigreeStore.test.ts -t "createSeededDocument seeds a single Unknown"`
Expected: PASS.

- [ ] **Step 5: Update `newDocument` (re-seed)**

In `src/commands/useEditorActions.ts`, replace the body of `newDocument` from the `useViewportStore.getState().resetView();` line onward:

```ts
    useUIStore.getState().setOnboarded();
    useViewportStore.getState().resetView();
    const doc = createSeededDocument(getVisibleCanvasCenter());
    usePedigreeStore.getState().setDocument(doc);
    useUIStore.getState().clearSelection();
    const seedId = Object.keys(doc.individuals)[0];
    if (seedId) useUIStore.getState().showGenderPicker(seedId);
```

(Removes the `const sex = useUIStore.getState().defaultSex;` line and the `sex` argument.)

- [ ] **Step 6: Update the first-run seed**

In `src/hooks/useAutoSave.ts`, replace the `else` branch of the restore effect:

```ts
    } else {
      // Genuinely fresh start: seed an Unknown first person at canvas origin and
      // pop the gender picker on it (first-run only). CanvasContainer centres the
      // viewport on it once the stage is measured.
      const doc = createSeededDocument();
      usePedigreeStore.getState().setDocument(doc);
      const seedId = Object.keys(doc.individuals)[0];
      if (seedId) useUIStore.getState().showGenderPicker(seedId);
    }
```

(Removes `const sex = useUIStore.getState().defaultSex;`. `useUIStore` is already imported in this file.)

- [ ] **Step 7: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; the full suite passes (the deleted-arg change ripples are all in this task).

- [ ] **Step 8: Commit**

```bash
git add src/stores/pedigreeStore.ts src/stores/pedigreeStore.test.ts src/commands/useEditorActions.ts src/hooks/useAutoSave.ts
git commit -m "feat: seed paths create Unknown and open the gender picker"
```

---

## Task 7: Remove `defaultSex` and the dead translation layer

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/ui/islands/ToolIsland.tsx`
- Delete: `src/utils/sex.ts`, `src/components/ui/radialActions.ts`, `src/components/ui/RadialMenu.defaultSex.test.tsx`, `src/components/ui/islands/DefaultSexControl.tsx`, `src/components/ui/islands/DefaultSexControl.test.tsx`, `src/components/ui/islands/toolIcons.tsx`

**Interfaces:**
- Consumes: nothing (this is removal).
- Produces: no more `defaultSex`/`genderForSex`/`createRelativeIndividual`/`DefaultSexControl` anywhere in `src/`.

> By now nothing reads any of these, so removal keeps the tree green.

- [ ] **Step 1: Remove `defaultSex` from `uiStore`**

In `src/stores/uiStore.ts`, delete:
- the `import type { DefaultSex } from '../utils/sex';` line,
- the `defaultSex: DefaultSex;` field in `UIState`,
- the `setDefaultSex: (sex: DefaultSex) => void;` signature,
- the `defaultSex: 'unknown',` initial value,
- the `setDefaultSex: (defaultSex) => set({ defaultSex }),` implementation.

- [ ] **Step 2: Remove `DefaultSexControl` from the toolbar**

In `src/components/ui/islands/ToolIsland.tsx`, delete the `import { DefaultSexControl } from './DefaultSexControl';` line and the `<DefaultSexControl />` element. Update the JSDoc summary line "then Select with its default-sex control, then Text" to "then Select, then Text".

- [ ] **Step 3: Delete the dead files**

```bash
git rm src/utils/sex.ts \
       src/components/ui/radialActions.ts \
       src/components/ui/RadialMenu.defaultSex.test.tsx \
       src/components/ui/islands/DefaultSexControl.tsx \
       src/components/ui/islands/DefaultSexControl.test.tsx \
       src/components/ui/islands/toolIcons.tsx
```

- [ ] **Step 4: Verify nothing references the removed symbols**

Run: `rg -n "defaultSex|setDefaultSex|genderForSex|createRelativeIndividual|DefaultSexControl|DefaultSex|toolIcons" src`
Expected: **no matches**.

- [ ] **Step 5: Full typecheck, lint, test, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove default-sex mode and its translation layer"
```

---

## Self-Review

**Spec coverage**

| Spec item | Task |
|---|---|
| `genderPicker` state + show/hide | Task 1 |
| Single-step undo via `temporal` pause/resume | Task 2 |
| `InlineGenderPicker` overlay (position, keys M/F/N/U, Esc/Enter/click-away, `editingLocked`) | Task 3 |
| Radial Partner/Child/Sibling create Unknown + open picker; existing-parents branches included | Task 4 |
| Radial hidden while picker open (precedence) | Task 4 |
| `handleAddTwin` drops helper, no picker (#71) | Task 4 |
| Mount overlay (App.tsx, after RadialMenu) | Task 5 |
| `createSeededDocument` Unknown; `newDocument` + first-run seed open picker | Task 6 |
| Onboarding sequencing (radial gated behind picker) | Task 4 gate + Task 6 first-run picker (no `OnboardingHints` code change; verify visually in Task 5 smoke) |
| Delete `DefaultSexControl`/`defaultSex`/`genderForSex`/`createRelativeIndividual`/`DefaultSex`/sex glyphs | Task 7 |
| Reuse `GenderIconButtons`; `svgExport` untouched | Task 3 (reuse); no task touches rendering |

**Placeholder scan:** none — every step has concrete code or an exact command.

**Type consistency:** `commitGenderPick(targetId: string, gender: GenderIdentity | null)` is defined in Task 2 and called identically in Tasks 3–4. `showGenderPicker(id: string)`/`hideGenderPicker()`/`genderPicker.targetId` are defined in Task 1 and consumed unchanged in Tasks 2–6. `createSeededDocument(position?)` defined in Task 6 and matches both call sites updated in the same task.

**Note for the implementer:** Tasks must run in order — each leaves the tree green, but `defaultSex` is intentionally still present (unused by new code) until Task 7. Do not remove it earlier.
