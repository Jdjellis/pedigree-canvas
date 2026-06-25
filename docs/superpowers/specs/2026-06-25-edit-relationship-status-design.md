# Edit Relationship Status — Design

**Issue:** #16 — Edit relationship status (partnership / separated / consanguineous)
**Date:** 2026-06-25

## Problem

A partnership's `type` is fixed at creation. The `LinkTypePopup` offers only
`Partnership` and `Consanguinity` when a relationship is first created, and there
is no way to change a partnership's type afterward. The two-slash "Separated"
glyph (`RelationshipType.Separation`) already renders in `PartnershipLine.tsx`
but is not reachable from any UI surface.

Note on terminology: divorce == separation == the two-slash glyph. There is one
`Separation` type; it is labelled "Separated" in the UI.

## Goal

Let the user set or change an existing partnership's relationship status to any
of the three supported types by **clicking its connecting line**, which opens a
small popup. The change must be undoable.

## Non-goals

- Changing the **creation** popup (`LinkTypePopup`). "Separated" is a state
  applied to an existing couple, not a from-scratch creation choice; the new edit
  popup makes it reachable. Creation stays `Partnership` / `Consanguinity`.
- Making partnership lines part of the selection model (no `selectedIds` /
  `PropertiesPanel` changes). Considered and rejected: it adds heterogeneous
  selection plumbing for a single control the popup already provides. Revisit
  only when partnerships gain several editable attributes.

## Approach

Mirror the existing `linkPopup` pattern end to end: a screen-positioned popup
component driven by a dedicated UI-store slice, opened by a click handler on the
line, applying its change through a new store action.

### 1. Store action — `updatePartnership`

Add to `pedigreeStore.ts`, alongside `addChildToPartnership`:

```ts
updatePartnership: (id: string, patch: Partial<PartnershipRelationship>) => void;
```

Implementation mirrors `addChildToPartnership`: look up the partnership, return
state unchanged if missing, otherwise spread `{ ...partnership, ...patch }` back
into `partnerships` and bump `metadata.updatedAt`. It runs inside the existing
`temporal` middleware, so undo/redo works with no extra wiring.

### 2. UI store — `relationshipPopup` slice

Add to `uiStore.ts`, mirroring `linkPopup` exactly:

```ts
relationshipPopup: {
  visible: boolean;
  partnershipId: string | null;
  screenPosition: { x: number; y: number };
};
showRelationshipPopup: (partnershipId: string, screenPos: { x: number; y: number }) => void;
hideRelationshipPopup: () => void;
```

Kept separate from `linkPopup` because `linkPopup` is keyed on source/target
**individual** IDs (for creation), whereas this is keyed on a single existing
**partnership** ID. Opening the relationship popup hides the radial menu (as
other click handlers do).

### 3. `PartnershipLine` — make the line clickable

Add to the `<Line>` element(s) in all three render branches (partnership,
consanguinity, separation):

- `hitStrokeWidth={12}` so the thin line is easy to hit.
- `onClick` / `onTap` → a handler that:
  - sets `e.cancelBubble = true` (don't fall through to the stage's
    `clearSelection`),
  - computes the line midpoint in canvas coords `((p1.x+p2.x)/2, y)`,
  - converts to screen position via `viewportStore.canvasToScreen` plus the
    `.konvajs-content` bounding-rect offset (same technique as `handleMouseUp`
    in `PedigreeSymbol.tsx`),
  - calls `useUIStore.getState().showRelationshipPopup(partnership.id, screenPos)`.
- `onMouseEnter` / `onMouseLeave` → set the canvas cursor to `pointer` / `default`
  so the line reads as interactive (the discoverability affordance that the
  popup approach otherwise lacks).

No new props are needed — `ConnectionsLayer` already passes `partnership` and
`individuals`. Per the react-konva + Zustand gotcha, the handler uses
`useUIStore.getState()` imperatively (no subscription inside the Konva tree).

### 4. New component — `RelationshipPopup`

A near-copy of `LinkTypePopup.tsx`: a full-area backdrop (click = dismiss) with a
screen-positioned popup that `stopPropagation`s. Title "Relationship Status" and
three option buttons:

| Button         | Sets type                        |
| -------------- | -------------------------------- |
| Partnership    | `RelationshipType.Partnership`   |
| Separated      | `RelationshipType.Separation`    |
| Consanguineous | `RelationshipType.Consanguinity` |

Each button calls `updatePartnership(partnershipId, { type })` then
`hideRelationshipPopup()`. The button matching the partnership's current type
gets a highlighted/active style so the current state is visible. Reuses
`LinkTypePopup.module.css` (add an `active` class if not present, or a small
dedicated `RelationshipPopup.module.css`). Mounted in the same place
`LinkTypePopup` is mounted (the react-dom overlay layer over the canvas).

### Data flow

```
click line (PartnershipLine, Konva)
  -> showRelationshipPopup(partnershipId, screenPos)   [uiStore]
  -> RelationshipPopup renders at screenPos             [react-dom]
  -> user clicks a status
  -> updatePartnership(id, { type })                    [pedigreeStore, temporal]
  -> PartnershipLine re-renders new glyph; hideRelationshipPopup()
```

## Error / edge handling

- Click handler is a no-op if either partner individual is missing (the line
  already returns `null` in that case, so it won't render or be clickable).
- `updatePartnership` returns state unchanged for an unknown id.
- Backdrop click and (optionally) Escape dismiss the popup without changes.
- `e.cancelBubble = true` prevents the click from also clearing the current
  individual selection.

## Testing / verification

Manual via the dev server (no unit-test harness for Konva interaction in this
repo):

1. Create a partnership between two individuals.
2. Click the connecting line — popup appears at the line, current type highlighted.
3. Switch to "Separated" — line shows the two-slash glyph.
4. Switch to "Consanguineous" — line shows the double line.
5. Switch back to "Partnership" — solid line.
6. Undo (Cmd/Ctrl+Z) reverts the last status change; redo re-applies it.
7. Clicking the line does not clear/alter the selected individual.

## Files touched

- `src/stores/pedigreeStore.ts` — add `updatePartnership` (interface + impl).
- `src/stores/uiStore.ts` — add `relationshipPopup` slice + show/hide actions.
- `src/components/connections/PartnershipLine.tsx` — click/cursor handlers,
  `hitStrokeWidth`.
- `src/components/ui/RelationshipPopup.tsx` — new component.
- `src/components/ui/RelationshipPopup.module.css` (or reuse
  `LinkTypePopup.module.css`) — styles, including active-state highlight.
- `src/App.tsx` — mount `<RelationshipPopup />` next to `<LinkTypePopup />`.
