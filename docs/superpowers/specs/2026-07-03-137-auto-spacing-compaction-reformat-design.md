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
  out: cross-branch **gaps** (fixed by compaction) and a multi-union **hub**
  mess — `c912` has both spouses on one side with a sibling wedged between (fixed
  by re-tidying; order-preserving compaction alone cannot reorder). Hence the
  algorithm must be **tidy-all-families + compact**, not compaction alone.

---

## 2. Goals / non-goals

**Goals (PR1):**

- A pure function that produces a correct, tidy, compact layout of an entire
  document, fixing both bugs.
- Hard guarantee: **no non-partner node sits strictly between a couple's two
  partners** (`noNodeBetweenPartners`).
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
- A full Brandes–Köpf / Sugiyama rewrite of coordinate assignment.
- Any change to `svgExport.ts` — layout math is upstream of both renderers;
  svgExport has no layout of its own. (To be re-confirmed during implementation.)

---

## 3. Approach

**Chosen: A1 — document-level "tidy every family, then compact," delivered as a
pure function.** This is the tractable core of Brandes–Köpf horizontal
coordinate assignment (align each node toward the median of its neighbours across
*both* lineages, then compact) without importing the full layered algorithm. It
reuses the existing rigid-block, clamp, and obstacle machinery and does not
reopen the recursive frame-builder that #131 stabilised.

**Alternatives considered and rejected:**

- **A2 — integrate into the recursive frame** (recurse into a cross-branch
  in-law's family instead of pinning it). Fewer top-level moving parts, but it
  changes the meaning of "rooted at a family" and touches the core the #131
  invariant suite is pinned to → higher regression risk.
- **A3 — full Brandes–Köpf.** Highest fidelity for dense multi-founder DAGs, but
  a large rewrite, and pedigrees are not clean layered DAGs (partnerships, twins,
  consanguinity loops). Not warranted; the issue asks for "the tractable core."

**PR split** (per user decision — small, focused PRs):

- **PR1 (this spec):** the pure `reformatLayout` algorithm + `compactLayout` core
  + new fixtures + new invariants + docs. Fully unit-tested, no UI.
- **PR2 (follow-up):** `reformatDocument()` store action → ⌘K command + island
  control, one undo step. No auto-run on load.

---

## 4. PR1 detailed design

All new code lives in `src/utils/treeLayout.ts` (algorithm) and
`src/utils/__fixtures__/` (test surface). Positions are canvas-space; "moves"
maps return only nodes whose position changed, matching `computeTreeLayout`'s
existing contract.

### 4.1 `reformatLayout` — the composed entry point

```ts
/**
 * Lay out and compact an entire document. Enumerates every maximal founder
 * family, tidies each with the existing engine, merges them into one coordinate
 * space, then compacts (pull cross-branch couples together + remove global
 * slack). Returns only the nodes whose position changed.
 */
export function reformatLayout(
  doc: LayoutDoc,
  spacing?: LayoutSpacing,
): Record<string, { x: number; y: number }>;
```

Steps:

1. **Enumerate maximal founder families.** A founder-root union is one where
   every *present* partner is a founder (no parent link) — this includes
   partnerless-with-children unions (a founder sibship). Determined with the
   existing `isLoadBearingInLaw` predicate (a load-bearing partner has parents;
   a founder does not).
2. **Tidy each** via the existing `computeTreeLayout(doc, rootUnionId, spacing)`,
   applying its moves cumulatively into a working positions map. This fixes
   hub/sibling ordering that order-preserving compaction cannot.
3. **Compact** the merged positions with `compactLayout` (§4.2).
4. Return the diff vs. the document's stored positions (unchanged nodes omitted).

Determinism: founder roots processed in id order; ties broken by id everywhere.

### 4.2 `compactLayout` — the geometric core (pure, separately testable)

```ts
/**
 * Remove horizontal slack from an already-tidied, merged layout: pull
 * cross-branch couples together and compact each generation, without introducing
 * overlaps or crossings. Pure: takes absolute x per node, returns new absolute x
 * per node. Idempotent and anchor-stable.
 */
export function compactLayout(
  doc: LayoutDoc,
  positions: Record<string, number>,
  genOf: (id: string) => number,
  spacing?: LayoutSpacing,
): Record<string, number>;
```

Internally, operating on the shared `DescentBlock` partition
(`computeRigidBlocks`):

1. **Couple pull-together.** For each cross-branch couple (both partners placed
   and load-bearing, currently more than `PARTNER_SPACING` apart), translate the
   movable lineage subtree toward its spouse until the partners reach
   `PARTNER_SPACING`. **The movable unit is the spouse's whole founder-family
   subtree** — the nodes tidied from that founder root in §4.1 step 2 — moved as
   one; it may span several descent blocks. The shift is **clamped** (reusing the
   `clampShift` pattern from `centerAndReproject`) so no moving member comes
   within `minGap` of a foreign node in a shared row, and no descent line
   crosses. Deterministic choice of which side moves (e.g. the less-constrained /
   smaller subtree; id tie-break).
2. **`compactGenerations`** — the leftward dual of `separateGenerations`:

   ```ts
   /**
    * Pull rigid blocks left to remove slack: per generation row (top-down),
    * sort blocks by current x and slide each left until it is within `minGap`
    * of its left neighbour's right edge (or a fixed obstacle), never past.
    * Whole blocks move (descent stays vertical). Monotone in the pull-left
    * direction and idempotent (a tight row yields zero shifts). Mirror of
    * `separateGenerations`.
    */
   function compactGenerations(
     doc: LayoutDoc,
     finalX: Record<string, number>,
     genOf: (id: string) => number,
     minGap: number,
     blocks: readonly DescentBlock[],
   ): void;
   ```

3. **Re-centre + re-separate.** Run `centerAndReproject` then a final
   `separateGenerations` so no-overlap holds by construction after the pulls.
4. **Uniform re-anchor.** Translate everything so the document's anchor (root
   union centre / proband) returns to its pre-reformat x — no canvas jump.

