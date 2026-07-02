# Design: correct-by-construction auto-spacing

- **Issue:** #131 — _Rethink auto-spacing: correct-by-construction layout + named-fixture test library_
- **Related:** #115 (concrete failing case), #109 / #105 (the wide-couple recentring that exposed it), #130 / #134 (the Playwright harness)
- **Date:** 2026-07-02
- **Status:** approved design; implementation plan to follow

---

## 1. Problem

`computeTreeLayout` in `src/utils/treeLayout.ts` is a Reingold–Tilford tidy tree
(`layoutUnionFrame` → `layoutChildBlock` → `packBlocks`) followed by **two
post-hoc patch passes** — `inLawClearanceShift` and
`centerChildrenUnderWideCouples` (#109). Each pass **translates already-placed
blocks with no re-separation and no collision check, then trusts the result.**

Because nothing verifies the outcome, every new pedigree shape can violate
spacing in a way no pass anticipated, and the only remedy is to bolt on another
pass. #115 is the proof: a cross-branch marriage where **both** partners are
load-bearing turns the pedigree from a *tree* into a *DAG* — the child has two
independent ancestral lineages, and a tidy-tree has no node that "owns" the
couple's horizontal position — so the recenter slides a sibship onto its cousins.

**Verified reproduction** (exact #115 fixture, run against the real code):

```
gen 2: kidA = 100.0   kidB = 100.0   |diff| = 0   ← two cousins drawn on top of each other
```

`centerChildrenUnderWideCouples` slides `kidA` from its packed position onto
`couple1`'s midpoint (x = 100), which is exactly where cousin `kidB` already sits.

## 2. Goal

A layout pass whose output is **correct by construction** for the pedigree
shapes we support — no overlaps, no crossed lineages, stable generation rows —
backed by a fixture-driven test suite that lets us define cases first and fix
them one at a time, each fixed case then standing as a permanent regression
guard.

## 3. What discovery established (grounding)

- The #115 collision reproduces exactly against the live code (above).
- **74 candidate scenarios** were ideated across 12 pedigree shape families;
  after verifying a sample against the real code, the genuine failure modes
  dedupe to:
  1. **Wide-couple recenter collisions** (the #115 / #105 family) — dominant and
     highest severity: exact overlap, sibling-order inversion, sub-minimum
     spacing, cousins present on both sides.
  2. **Generation-value fragility** — a missing/`NaN` `generation` collapses a
     child onto its parent's row (verified: `y = 0` instead of `150`, because
     `y` is derived purely from `generation`).
  3. **Cross-branch DAG ownership** — no tree node owns a both-load-bearing
     couple's x.
  4. **Anchor / order edge cases** — remarriage clearance breaking anchor
     stability; tie-breaks overriding manual order.
  5. **Degenerate inputs** — self-partnered union, disconnected components,
     partner generation mismatch (mostly "don't crash / don't silently
     misplace").
- Several *predicted* failures actually **pass today** and become regression
  guards: a 12-cousin wide fan holds `minGap = 80` exactly (packBlocks handles
  cumulative drift), and a plain first-cousin union centres the grandchild
  correctly. Discovery over-predicted; fixtures are classified by **verified**
  behaviour, not agent judgement.
- **Twins have zero layout logic today** — `treeLayout.ts` never reads
  `twinGroups`. Twins are positioned as ordinary siblings; the `TwinConnector`
  draws the MZ/DZ/unknown apex (Bennett §8) over wherever they land. A non-twin
  sibling can therefore be ordered *between* two twins.

## 4. Approach decision — hybrid, not full Brandes–Köpf

Two independent research angles converged on the same recommendation, chosen
over the constraint-based / Brandes–Köpf rewrite quoted in #115.

**Chosen: a hybrid** — keep the tidy-tree separation core; replace the two
unconstrained patch passes with (a) a **couple super-node** so a cross-branch
DAG marriage has one node that owns the couple's x (the root-cause fix for
#115), and (b) a **global per-generation separation projection** run *after* any
centering shift ("center-then-reproject"), making no-overlap a **hard invariant
of the pass**. This mirrors how kinship2 (the reference R pedigree tool)
structures the problem: separation + ordering are hard constraints, centering is
a soft penalty.

### Why not full Brandes–Köpf

BK is O(N), guarantees no overlap, is DAG-native, and is order-driven (fits our
manual-order requirement). But it is a from-scratch rewrite: its 2002 pseudocode
has two known erratum bugs (fixed in Brandes–Walter–Zink 2020), and it optimises
edge-straightness on generic layered graphs — **not** pedigree conventions
(couple adjacency, sibship centering, anchor stability, minimal move-map), all
of which we would have to re-derive on top. Higher risk for no correctness gain
on the shallow, narrow charts this app produces.

### Why the hybrid is not brittle

The current code is brittle because its patch passes move blocks and trust the
result. The hybrid differs by one structural fact: **the separation sweep is a
hard invariant enforced as the final step.** After any amount of centering, a
monotone left-to-right pass guarantees `x[i] ≥ x[i-1] + minGap` for every
adjacent pair in every generation row — a projection that mathematically cannot
leave an overlap, not a patch that might miss a case.

What remains *soft* is aesthetic only: a shift may cascade right rather than be
shared symmetrically, and a very wide DAG couple may open a large gap in the
grandparent row. These are "chart is wider / less balanced," never "symbols
overlap / lines cross," and are invisible on shallow clinical pedigrees.

### Low-regret

The invariant matchers and fixture library are **algorithm-agnostic**. If the
hybrid ever hits a wall, swapping the core for Brandes–Köpf later is a contained
change behind the same pure-function interface, validated by the same suite.

## 5. The invariant matchers (the contract)

Framework-agnostic pure predicates in `src/utils/__fixtures__/invariants.ts`,
each of the shape `(finalPositions, doc, spacing) → { ok: boolean; violations:
Violation[] }`, so **both** `treeLayout.test.ts` and the Playwright guard assert
against the identical rules. A `finalPositions(doc, moved)` helper merges the
move-map over the document's current positions (what today's tests do inline via
`moved[id]?.x ?? individuals[id].position.x`).

| Matcher | Rule |
|---|---|
| `noSymbolOverlap` | every same-generation pair ≥ `SYMBOL_SIZE` apart |
| `minSiblingSpacing` | adjacent siblings ≥ `SIBLING_SPACING` |
| `minPartnerSpacing` | an **ordinary** couple (both partners placeable) is exactly `PARTNER_SPACING` apart; a pinned load-bearing in-law is exempt (deliberately far — the wide-couple case) |
| `generationRowAlignment` | all nodes of a generation share one `y` (± tolerance); **no node on the wrong row** (catches NaN/undefined-generation) |
| `noCrossedDescentLines` | sibling x-order matches child-block order (the #115 inversion check) |
| `subtreeNonCollision` | sibships under different unions don't horizontally overlap |
| `anchorStability` | re-layout keeps the anchored node's x fixed |
| `manualOrderPreserved` | left-to-right order follows input x (id tie-break) |
| `twinContiguity` | members of a twin group are contiguous in their sibship order |
| `idempotence` | a tidy family yields an empty move-map |

Each fixture is checked against **all applicable matchers**, so a new shape
automatically stresses every rule.

## 6. The named-fixture library — `src/utils/__fixtures__/pedigrees.ts`

Each fixture is a builder returning `{ doc: LayoutDoc; rootUnionId: string;
twinGroups?: Record<string, TwinGroup> }`, built with the existing
`ind()/union()/link()` helper style, and imported by **both** the unit tests and
the Playwright guard (a shape defined once, protected at both altitudes).

The 7 named shapes from #131:

- `loneFounder` — single seed person
- `coupleWithSibship` — couple + N children
- `threeGenerations` — grandparents → parents → children
- `twins` — MZ/DZ pair under a sibship
- `marriedInWithParents` — a load-bearing in-law carrying its own parents
- `crossBranchMarriage` — both partners load-bearing → the #115 DAG collision
- `consanguinity` — a mating loop (double descent)

Plus the comprehensive set (verified failure modes / important guards):

- `wideCoupleAdjacentCousin` — exact #115 node-on-node overlap
- `wideCoupleInverted` — the looser sibling-order-inversion variant
- `chainedWideCouples` — child of a wide couple is itself a wide-couple partner
- `undefinedGenerationChild` — missing generation must resolve to the right row
- `remarriageHalfSibs` — one parent, two child-bearing unions
- `twinsWithSingletonSibling` — twins must stay contiguous past a non-twin sib
- `disconnectedComponents` — two families in one document
- `selfPartneredUnion` — degenerate; must not crash / misplace
- `wideCousinFan` — 12-cousin row; regression guard for cumulative drift

## 7. The algorithm — the hybrid as 4 pure passes

`computeTreeLayout` keeps its exact signature and its "return only the nodes
whose position changes" contract. Internally it becomes four passes; the two
patch functions (`inLawClearanceShift`, `centerChildrenUnderWideCouples`) are
deleted.

- **Pass 0 — Structure & ownership.** Build couples as **super-nodes**
  `{ left, right, ownerLineage }`. A deterministic spanning tree (reusing
  `findRootUnion`'s blood-line preference, id tie-break) decides who owns each
  couple's x. A both-load-bearing cross-branch couple (the DAG case) is owned by
  *neither* tree — its x is a free variable resolved by separation in Pass 2.
  Consanguinity loop-closing edges are recorded but never own a position, so the
  traversal is cycle-safe.
- **Pass 1 — Tidy relative layout.** The current
  `layoutUnionFrame`/`layoutChildBlock`/`packBlocks` recursion, generalised to
  operate on couple super-nodes so a couple has a single footprint. Order
  preserved via `orderChildrenByX`. This well-tested code is substantially
  unchanged.
- **Pass 2 — Global per-generation separation projection (the core fix).**
  Bucket every placed node by generation; sort each row by x (id tie-break,
  frozen from input order); run one monotone left→right sweep enforcing
  `x[i] ≥ x[i-1] + minGap` **between adjacent rigid blocks**. Move **rigid
  subtree blocks** (via `collectUnionDescendants`), never bare individuals, so
  descent lines stay vertical — and a couple's internal `PARTNER_SPACING` (set in
  Pass 1) is preserved, because the couple moves as one block rather than being
  separated within. `minGap` between blocks is `SIBLING_SPACING`, floored at
  `MIN_GENERATION_NODE_SPACING` (equal today: `SYMBOL_SIZE × 2 = 80`). The sweep
  never pulls a clear node left ⇒ idempotent and anchor-safe.
- **Pass 3 — Centering as a soft objective.** Top-down by generation, shift each
  sibship toward its parents'/couple midpoint, then **immediately re-run Pass 2**
  for that row and below. Centering requests; separation disposes. Overlap is
  impossible. Strictly one-shot per generation (no fixpoint iteration) so it
  cannot oscillate — settle upper generations before lower, matching the
  existing top-down ordering requirement.
- **Pass 4 — Anchor + y.** The existing uniform anchor translation
  (`currentAnchor − frameAnchor`, so the canvas does not jump) plus y derived
  from generation, **hardened** so a missing/`NaN` generation resolves to a
  derived row instead of collapsing to 0.

## 8. Twins (comprehensive scope)

A layout-**ordering** constraint only. Within a sibship, reorder so twin-group
members are contiguous (otherwise stable), satisfying `twinContiguity` so
`TwinConnector` draws a clean apex per Bennett §8. No rendering change. If any
*spacing* around the apex is introduced, `svgExport.ts` must mirror it (the
parallel-renderer gotcha in `CLAUDE.md` / architecture-reference).

## 9. Comprehensive hardening

- **Generation robustness** (Pass 4): missing/`NaN` generation resolves to the
  correct row.
- **Remarriage / second union**: a person's second child-bearing union's sibship
  is laid out rather than left in place, lifting today's documented best-effort
  limitation. Guarded by `anchorStability` + `manualOrderPreserved`.
- **Degenerate inputs**: self-partnered union, disconnected components, partner
  generation mismatch — proven to not crash and not silently misplace, each a
  fixture + matcher assertion.

## 10. Non-goals

- No full Brandes–Köpf / constraint-solver rewrite; no new runtime dependency.
- No change to twin *rendering* (`TwinConnector`, Bennett symbols) — ordering
  only.
- No change to `computeTreeLayout`'s signature or its "return only moved nodes"
  contract, so `relayoutFamily` and all callers in `pedigreeStore.ts` are
  untouched.
- No global re-solve of chart width/balance — the sweep is a local optimiser;
  slightly wider/less-balanced charts are acceptable.

## 11. Testing strategy — layered (per #131)

| Layer | Surface | Role | Volume |
|---|---|---|---|
| Pure layout | `computeTreeLayout` + `treeLayout.test.ts` + fixtures + matchers | The systematic TDD loop; invariant assertions | Many (crown jewels) |
| Interaction / render | Playwright harness (`e2e/`) | Proves the computed layout renders where computed | 1–2 cases |

**TDD loop:** write matchers → write fixtures → assert all invariants (watch
reds locally) → implement Pass 2, then Pass 3, then Pass 0 + twins, flipping
reds to greens one failure mode at a time.

**"Failing first, green after" without a red CI:** commit known-broken fixtures
as vitest `it.fails(...)` — green in CI *because* they currently violate the
invariant, which documents the bug — then flip `it.fails` → `it` in the commit
that fixes each mode. Git history shows failing-first; CI stays green; honours
"run tests before committing."

**Playwright render guard (acceptance criterion):** reuse the
`seedFreshStart` / `readPersistedDoc` spine; seed a fixture document into
`localStorage['pedigree-editor-autosave']` (verified to hydrate the app), then
assert the rendered node positions match `computeTreeLayout` for at least one
fixture — proving the computed layout actually renders where computed.

## 12. Files touched

- `src/utils/treeLayout.ts` — rewrite into Passes 0–4; delete
  `inLawClearanceShift` and `centerChildrenUnderWideCouples`.
- `src/utils/__fixtures__/pedigrees.ts` — new named-fixture library.
- `src/utils/__fixtures__/invariants.ts` — new reusable matchers +
  `finalPositions` helper.
- `src/utils/treeLayout.test.ts` — consume the fixtures + matchers.
- `e2e/` — new spec (1–2 render-guard cases) reusing `support/harness.ts`.
- `docs/architecture-reference.md` — new "Auto-spacing" section pointing at the
  fixture library as the canonical test surface.

## 13. Risks & mitigations

- **Rigid-block membership** is the one genuine subtlety: `collectUnionDescendants`
  must gather exactly the right descendants — under-collect shears a descent
  line, over-collect drags a pinned in-law. *Mitigation:* TDD converts this from
  a silent production bug into a red unit test (`noCrossedDescentLines`,
  `subtreeNonCollision`, and the both-parents-load-bearing fixture).
- **Idempotence depends on exact `minGap`:** if the sweep's gap differs by even
  1px from the spacing `packBlocks` used, a tidy family gets nudged and the
  idempotence test fails. *Mitigation:* `minGap` must equal
  `SIBLING_SPACING`/`PARTNER_SPACING` per adjacency type exactly; asserted by the
  `idempotence` matcher on every tidy fixture.
- **Determinism:** every row needs a total order; x-tie and priority-tie both
  fall back to id, and sort on a quantised x to avoid float drift flipping order.
- **Anchor vs sweep interaction:** the uniform anchor (Pass 4) and the right-only
  sweep must not reintroduce canvas-jump. *Mitigation:* `anchorStability` matcher
  on relayout fixtures.
- **Twin reorder / remarriage layout** change *arrangement*, so they could shift
  a chart a user expects to stay put. *Mitigation:* guarded by `anchorStability`
  + `manualOrderPreserved`; these are the only two pieces beyond pure overlap
  correctness.
