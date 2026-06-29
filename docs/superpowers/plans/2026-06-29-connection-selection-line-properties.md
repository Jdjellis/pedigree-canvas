# Connection Selection + Line-Properties Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pedigree connections (parent-child descent edges, partnership lines, twin connectors) first-class, click-selectable, panel-editable entities, and use that to home three per-edge properties: descent line style (biological/adoptive), partnership status + consanguinity degree, and twin zygosity.

**Architecture:** Add a single typed `selectedConnection` slice to `uiStore`, mutually exclusive with the existing individual `selectedIds` selection. Make the Konva line components hit-testable; their click handlers call `useUIStore.getState().selectConnection(...)` imperatively (Zustand subscriptions silently fail inside react-konva's reconciler). `selectedConnection` is subscribed in `CanvasContainer` (react-dom) and threaded as a prop into `ConnectionsLayer` and the line components to drive a highlight. `PropertiesPanel` branches on `selectedConnection` to render a new `ConnectionProperties` editor. The transient `RelationshipPopup` is retired (its status + consanguinity-degree controls move into the panel).

**Tech Stack:** React + Vite + TypeScript, react-konva (HTML5 Canvas), Zustand (3 stores; `pedigreeStore` wraps zundo `temporal` for undo/redo), Vitest + jsdom + React Testing Library.

## Global Constraints

- **react-konva + Zustand:** never subscribe to a Zustand store *inside* a react-konva component — the canvas won't repaint. Lift subscriptions to `CanvasContainer` (react-dom) and pass data as props; use `useUIStore.getState()` only for imperative actions in event handlers. (Project memory.)
- **Konva is not jsdom-testable:** line/canvas components cannot render under Vitest. Test store logic and react-dom components (RTL); verify Konva interaction manually via the dev server. (Project memory.)
- **Never `import ... from 'konva'` directly** (dupes React → "Invalid hook call"). Import event *types* from `konva/lib/Node` only (`import type { KonvaEventObject } from 'konva/lib/Node'`).
- **TypeScript:** no `any`; type-annotate function signatures; JSDoc public interfaces.
- **Git:** conventional commits (`feat:`/`refactor:`/`test:`); one logical change per commit; run tests before committing. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Adoption model (from #67, do not change):** descent line style is the per-edge `ParentChildRelationship.isAdoptive` (`true` → dashed/adoptive, falsy → solid/biological); the symbol brackets are the orthogonal `Individual.adopted`. The store action `setLinkAdoptive(linkId, boolean)` already exists.
- **Selection accent color:** `#6965db` (currently a local const in `PedigreeSymbol.tsx`); promote to `src/utils/constants.ts` as `SELECTION_COLOR` and reuse.
- **Spec:** `docs/superpowers/specs/2026-06-29-connection-selection-line-properties-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/stores/uiStore.ts` | `selectedConnection` slice + `selectConnection`/`clearConnectionSelection`; reset on individual-selection actions; remove `relationshipPopup` slice | Modify |
| `src/stores/uiStore.connectionSelection.test.ts` | Unit tests for the selection model | Create |
| `src/components/ui/TwinZygosityFields.tsx` | Shared presentational zygosity `<select>` + "Ungroup twins" button | Create |
| `src/components/ui/ConnectionProperties.tsx` | Panel editor switching on `selectedConnection.kind` (partnership / parentChild / twin) | Create |
| `src/components/ui/ConnectionProperties.test.tsx` | RTL tests for the connection editors | Create |
| `src/components/ui/PropertiesPanel.tsx` | Branch to `ConnectionProperties`; refactor individual Twin section to `TwinZygosityFields` | Modify |
| `src/utils/constants.ts` | Add exported `SELECTION_COLOR` | Modify |
| `src/components/canvas/symbols/PedigreeSymbol.tsx` | Import `SELECTION_COLOR` from constants (drop local dup) | Modify |
| `src/components/connections/ConnectionsLayer.tsx` | Accept `selectedConnection`; thread to line components | Modify |
| `src/components/connections/ParentChildLine.tsx` | Per-child-drop hit-testing + selection + highlight + cursor | Modify |
| `src/components/connections/PartnershipLine.tsx` | Swap popup handler → `selectConnection`; add highlight | Modify |
| `src/components/connections/TwinConnector.tsx` | Hit-testing + selection + highlight + cursor | Modify |
| `src/components/canvas/CanvasContainer.tsx` | Subscribe `selectedConnection`; pass to `ConnectionsLayer` | Modify |
| `src/components/ui/RelationshipPopup.tsx` + `.module.css` | Retired | Delete |
| `src/App.tsx` | Remove `RelationshipPopup` import + mount | Modify |
| `src/stores/uiStore.test.ts` | Remove obsolete `relationshipPopup slice` block | Modify |

**Task order keeps the build green at every commit:** Task 1 adds the selection slice (additive). Task 2 builds the panel editor (inert until something sets `selectedConnection`). Task 3 wires the lines to set/highlight selection and swaps `PartnershipLine` off the popup. Task 4 removes the now-unused `RelationshipPopup`.

---

## Task 1: `uiStore` — typed connection selection

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.connectionSelection.test.ts` (create)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `export type ConnectionKind = 'partnership' | 'parentChild' | 'twin'`
  - `export interface ConnectionSelection { kind: ConnectionKind; id: string }`
  - State: `selectedConnection: ConnectionSelection | null`
  - Actions: `selectConnection(sel: ConnectionSelection): void`, `clearConnectionSelection(): void`
  - Invariant: `selectConnection` clears `selectedIds` and opens the panel; `select`/`selectMultiple`/`toggleSelection`/`clearSelection`/`startEditingAnnotation` reset `selectedConnection` to `null`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/uiStore.connectionSelection.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest';
import { useUIStore } from './uiStore';

beforeEach(() => {
  useUIStore.setState({
    selectedIds: new Set<string>(),
    selectedConnection: null,
    propertiesPanelOpen: false,
    editingAnnotationId: null,
  });
});

describe('uiStore connection selection', () => {
  it('selectConnection sets the typed slice, clears individuals, opens the panel', () => {
    useUIStore.getState().selectMultiple(['a', 'b']);
    useUIStore.getState().selectConnection({ kind: 'parentChild', id: 'link1' });

    const s = useUIStore.getState();
    expect(s.selectedConnection).toEqual({ kind: 'parentChild', id: 'link1' });
    expect(s.selectedIds.size).toBe(0);
    expect(s.propertiesPanelOpen).toBe(true);
  });

  it('select(individual) clears any connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().select('ind1');

    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.selectedIds.has('ind1')).toBe(true);
  });

  it('selectMultiple clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'pa1' });
    useUIStore.getState().selectMultiple(['x', 'y']);
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('toggleSelection clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'pa1' });
    useUIStore.getState().toggleSelection('z');
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('clearSelection clears connection selection and closes the panel', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().clearSelection();
    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.propertiesPanelOpen).toBe(false);
  });

  it('startEditingAnnotation clears connection selection', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().startEditingAnnotation('note1');
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('clearConnectionSelection nulls the slice without touching the panel flag', () => {
    useUIStore.getState().selectConnection({ kind: 'twin', id: 'tw1' });
    useUIStore.getState().clearConnectionSelection();
    const s = useUIStore.getState();
    expect(s.selectedConnection).toBeNull();
    expect(s.propertiesPanelOpen).toBe(true); // selectConnection opened it; clear leaves it
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/uiStore.connectionSelection.test.ts`
Expected: FAIL — `selectConnection`/`selectedConnection`/`clearConnectionSelection` do not exist (type error / undefined is not a function).

- [ ] **Step 3: Add the types and state**

In `src/stores/uiStore.ts`, after the `ActiveModal` type (around line 14), add the exported connection-selection types:

```ts
/** What kind of connection an id in {@link ConnectionSelection} refers to. */
export type ConnectionKind = 'partnership' | 'parentChild' | 'twin';

/**
 * A single, typed connection selection (mutually exclusive with the individual
 * `selectedIds` selection). `id` is a partnership id, a `ParentChildRelationship`
 * id, or a twin-group id, per `kind`.
 */
export interface ConnectionSelection {
  kind: ConnectionKind;
  id: string;
}
```

In the `UIState` interface, add the state field next to `selectedIds` (after line 17):

```ts
  /**
   * The currently selected connection (line of descent / partnership / twin
   * connector), or `null`. Mutually exclusive with `selectedIds`: selecting a
   * connection clears the individual selection and vice versa.
   */
  selectedConnection: ConnectionSelection | null;
```

In the actions section of `UIState` (near `select`/`selectMultiple`, around line 83), add:

```ts
  /** Select a single connection; clears any individual selection, opens the panel. */
  selectConnection: (sel: ConnectionSelection) => void;
  /** Clear the connection selection (leaves the panel open/closed as-is). */
  clearConnectionSelection: () => void;
```

- [ ] **Step 4: Add the initial state and actions, and the resets**

In the store creator (`create<UIState>()((set) => ({ ... }))`):

Add the initial value next to `selectedIds: new Set<string>()` (line 134):

```ts
  selectedConnection: null,
```

Add the two new actions (e.g. directly after the existing `clearSelection` action):

```ts
  selectConnection: (sel) =>
    set({
      selectedConnection: sel,
      selectedIds: new Set<string>(),
      propertiesPanelOpen: true,
      editingAnnotationId: null,
    }),

  clearConnectionSelection: () => set({ selectedConnection: null }),
```

Now reset `selectedConnection` in every individual-selection action. Edit each existing action's `set(...)` payload to include `selectedConnection: null`:

`select`:
```ts
  select: (id) =>
    set((state) => ({
      selectedIds: new Set([id]),
      selectedConnection: null,
      propertiesPanelOpen: true,
      editingAnnotationId:
        state.editingAnnotationId === id ? state.editingAnnotationId : null,
    })),
```

`selectMultiple`:
```ts
  selectMultiple: (ids) =>
    set({
      selectedIds: new Set(ids),
      selectedConnection: null,
      propertiesPanelOpen: ids.length > 0,
      editingAnnotationId: null,
    }),
```

`clearSelection`:
```ts
  clearSelection: () =>
    set({
      selectedIds: new Set(),
      selectedConnection: null,
      propertiesPanelOpen: false,
      editingAnnotationId: null,
    }),
```

`toggleSelection` (add `selectedConnection: null` to the returned object):
```ts
  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return {
        selectedIds: next,
        selectedConnection: null,
        propertiesPanelOpen: next.size > 0,
      };
    }),
```

`startEditingAnnotation`:
```ts
  startEditingAnnotation: (id) =>
    set({
      editingAnnotationId: id,
      selectedIds: new Set([id]),
      selectedConnection: null,
      propertiesPanelOpen: true,
    }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/stores/uiStore.connectionSelection.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Run the full store test suite (no regressions)**

Run: `npx vitest run src/stores/`
Expected: PASS (existing `uiStore.test.ts` etc. still green — `relationshipPopup` slice untouched in this task).

- [ ] **Step 7: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.connectionSelection.test.ts
git commit -m "$(cat <<'EOF'
feat: add typed connection selection to uiStore (#65)

selectedConnection slice (partnership/parentChild/twin) mutually exclusive
with individual selectedIds; selecting one resets the other.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Connection-properties panel editors

Builds the react-dom editor surface. Inert until Task 3 wires the lines to set `selectedConnection`, but fully testable now via RTL by seeding the store.

**Files:**
- Create: `src/components/ui/TwinZygosityFields.tsx`
- Create: `src/components/ui/ConnectionProperties.tsx`
- Create: `src/components/ui/ConnectionProperties.test.tsx`
- Modify: `src/components/ui/PropertiesPanel.tsx`

**Interfaces:**
- Consumes (Task 1): `useUIStore` `selectedConnection`, `clearConnectionSelection`; `ConnectionSelection`.
- Consumes (existing stores): `usePedigreeStore` `document.partnerships`, `document.parentChildLinks`, `document.twinGroups`, `document.individuals`, `updatePartnership`, `setLinkAdoptive`, `updateTwinGroup`, `removeTwinGroup`.
- Consumes (existing): `SegmentedControl<T extends string>` (`{ options, value, onChange, ariaLabel }`); `parentCoupleLabel({ individuals, partnerships }, link)` from `src/utils/adoption.ts`; `PropertiesPanel.module.css` classes `panel`, `empty`, `section`, `sectionTitle`, `field`, `label`, `select`, `input`, `hint`, `addButton`, `divider`.
- Produces:
  - `TwinZygosityFields` component: `{ twinGroup: TwinGroup; onChangeType: (t: TwinType) => void; onUngroup: () => void }`
  - `ConnectionProperties` component: no props (reads stores).

- [ ] **Step 1: Write `TwinZygosityFields` (shared presentational component)**

Create `src/components/ui/TwinZygosityFields.tsx`:

```tsx
import type { TwinGroup } from '../../types/pedigree';
import { TwinType } from '../../types/enums';
import styles from './PropertiesPanel.module.css';

interface TwinZygosityFieldsProps {
  /** The twin group being edited. */
  twinGroup: TwinGroup;
  /** Set the group's zygosity. */
  onChangeType: (type: TwinType) => void;
  /** Disband the group. */
  onUngroup: () => void;
}

/**
 * Zygosity `<select>` + "Ungroup twins" button. Shared by the individual
 * properties panel (when a selected person is a twin) and the connection
 * editor (when the twin connector is selected) so both surfaces edit the same
 * group identically.
 */
export function TwinZygosityFields({
  twinGroup,
  onChangeType,
  onUngroup,
}: TwinZygosityFieldsProps) {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Zygosity</label>
        <select
          className={styles.select}
          value={twinGroup.twinType}
          onChange={(e) => onChangeType(e.target.value as TwinType)}
        >
          <option value={TwinType.Monozygotic}>Monozygotic (identical)</option>
          <option value={TwinType.Dizygotic}>Dizygotic (fraternal)</option>
          <option value={TwinType.Unknown}>Unknown zygosity</option>
        </select>
      </div>
      <button className={styles.addButton} onClick={onUngroup}>
        Ungroup twins
      </button>
    </>
  );
}
```

- [ ] **Step 2: Write the failing RTL test for `ConnectionProperties`**

Create `src/components/ui/ConnectionProperties.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import {
  usePedigreeStore,
  createDefaultDocument,
  createDefaultIndividual,
} from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType, TwinType } from '../../types/enums';
import type {
  ParentChildRelationship,
  PartnershipRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { PropertiesPanel } from './PropertiesPanel';

function makeLink(
  id: string,
  childId: string,
  parentPartnershipId: string,
  isAdoptive?: boolean,
): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive };
}

