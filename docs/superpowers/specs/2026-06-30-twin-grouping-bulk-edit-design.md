# Multi-select bulk editing + twin grouping — Design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)
**Builds on:** #68 (connection/line selection + line-properties panel)
**Related:** #70 (future: floating contextual toolbar as an alternative action surface)

## Summary

Make the properties panel do something useful when more than one individual is
selected. Two user-facing capabilities ride on that single substrate:

1. **Bulk edit** of eligible (categorical) person properties across a
   multi-selection.
2. **Twin grouping** — uniting existing siblings into a twin group (the inverse
   of the existing "Ungroup twins"), as a contextual action inside the
   multi-select panel.

Both are purely additive: no selection plumbing changes. Users already build
multi-selections via marquee drag (`selectMultiple`) and shift/⌘/ctrl-click on a
symbol (`toggleSelection`, `PedigreeSymbol.tsx`). The only gap is that
`PropertiesPanel` renders nothing useful when `selectedIds.size > 1`.

## Background — current foundation (post-#68)

- **Selection model (`uiStore`):** `selectedIds: Set<string>` holds *individuals*
  (marquee + shift-click already populate it with multiple ids); a separate,
  single `selectedConnection: { kind: 'partnership' | 'parentChild' | 'twin',
  id }` holds *one* connection. They are mutually exclusive.
- **Panel dispatch (`PropertiesPanel`):**
  - `selectedConnection` set → `<ConnectionProperties/>`
  - exactly one individual (`selectedIds.size === 1`) → full single-person editor
  - otherwise → empty state ("Select an individual to edit their properties")
  - So a multi-selection currently shows the empty state.
- **Twin model:** `TwinGroup { id, twinType, individualIds: string[],
  parentPartnershipId }`. `addTwinGroup` / `updateTwinGroup` / `removeTwinGroup`
  exist. Twins are only ever *born* together via the radial "Add Twin" action;
  there is no way to unite existing siblings. Ungroup is wired to the
  twin-connector editor in `ConnectionProperties`.

## Goals

- A multi-select properties editor for `selectedIds.size > 1`.
- Bulk edit of: **Identity** (gender identity, sex assigned at birth),
  **Vital status** (+ shared cause of death), **Adoption** (adopted flag),
  **Conditions** (legend condition checkboxes).
- A contextual **Group as twins** action (create / extend-to-triplet / merge).
- Each bulk operation is a **single undo step**.

## Non-goals (YAGNI)

- Bulk editing identifying/unique fields: name, DOB, age, notes.
- Bulk proband/consultand (proband is unique by definition).
- Grouping founders with no shared sibship (give them shared parents first).
- New selection gestures (marquee + shift-click already suffice).
- A floating contextual toolbar — tracked separately in #70.

## Architecture

`PropertiesPanel` gains one branch, mirroring the existing `ConnectionProperties`
dispatch:

```
selectedConnection        → <ConnectionProperties/>     (exists)
selectedIds.size === 1    → single-person editor         (exists)
selectedIds.size  >  1    → <MultiSelectProperties/>      (NEW)
else                      → empty state                   (exists)
```

`MultiSelectProperties` is a new react-dom component (subscriptions are safe
here, same as `ConnectionProperties`). It reuses existing sub-components
(`GenderIconButtons`, `SegmentedControl`, the condition checkbox rows).