`compactGenerations` and the couple-pull helper are **exported** as tested
primitives, mirroring how `resolveRowSeparation` is exported today.

### 4.3 Guarantees

- **Hard:** `noNodeBetweenPartners`.
- **Best-effort:** `boundedPartnerDistance`, `chartWidth` — taken as close as the
  no-overlap and no-crossing constraints allow. The documented over-constrained
  case stays *bounded*, not necessarily exactly `PARTNER_SPACING`.

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
  fails at 3.1×–6.9×. `maxFactor` tuned during TDD (target ≈≤2×).

`noNodeBetweenPartners` joins `checkAllInvariants` (a hard invariant all layouts
should satisfy). `boundedPartnerDistance` and `chartWidth` are compaction-specific
(only meaningful post-compaction) and run in the compaction suite, not the global
aggregate — some existing fixtures legitimately hold wide couples pre-compaction.

### 5.3 TDD plan (failing-first)

1. Write the three invariants.
2. Add the fixtures; assert `reportedLayoutBugs` **fails**
   `noNodeBetweenPartners`, `boundedPartnerDistance`, and `chartWidth` on
   *current* output (either raw stored positions or a single `computeTreeLayout`
   pass — both reproduce the bugs).
3. Implement `compactGenerations`, the couple-pull helper, `compactLayout`, and
   `reformatLayout` until all three fixtures are green on all three invariants.
4. **Regression guard:** run the full existing `ALL_FIXTURES × checkAllInvariants`
   suite — everything stays green. Confirm `noNodeBetweenPartners` also holds for
   every existing fixture (or classify it compaction-specific if any legitimately
   fails).
5. Idempotence + anchor-stability tests: `reformatLayout` applied twice equals
   once; the anchor node does not move (reuse `anchorStability`).

### 5.4 Docs

Update the **Auto-spacing** section of `docs/architecture-reference.md`: add the
compaction stage / `reformatLayout` to the pipeline description, and move the
"over-constrained cross-branch case" and width items out of "Known limitations"
(annotate as resolved by #137).

---

## 6. Risks & edge cases

- **Conflicting cross-branch couples.** Bringing one couple adjacent can widen
  another. Pulls are clamped and applied deterministically; the hard invariant is
  `noNodeBetweenPartners`, and couple distance is best-effort. Covered by the
  multi-founder fixture.
- **Multi-union hubs** (`c912`). Relies on the tidy-all step to order spouses
  around the hub; compaction preserves that order. A hub fixture forces this.
- **Consanguinity loops / partnerless founder sibships / disconnected
  components.** Already handled by the existing engine's cycle guards and obstacle
  logic; `reformatLayout` composes over them. Keep the existing `consanguinity`,
  `selfPartneredUnion`, `disconnectedComponents` fixtures green.
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
