# Auto-spacing: horizontal compaction + reformat pedigree (issue #137)

**Issue:** [#137](https://github.com/Jdjellis/pedigree-canvas/issues/137) — follow-up
to #131.
**Status:** design approved 2026-07-03.
**Scope of this spec:** the layout-algorithm core (**PR1**). The user-facing
reformat action + UI is a separate follow-up (**PR2**), outlined here only for
context.

---

## 1. Problem

Two reported bugs share one root cause:

1. **A non-partner node renders between the two partners of a couple.**
2. **Very wide pedigrees with no way to reformat them.**

Both stem from **cross-branch marriages where both partners are load-bearing**
(each descends from its own family). The tidy-tree engine lays out each blood
family independently and anchors each partner in its own family; nothing
relocates a whole family to bring the couple adjacent, and there is **no global
horizontal compaction** to remove the slack between families.

### Root cause, verified against the source

- `separateGenerations` (`src/utils/treeLayout.ts`) is deliberately
  **right-monotone**: `need = prevMax + minGap − minX; if (need > 0) shift = need`.
  It only ever pushes blocks *rightward* to clear overlaps — there is no term
  that pulls a block *leftward* into empty space. Slack, once created, is
  permanent.
- In `layoutUnionFrame`, a load-bearing in-law is filtered out of `placeable`
  and left pinned where its own family put it. Nothing relocates a whole family
  to bring the two spouses of a cross-branch marriage adjacent.

### Key finding from probing the real bug document

Running the **real** `computeTreeLayout` against the reported `layout bugs.json`
(25 individuals, 12 partnerships, 6 generations) from the root that
`findRootUnion` resolves to:

- **`moved 1/25 nodes`.** A single-root layout call barely touches a
  multi-founder document — almost everything is pinned as an external obstacle.
  Therefore the fix **cannot** be "compact the existing single-family frame"; it
  must **lay out the whole document (every maximal founder family) and then
  compact.**
- Every reported symptom reproduced and was measured on current output:
  - `4a1d × ddf2` smoking gun: partners **1415 px** apart, both load-bearing.
  - `noNodeBetweenPartners` violations: `ae00` between `7a64`/`c912`;
    `7a64` **and** `ae00` between `2aa3`/`c912`.
  - Per-generation spans of 1655–1761 px across gens −3…0, i.e.
    **≈3.6×–10× `(n − 1) × minSpacing`** (gen 0, with only 3 nodes, is ~10×).
- Two distinct sub-problems surface, both from the doc never being globally laid
  out: cross-branch **gaps** and a multi-union **hub** mess — `c912` has both
  spouses on one side with a sibling wedged between.

A second prototype then disproved the first-cut "tidy each family, then compact"
plan:

- **Independent per-family layout + merge thrashes.** Laying out each of the four
  founder roots with `computeTreeLayout` and merging (last-wins) spread
  `4a1d × ddf2` from 1415 px to **1909 px** — each family re-anchors on its own
  root's centre, and those centres are far apart. Independent per-family layout is
  the wrong composition.
- **Both reported betweenness cases need reordering.** They are the `c912` hub
  (`625b`: ae00 between 7a64/c912; `f215`: 7a64+ae00 between 2aa3/c912). The fix
  is the row order `ae00, 7a64, c912, 2aa3` (spouses straddling the hub).
  **Order-preserving compaction cannot reorder**, so compaction alone cannot
  deliver the hard invariant for the actual reported cases.

**Conclusion:** the fix is a coherent **layered (Sugiyama / Brandes–Köpf-style)
layout** of the whole document that *orders* each generation row (reordering to
straddle hubs and minimise crossings) and then *assigns compact coordinates* —
not a post-pass on the existing per-family layout.

---

## 2. Goals / non-goals

**Goals (PR1):**

- A pure function `reformatLayout(doc)` that produces a correct, tidy, compact
  layout of an entire multi-founder document, fixing both bugs — **allowed to
  reorder** rows (it is an explicit user-triggered re-tidy, not an incremental
  edit).
- Hard guarantee: **no non-partner node sits strictly between a couple's two
  partners** (`noNodeBetweenPartners`) — including the reported `c912` hub cases,
  achieved by reordering spouses to straddle the hub.
- Best-effort guarantees: cross-branch couples brought within a small multiple
  of `PARTNER_SPACING`; per-generation chart width bounded to a small multiple of
  `n × minSpacing`.
- Idempotent (running it twice changes nothing the second time), anchor-stable
  (the root/proband does not jump), deterministic (id tie-breaks throughout).
- Failing-first tests grounded in the real bug document, plus a full regression
  guard over the existing fixture × invariant suite.

**Non-goals (PR1):**

- The user-facing reformat action, store wiring, ⌘K entry, and undo integration
  (**PR2**).
- Auto-running layout on document load (explicitly declined — manual reformat
  only).
- **Touching `computeTreeLayout`** — the incremental-edit engine stays as-is
  (order-preserving, #131 invariant suite intact). `reformatLayout` is a *new*
  coexisting engine reached only via the reformat trigger. Row-resolution logic
  is the one small piece extracted and shared.
- Any change to `svgExport.ts` — layout math is upstream of both renderers;
  svgExport has no layout of its own. (To be re-confirmed during implementation.)

---

## 3. Approach

**Chosen: a new layered layout engine, `reformatLayout`, that coexists with
`computeTreeLayout`.** It follows the classic Sugiyama pipeline with a
Brandes–Köpf-style coordinate stage: assign layers (generations), **order** each
row to minimise crossings and straddle hubs, then assign **compact coordinates**.
Ordering fixes the `c912` hub betweenness; the coordinate stage fixes width and
the cross-branch gaps. `computeTreeLayout` is **untouched** and remains the
order-preserving engine used on every incremental edit — only the reformat
trigger reaches the new engine, which keeps the #131 invariant suite intact.

**Alternatives considered and rejected (all disproven by prototype):**

- **Compaction post-pass on the existing layout** — order-preserving, so it
  cannot reorder the `c912` hub and cannot deliver the hard invariant.
- **Independent per-family layout + merge** — thrashes (1415 → 1909 px).
- **Extending the recursive frame (A2)** — handles cross-branch marriages but not
  the childless multi-union hub; the layered engine handles both uniformly.

**PR split:**

- **PR1 (this spec):** the `reformatLayout` engine + new fixtures + new invariants
  + docs. Fully unit-tested, no UI.
- **PR2 (follow-up):** `reformatDocument()` store action → ⌘K command + island
  control, one undo step. No auto-run on load.

---

## 4. PR1 detailed design

New code in a focused module `src/utils/reformatLayout.ts` (importing shared
helpers from `treeLayout.ts`), plus the test surface in `src/utils/__fixtures__/`.
Positions are canvas-space; the moves map returns only nodes whose position
changed, matching `computeTreeLayout`'s contract.

> The exact heuristics (crossing-reduction sweep count, coordinate-alignment
> iteration) are **finalised in TDD** against `layout-bugs.json` + the existing
> fixtures — this is a prototype-first build. The phase decomposition below is the
> committed architecture; per-phase numeric constants are tuned to green.

### 4.1 Entry point

```ts
/**
 * Lay out an entire multi-founder document with a layered (Sugiyama /
 * Brandes–Köpf-style) engine: layers → ordering → coordinates → anchor. Unlike
 * computeTreeLayout it MAY reorder rows (it is an explicit user-triggered
 * re-tidy). Returns only the nodes whose position changed. Deterministic.
 */
export function reformatLayout(
  doc: LayoutDoc,
  spacing?: LayoutSpacing,
): Record<string, { x: number; y: number }>;
```

### 4.2 Phase 1 — layers

Reuse the row-resolution logic **extracted** from `computeTreeLayout` into a
shared, exported helper (the one small refactor to the existing file):

```ts
/** Resolve every individual's generation row (finite `generation`, else walk
 *  parent links to the nearest known ancestor + depth; fallback otherwise). */
export function resolveGenerationRows(
  doc: LayoutDoc,
  fallbackGen?: number,
): Map<string, number>;
```

Bucket present individuals into rows keyed by generation. `computeTreeLayout` is
refactored to call this helper (no behaviour change — guarded by the existing
suite).

### 4.3 Phase 2 — ordering (crossing reduction + pedigree constraints)

Produce a left-to-right order of individuals per row. Seed from current x, then
run alternating down/up median (barycenter) sweeps that reorder to reduce
crossings, subject to hard constraints:

- **Partner adjacency:** the two partners of a union are adjacent; a person with
  multiple spouses (a **hub**, including childless unions like `c912 × 2aa3`) sits
  **between** its spouses (straddle). This is what fixes the reported betweenness.
- **Sibling contiguity:** children of a union form one contiguous group, centred
  under the couple.
- **Twin contiguity:** twin-group members stay contiguous within their sibship
  (reuse `orderSiblingsWithTwins`).

Output: an ordered `string[]` per row. Sweep count tuned in TDD; deterministic id
tie-breaks throughout.

### 4.4 Phase 3 — coordinates (align + compact)

Given the per-row orders, assign x:

- Place adjacent nodes at minimum spacing — partners at `PARTNER_SPACING`,
  siblings at `SIBLING_SPACING`, otherwise `minGap = max(SIBLING_SPACING,
  MIN_GENERATION_NODE_SPACING)`.
- Align each node toward the **median x of its cross-row neighbours** (parents,
  children, partners) — the Brandes–Köpf core — resolving conflicts by priority,
  then compact to remove slack.
- Iterated to convergence or a fixed cap (determinism); the cap is tuned in TDD.

Guarantees `noSymbolOverlap`, `minSiblingSpacing`, `minPartnerSpacing`,
`subtreeNonCollision`, `noNodeBetweenPartners`, and bounds width.

### 4.5 Phase 4 — anchor + y

Uniform translate so the anchor keeps its x (the proband if present, else the
topmost-leftmost root), so the canvas does not jump. `y = rowY(gen)` anchored on
the reference node's stored y and `generationSpacing`.

### 4.6 Guarantees

- **Hard:** `noNodeBetweenPartners`.
- **Best-effort:** `boundedPartnerDistance`, `chartWidth` — as close as the
  no-overlap and no-crossing constraints allow; the over-constrained case stays
  *bounded*, not necessarily exactly `PARTNER_SPACING`.

---

## 5. Test surface

### 5.1 Fixtures (`src/utils/__fixtures__/pedigrees.ts`)

- **`reportedLayoutBugs()`** — the real `layout bugs.json` saved verbatim as a
  fixture asset (`src/utils/__fixtures__/layout-bugs.json`) with a thin adapter
  that slices `{ individuals, partnerships, parentChildLinks, twinGroups }` into a
  `LayoutDoc`. The canonical failing-first case.
- **`farApartCrossBranchCouple()`** — minimal synthetic: two founder families, a
  cross-branch marriage between a child of each, seeded far apart with a sibling
  in the gap. Reproduces bug 1 + bug 2 in ~9 nodes.
- **`wideMultiFounderChart()`** — 3–4 founder families side by side with
  cross-branch marriages and slack. Reproduces bug 2.

New fixtures are exercised through `reformatLayout` (not `computeTreeLayout`),
so they get their own test list rather than joining `ALL_FIXTURES` (whose harness
runs the single-family engine). Existing `ALL_FIXTURES` behaviour is unchanged.

### 5.2 Invariants (`src/utils/__fixtures__/invariants.ts`)

- **`noNodeBetweenPartners(pos, doc, tol?)`** — HARD. For each union with both
  partners placed on the same y-row, no *other* individual on that row has x
  strictly within `(min(p1,p2) + tol, max(p1,p2) − tol)`; `tol ≈ SYMBOL_SIZE/2`.
  Correctly permits a multi-union hub between its own two spouses (each union's
  own partners are adjacent). Catches the real `ae00` / `7a64+ae00` violations.
- **`boundedPartnerDistance(pos, doc, spacing, maxFactor)`** — best-effort. For
  cross-branch couples (both partners load-bearing), `|Δx| ≤ maxFactor ×
  PARTNER_SPACING`. Currently fails at 11.8× (1415 px). `maxFactor` default tuned
  during TDD to the tightest value the real fixture actually achieves (target
  ~2–3×).
- **`chartWidth(pos, doc, spacing, maxFactor)`** — best-effort. Per generation
  row, `(max − min x) ≤ maxFactor × max(0, n − 1) × minSpacing`, where
  `minSpacing = max(siblingSpacing, MIN_GENERATION_NODE_SPACING)`. Currently
  fails at ≈3.6×–10×. `maxFactor` tuned during TDD (target ≈≤2×).

`noNodeBetweenPartners` joins `checkAllInvariants` (a hard invariant all layouts
should satisfy). `boundedPartnerDistance` and `chartWidth` are reformat-specific
(only meaningful after a full re-tidy) and run in the reformat suite, not the
global aggregate — some existing fixtures legitimately hold wide couples in their
pre-reformat single-family layout.

### 5.3 TDD plan (prototype-first, failing-first)

1. Write the three invariants.
2. Add the fixtures; assert `reportedLayoutBugs` **fails**
   `noNodeBetweenPartners`, `boundedPartnerDistance`, and `chartWidth` on its raw
   stored positions (they reproduce the bugs).
3. Build `reformatLayout` phase by phase (layers → ordering → coordinates →
   anchor), iterating against `layout-bugs.json` + the synthetic fixtures until
   all three are green on all three invariants. Prototype-first: the ordering and
   coordinate heuristics are tuned to green, then locked with assertions.
4. **Regression guard:** run the full existing `ALL_FIXTURES × checkAllInvariants`
   suite — everything stays green (`computeTreeLayout` is untouched). Assert
   `reformatLayout` output *also* satisfies `checkAllInvariants` +
   `noNodeBetweenPartners` on every existing fixture.
5. Idempotence + anchor-stability tests: `reformatLayout` applied twice equals
   once; the anchor node does not move (reuse `anchorStability`).

### 5.4 Docs

Update the **Auto-spacing** section of `docs/architecture-reference.md`: document
`reformatLayout` as the layered re-tidy engine (distinct from the per-edit
`computeTreeLayout`), and move the "over-constrained cross-branch case" and width
items out of "Known limitations" (annotate as resolved by #137).

---

## 6. Risks & edge cases

- **Crossing-reduction not converging / oscillating.** Cap sweep iterations and
  keep deterministic id tie-breaks so the result is stable and idempotent;
  assert idempotence in tests.
- **Multi-union hubs** (`c912`). The ordering phase must straddle a hub's spouses
  (including childless unions). A dedicated hub fixture forces
  `noNodeBetweenPartners`.
- **Conflicting cross-branch couples.** Bringing one couple adjacent can widen
  another; the hard invariant is `noNodeBetweenPartners`, couple distance is
  best-effort. Covered by the multi-founder fixture.
- **Consanguinity loops / partnerless founder sibships / disconnected
  components.** Guard graph walks against cycles; keep the existing
  `consanguinity`, `selfPartneredUnion`, `disconnectedComponents` fixtures green
  under `reformatLayout` too.
- **Anchor stability.** The final uniform re-anchor guarantees no canvas jump;
  asserted in tests.

---

## 7. Out of scope — PR2 (context only)

- `reformatDocument()` store action: call `reformatLayout(document)`, apply the
  moves as a single undo step.
- Expose via the ⌘K command registry (`src/commands/registry.ts`) +
  `useEditorActions` + an `ActionsIsland`/menu control. Optional keyboard
  shortcut.
- No auto-run on document load.