**Rejected alternatives:** a Figma-style floating toolbar (new surface,
inconsistent with the panel-centric model from #68 — deferred to #70); making the
existing ~800-line single editor bulk-aware in place (would expose non-bulkable
fields and bloat an already-large file).

## Component: `MultiSelectProperties`

Layout (top to bottom):

1. **Header** — "{n} people selected".
2. **Twins section** — only when the selection is *grouping-eligible* (see below).
3. **Identity** — gender identity, sex assigned at birth.
4. **Vital status** — Alive/Deceased; cause of death only when *all* selected are
   Deceased.
5. **Adoption** — adopted flag.
6. **Conditions** — legend condition checkboxes (tri-state).

Wrapped in `<fieldset disabled={editingLocked}>` like the other editors so the
read-only lock applies.

### Mixed-value semantics

Each control computes agreement across the selection:

- **Agree** → show the shared value.
- **Disagree** → show a **"Mixed"** state: segmented controls show no active
  segment; checkboxes render *indeterminate* (dash).
- **Write-on-explicit-change only.** A control that the user does not touch never
  writes. This prevents a "Mixed" field from silently flattening everyone to one
  value.
- **Condition checkboxes are tri-state:** indeterminate → click *checks all* →
  click again *unchecks all*.

### Edge rules

- **Gender-specific conditions:** a `LegendEntry` with `applicableTo: 'man' |
  'woman'` is shown if it applies to *at least one* selected person. Its checkbox
  state and writes consider only the applicable subset.
- **Cause of death** input appears only when *every* selected person is Deceased
  (otherwise it is meaningless).

## Twin grouping

A **Twins** section appears in `MultiSelectProperties` only when the selection is
**grouping-eligible**:

- 2 or more individuals, **and**
- they all share the same parent partnership (same sibship).

An individual's sibship is the `parentPartnershipId` of its `parentChildLink`
(the link whose `childId` is the individual). All selected individuals must
resolve to the same `parentPartnershipId`. Founders with no parent link are not
eligible.

UI is contextual on whether any selected sibling is already in a twin group:

- **None grouped** → three buttons: *Group as MZ / DZ / Unknown twins*. Click →
  create one `TwinGroup` containing all selected ids with the chosen zygosity.
- **Some already grouped** → a single *"Add to existing twin group"* button that
  displays the existing zygosity. Click → merge all selected ids (and any second
  existing group's members) into one group.

### Merge rule

When grouping touches existing groups:

- All selected ids plus all members of any existing group(s) among them collapse
  into **one** `TwinGroup`.
- **Type is kept from the existing group** (the user's chosen MZ/DZ/Unknown
  applies only when creating a *fresh* group). When two existing groups merge,
  the type of the group with **more members** wins; ties resolve to the
  lexicographically-first group id (stable).
- Redundant emptied groups are removed.

Zygosity is later editable as before by selecting the twin connector
(`ConnectionProperties`).

## Data flow — store actions (`pedigreeStore`)

zundo records one undo entry per store mutation, so calling `updateIndividual`
N times would create N undo steps. New batched actions keep each bulk operation
atomic and undoable in one step:

- `updateIndividuals(ids: string[], patch: Partial<Individual>): void`
  — identity / vital status / adoption across the selection in one mutation.
- `setConditionForIndividuals(ids: string[], entryId: string, applied: boolean):
  void` — add or remove a condition id across the selection in one mutation.
- `groupTwins(ids: string[], twinType: TwinType): string | null` — validates the
  same-sibship constraint, performs create-or-merge, removes emptied groups, and
  returns the resulting group id (or `null` if the selection is not eligible).

Validation/merge logic lives in the store, not the component: react-konva cannot
render under vitest/jsdom, so **store logic is the real test surface**.

## Testing

**Store (vitest):**

- `updateIndividuals` — patches all ids; preserves untouched fields; records a
  single undoable step.
- `setConditionForIndividuals` — adds to all; removes from all; idempotent; single
  undo step.
- `groupTwins` — creates a group from ungrouped siblings; extends a pair to a
  triplet; merges two existing groups (type-kept = larger group's type, stable
  tiebreak); removes emptied groups; rejects (returns `null`) when ids span
  different sibships or include a founder; single undo step.

**Component (jsdom-friendly, like `ConnectionProperties.test.tsx`):**

- `MultiSelectProperties` renders agreed vs. "Mixed" states correctly.
- Untouched controls do not write; touched controls write to all.
- Condition tri-state toggle (indeterminate → all → none).
- Twins section visibility (eligible vs. not) and create vs. add-to-existing UI.

## Implementation order

1. Store actions + their unit tests (TDD): `updateIndividuals`,
   `setConditionForIndividuals`, `groupTwins`.
2. `MultiSelectProperties` component + the `PropertiesPanel` dispatch branch.
3. Component tests.
4. Manual verification in the running app (marquee/shift-click → bulk edit →
   group siblings → verify connector + undo).
