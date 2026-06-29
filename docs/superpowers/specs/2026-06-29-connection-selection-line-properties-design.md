# Connection Selection + Line-Properties Panel — Design

**Issue:** #65 — connection/line selection + line-specific properties panel
**Date:** 2026-06-29
**Builds on:** #56/#67 (adoption in/out — already merged; introduced `isAdoptive`,
`setLinkAdoptive`, `setAdoption`, and the per-link adoption UI in the panel).
**Related:** #64 (multi-parentage, depends on this per-edge model); #16 (edit
relationship status — the `RelationshipPopup` retired here).

## Problem

Editing is entirely properties-panel-driven for **individuals**, but the
**connections** between them (partnership lines, lines of descent, consanguinity
double-lines, separation slashes, twin connectors) have no first-class selection.
Selection is individual-centric and untyped (`uiStore.selectedIds: Set<string>`
with a single `select(id)` action), and `PropertiesPanel` assumes every selected
id is an individual (`PropertiesPanel.tsx:92-94`). The descent and twin lines
aren't interactive at all; the one interactive line (`PartnershipLine`) is a
workaround that opens a bespoke `RelationshipPopup` rather than participating in
selection.

The result: per-edge properties have no home on the edge. Concretely after #67:

- **Parent-child line style** (`ParentChildRelationship.isAdoptive`) has a setter
  (`setLinkAdoptive`) and even a per-link toggle in the panel — but only reachable
  by selecting the **child individual** (the 2+-parent-links branch,
  `PropertiesPanel.tsx:693-723`), never by clicking the descent line itself.
- **Relationship status + consanguinity degree** live in a transient
  `RelationshipPopup` keyed off a click on `PartnershipLine`.
- **Twin zygosity** is hung off a selected twin *person*
  (`PropertiesPanel.tsx:764-793`), never the twin connector.

## Goal

Make connections first-class, selectable, panel-editable entities, and use that
to give three per-edge properties a connection-selection home:

1. **Parent-child descent edge** — biological (solid) vs adoptive (dashed), by
   clicking the line. Reuses the existing `setLinkAdoptive` action.
2. **Partnership** — relationship status + consanguinity degree, **migrated out
   of `RelationshipPopup`** (which is retired).
3. **Twin group** — zygosity, editable from the **twin connector** *in addition
   to* the existing individual-panel section (kept).

## Non-goals

