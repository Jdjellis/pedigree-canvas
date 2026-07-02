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

### Known limitations

- **Over-constrained cross-branch case**: when a sibship sits between a pinned
  in-law and a cousin, centering is clamped rather than exact — no-overlap wins
  over exact centering.
- **3+ child-bearing unions on one hub**: a single point cannot be at exactly
  `partnerSpacing` from three different spouses, so the exact partner-spacing
  aesthetic degrades for the 3rd+ union (sibships are still separated; only the
  aesthetic spacing widens).
- **Disconnected components**: an unrelated family that shares a generation row is
  treated as a fixed obstacle, so the rooted family may be translated sideways to
  clear it (no overlap or crossing results; the unrelated family never moves).

### Canonical test surface

`src/utils/__fixtures__/pedigrees.ts` — named fixture builders
(`coupleWithSibship`, `crossBranchMarriage`, `remarriageHalfSibs`,
`chainedWideCouples`, `twins`, `consanguinity`, `wideCousinFan`, and more;
exported as `ALL_FIXTURES`). Each fixture is a `{ doc, rootUnionId }` pair with
seed positions that reproduce a known bug or document a passing case.

`src/utils/__fixtures__/invariants.ts` — reusable invariant matchers
(`noSymbolOverlap`, `minSiblingSpacing`, `minPartnerSpacing`,
`generationRowAlignment`, `noCrossedDescentLines`, `subtreeNonCollision`,
`manualOrderPreserved`, `twinContiguity`, `anchorStability`,
`checkAllInvariants`). Framework-agnostic pure functions — no React, no Konva.

Both are consumed by `src/utils/__fixtures__/pedigrees.test.ts` /
`treeLayout.invariants.test.ts` (unit suite) and by
`e2e/layout-render-guard.spec.ts` (Playwright guard). **When changing layout,
add a fixture that exposes the new structure, then check it against the matchers
before merging.**
