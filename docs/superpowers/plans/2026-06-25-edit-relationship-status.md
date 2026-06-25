# Edit Relationship Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user change an existing partnership's relationship status (Partnership / Separated / Consanguineous) by clicking its connecting line, which opens a small popup.

**Architecture:** Mirror the existing `linkPopup` pattern end to end — a new `updatePartnership` store action (undoable via the existing `temporal` middleware), a dedicated `relationshipPopup` UI-store slice, a click handler on `PartnershipLine` that opens the popup at the line's screen position, and a `RelationshipPopup` component (near-copy of `LinkTypePopup`) mounted in `App.tsx`.

**Tech Stack:** React 19, react-konva 19, Zustand 5 + zundo (temporal), Vitest 3 + Testing Library, TypeScript, Vite, CSS Modules.

## Global Constraints

- **react-konva + Zustand:** Never subscribe to a Zustand store (`useXStore(selector)`) inside a react-konva component — subscriptions silently fail to repaint the canvas. Inside Konva event handlers use `useUIStore.getState()` / `usePedigreeStore.getState()` imperatively. (`PartnershipLine` receives all data as props.)
- **Never `import ... from 'konva'` directly** — it dupes React and crashes with "Invalid hook call". Use `react-konva` exports and the `KonvaEventObject` type from `konva/lib/Node` only as a type import.
- **TypeScript:** type-annotate all function signatures; never use `any`.
- **Tests run with:** `npx vitest run <path>` (there is no `npm test` script).
- **Commits:** Conventional commits; one logical change per commit. End commit messages with the `Co-Authored-By` trailer used in this repo.
- **Three relationship types** live in `src/types/enums.ts`: `RelationshipType.Partnership`, `RelationshipType.Separation`, `RelationshipType.Consanguinity`. UI label for `Separation` is "Separated".

---

## File Structure

- `src/stores/pedigreeStore.ts` — add `updatePartnership` (interface entry + implementation).
- `src/stores/pedigreeStore.test.ts` — **new** — unit tests for `updatePartnership`.
- `src/stores/uiStore.ts` — add `relationshipPopup` slice + `showRelationshipPopup` / `hideRelationshipPopup`.
- `src/stores/uiStore.test.ts` — **new** — unit tests for the `relationshipPopup` slice.
- `src/components/ui/RelationshipPopup.tsx` — **new** — the status-picker popup.
- `src/components/ui/RelationshipPopup.module.css` — **new** — styles (copy of `LinkTypePopup.module.css` + an `.active` rule).
- `src/components/connections/PartnershipLine.tsx` — add click handler, `hitStrokeWidth`, cursor affordance.
- `src/App.tsx` — mount `<RelationshipPopup />`.

---

## Task 1: `updatePartnership` store action

**Files:**
- Modify: `src/stores/pedigreeStore.ts` (interface near line 64–74; implementation after `removeChildFromPartnership` ~line 325)
- Test: `src/stores/pedigreeStore.test.ts` (create)

**Interfaces:**
- Consumes: existing `usePedigreeStore`, `createDefaultIndividual`, `RelationshipType`, `PartnershipRelationship`.
- Produces: `updatePartnership(id: string, patch: Partial<PartnershipRelationship>): void` on the store.

- [ ] **Step 1: Write the failing test**

