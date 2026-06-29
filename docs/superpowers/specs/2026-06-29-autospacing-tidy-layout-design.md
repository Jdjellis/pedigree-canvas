# Auto-spacing: deterministic tidy layout

**Issue:** #55 — "layout spacing still wrong after add/reflow"
**Date:** 2026-06-29
**Status:** Approved (design)

## Problem

Auto-spacing is a patchwork of greedy, one-directional nudges applied per add
operation. The result is path-dependent (depends on the order people were added)
and only ever pushes nodes rightward and only ever re-centres one couple deep.
This produces the four reported failures:

1. **Sibling added beside a partnered person lands *between* the partners.**
   `RadialMenu.tsx` places a new sibling at `target.x + SIBLING_SPACING`
   (blindly rightward). If the target has a partner on that side, the sibling
   lands inside the union.

2. **Adding a child ignores clashes in the child's generation.**
   `addChildViaNewUnion` drops the child at the parent's x and runs only
   `respaceGenerationWithSubtrees`, which pushes right-only and never balances
   or centres. A child landing left of, or between, existing sibships is not
   cleanly separated.

3. **Drag has no constraints and no reaction.**
   `symbolDrag.ts` commits positions directly with zero collision/respace logic.
   A node can be dropped on top of another or inside a partnership.

4. **Siblings fan rightward instead of staying centred under the parent.**
   New siblings append at `maxX + SIBLING_SPACING`, and
   `centerParentsOverChildren` bails out entirely for single-parent unions
   (`respacing.ts` requires both partners present), so a one-parent family never
   re-centres.

The root flaw shared by all four: **there is no primitive that says "a sibship is
an evenly-spaced row centred under its parents, recursively."**

## Goals

- Adding a parent / partner / child / sibling produces a centred, overlap-free
  layout with no manual cleanup for the common cases.
- Each sibship is centred under its parents, at every generation, including
  single-parent unions.
- Dragging a node can only **reorder** it horizontally within its generation; it
  can never be dropped overlapping another node or inside a partnership.
- The whole operation (insert/drag + relayout) remains a single undo step.
- Layout is **deterministic from the relationship graph + current left-to-right
  order** — path-independent and idempotent (re-running on a tidy tree is a
  no-op, no jitter).

## Decisions (resolved during brainstorming)

- **Approach:** deterministic tidy layout (not targeted patches).
- **Auto-layout wins:** each structural add (and each drag) re-tidies the
  affected family from its structure. There is no per-node manual-position
  pinning.
- **Order-preserving relayout (safety refinement 1):** the tidy pass orders
  siblings and partners by their **current x**, so manual *ordering* and partner
  sides survive a relayout even though exact spacing is normalised. This is what
  makes "drag to reorder" meaningful.
- **Load-bearing in-law guard (safety refinement 2):** an in-law (married-in
  partner) that has its *own* parents present in the document is treated as a
  fixed anchor — the blood tree lays out relative to it rather than dragging it
  away from its own family.
- **Drag is a reorder gesture (constrain):** drag is horizontal-only (y locked
  to the generation row); the drop position sets order; the same tidy engine
  settles final positions. No separate drag-respace path.
- **Packaging:** one PR.

## Non-goals

- General pedigree-graph layout with consanguinity loops or a person marrying
  into two families. Multi-union (remarriage) is handled best-effort, not fully
  solved; documented as a known limitation.
- Free pixel-placement by drag. Drag controls *order*, not absolute position; a
  node cannot be parked at a deliberately non-tidy spot. This is an accepted
  consequence of "auto-layout wins".
- Re-parenting by drag (dragging a node into a different family). Drag reorders
  within the node's existing sibship / swaps partner sides only.

## Design

### Coordinate model

The tidy engine owns **both axes**:
- **x** — computed by the tidy-tree packing below.
- **y** — normalised to one row per generation:
  `y = rootY + (generation − rootGeneration) × GENERATION_SPACING`. This
  guarantees every generation is a straight horizontal line, which is what makes
  "drag horizontally within the row" well-defined.

Anchoring (below) keeps the canvas stable so assigning both axes does not make
the chart jump.

### The blood tree