- **Multi-parentage** (#64): a child shown connected to both a biological and an
  adoptive parent set at once. The descent-edge editor here is single-edge.
- **Text-annotation properties editor.** A selected text annotation currently
  falls through to the empty state (`startEditingAnnotation` puts its id in
  `selectedIds`). The branch structure added here makes that editor trivial to
  add later, but it is out of scope for this pass.
- **New adoption data model / brackets.** #67 settled the model: `isAdoptive`
  per edge (line style) and `Individual.adopted` for brackets are orthogonal. We
  reuse them as-is; no model change.
- **Eraser interaction with connections.** Unchanged.

## Architecture constraint (verified)

`ConnectionsLayer` receives **all** data as props from `CanvasContainer` because
Zustand subscriptions silently fail inside react-konva's custom reconciler
(`ConnectionsLayer.tsx:19-25`); `PartnershipLine` already reads
`useUIStore.getState()` imperatively. Therefore:

- The new `selectedConnection` must be **subscribed in `CanvasContainer`
  (react-dom) and threaded as a prop** through `ConnectionsLayer` into the line
  components to drive the highlight. It cannot be subscribed inside the Konva
  tree.
- Line click handlers call `useUIStore.getState().selectConnection(...)`
  imperatively.

`PropertiesPanel` is a react-dom component, so it subscribes to stores directly
(as it already does for `individuals`, `partnerships`, `parentChildLinks`,
`twinGroups`, `setLinkAdoptive`, …).

## Approach

### 1. Selection model — `uiStore`

A connection is a **single, typed** selection that is **mutually exclusive** with
individual selection (one connection, or N individuals, never both):

```ts
export type ConnectionKind = 'partnership' | 'parentChild' | 'twin';

export interface ConnectionSelection {
  kind: ConnectionKind;
  /** partnership id, ParentChildRelationship id, or twinGroup id (per `kind`). */
  id: string;
}

// state
selectedConnection: ConnectionSelection | null;   // initialised to null

// actions
selectConnection: (sel: ConnectionSelection) => void;
clearConnectionSelection: () => void;
```

- `selectConnection(sel)` sets `selectedConnection = sel`, clears `selectedIds`
  (`new Set()`), sets `propertiesPanelOpen = true`, `editingAnnotationId = null`.
- `clearConnectionSelection()` sets `selectedConnection = null` (leaves
  `propertiesPanelOpen` to the caller).
- **Every individual-selection action resets `selectedConnection` to `null`** so
  the two kinds can't both be live: `select`, `selectMultiple`,
  `toggleSelection`, `clearSelection`, `startEditingAnnotation`. `clearSelection`
  additionally closes the panel as today.

### 2. Hit-testing the lines (react-konva)

Each handler sets `e.cancelBubble = true` (so the stage's `clearSelection`
doesn't fire), calls `useUIStore.getState().selectConnection(...)`, and sets the
canvas cursor to `pointer`/`default` on enter/leave — the affordance pattern
`PartnershipLine` already uses (`hitStrokeWidth={12}`).

- **`ParentChildLine`** — each **per-child drop** `<Line>` (`drop-${child.id}`)
  becomes selectable and selects **that child's `ParentChildRelationship`**:
  `selectConnection({ kind: 'parentChild', id: link.id })`. Only drops that have
  a resolved `link` are selectable. The shared `parentDrop`/`sibship` bars stay
  structural and non-interactive.
  - **Note (twin members):** the component already *skips* drops for twin members
    (their edges converge in `TwinConnector`, `ParentChildLine.tsx:73-80`). So a
    twin member's adoption edge is not reachable by descent-click; it remains
    editable via the individual panel's child-link controls. Acceptable for this
    pass.

- **`PartnershipLine`** — replace the popup handler: the click now calls
  `selectConnection({ kind: 'partnership', id: partnership.id })` instead of
  `showRelationshipPopup(...)`. The midpoint/screen-position computation is no
  longer needed and is removed. `hitStrokeWidth={12}` + cursor handlers stay;
  applies to all three render branches (partnership, consanguinity, separation).

- **`TwinConnector`** — the V-line `<Line>`s (and the MZ bar, when present)
  become selectable and select `selectConnection({ kind: 'twin', id:
  twinGroup.id })`. The "?" text stays `listening={false}`.

### 3. Selected-state highlight

`CanvasContainer` subscribes `selectedConnection` (react-dom) and threads it as a
prop into `ConnectionsLayer`, which forwards the relevant slice to each line
component. The matching segments render in `SELECTION_COLOR` (`#6965db`, the
accent `PedigreeSymbol` uses) instead of `LINE_COLOR`:

- `parentChild` → the selected child's drop line.
- `partnership` → the partnership line(s) for the selected partnership.
- `twin` → the selected group's V-lines (and bar).

Highlight is screen-only and **not** part of any export, so `svgExport.ts` needs
no change.

### 4. Panel branching — `PropertiesPanel`

New top-level branch order:

```
selectedConnection != null   → ConnectionProperties (connection editor)
else single individual        → existing individual panel
else                          → empty state ("Select an individual to edit…")
```

Connection editors are extracted into a new focused component
`src/components/ui/ConnectionProperties.tsx` (the panel is already ~870 lines;
this keeps it from growing). It subscribes to the stores it needs
(`partnerships`, `parentChildLinks`, `twinGroups`, `individuals`,
`updatePartnership`, `setLinkAdoptive`, `updateTwinGroup`, `removeTwinGroup`,
`clearConnectionSelection`) and switches on `selectedConnection.kind`. Controls
sit inside the same `disabled={editingLocked}` fieldset pattern the individual
panel uses. If the referenced entity is missing (e.g. just deleted), it renders
the empty state.

**Parent-child edge editor** — a "Line of descent" `SegmentedControl`:
**Biological** (solid) / **Adoptive** (dashed), `value = link.isAdoptive ?
'adoptive' : 'biological'`, `onChange → setLinkAdoptive(link.id, v ===
'adoptive')`. This is the same control the individual panel's 2+-links branch
uses (`PropertiesPanel.tsx:711-719`) — reused here, optionally via a shared
`LineOfDescentField` (label + control). It controls **only the edge's line
style**; the child's **brackets remain the individual's `adopted` flag**
(unchanged, per Bennett). Header shows context via `parentCoupleLabel(...)` and
the child's `displayName`, e.g. *"Line of descent — Child → Parents"*, plus a
hint that brackets are set on the person.

**Partnership editor** (migrated from `RelationshipPopup`) — a "Relationship
status" `SegmentedControl`: **Partnership** / **Separated** / **Consanguineous**,
`value = partnership.type`, `onChange → updatePartnership(id, { type })`. When
the type is `Consanguinity`, a free-text "Degree of relationship" input appears
(placeholder `e.g. 1st cousins`), bound to `partnership.consanguinityDegree` via
`updatePartnership(id, { consanguinityDegree: value || undefined })`. The stored
degree is retained when toggling away from consanguineous (matching current popup
behaviour). No `autoFocus` (persistent panel, not a transient popup).

**Twin group editor** — the zygosity `<select>` (Monozygotic / Dizygotic /
Unknown) + "Ungroup twins", driven by the selected twin group. "Ungroup twins"
calls `removeTwinGroup(group.id)` then `clearConnectionSelection()`. The zygosity
+ ungroup markup is extracted into a small shared presentational component
`src/components/ui/TwinZygosityFields.tsx` (props: `twinGroup`, `onChangeType`,
`onUngroup`) used by **both** this editor **and** the existing individual-panel
Twin section.

### 5. Twin section in the individual panel — kept

The existing Twin section (`PropertiesPanel.tsx:764-793`), shown when a selected
individual belongs to a twin group, is **kept**, refactored to render the shared
`TwinZygosityFields`. Because both surfaces call `updateTwinGroup` on the same
group, editing zygosity from either the connector or a twin person stays in sync
through the store.

### 6. Retire `RelationshipPopup`

With partnerships now selectable and panel-editable, the popup is redundant.
Remove:

- `src/components/ui/RelationshipPopup.tsx` + `RelationshipPopup.module.css`.
- `src/App.tsx` — the import (`App.tsx:12`) and the `<RelationshipPopup />` mount
  (`App.tsx:83`).
- `src/stores/uiStore.ts` — the `relationshipPopup` state slice and the
  `showRelationshipPopup` / `hideRelationshipPopup` actions (state + interface).
- `src/stores/uiStore.test.ts` — the `relationshipPopup slice` describe block
  (`uiStore.test.ts:16-37`).
- `src/components/connections/PartnershipLine.tsx` — the `showRelationshipPopup`
  call (replaced in §2).

`clsx` stays a dependency (used elsewhere); no package change.

## Data flow

```
click descent drop (ParentChildLine, Konva)
  -> selectConnection({ kind:'parentChild', id: link.id })   [uiStore, clears selectedIds]
  -> CanvasContainer re-renders; threads selectedConnection into ConnectionsLayer (highlight)
  -> PropertiesPanel renders ConnectionProperties -> parent-child editor  [react-dom]
  -> user toggles Adoptive
  -> setLinkAdoptive(link.id, true)                          [pedigreeStore, temporal]
  -> ParentChildLine re-renders the drop dashed; highlight persists

click partnership line  -> selectConnection({ kind:'partnership', id }) -> status/degree editor
click twin connector    -> selectConnection({ kind:'twin', id })        -> zygosity editor
click empty canvas      -> clearSelection() (resets selectedConnection) -> empty state
click an individual     -> select(id) (resets selectedConnection)       -> individual panel
```

## Error / edge handling

- Line click handlers no-op when their entities are missing (components already
  return `null`, so the line isn't rendered/clickable).
- `setLinkAdoptive` / `updatePartnership` / `updateTwinGroup` return state
  unchanged for unknown ids.
- `ConnectionProperties` renders the empty state if the selected connection's
  entity is missing (e.g. after Ungroup), and Ungroup clears the selection.
- `e.cancelBubble = true` on each line prevents the click from also clearing
  selection via the stage handler.
- `editingLocked` disables connection-editor controls (shared fieldset). Selecting
  a line to inspect it is still allowed.
- Individual ⇄ connection selection is mutually exclusive: each side's
  select/clear action resets the other.

## Testing / verification

Konva interaction isn't unit-testable under vitest/jsdom (project gotcha), so the
store/selection logic is the real test surface. The adoption store actions
(`setLinkAdoptive`, `setAdoption`) and `updatePartnership`/`updateTwinGroup` are
already covered by existing tests and are reused unchanged.

- **`src/stores/uiStore.connectionSelection.test.ts`** (new): `selectConnection`
  sets the typed slice, clears `selectedIds`, opens the panel; `select` /
  `selectMultiple` / `clearSelection` / `toggleSelection` / `startEditingAnnotation`
  each reset `selectedConnection` to `null`; `clearConnectionSelection` clears it.
- **`src/stores/uiStore.test.ts`**: remove the obsolete `relationshipPopup slice`
  block.
- If a shared `adoptionEditState`/label helper is extracted, unit-test it; the
  existing `src/utils/adoption.ts` helpers (`parentCoupleLabel`,
  `adoptionModeForLink`) already have/deserve coverage.

Manual (dev server / trusted Playwright `page.mouse.click`, per the
verifying-konva-canvas gotcha):

1. Click a line of descent → Biological/Adoptive control; toggle Adoptive → that
   drop dashes; toggle back → solid. Undo/redo works.
2. Click a partnership line → status control + (for Consanguineous) the degree
   input; switching status changes the glyph; degree renders above the double
   line.
3. Click a twin connector → zygosity select; changing it updates the connector;
   selecting a twin *person* shows the same zygosity in the individual panel, in
   sync.
4. Selected connection highlights in the accent colour; clicking empty canvas or
   an individual clears it; the two selection kinds never coexist.
5. `RelationshipPopup` no longer appears anywhere.

## Files touched

| File | Change |
|---|---|
| `src/stores/uiStore.ts` | Add `selectedConnection` + `selectConnection` / `clearConnectionSelection`; reset it in the individual-selection actions; remove the `relationshipPopup` slice + show/hide actions. |
| `src/components/connections/ConnectionsLayer.tsx` | Accept `selectedConnection` prop; forward to line components. |
| `src/components/connections/ParentChildLine.tsx` | Per-child-drop hit-testing + selection + highlight + cursor. |
| `src/components/connections/PartnershipLine.tsx` | Replace popup handler with `selectConnection`; add selected highlight. |
| `src/components/connections/TwinConnector.tsx` | Hit-testing + selection + highlight + cursor. |
| `src/components/canvas/CanvasContainer.tsx` | Subscribe `selectedConnection`; pass to `ConnectionsLayer`. |
| `src/components/ui/PropertiesPanel.tsx` | Top-level connection branch → render `ConnectionProperties`; refactor individual Twin section to shared `TwinZygosityFields`. |
| `src/components/ui/ConnectionProperties.tsx` | New — connection editors (parent-child / partnership / twin). |
| `src/components/ui/ConnectionProperties.module.css` | New (or reuse `PropertiesPanel.module.css`) — editor styles. |
| `src/components/ui/TwinZygosityFields.tsx` | New — shared zygosity + ungroup controls. |
| `src/App.tsx` | Remove `RelationshipPopup` import + mount. |
| `src/components/ui/RelationshipPopup.tsx`, `RelationshipPopup.module.css` | Delete. |
| `src/stores/uiStore.test.ts` | Remove `relationshipPopup slice` test block. |
| `src/stores/uiStore.connectionSelection.test.ts` | New tests. |

No new store action is required: the parent-child editor reuses `setLinkAdoptive`
(from #67); partnership/twin editors reuse `updatePartnership` / `updateTwinGroup`
/ `removeTwinGroup`.