Create `src/stores/pedigreeStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from './pedigreeStore';
import { RelationshipType } from '../types/enums';
import type { PartnershipRelationship } from '../types/pedigree';

function seedPartnership(): string {
  const a = createDefaultIndividual();
  const b = createDefaultIndividual();
  const partnership: PartnershipRelationship = {
    id: 'pa-1',
    type: RelationshipType.Partnership,
    partner1Id: a.id,
    partner2Id: b.id,
    childrenIds: [],
  };
  const store = usePedigreeStore.getState();
  store.addIndividual(a);
  store.addIndividual(b);
  store.addPartnership(partnership);
  return partnership.id;
}

describe('updatePartnership', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
  });

  it('changes the partnership type', () => {
    const id = seedPartnership();
    usePedigreeStore
      .getState()
      .updatePartnership(id, { type: RelationshipType.Separation });
    expect(usePedigreeStore.getState().document.partnerships[id].type).toBe(
      RelationshipType.Separation,
    );
  });

  it('preserves other fields when patching type', () => {
    const id = seedPartnership();
    const before = usePedigreeStore.getState().document.partnerships[id];
    usePedigreeStore
      .getState()
      .updatePartnership(id, { type: RelationshipType.Consanguinity });
    const after = usePedigreeStore.getState().document.partnerships[id];
    expect(after.partner1Id).toBe(before.partner1Id);
    expect(after.partner2Id).toBe(before.partner2Id);
    expect(after.childrenIds).toEqual(before.childrenIds);
  });

  it('is a no-op for an unknown id', () => {
    const id = seedPartnership();
    const before = usePedigreeStore.getState().document.partnerships[id];
    usePedigreeStore
      .getState()
      .updatePartnership('does-not-exist', { type: RelationshipType.Separation });
    expect(usePedigreeStore.getState().document.partnerships[id]).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/pedigreeStore.test.ts`
Expected: FAIL — `updatePartnership is not a function`.

- [ ] **Step 3: Add the interface entry**

In `src/stores/pedigreeStore.ts`, in the `// Partnership actions` block of `interface PedigreeState`, after `removeChildFromPartnership(...)`:

```ts
  updatePartnership: (
    id: string,
    patch: Partial<PartnershipRelationship>
  ) => void;
```

- [ ] **Step 4: Add the implementation**

In the store body, immediately after the `removeChildFromPartnership` implementation (the block ending ~line 325), add:

```ts
      updatePartnership: (id, patch) =>
        set((state) => {
          const partnership = state.document.partnerships[id];
          if (!partnership) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              partnerships: {
                ...state.document.partnerships,
                [id]: { ...partnership, ...patch },
              },
            },
          };
        }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/stores/pedigreeStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/stores/pedigreeStore.ts src/stores/pedigreeStore.test.ts
git commit -m "feat(store): add updatePartnership action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `relationshipPopup` UI-store slice

**Files:**
- Modify: `src/stores/uiStore.ts` (interface ~line 23–31 region; actions ~line 55–61; initial state ~line 81–86; implementations ~line 161–170)
- Test: `src/stores/uiStore.test.ts` (create)

**Interfaces:**
- Consumes: existing `useUIStore`.
- Produces:
  - state `relationshipPopup: { visible: boolean; partnershipId: string | null; screenPosition: { x: number; y: number } }`
  - `showRelationshipPopup(partnershipId: string, screenPos: { x: number; y: number }): void`
  - `hideRelationshipPopup(): void`

- [ ] **Step 1: Write the failing test**

Create `src/stores/uiStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('relationshipPopup slice', () => {
  beforeEach(() => {
    useUIStore.getState().hideRelationshipPopup();
  });

  it('is hidden by default', () => {
    expect(useUIStore.getState().relationshipPopup.visible).toBe(false);
  });

  it('shows the popup for a partnership at a screen position', () => {
    useUIStore.getState().showRelationshipPopup('pa-1', { x: 10, y: 20 });
    const popup = useUIStore.getState().relationshipPopup;
    expect(popup.visible).toBe(true);
    expect(popup.partnershipId).toBe('pa-1');
    expect(popup.screenPosition).toEqual({ x: 10, y: 20 });
  });

  it('hides the popup and clears the partnership id', () => {
    useUIStore.getState().showRelationshipPopup('pa-1', { x: 10, y: 20 });
    useUIStore.getState().hideRelationshipPopup();
    const popup = useUIStore.getState().relationshipPopup;
    expect(popup.visible).toBe(false);
    expect(popup.partnershipId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: FAIL — `showRelationshipPopup is not a function`.

- [ ] **Step 3: Add the interface fields**

In `src/stores/uiStore.ts`, inside `interface UIState`, after the `linkPopup: {...};` block:

```ts
  relationshipPopup: {
    visible: boolean;
    partnershipId: string | null;
    screenPosition: { x: number; y: number };
  };
```

And in the action-signatures section, after `hideLinkPopup: () => void;`:

```ts
  showRelationshipPopup: (
    partnershipId: string,
    screenPos: { x: number; y: number }
  ) => void;
  hideRelationshipPopup: () => void;
```

- [ ] **Step 4: Add the initial state**

In the `create<UIState>()((set) => ({ ... }))` object, after the `linkPopup: { ... },` initial block:

```ts
  relationshipPopup: {
    visible: false,
    partnershipId: null,
    screenPosition: { x: 0, y: 0 },
  },
```

- [ ] **Step 5: Add the action implementations**

After the `hideLinkPopup: () => set({ ... }),` implementation:

```ts
  showRelationshipPopup: (partnershipId, screenPosition) =>
    set({
      relationshipPopup: { visible: true, partnershipId, screenPosition },
    }),

  hideRelationshipPopup: () =>
    set({
      relationshipPopup: {
        visible: false,
        partnershipId: null,
        screenPosition: { x: 0, y: 0 },
      },
    }),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.test.ts
git commit -m "feat(store): add relationshipPopup ui slice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `RelationshipPopup` component

**Files:**
- Create: `src/components/ui/RelationshipPopup.tsx`
- Create: `src/components/ui/RelationshipPopup.module.css`

**Interfaces:**
- Consumes: `useUIStore` (`relationshipPopup`, `hideRelationshipPopup`), `usePedigreeStore` (`updatePartnership`, `document.partnerships`), `RelationshipType`.
- Produces: `export function RelationshipPopup(): JSX.Element | null` — default export-free named export, mounted by Task 5.

- [ ] **Step 1: Create the stylesheet**

Create `src/components/ui/RelationshipPopup.module.css` (copy of the link popup styles plus an active-state rule):

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.popup {
  position: absolute;
  transform: translate(-50%, -100%) translateY(-10px);
  background: #ffffff;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  padding: 4px 0;
  font-family: Inter, system-ui, -apple-system, sans-serif;
}

.title {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  font-family: inherit;
}

.option:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.active {
  color: var(--color-primary);
  font-weight: 600;
}

.check {
  font-size: 12px;
}
```

- [ ] **Step 2: Create the component**

Create `src/components/ui/RelationshipPopup.tsx`:

```tsx
import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { RelationshipType } from '../../types/enums';
import styles from './RelationshipPopup.module.css';
import clsx from 'clsx';

type PartnershipType =
  | RelationshipType.Partnership
  | RelationshipType.Separation
  | RelationshipType.Consanguinity;

const OPTIONS: ReadonlyArray<{ type: PartnershipType; label: string }> = [
  { type: RelationshipType.Partnership, label: 'Partnership' },
  { type: RelationshipType.Separation, label: 'Separated' },
  { type: RelationshipType.Consanguinity, label: 'Consanguineous' },
];

export function RelationshipPopup() {
  const { visible, partnershipId, screenPosition } = useUIStore(
    (s) => s.relationshipPopup,
  );
  const hideRelationshipPopup = useUIStore((s) => s.hideRelationshipPopup);
  const partnerships = usePedigreeStore((s) => s.document.partnerships);
  const updatePartnership = usePedigreeStore((s) => s.updatePartnership);

  const partnership = partnershipId ? partnerships[partnershipId] : null;

  const setType = useCallback(
    (type: PartnershipType) => {
      if (!partnershipId) return;
      updatePartnership(partnershipId, { type });
      hideRelationshipPopup();
    },
    [partnershipId, updatePartnership, hideRelationshipPopup],
  );

  if (!visible || !partnership) return null;

  return (
    <div className={styles.backdrop} onClick={hideRelationshipPopup}>
      <div
        className={styles.popup}
        style={{ left: screenPosition.x, top: screenPosition.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>Relationship Status</div>
        {OPTIONS.map((option) => {
          const isActive = partnership.type === option.type;
          return (
            <button
              key={option.type}
              className={clsx(styles.option, isActive && styles.active)}
              onClick={() => setType(option.type)}
            >
              {option.label}
              {isActive && <span className={styles.check}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks and lints**

Run: `npx tsc -b --noEmit && npx eslint src/components/ui/RelationshipPopup.tsx`
Expected: no errors. (The component is not mounted or reachable yet; that is Tasks 4–5.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/RelationshipPopup.tsx src/components/ui/RelationshipPopup.module.css
git commit -m "feat(ui): add RelationshipPopup status picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Make `PartnershipLine` clickable

**Files:**
- Modify: `src/components/connections/PartnershipLine.tsx`

**Interfaces:**
- Consumes: `useUIStore.getState().showRelationshipPopup` (Task 2), `useViewportStore.getState().canvasToScreen`.
- Produces: clicking any partnership line opens the relationship popup at the line midpoint.

- [ ] **Step 1: Replace the component with a click-enabled version**

Replace the entire body of `src/components/connections/PartnershipLine.tsx`. The shared `onClick` / `onTap` / cursor handlers are applied to every `<Line>` via a spread `lineProps`, and a transparent wide `hitStrokeWidth` makes the thin line easy to hit. Screen position is computed the same way as `handleMouseUp` in `PedigreeSymbol.tsx` (canvas→screen plus the `.konvajs-content` bounding-rect offset, because the popup backdrop is `position: fixed`).

```tsx
import { useCallback } from 'react';
import { Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Individual, PartnershipRelationship } from '../../types/pedigree';
import { RelationshipType } from '../../types/enums';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { LINE_COLOR, LINE_WIDTH, CONSANGUINITY_GAP } from '../../utils/constants';

interface PartnershipLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
}

export function PartnershipLine({ partnership, individuals }: PartnershipLineProps) {
  const p1 = individuals[partnership.partner1Id];
  const p2 = individuals[partnership.partner2Id];

  const openPopup = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      if (!p1 || !p2) return;
      const midpoint = {
        x: (p1.position.x + p2.position.x) / 2,
        y: (p1.position.y + p2.position.y) / 2,
      };
      const { canvasToScreen } = useViewportStore.getState();
      const screenPos = canvasToScreen(midpoint);
      const canvasEl = document.querySelector('.konvajs-content');
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        screenPos.x += rect.left;
        screenPos.y += rect.top;
      }
      useUIStore.getState().showRelationshipPopup(partnership.id, screenPos);
    },
    [p1, p2, partnership.id],
  );

  const setCursor = useCallback((cursor: string) => {
    const stage = document.querySelector('canvas');
    if (stage) stage.style.cursor = cursor;
  }, []);

  if (!p1 || !p2) return null;

  const y = (p1.position.y + p2.position.y) / 2;

  const lineProps = {
    stroke: LINE_COLOR,
    strokeWidth: LINE_WIDTH,
    hitStrokeWidth: 12,
    onClick: openPopup,
    onTap: openPopup,
    onMouseEnter: () => setCursor('pointer'),
    onMouseLeave: () => setCursor('default'),
  };

  if (partnership.type === RelationshipType.Consanguinity) {
    return (
      <>
        <Line
          points={[p1.position.x, y - CONSANGUINITY_GAP / 2, p2.position.x, y - CONSANGUINITY_GAP / 2]}
          {...lineProps}
        />
        <Line
          points={[p1.position.x, y + CONSANGUINITY_GAP / 2, p2.position.x, y + CONSANGUINITY_GAP / 2]}
          {...lineProps}
        />
      </>
    );
  }

  if (partnership.type === RelationshipType.Separation) {
    const midX = (p1.position.x + p2.position.x) / 2;
    const hashSize = 6;
    return (
      <>
        <Line points={[p1.position.x, y, p2.position.x, y]} {...lineProps} />
        <Line
          points={[midX - 4, y - hashSize, midX + 4, y + hashSize]}
          {...lineProps}
        />
        <Line
          points={[midX + 2, y - hashSize, midX + 10, y + hashSize]}
          {...lineProps}
        />
      </>
    );
  }

  // Standard partnership - solid line
  return <Line points={[p1.position.x, y, p2.position.x, y]} {...lineProps} />;
}
```

- [ ] **Step 2: Verify it type-checks and lints**

Run: `npx tsc -b --noEmit && npx eslint src/components/connections/PartnershipLine.tsx`
Expected: no errors. (Popup is still not mounted, so a click currently sets store state with nothing rendering it — wired up in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/components/connections/PartnershipLine.tsx
git commit -m "feat(canvas): open relationship popup on partnership-line click

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Mount the popup and verify end-to-end

**Files:**
- Modify: `src/App.tsx` (import ~line 12; render ~line 44)

**Interfaces:**
- Consumes: `RelationshipPopup` (Task 3), and the full chain from Tasks 1–4.
- Produces: a working, user-reachable feature.

- [ ] **Step 1: Import and mount the popup**

In `src/App.tsx`, add the import next to the `LinkTypePopup` import:

```tsx
import { RelationshipPopup } from './components/ui/RelationshipPopup';
```

And render it immediately after `<LinkTypePopup />`:

```tsx
      <LinkTypePopup />
      <RelationshipPopup />
```

- [ ] **Step 2: Type-check, lint, and run the full test suite**

Run: `npx tsc -b --noEmit && npx eslint . && npx vitest run`
Expected: no type/lint errors; all tests pass (including Tasks 1–2 suites and the existing `svgExport.test.ts`).

- [ ] **Step 3: Manual verification in the dev server**

Start the dev server (`npm run dev`) and, using the preview tools, perform this sequence. Capture a screenshot as proof for each glyph state.

1. Create two individuals and an individual-to-individual partnership (drag-link → "Partnership"). A solid line appears.
2. Hover the line — cursor becomes a pointer.
3. Click the line — the "Relationship Status" popup appears anchored above the line midpoint, with "Partnership" marked active (✓).
4. Click "Separated" — popup closes; the line now shows the two-slash glyph.
5. Click the line → "Consanguineous" — the line becomes a double line.
6. Click the line → "Partnership" — back to a solid line.
7. Press Cmd/Ctrl+Z — the last change reverts (undo works); Cmd/Ctrl+Shift+Z re-applies it.
8. Select an individual, then click a line — confirm the individual selection is not cleared/changed by the line click (`e.cancelBubble`).

Expected: all eight behaviors hold; glyphs match the type chosen.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): mount RelationshipPopup to enable editing relationship status (#16)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** updatePartnership (Task 1) ✓; relationshipPopup slice (Task 2) ✓; clickable line + hitStrokeWidth + cursor + screen-pos via canvasToScreen+rect (Task 4) ✓; RelationshipPopup near-copy of LinkTypePopup with all three types + active highlight (Task 3) ✓; mount in App.tsx (Task 5) ✓; creation popup left unchanged (non-goal — no task, correct) ✓; undo/redo verified (Task 5 step 3.7) ✓; edge cases — missing partner returns null, unknown id no-op, cancelBubble (Tasks 1, 4, 5) ✓.
- **Type consistency:** `updatePartnership(id, patch)`, `showRelationshipPopup(partnershipId, screenPos)`, `hideRelationshipPopup()`, and the `relationshipPopup` shape are used identically across tasks. `PartnershipType` union in the component matches `PartnershipRelationship.type`.
- **CSS decision:** dedicated `RelationshipPopup.module.css` (resolves the spec's reuse-vs-dedicated either/or) because an `.active` rule and a flex layout for the check mark are needed beyond `LinkTypePopup.module.css`.