The recursive unit is the **blood tree** rooted at the affected family's
founder. Married-in partners (in-laws) are not blood descendants; they ride
along beside their spouse. This is exactly the split `collectDescendants`
already models (it walks children through partnerships but excludes partners
married into the line). Exception: a **load-bearing in-law** (one with its own
parents present) is pinned, not floated (safety refinement 2).

### New module: `src/utils/treeLayout.ts` (pure)

A two-pass tidy-tree (Reingold–Tilford reduced to 1-D):

**Pass 1 — measure (post-order).** For each union with children:
1. Recursively lay out each child's subtree. Each subtree reports
   `{ center, leftExtent, rightExtent }` where the extents are the min/max node
   *center* x within that subtree.
2. Order the children **by their current x** (safety refinement 1), then place
   their subtrees left-to-right so that
   `nextBlock.leftExtent ≥ prevBlock.rightExtent + SIBLING_SPACING`. Leaf
   siblings (no descendants) have `leftExtent === rightExtent === center`, so
   adjacent leaves end up exactly `SIBLING_SPACING` apart — matching today's
   look.
3. `sibshipCenter = (firstChildCenter + lastChildCenter) / 2`.
4. Seat the union's partners centred on `sibshipCenter`: two partners at
   `sibshipCenter ∓ PARTNER_SPACING / 2`; a sole parent at `sibshipCenter`;
   a 0-partner (parentless) sibship has no partners and is centred on its own
   children's centroid. Partner left/right order is taken from current x, so a
   manual side-swap survives.
5. The union's subtree extent spans both the partners and the children blocks.

**Pass 2 — assign (pre-order).** Walk down assigning absolute x from relative
offsets, then translate the entire result so the **layout root keeps its current
x**. "Root x" means: for a founder individual, that individual's pre-layout x;
for a parentless-sibship root, the pre-layout centroid of the sibship's children.
The single translation that satisfies this is applied to every moved node. `y`
is assigned per generation row (see coordinate model).

