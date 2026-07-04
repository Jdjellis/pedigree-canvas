# Pedigree Canvas — Architecture Reference

Detailed architecture notes and conventions. [`CLAUDE.md`](../CLAUDE.md) links
here and keeps a one-line index; read the relevant section below before touching
the area it covers.

## Canvas rendering & stores (react-konva gotchas)

These are non-obvious and have each cost real debugging time. Read before
touching canvas rendering, stores, or export.

- **react-konva + Zustand subscriptions silently fail.** react-konva uses a
  custom React reconciler (not react-dom), so a `useStore(selector)` subscription
  *inside* a Konva component updates the store but never repaints the canvas.
  Lift **all** Zustand subscriptions up to `CanvasContainer.tsx` (react-dom
  context) and pass data down as props. Use `useXStore.getState()` for
  imperative reads/writes inside event handlers only.

- **Never `import ... from 'konva'` directly.** It pulls in a second React copy
  and crashes with "Invalid hook call". Use the `react-konva` exports; intercept
  raw events in the capture phase instead of reaching for the Konva global.

- **`svgExport.ts` is a parallel renderer, not a wrapper.** It re-implements the
  canvas drawing for vector export, so any change to a symbol, label, legend, or
  layout must be made in **both** the Konva component and `svgExport.ts` or they
  drift. Because Konva can't render under jsdom, `svgExport` is also the real
  unit-test surface for rendering logic.

- **react-konva can't render under vitest/jsdom** (no canvas → `Stage` throws).
  Extract canvas logic into store-operating modules (e.g. `symbolDrag.ts`) and
  unit-test those, not the components.

## Feature flags

Toggles for experimental / discoverability affordances live in a single module,
`src/config/featureFlags.ts`, exporting a mutable `featureFlags` object. It's the
one source of truth so a feature can be turned on/off in one place instead of
threading props through the tree.

- **Reading a flag:** import `featureFlags` and branch on it at render/use time —
  e.g. `{featureFlags.altHint && <TwinBadge />}`. Read it live (don't snapshot it
  into module scope) so a change takes effect on the next render.
- **Adding a flag:** add the field to the `FeatureFlags` interface *and* the
  `featureFlags` object with a JSDoc note on what it gates and its default.
- **Testing a flag:** the object is intentionally mutable — set
  `featureFlags.myFlag = true` in a test and **reset it in `afterEach`** (module
  state leaks across tests otherwise). See `RadialMenu.altBadge.test.tsx` and
  `InlineGenderPicker.twin.test.tsx`.
- It's a plain object, not Zustand — components don't re-render when you mutate
  it at runtime. It's for build-time defaults (and per-test overrides), not live
  in-app toggling. Wire it to a store / query param / settings UI if that's
  needed later.