function makePartnership(
  id: string,
  type: PartnershipRelationship['type'],
  consanguinityDegree?: string,
): PartnershipRelationship {
  return { id, type, partner1Id: 'p1', partner2Id: 'p2', childrenIds: [], consanguinityDegree };
}

function makeTwinGroup(id: string, twinType: TwinType): TwinGroup {
  return { id, twinType, individualIds: ['t1', 't2'], parentPartnershipId: 'union1' };
}

beforeEach(() => {
  act(() => {
    usePedigreeStore.getState().setDocument(createDefaultDocument());
    useUIStore.setState({
      selectedIds: new Set<string>(),
      selectedConnection: null,
      propertiesPanelOpen: false,
    });
  });
});

describe('ConnectionProperties via PropertiesPanel', () => {
  it('renders the line-of-descent control for a parent-child edge', () => {
    const doc = createDefaultDocument();
    doc.individuals['p1'] = createDefaultIndividual({ id: 'p1', displayName: 'Dad' });
    doc.individuals['p2'] = createDefaultIndividual({ id: 'p2', displayName: 'Mum' });
    doc.individuals['child'] = createDefaultIndividual({ id: 'child', displayName: 'Kid' });
    doc.partnerships['union1'] = { ...makePartnership('union1', RelationshipType.Partnership) };
    doc.parentChildLinks['link1'] = makeLink('link1', 'child', 'union1', false);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'parentChild', id: 'link1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);

    expect(screen.getByRole('group', { name: 'Line of descent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Biological' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Adoptive' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the relationship-status control and shows the degree input only when consanguineous', () => {
    const doc = createDefaultDocument();
    doc.partnerships['union1'] = makePartnership('union1', RelationshipType.Consanguinity, '1st cousins');

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'union1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);

    expect(screen.getByRole('group', { name: 'Relationship status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consanguineous' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByDisplayValue('1st cousins')).toBeInTheDocument();
  });

  it('does not show the degree input for a plain partnership', () => {
    const doc = createDefaultDocument();
    doc.partnerships['union1'] = makePartnership('union1', RelationshipType.Partnership);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'union1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.queryByPlaceholderText('e.g. 1st cousins')).not.toBeInTheDocument();
  });

  it('renders the zygosity control for a twin connector', () => {
    const doc = createDefaultDocument();
    doc.twinGroups['tw1'] = makeTwinGroup('tw1', TwinType.Monozygotic);

    act(() => {
      usePedigreeStore.getState().setDocument(doc);
      useUIStore.setState({
        selectedConnection: { kind: 'twin', id: 'tw1' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.getByRole('button', { name: 'Ungroup twins' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue(TwinType.Monozygotic);
  });

  it('shows the empty state when the selected connection no longer exists', () => {
    act(() => {
      useUIStore.setState({
        selectedConnection: { kind: 'partnership', id: 'missing' },
        propertiesPanelOpen: true,
      });
    });

    render(<PropertiesPanel />);
    expect(screen.getByText(/Select an individual/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ui/ConnectionProperties.test.tsx`
Expected: FAIL — `ConnectionProperties` not imported by `PropertiesPanel` yet; the connection branch doesn't exist, so the panel renders the empty state (or nothing) and the `getByRole('group', …)` queries throw.

- [ ] **Step 4: Write `ConnectionProperties`**

Create `src/components/ui/ConnectionProperties.tsx`:

```tsx
import type { JSX } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType } from '../../types/enums';
import type { PartnershipRelationship } from '../../types/pedigree';
import { SegmentedControl } from './SegmentedControl';
import { TwinZygosityFields } from './TwinZygosityFields';
import { parentCoupleLabel } from '../../utils/adoption';
import styles from './PropertiesPanel.module.css';

type PartnershipStatus = PartnershipRelationship['type'];

const STATUS_OPTIONS: { value: PartnershipStatus; label: string }[] = [
  { value: RelationshipType.Partnership, label: 'Partnership' },
  { value: RelationshipType.Separation, label: 'Separated' },
  { value: RelationshipType.Consanguinity, label: 'Consanguineous' },
];

const DESCENT_OPTIONS: { value: 'biological' | 'adoptive'; label: string }[] = [
  { value: 'biological', label: 'Biological' },
  { value: 'adoptive', label: 'Adoptive' },
];

/**
 * Properties editor for a selected connection (line of descent, partnership, or
 * twin connector). Rendered by {@link PropertiesPanel} when
 * `uiStore.selectedConnection` is set. Reads/writes the stores directly (it is a
 * react-dom component, so subscriptions are safe here).
 */
export function ConnectionProperties() {
  const selectedConnection = useUIStore((s) => s.selectedConnection);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const clearConnectionSelection = useUIStore((s) => s.clearConnectionSelection);

  const partnerships = usePedigreeStore((s) => s.document.partnerships);
  const parentChildLinks = usePedigreeStore((s) => s.document.parentChildLinks);
  const twinGroups = usePedigreeStore((s) => s.document.twinGroups);
  const individuals = usePedigreeStore((s) => s.document.individuals);
  const updatePartnership = usePedigreeStore((s) => s.updatePartnership);
  const setLinkAdoptive = usePedigreeStore((s) => s.setLinkAdoptive);
  const updateTwinGroup = usePedigreeStore((s) => s.updateTwinGroup);
  const removeTwinGroup = usePedigreeStore((s) => s.removeTwinGroup);

  const empty = (
    <div className={styles.panel}>
      <div className={styles.empty}>Select an individual to edit their properties</div>
    </div>
  );

  if (!selectedConnection) return empty;

  let body: JSX.Element | null = null;

  if (selectedConnection.kind === 'partnership') {
    const p = partnerships[selectedConnection.id];
    if (p) {
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Relationship</div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <SegmentedControl
              options={STATUS_OPTIONS}
              value={p.type}
              onChange={(type) => updatePartnership(p.id, { type })}
              ariaLabel="Relationship status"
            />
          </div>
          {p.type === RelationshipType.Consanguinity && (
            <div className={styles.field}>
              <label className={styles.label}>Degree of relationship</label>
              <input
                className={styles.input}
                value={p.consanguinityDegree ?? ''}
                onChange={(e) =>
                  updatePartnership(p.id, {
                    consanguinityDegree: e.target.value || undefined,
                  })
                }
                placeholder="e.g. 1st cousins"
              />
            </div>
          )}
        </div>
      );
    }
  } else if (selectedConnection.kind === 'parentChild') {
    const link = parentChildLinks[selectedConnection.id];
    if (link) {
      const childName = individuals[link.childId]?.displayName || 'Child';
      const parents = parentCoupleLabel({ individuals, partnerships }, link);
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Line of descent</div>
          <p className={styles.hint}>
            {childName} → {parents}
          </p>
          <div className={styles.field}>
            <SegmentedControl
              options={DESCENT_OPTIONS}
              value={link.isAdoptive ? 'adoptive' : 'biological'}
              onChange={(v) => setLinkAdoptive(link.id, v === 'adoptive')}
              ariaLabel="Line of descent"
            />
            <p className={styles.hint}>
              Adoptive draws a dashed line to the adoptive parents. The bracket
              annotation around the child is set on the person.
            </p>
          </div>
        </div>
      );
    }
  } else if (selectedConnection.kind === 'twin') {
    const tg = twinGroups[selectedConnection.id];
    if (tg) {
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Twin</div>
          <TwinZygosityFields
            twinGroup={tg}
            onChangeType={(twinType) => updateTwinGroup(tg.id, { twinType })}
            onUngroup={() => {
              removeTwinGroup(tg.id);
              clearConnectionSelection();
            }}
          />
        </div>
      );
    }
  }

  if (!body) return empty;

  return (
    <div className={styles.panel}>
      <fieldset
        disabled={editingLocked}
        style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}
      >
        {body}
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 5: Branch `PropertiesPanel` to render `ConnectionProperties`**

In `src/components/ui/PropertiesPanel.tsx`:

Add the import near the other UI imports (after the `SegmentedControl` import, line 11):

```tsx
import { ConnectionProperties } from './ConnectionProperties';
import { TwinZygosityFields } from './TwinZygosityFields';
```

Add the `selectedConnection` subscription with the other `useUIStore` reads (after line 78, `editingLocked`):

```tsx
  const selectedConnection = useUIStore((s) => s.selectedConnection);
```

Add the connection branch immediately before the existing empty-state early-return (the `if (!propertiesPanelOpen || !individual)` block at line 193 — this is after all hook calls, so it is hook-safe):

```tsx
  if (selectedConnection) {
    return <ConnectionProperties />;
  }

  if (!propertiesPanelOpen || !individual) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Select an individual to edit their properties
        </div>
      </div>
    );
  }
```

- [ ] **Step 6: Refactor the individual Twin section to use the shared component**

Still in `PropertiesPanel.tsx`, replace the existing Twin block (`{twinGroup && ( … )}`, currently lines ~764-793) with:

```tsx
      {twinGroup && (
        <>
          <div className={styles.divider} />
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Twin</div>
            <TwinZygosityFields
              twinGroup={twinGroup}
              onChangeType={(twinType) => updateTwinGroup(twinGroup.id, { twinType })}
              onUngroup={() => removeTwinGroup(twinGroup.id)}
            />
          </div>
        </>
      )}
```

The `TwinType` import in `PropertiesPanel.tsx` may now be unused (it moved into `TwinZygosityFields`). Remove `TwinType` from the `'../../types/enums'` import if `npm run lint` / `typecheck` flags it as unused.

- [ ] **Step 7: Run the connection-editor tests to verify they pass**

Run: `npx vitest run src/components/ui/ConnectionProperties.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the existing panel tests (no regressions)**

Run: `npx vitest run src/components/ui/PropertiesPanel.test.tsx`
Expected: PASS (the adoption-control tests still green; the individual Twin refactor preserves behaviour).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/ConnectionProperties.tsx src/components/ui/ConnectionProperties.test.tsx src/components/ui/TwinZygosityFields.tsx src/components/ui/PropertiesPanel.tsx
git commit -m "$(cat <<'EOF'
feat: connection properties editor in the panel (#65)

PropertiesPanel branches to ConnectionProperties when a connection is
selected: line-of-descent (biological/adoptive), partnership status +
consanguinity degree, and twin zygosity. Twin zygosity controls extracted
to a shared TwinZygosityFields used by both the connection editor and the
individual panel.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Make lines hit-testable, highlighted, and selection-driven

Wires the Konva line components to set `selectedConnection` on click and render a highlight, and swaps `PartnershipLine` off the popup. Konva is not jsdom-testable, so this task is verified by `typecheck` + `build` + manual dev-server checks (per project memory).

**Files:**
- Modify: `src/utils/constants.ts`
- Modify: `src/components/canvas/symbols/PedigreeSymbol.tsx`
- Modify: `src/components/connections/ConnectionsLayer.tsx`
- Modify: `src/components/connections/ParentChildLine.tsx`
- Modify: `src/components/connections/PartnershipLine.tsx`
- Modify: `src/components/connections/TwinConnector.tsx`
- Modify: `src/components/canvas/CanvasContainer.tsx`

**Interfaces:**
- Consumes (Task 1): `useUIStore.getState().selectConnection(...)`; `ConnectionSelection` type.
- Consumes (existing): `LINE_COLOR`, `LINE_WIDTH`, `DASH_PATTERN` from constants; `SELECTION_COLOR` (added in Step 1).
- Produces: `ConnectionsLayer`, `ParentChildLine`, `PartnershipLine`, `TwinConnector` all accept a new prop `selectedConnection?: ConnectionSelection | null`.

- [ ] **Step 1: Promote `SELECTION_COLOR` to constants**

In `src/utils/constants.ts`, add (near the other line/colour constants):

```ts
/** Accent colour for selected symbols and connections. */
export const SELECTION_COLOR = '#6965db';
```

In `src/components/canvas/symbols/PedigreeSymbol.tsx`, remove the local `const SELECTION_COLOR = '#6965db';` (line 57) and import it from constants instead. Find the existing constants import (the line importing `SYMBOL_SIZE` etc. from `'../../../utils/constants'`) and add `SELECTION_COLOR` to it.

- [ ] **Step 2: Thread `selectedConnection` through `ConnectionsLayer`**

In `src/components/connections/ConnectionsLayer.tsx`:

Add the import:
```ts
import type { ConnectionSelection } from '../../stores/uiStore';
```

Add to `ConnectionsLayerProps`:
```ts
  selectedConnection: ConnectionSelection | null;
```

Destructure it and pass it to each line component:
```tsx
export function ConnectionsLayer({
  partnerships,
  parentChildLinks,
  twinGroups,
  individuals,
  selectedConnection,
}: ConnectionsLayerProps) {
  return (
    <Layer>
      {Object.values(partnerships).map((partnership) => (
        <PartnershipLine
          key={`p-${partnership.id}`}
          partnership={partnership}
          individuals={individuals}
          selectedConnection={selectedConnection}
        />
      ))}
      {Object.values(partnerships).map((partnership) => (
        <ParentChildLine
          key={`pc-${partnership.id}`}
          partnership={partnership}
          individuals={individuals}
          parentChildLinks={parentChildLinks}
          twinGroups={twinGroups}
          selectedConnection={selectedConnection}
        />
      ))}
      {Object.values(twinGroups).map((twinGroup) => (
        <TwinConnector
          key={`tw-${twinGroup.id}`}
          twinGroup={twinGroup}
          individuals={individuals}
          partnerships={partnerships}
          selectedConnection={selectedConnection}
        />
      ))}
    </Layer>
  );
}
```

- [ ] **Step 3: `PartnershipLine` — select instead of popup, add highlight**

In `src/components/connections/PartnershipLine.tsx`:

Add the import for the selection type and update props:
```ts
import type { ConnectionSelection } from '../../stores/uiStore';
```
```ts
interface PartnershipLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  selectedConnection?: ConnectionSelection | null;
}
```

Replace the `openPopup` callback (lines 27-46) with a select handler (drop the viewport/midpoint/screen-position computation entirely):

```tsx
  const selectLine = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      useUIStore.getState().selectConnection({ kind: 'partnership', id: partnership.id });
    },
    [partnership.id],
  );
```

Remove the now-unused `useViewportStore` import. In the function body (after the `if (!p1 || !p2) return null;`), derive the selected flag and stroke and wire the handlers into `lineProps`:

```tsx
  const isSelected =
    selectedConnection?.kind === 'partnership' && selectedConnection.id === partnership.id;

  const lineProps = {
    stroke: isSelected ? SELECTION_COLOR : LINE_COLOR,
    strokeWidth: LINE_WIDTH,
    hitStrokeWidth: 12,
    onClick: selectLine,
    onTap: selectLine,
    onMouseEnter: () => setCursor('pointer'),
    onMouseLeave: () => setCursor('default'),
  };
```

Add `SELECTION_COLOR` to the constants import at the top of the file.

- [ ] **Step 4: `ParentChildLine` — per-drop hit-testing + highlight**

In `src/components/connections/ParentChildLine.tsx`:

Add imports:
```ts
import { useCallback } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useUIStore } from '../../stores/uiStore';
import type { ConnectionSelection } from '../../stores/uiStore';
```
Add `SELECTION_COLOR` to the existing constants import.

Extend props:
```ts
interface ParentChildLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  parentChildLinks: Record<string, ParentChildRelationship>;
  twinGroups: Record<string, TwinGroup>;
  selectedConnection?: ConnectionSelection | null;
}
```
and the destructure to include `selectedConnection`.

Add a cursor helper and a selection helper near the top of the component body (before building `lines`):

```tsx
  const setCursor = useCallback((cursor: string) => {
    const stage = document.querySelector('canvas');
    if (stage) stage.style.cursor = cursor;
  }, []);

  const selectLink = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>, linkId: string) => {
      e.cancelBubble = true;
      useUIStore.getState().selectConnection({ kind: 'parentChild', id: linkId });
    },
    [],
  );
```

In the `children.forEach(...)` loop, make each drop with a resolved `link` interactive and highlighted:

```tsx
  children.forEach((child, i) => {
    if (twinMemberIds.has(child.id)) return;
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    const isSelected =
      !!link &&
      selectedConnection?.kind === 'parentChild' &&
      selectedConnection.id === link.id;
    // Dash the line of descent only for an adoptive (non-biological) edge, per
    // NSGC/Bennett. Brackets on the child are handled separately in the symbol.
    lines.push(
      <Line
        key={`drop-${child.id}`}
        points={childDrops[i]}
        stroke={isSelected ? SELECTION_COLOR : LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        dash={link?.isAdoptive ? DASH_PATTERN : undefined}
        {...(link
          ? {
              hitStrokeWidth: 12,
              onClick: (e: KonvaEventObject<MouseEvent>) => selectLink(e, link.id),
              onTap: (e: KonvaEventObject<TouchEvent>) => selectLink(e, link.id),
              onMouseEnter: () => setCursor('pointer'),
              onMouseLeave: () => setCursor('default'),
            }
          : {})}
      />,
    );
  });
```

- [ ] **Step 5: `TwinConnector` — hit-testing + highlight**

In `src/components/connections/TwinConnector.tsx`:

Add imports:
```ts
import { useCallback } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useUIStore } from '../../stores/uiStore';
import type { ConnectionSelection } from '../../stores/uiStore';
```
Add `SELECTION_COLOR` to the existing constants import.

Extend props:
```ts
interface TwinConnectorProps {
  twinGroup: TwinGroup;
  individuals: Record<string, Individual>;
  partnerships: Record<string, PartnershipRelationship>;
  selectedConnection?: ConnectionSelection | null;
}
```
and the destructure to include `selectedConnection`.

After the early returns (once `twinGroup`/partners are known to exist), add:

```tsx
  const isSelected =
    selectedConnection?.kind === 'twin' && selectedConnection.id === twinGroup.id;
  const stroke = isSelected ? SELECTION_COLOR : LINE_COLOR;

  const setCursor = (cursor: string) => {
    const stage = document.querySelector('canvas');
    if (stage) stage.style.cursor = cursor;
  };

  const selectGroup = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    useUIStore.getState().selectConnection({ kind: 'twin', id: twinGroup.id });
  };

  const interactive = {
    hitStrokeWidth: 12,
    onClick: selectGroup,
    onTap: selectGroup,
    onMouseEnter: () => setCursor('pointer'),
    onMouseLeave: () => setCursor('default'),
  };
```

Apply `stroke={stroke}` and `{...interactive}` to the V-line `<Line>`s and the MZ-bar `<Line>` (replace their existing `stroke={LINE_COLOR}`). Leave the "?" `<Text>` with `listening={false}` and its existing `fill`. Example for the V-lines:

```tsx
    elements.push(
      <Line
        key={`twin-line-${twin.id}`}
        points={[twinMidX, sibshipY, twin.position.x, twin.position.y]}
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        {...interactive}
      />
    );
```

and the bar:
```tsx
    elements.push(
      <Line
        key={`twin-bar-${twinGroup.id}`}
        points={[leftX, barY, rightX, barY]}
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        {...interactive}
      />
    );
```

- [ ] **Step 6: `CanvasContainer` — subscribe and pass `selectedConnection`**

In `src/components/canvas/CanvasContainer.tsx`:

Add the subscription with the other `useUIStore` reads (near line 86, `editingAnnotationId`):
```tsx
    const selectedConnection = useUIStore((s) => s.selectedConnection);
```

Pass it to the layer (the existing `<ConnectionsLayer … />`, line ~506):
```tsx
            <ConnectionsLayer
              partnerships={partnerships}
              parentChildLinks={parentChildLinks}
              twinGroups={twinGroups}
              individuals={individuals}
              selectedConnection={selectedConnection}
            />
```

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (tsc + vite). `RelationshipPopup` still compiles (removed in Task 4); `showRelationshipPopup` is now unused by `PartnershipLine` but still defined in the store, so no break.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS. (Existing `uiStore.test.ts` `relationshipPopup slice` block still passes — the store slice is removed in Task 4.)

- [ ] **Step 9: Manual verification (dev server)**

Run: `npm run dev`, then in the app:
1. Create two people, partner them, add a child. Click the child's **line of descent** → panel shows "Line of descent" with Biological/Adoptive; the drop highlights in the accent colour. Toggle **Adoptive** → the drop becomes dashed; toggle back → solid. Cmd/Ctrl+Z undoes.
2. Click the **partnership line** → panel shows "Relationship" status control (no popup appears). Switch to **Separated** → slash glyph; **Consanguineous** → double line + a "Degree of relationship" input; type "1st cousins" → renders above the line.
3. Mark two siblings as twins, click the **twin connector** → "Twin" zygosity select; change it → connector updates. Select one twin **person** → the individual panel shows the same zygosity (in sync).
4. Click empty canvas → selection clears (panel closes). Click a person → individual panel (connection selection gone). The two never coexist.

- [ ] **Step 10: Commit**

```bash
git add src/utils/constants.ts src/components/canvas/symbols/PedigreeSymbol.tsx src/components/connections/ConnectionsLayer.tsx src/components/connections/ParentChildLine.tsx src/components/connections/PartnershipLine.tsx src/components/connections/TwinConnector.tsx src/components/canvas/CanvasContainer.tsx
git commit -m "$(cat <<'EOF'
feat: select and highlight connections on the canvas (#65)

Parent-child drops, partnership lines, and twin connectors are now
hit-testable and set the typed selectedConnection on click, highlighting
in the accent colour. PartnershipLine selects into the panel instead of
opening RelationshipPopup. SELECTION_COLOR promoted to constants.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Retire `RelationshipPopup`

With partnerships selectable and panel-editable, the popup is dead code. Removing it is its own commit so it can be reviewed/reverted independently.

**Files:**
- Delete: `src/components/ui/RelationshipPopup.tsx`, `src/components/ui/RelationshipPopup.module.css`
- Modify: `src/App.tsx`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/stores/uiStore.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: removes `relationshipPopup` state, `showRelationshipPopup`, `hideRelationshipPopup` from `uiStore`.

- [ ] **Step 1: Remove the mount from `App.tsx`**

In `src/App.tsx`, delete the import (line 12):
```tsx
import { RelationshipPopup } from './components/ui/RelationshipPopup';
```
and the mount (line 83):
```tsx
      <RelationshipPopup />
```

- [ ] **Step 2: Delete the component files**

```bash
git rm src/components/ui/RelationshipPopup.tsx src/components/ui/RelationshipPopup.module.css
```

- [ ] **Step 3: Remove the `relationshipPopup` slice from `uiStore`**

In `src/stores/uiStore.ts`, remove:
- the `relationshipPopup: { … }` block in the `UIState` interface (lines ~42-46);
- the `showRelationshipPopup` / `hideRelationshipPopup` signatures in the interface (lines ~103-107);
- the `relationshipPopup: { … }` initial state in the creator (lines ~158-162);
- the `showRelationshipPopup` / `hideRelationshipPopup` action implementations (lines ~265-277).

- [ ] **Step 4: Remove the obsolete test block**

In `src/stores/uiStore.test.ts`, delete the entire `describe('relationshipPopup slice', () => { … })` block (lines 16-37) and any now-unused imports it introduced.

- [ ] **Step 5: Verify no dangling references**

Run: `grep -rn "RelationshipPopup\|relationshipPopup\|showRelationshipPopup\|hideRelationshipPopup" src/`
Expected: no matches.

- [ ] **Step 6: Typecheck, test, build**

Run: `npm run typecheck` → no errors.
Run: `npm test` → PASS.
Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: retire RelationshipPopup in favour of the panel editor (#65)

Partnership status and consanguinity degree are now edited via the
connection properties panel; the transient popup and its uiStore slice
are removed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Selection model (`selectedConnection`, mutually exclusive, resets) → Task 1. ✅
- Hit-testing all three line kinds → Task 3 (Steps 3-5). ✅
- Highlight threaded from `CanvasContainer` → `ConnectionsLayer` → lines → Task 3 (Steps 2, 6). ✅
- Panel branching + parent-child / partnership / twin editors → Task 2. ✅
- Reuse `setLinkAdoptive` (no new store action) → Task 2, Step 4. ✅
- Twin zygosity in both places via shared `TwinZygosityFields` → Task 2 (Steps 1, 6). ✅
- Retire `RelationshipPopup` (component, css, App mount, uiStore slice, test block, PartnershipLine handler) → handler swap in Task 3 Step 3; removal in Task 4. ✅
- Bennett: edge editor controls only line style; brackets stay the person's → Task 2 Step 4 (hint copy + only `setLinkAdoptive`). ✅
- Edge cases: missing entity → empty state (Task 2 Step 4, tested Step 2); `cancelBubble` (Task 3); `editingLocked` fieldset (Task 2 Step 4); twin-member drops not selectable (inherent — loop `return`s for twin members). ✅
- Testing: store TDD (Task 1), panel RTL (Task 2), Konva manual (Task 3 Step 9), test-block removal (Task 4). ✅

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — all steps carry complete code and exact commands. ✅

**Type consistency:** `ConnectionSelection { kind; id }` and `ConnectionKind` defined in Task 1, imported by Tasks 2-3. `selectConnection`/`clearConnectionSelection` names consistent across tasks. `TwinZygosityFields` props (`twinGroup`, `onChangeType`, `onUngroup`) identical in definition (Task 2 Step 1) and both call sites (Task 2 Steps 4 & 6). `setLinkAdoptive(linkId, boolean)`, `updatePartnership(id, patch)`, `updateTwinGroup(id, patch)`, `removeTwinGroup(id)` match the existing store signatures. ✅