**Consequences (by construction):**
- One tree packs into disjoint horizontal intervals → no cross-sibship overlap
  (fixes #2).
- Every sibship is centred under its parents at every level, including the
  sole-parent case (fixes #4).
- A newly added sibling just re-packs its row, so which side it was seeded on no
  longer matters (fixes #1).
- A dragged node re-packs into the order implied by its dropped x, never
  overlapping (fixes #3).
- Same structure + same order → same layout, always (path-independent,
  idempotent).

**Helpers (each unit-tested in isolation):**
- `findLayoutRoot(doc, nodeId): string` — walk parent links upward to the
  founder of the connected blood family containing `nodeId`. For a parentless
  sibship, the root is the sibship itself (anchor on its centroid).
- `orderChildrenByX(childIds, individuals): string[]` — safety refinement 1.
- `placeSiblingBlocks(childLayouts, siblingSpacing): Placed[]` — the edge-gap
  packing of pass-1 step 2.
- `centerCoupleOver(sibshipCenter, partners, partnerSpacing): Record<id, number>`
  — pass-1 step 4, preserving current side order.
- `isLoadBearingInLaw(doc, inLawId): boolean` — safety refinement 2.
- `layoutUnionSubtree(...)` — the recursion; returns member offsets + extents.
- `computeTreeLayout(doc, rootId, spacing): Record<id, {x, y}>` — top-level;
  returns id → new position for every node in the rooted blood tree plus the
  in-law partners attached to it. Only nodes whose position actually changes are
  returned (so callers can detect no-ops / idempotence).

### Store wiring (`src/stores/pedigreeStore.ts`)

One orchestration helper used by **both** adds and drag:

```
relayoutFamily(document, anchorId)
  → Record<string, Individual>   // new individuals map with moves applied
```

It resolves `findLayoutRoot(anchorId)`, runs `computeTreeLayout`, and applies the
moves via the existing `applyMoves` (extended to carry y as well as x).

- **Adds.** Every add operation (`addParentsForChild`,
  `addPartnerToIndividual`, `addChildToFamily`, `addSiblingViaNewUnion`,
  `addChildViaNewUnion`, `addParentsToParentlessUnion`) inserts the new node(s)
  and then calls `relayoutFamily` **inside the same `set(...)`** so insert +
  relayout collapse into one zundo history entry. `RadialMenu.tsx` initial
  placement becomes a seed only (it still establishes structure + a rough x to
  set order); the tidy pass owns final position, so the side-guessing logic for
  siblings is removed.
- **Drag.** On commit, the dragged node's x (set by the horizontal-only drag)
  determines its order; `relayoutFamily` then settles the family. This replaces
  the direct position commit in `symbolDrag.ts` with a store action
  (`commitDragWithRelayout`) so the dropped order + the settle land in one
  tracked update — preserving the existing "whole drag is one undo step"
  invariant.

### Drag input (`symbolDrag.ts` + the Konva symbol handler)

- Constrain live drag motion to **horizontal only**: the node's y is frozen at
  its generation-row value for the duration of the drag.
- On release, commit via `commitDragWithRelayout(id, droppedX)`.
- No `respaceAfterDrag` / couple-block-push logic is needed — the tidy engine
  handles seating.

### Retired

`src/utils/respacing.ts` is superseded by `treeLayout.ts`. Removed (with their
tests migrated or replaced by `treeLayout` tests):
- `respaceRow`, `respaceGeneration`, `respaceGenerationWithSubtrees`
- `makeRoomForPartner`
- `computeParentClearanceShift`
- `centerParentsOverChildren`

`collectDescendants` is **also retired**: the tidy recursion walks
`partnership.childrenIds` directly and never needs a flattened descendant set,
so nothing imports it after the rewrite. `src/utils/respacing.ts` and its test
are deleted in full.

## Testing (TDD)

Red → green on the pure helpers first, then store-integration tests, then drag.

**Pure `treeLayout.ts`:**
- `orderChildrenByX`: returns children sorted by current x; stable for ties.
- `placeSiblingBlocks`: leaves end exactly `SIBLING_SPACING` apart; subtrees with
  width are separated by their extents + spacing; empty / single inputs.
- `centerCoupleOver`: two partners, sole parent, preserves partner side order,
  no-op when already centred.
- `findLayoutRoot`: walks to founder; parentless sibship returns itself;
  married-in branch resolves to the blood founder.
- `isLoadBearingInLaw`: true when the in-law has a present parent union; false
  otherwise.
- `computeTreeLayout`: **idempotent** (tidy tree in → no moves out); root
  position preserved; even vs odd child counts; child subtrees carried; centring
  propagates up two+ generations; y normalised to generation rows; a
  load-bearing in-law is not relocated.

**Store integration — one per scenario + edges:**
- S1: sibling added to a partnered person ends outside the union, sibship
  centred. Mirror case (partner on the left).
- S1b: sibling of a person who has parents *and* a partner — stays in the
  parented sibship and clears the partner.
- S2: child added where the generation already holds a cousin sibship — no
  overlap; both sibships centred under their own parents.
- S4: add siblings repeatedly — row stays centred under the parent (single and
  couple), existing siblings shift left; sole-parent case included.
- Order preservation: after a manual reorder (sibling x's swapped), a subsequent
  add keeps the new order.
- Invariants: every add + relayout is a single undo step; relayout of an
  already-tidy family is a no-op.

**Drag (S3):**
- Horizontal-only: a drag that moves y is committed with y back on the row.
- Drop a node onto another → it reorders to an adjacent slot, no overlap.
- Drop a node "inside" a couple → it seats beside them in order; the couple is
  not split.
- Drop past a sibling → siblings reorder; row re-centres under the parent.
- The whole drag remains a single undo step.

## Open risks / notes

- **Broad motion (R2).** Re-tidying the whole connected family means one add or
  drag can shift distant branches. Accepted per "auto-layout wins". A later
  optimisation could scope the relayout to the edited sibship + its spine.
- **Multi-union / joined families (R3).** The single-root tidy pass lays out one
  blood tree; the load-bearing-in-law guard prevents the worst breakage (an
  in-law torn from its own family), but two deeply-interlinked blood trees are
  not jointly optimised. Documented best-effort.
- **No free placement.** Drag cannot park a node off-grid; only order is
  user-controlled. Accepted consequence of the tidy model.