Current flags: `altHint` (the radial menu's ⌥ discovery badge — off) and
`twinsInGenderPopup` (MZ/DZ twin icons in the inline gender popup — on).

## Auto-spacing

> **New to layout?** Start with the guided, layered overview in
> [`auto-layout.md`](auto-layout.md) — mental model, the two engines, the
> invariants, the test surface, and the open residual — then return here for the
> execution-order pipeline detail below.

`computeTreeLayout(doc, rootUnionId, spacing?)` in `src/utils/treeLayout.ts` is
a **pure function** that takes a `LayoutDoc` slice and returns only the nodes
whose position changed (clean input → empty map). Because react-konva can't
render under jsdom, the layout logic is unit-tested here — not in components.
This is the crown-jewel test surface for the auto-spacing feature.

### The pipeline (in execution order)

1. **Tidy relative layout** (`layoutUnionFrame` / `layoutChildBlock`).
   Children are ordered by their current x (`orderChildrenByX`), or by
   `orderSiblingsWithTwins` when twin groups are present (twins are pulled
   into contiguous runs before packing). Child blocks are packed left-to-right
   with `packBlocks`. When a person has multiple child-bearing unions the
   frames are composed around the shared hub by `composeHubUnions`, which
   normalises each union to hub-at-0 then packs the non-hub footprints clear of
   one another — so remarriage sibships are separated rather than left at their
   seed position. A load-bearing in-law (one that has its own parents present in
   the document) is left pinned at its current x and treated as a fixed obstacle;
   it is never dragged into the laid-out frame.

2. **Generation-row resolution**. Nodes with a missing or NaN `generation`
   field are assigned a row by walking parent-child links upward to the nearest
   ancestor with a finite generation, then setting `row = ancestorRow + depth`.
   This feeds both the horizontal separation sweep (which buckets nodes by
   generation row) and the final y computation, so a node with no generation
   always lands on the correct row rather than collapsing onto the root row.

3. **`clearExternalObstacles`** — directional whole-frame clearance. Slides
   every placed node by a single uniform translation so the frame clears any
   pinned external family (nodes present in the doc but absent from the frame)
   in each shared generation row by at least `minGap`. The dominant side is
   chosen by comparing the mean x of the frame with the mean x of the external
   nodes; when pinned families exist on opposite sides only the dominant side is
   resolved (the internal separation sweep handles any residual cousin overlap).

4. **`centerAndReproject`** — centre sibships on couple midpoints, then
   re-separate. Processes unions top-down (shallower couples settle first so a
   chained wide couple picks up the parent's shift exactly once). For each union
   the desired shift is `coupleMidpoint − sibshipCentre`; the shift is clamped
   so no moving member comes within `minGap` of a foreign node (cousin block or
   pinned obstacle) on the shift side. After each generation's centring,
   `separateGenerations` re-runs immediately to restore no-overlap before the
   next generation centres — this is the "center-then-reproject" finishing stage.

5. **`separateGenerations`** — right-monotone per-row sweep over rigid descent
   blocks. Partitions every placed node into a `DescentBlock` (a couple, its
   sibship, and everything below, all moving as one unit). Rows are processed
   top-down; within each row blocks are sorted by current x and swept with the
   monotone `prevMax + minGap − minX` rule, so no-overlap is **guaranteed by
   construction** — not a hope. Pinned in-law nodes participate as fixed
   obstacles: they re-anchor the running edge without moving. This pass replaced
   the old `inLawClearanceShift` / `centerChildrenUnderWideCouples` patch passes
   (issue #115) which were overlap-blind.

6. **Uniform anchor + y-from-row**. The root union's current centre is kept
   fixed (no canvas jump) and each node's y is derived from its resolved
   generation row: `rootY + (gen − rootGen) × generationSpacing`.

### Whole-document reformat (`reformatLayout`, issue #137)

`computeTreeLayout` is **order-preserving** and rooted at a single blood family:
it deliberately pins a cross-branch in-law's family as a fixed obstacle, so it
cannot bring a couple whose *both* partners are load-bearing adjacent, and it
never compacts the slack between multiple founder families. That is by design —
it runs on every incremental edit and must respect the user's manual arrangement.

`reformatLayout(doc, spacing?)` in `src/utils/reformatLayout.ts` is a **separate,
new engine** for the explicit user-triggered "re-tidy" (the reformat action). It
is a layered (Sugiyama / Brandes–Köpf-style) layout that **is allowed to
reorder** rows, and fixes both #137 symptoms by construction:

1. **Layers** — bucket individuals by generation via the shared
   `resolveGenerationRows` helper (extracted from `computeTreeLayout`).
2. **Ordering** — partition each row into partnership **chains** (a couple, or a
   multi-union hub ordered between its spouses) and order the chains by an
   iterated, **row-size-normalised barycentre** of their cross-row neighbours. A
   no-neighbour founder spouse is skipped from the barycentre (it would otherwise
   skew the chain). This drops a cross-branch couple *between* its two families
   and keeps a hub's spouses straddling it.
3. **Coordinates** — pack each row tightly (partners at `PARTNER_SPACING`,
   otherwise `minGap`), then rigidly align rows over their neighbours. Because the
   invariants never require x-*centring* of parents over children (only correct
   ordering, spacing, no-overlap, bounded width), no full coordinate-assignment
   solve is needed.
4. **Anchor + y** — keep the document centroid's x fixed and derive y from the
   generation row, so the canvas does not jump.

Between steps 3 and 4 each connected family is refined per its shape (#141):

- a **plain hub-free family** is re-tidied through `computeTreeLayout`'s contour
  separation, which closes the flat row-packing's cousin-subtree overlaps;
- a component whose only non-plain feature is a **single cross-branch couple**
  (both partners load-bearing) keeps the aligned linear layout while that layout
  satisfies the hard invariants — it is the tightest form — and is otherwise
  **split at the cross union** into blood sides that are each re-tidied as a
  plain family and composed at the couple (`retidyCrossBranchComponent`; a
  consanguineous couple re-tidies as one family with a divergence-sibship bias
  that makes the couple's branches adjacent). Because this corrective changes
  the row order it hands the next pass, `reformatLayout` iterates internally to
  the engine's fixed point so the result stays idempotent;
- **hub and married-twin components** keep the aligned linear layout (the
  tracked residual 1b).

`reformatLayout` is **only** reached by the reformat trigger; the per-edit path
and its invariant suite are untouched. It satisfies every positional invariant
plus `noNodeBetweenPartners` **in its achievable form** — no *foreign*
(non-partner) node sits between a couple; a **hub** with 3+ same-row unions may
keep one of its own co-spouses between it and a non-adjacent spouse, which no
linear row can avoid (see Known limitations) — and is idempotent.

### Suggesting a reformat (the discovery-gap nudge)

`reformatLayout` is manual-only and free to reorder rows, so it is **never run
automatically** — auto-applying it would blow away the user's manual arrangement
(and auto-run on load was explicitly declined). But the order-preserving per-edit
engine *cannot* clear a foreign node wedged between a couple (the cross-branch /
multi-union-hub tangle), so a user could land in that state with no signal that a
reformat would fix it.

`shouldSuggestReformat(doc)` in `src/utils/reformatSuggestion.ts` closes that gap.
It is a focused **production** predicate that mirrors the `noNodeBetweenPartners`
invariant exactly (same `SYMBOL_SIZE / 2` tolerance, same hub co-spouse carve-out)
against the document's *current* positions, returning a boolean. The
`ReformatSuggestion` island (top-right, under `ActionsIsland`) subscribes to it and
shows a calm, dismissible **"Layout looks tangled → Reformat"** nudge whenever the
tangle is present — an opt-in prompt, never an automatic reformat. Visibility is
derived from the document, so the nudge vanishes the instant the tangle is gone
(reformat, undo, or manual fix); the ✕ is a one-shot dismissal, re-armed once the
layout is tidy again (`uiStore.reformatSuggestionDismissed`). The detector is kept
out of the test-only `__fixtures__/invariants.ts`; `reformatSuggestion.test.ts`
cross-checks the two agree on **every** fixture so they cannot drift, and
`e2e/reformat-suggestion.spec.ts` is the real-browser guard.

### Known limitations

- **Over-constrained cross-branch case** (single-family `computeTreeLayout` only):
  when a sibship sits between a pinned in-law and a cousin, centering is clamped
  rather than exact. Resolved for the whole document by `reformatLayout`, which
  lays out every family together and brings cross-branch couples adjacent.
- **3+ same-row unions on one hub** (both engines): a single point cannot be
  adjacent to — or at exactly `partnerSpacing` from — three spouses in a linear
  row, so the 3rd+ union's spouse is left non-adjacent. `reformatLayout` keeps
  the hub's other unions tidy and `noNodeBetweenPartners` permits the co-spouse
  between by construction, but the stranded spouse still trips `minPartnerSpacing`
  (its aesthetic spacing widens). Fixing it properly needs line-routing or hub
  duplication — tracked in [issue #141](https://github.com/Jdjellis/pedigree-canvas/issues/141).
- **A married twin** is excluded from `reformatLayout`'s `makeTwinsContiguous`
  post-pass (which pulls single-node chains only), so a non-twin sibling can
  tie-break between a coupled twin and its co-twin, violating `twinContiguity`.
  Also tracked in [issue #141](https://github.com/Jdjellis/pedigree-canvas/issues/141).
- **Disconnected components**: an unrelated family that shares a generation row is
  treated as a fixed obstacle, so the rooted family may be translated sideways to
  clear it (no overlap or crossing results; the unrelated family never moves).

### Canonical test surface

`src/utils/__fixtures__/pedigrees.ts` — named fixture builders
(`coupleWithSibship`, `crossBranchMarriage`, `remarriageHalfSibs`,
`chainedWideCouples`, `twins`, `consanguinity`, `wideCousinFan`, and more;
exported as `ALL_FIXTURES`). Each fixture is a `{ doc, rootUnionId }` pair with
seed positions that reproduce a known bug or document a passing case. The
whole-document reformat cases live in `REFORMAT_FIXTURES` (`reportedLayoutBugs`
— the real reported `layout-bugs.json` saved verbatim as an asset;
`farApartCrossBranchCouple`; `wideMultiFounderChart`).

`src/utils/__fixtures__/invariants.ts` — reusable invariant matchers
(`noSymbolOverlap`, `minSiblingSpacing`, `minPartnerSpacing`,
`generationRowAlignment`, `noCrossedDescentLines`, `subtreeNonCollision`,
`manualOrderPreserved`, `twinContiguity`, `anchorStability`,
`checkAllInvariants`, plus the #137 additions `noNodeBetweenPartners`,
`boundedPartnerDistance`, `chartWidth`). Framework-agnostic pure functions — no
React, no Konva.

These are consumed by `src/utils/__fixtures__/pedigrees.test.ts` /
`treeLayout.invariants.test.ts` (single-family engine) and
`src/utils/reformatLayout.test.ts` (the layered reformat engine), plus
`e2e/layout-render-guard.spec.ts` (Playwright guard). **When changing layout,
add a fixture that exposes the new structure, then check it against the matchers
before merging.**
