# Auto-spacing in Pedigree Canvas vs. kinship2's `align.pedigree`

> **Status:** discussion / analysis note, not a spec. Captures a side-by-side
> comparison of Pedigree Canvas's auto-layout engines against the R package
> **kinship2** (Terry Therneau's `align.pedigree`), to inform design decisions —
> in particular the open **residual 1b** and whether to adopt kinship2's
> node-duplication strategy (see [#149](https://github.com/Jdjellis/pedigree-canvas/issues/149) / [#150](https://github.com/Jdjellis/pedigree-canvas/issues/150)).
>
> **Read first:** [`auto-layout.md`](../auto-layout.md) (our engines) and
> [`architecture-reference.md` → Auto-spacing](../architecture-reference.md#auto-spacing).
> kinship2 line references are to `mayoverse/kinship2` (`R/align.pedigree.R`,
> `R/alignped1..4.R`, `R/kindepth.R`, `R/autohint.R`, `R/besthint.R`,
> `R/plot.pedigree.R`).

## The one-paragraph answer

Both systems turn family relationships into readable coordinates, but they sit at
opposite ends of three axes:

- **Interactivity.** Pedigree Canvas is an interactive editor with **two** engines
  — a stable per-edit engine (`computeTreeLayout`) and an on-demand re-tidy
  (`reformatLayout`) — that preserve the user's manual arrangement and are
  *idempotent*. kinship2 is a **batch, from-scratch, one-shot** function with no
  memory of a prior layout.
- **Representation.** Pedigree Canvas draws every person **exactly once** and
  treats "a person needs 3+ adjacencies" as an *unsolved residual* (1b).
  kinship2's escape hatch for exactly that case is to **draw the person twice and
  join the copies with a dashed arc**.
- **Paradigm.** Pedigree Canvas is *constraint-satisfaction* — a suite of pass/fail
  invariants plus idempotence, with a continuous barycentre relaxation for
  ordering. kinship2 is *cost-minimization* — a recursive block-pack finished by a
  global quadratic program, with a discrete hint-search (`autohint`/`besthint`)
  minimizing a scalar stress score.

## Structural correspondence

The cleanest mental model: **`computeTreeLayout` is the true analogue of
kinship2's `alignped` recursion** — both are recursive, contour/block-packing,
Reingold–Tilford-lineage layouts that pack sibships left-to-right and center
parents over children. Our *other* engine, `reformatLayout` (Sugiyama
barycentre), **has no counterpart in kinship2** — kinship2 decides ordering by
discrete hint search, never by continuous barycentre sweeps.

| Job | Pedigree Canvas | kinship2 | Same idea? |
|---|---|---|---|
| Assign generations (y) | `resolveGenerationRows` (trusts stored `generation` + parent-walk) | `kindepth(align=TRUE)` (longest-path + **active realign**) | Partly — see §3 |
| Decide left→right order | `reformatLayout` barycentre sweeps (§4) | `autohint` (greedy) + `besthint` (brute-force permutations) | No — continuous vs discrete |
| Recursive block layout | `computeTreeLayout` → `layoutUnionFrame` / `layoutChildBlock` / `composeHubUnions` | `alignped1` ↔ `alignped2` mutual recursion | **Yes** — closest match |
| Glue sibling blocks | `packBlocks` (monotone left-pack) | `alignped3` (per-level slide + overlap dedup) | Mostly |
| Final centering | `centerAndReproject` (local, clamped, top-down) | `alignped4` (global constrained **QP**) | Same goal, different math |
| Keep no-overlap | `separateGenerations` (rigid descent-block sweep) | QP min-gap constraints + `alignped3` `space=1` | Different mechanism |
| Handle "can't linearize" | **Leave residual** (1b) / bring branches adjacent | **Duplicate** person + dashed arc | **Fundamentally different** |

---

## 1. When it runs — interactive vs. batch

This is the difference everything else flows from.

- **kinship2** is a plotting function: hand `align.pedigree` a whole pedigree and
  it computes a layout from scratch, deterministically from structure + hints.
  There is no incremental edit, no "don't disturb what the user did," no stability
  across runs — indeed `besthint` *shuffles* founder permutations, so its output
  can vary run-to-run until it hits `tolerance`.
- **Pedigree Canvas** splits the job (see [`auto-layout.md`](../auto-layout.md) §2):
  - `computeTreeLayout` runs on **every edit**, is **order-preserving**, local, and
    returns *only the nodes that moved* (clean input → empty map).
  - `reformatLayout` runs **only on Reformat** (⌘K), is free to reorder, re-tidies
    the whole document, is **idempotent** (running twice moves nothing), and keeps
    the document centroid fixed so the canvas doesn't jump.

**Consequence.** Feed kinship2 the same family twice → identical from-scratch
redraw, indifferent to any prior arrangement. Pedigree Canvas *preserves* what the
user built and only nudges; the from-scratch tidy is opt-in and anchored. kinship2
has no analogue of our "reformat suggestion" nudge
([`reformatSuggestion.ts`](../../src/utils/reformatSuggestion.ts)) — a detector
that spots a tangle and *offers* a re-tidy without forcing it.

## 2. Spacing units and metrics

- **kinship2** works in **abstract units where 1 ≈ one symbol width**, with a
  **single uniform minimum gap of 1 unit** everywhere — siblings, spouses, and
  unrelated neighbours share the same floor. QP penalties then pull spouses tight
  and children toward parent-midpoints within that floor. Pixel scale is applied at
  render.
- **Pedigree Canvas** uses **absolute pixels with distinct, fixed gaps**
  ([`constants.ts`](../../src/utils/constants.ts)): symbol 40, sibling 80 (2×
  symbol), **couple 120 (3× symbol) — couples are drawn *wider* than siblings**,
  generation row 150 vertical, min same-row clearance 80.

**Consequence.** Opposite emphasis. kinship2 renders spouses *at the minimum gap*
(tight) and everything else at the same floor unless pushed apart. Pedigree Canvas
renders **couples deliberately wider than siblings** — a fixed visual rhythm. The
same family is metrically different between the two.

## 3. Generation / vertical (y) assignment

- **kinship2** computes depth structurally (`kindepth`: founders 0, else `1 +
  max(father, mother)` — longest path from a founder), then `align=TRUE` runs an
  **active correction pass**: it finds the shallowest married couple whose partners
  landed on different rows and *pushes the entire shallower subtree down* until they
  line up ("join in the middle"). It refuses to shift across a consanguinity loop
  (intersecting ancestor sets) — "a perfect alignment may not exist."
- **Pedigree Canvas** does **not** do this. `resolveGenerationRows`
  ([`treeLayout.ts:1088`](../../src/utils/treeLayout.ts)) trusts each individual's
  stored `generation` field (assigned incrementally by the store as the user builds)
  and only *derives* a row by walking parent links when the field is missing. There
  is no pass that detects "these spouses' lineages are unequal depth" and re-levels
  a subtree; `generationRowAlignment` *checks* that partners share a row but the
  engine relies on the field being correct rather than *repairing* it.

**Consequence.** For a marriage joining a 4-generation branch to a 2-generation
branch, kinship2 auto-slides the shorter branch down. Pedigree Canvas gets the
common case right because generations are assigned coherently at edit time, but has
no structural "re-level on marriage" safety net — vertical alignment is a property
of *how the document was built*, not something the layout re-derives. kinship2 is
more robust to arbitrary/imported structures; the app is more predictable and
cheaper but leans on its own edit-time bookkeeping.

## 4. Deciding left-to-right order (crossing reduction)

- **Pedigree Canvas (`reformatLayout`)** uses the classic **Sugiyama barycentre**
  method ([`reformatLayout.ts:162`](../../src/utils/reformatLayout.ts)): 6 sweeps
  alternating top-down (order each row by mean parent position) and bottom-up (by
  mean child position), positions **row-size-normalized** to `(i+0.5)/n`. Couples
  are pre-grouped into chains that can't split; twin- and component-contiguity are
  layered on top. A *continuous relaxation* toward few crossings.
- **kinship2** has **no barycentre step**. The `alignped` walk lays families out in
  a *fixed* hint-driven order. Optimization lives in the hint generators:
  - `autohint` — greedy top-down sweep that re-runs `align.pedigree` per level,
    shuffling siblings so marriages land on the sibship edge nearest the spouse and
    duplicate drawings are minimized.
  - `besthint` — brute-force search enumerating **every permutation of founding-
    mother order**, scoring each by `1000·(#dashed arcs) + 10·(arc length) + 1·(parent
    bend)` and keeping the minimum. Factorial in founder count, so opt-in.

**Consequence.** The app minimizes crossings by smoothly relaxing continuous
positions (cheap, deterministic, heuristic, no global objective); kinship2 by
discrete search over orderings scored by a real cost (can be globally better, but
exponential and non-deterministic run-to-run until tolerance).

## 5. Single placement vs. duplication — the headline difference

Give either system a shape where one person structurally needs 3+ adjacencies (a
3+-marriage hub, a cousin marriage joining distant branches, a married twin):

- **kinship2 draws the person more than once.** Independent `alignped1` subtrees
  each place the person; `alignped3` merges only copies that land *adjacent*, so
  non-adjacent recurrences survive as separate plotting points, and `plot.pedigree`
  connects the copies with a dashed parabolic arc (`arcconnect`). Duplication is a
  first-class, always-available fallback — it guarantees *a* layout for *any*
  topology, at the cost of visual noise.
- **Pedigree Canvas never duplicates.** Every person is one symbol. When a shape
  can't be linearized, the engine either brings the blood branches physically
  adjacent (§9) or **leaves a known, bounded residual** — this is **residual 1b**
  ([`auto-layout.md`](../auto-layout.md) §5): a 3+-union hub or a married twin keeps
  a valid-but-suboptimal linear layout. The proper fix would need "hub-node
  duplication … a new rendering concept [touching] `CanvasContainer`,
  `svgExport.ts`, and every invariant — deferred against its blast radius."

**This is the deepest divergence.** kinship2: *always produce a drawing, duplicate
if you must.* Pedigree Canvas: *one symbol per person always; if that forces a
compromise, keep it clean and bounded and flag the residual rather than duplicate.*
A genetic counselor comparing outputs sees it immediately — kinship2 renders dashed
"same person" arcs on complex consanguinity; Pedigree Canvas renders a single
symbol with branches pulled together (and, on the rare unsolved hub, a wider gap
rather than a duplicate).

## 6. Centering parents over children

- **kinship2** makes this a *primary objective*. Unpacked mode centers exactly;
  packed mode defers to `alignped4`'s QP, whose penalty `(1/k^1.5)·Σ(xᵢ −
  (p1+p2)/2)²` pulls every child toward the midpoint of its two parents, globally,
  balanced against spouse-togetherness. The `k^{-1.5}` weighting makes *large*
  sibships slightly easier to slide than small ones — a deliberate aesthetic.
- **Pedigree Canvas** centers *locally and by construction*, not as a global solve.
  `reformatLayout`'s coordinate phase does **not** center — "the invariants never
  require x-centring of parents over children" — its `alignPass` just slides each
  row *rigidly by the mean offset*
  ([`reformatLayout.ts:245`](../../src/utils/reformatLayout.ts)). Real centering is
  delegated to `computeTreeLayout`'s `centerAndReproject`, which per union top-down
  computes `shift = coupleMidpoint − sibshipCentre`, **clamps** it so no child comes
  within `minGap` of a foreign node, applies it, and re-separates.

**Consequence.** kinship2's centering is a *global soft trade-off* — a parent may
end up slightly off-center to satisfy competing pulls, everything settles together.
The app's is *greedy, local, clamped* — each couple centered under its children
unless a neighbour blocks it, then it stops short rather than negotiate globally.
kinship2 looks more balanced on wide symmetric families; the app is more
predictable and never lets centering create an overlap.

## 7. Couple placement and the spouse-side convention

- **kinship2** picks the spouse's side by **sex convention** by default: a lone
  female subject gets her husband on the **left**, a lone male gets his wife on the
  **right** (`alignped1`, `nleft = floor((#spouses + (sex==2))/2)`), overridable by
  a hint anchor. Multiple spouses split roughly evenly to both sides. Spouse-ness is
  carried through the recursion as a `+0.5` hash on the id, un-packed at the top.
- **Pedigree Canvas** has **no gender convention in placement**. Couples are kept
  adjacent as a chain ordered by seed-x / barycentre; which partner is left is
  positional. Couples sit at exactly `PARTNER_SPACING`; a hub sits *between* its
  spouses.

**Consequence.** kinship2 encodes a Bennett-ish standardized couple orientation for
free; Pedigree Canvas leaves orientation to the user's arrangement and only
guarantees adjacency + spacing.

## 8. Multiple marriages / hubs

- **kinship2** splits a subject's spouses around them (some left, some right),
  children under each marriage, and duplicates the hub if the topology can't
  linearize.
- **Pedigree Canvas** `composeHubUnions` packs unions around a shared hub at local
  x=0, each union's spouse+sibship packed clear
  ([`treeLayout.ts:357`](../../src/utils/treeLayout.ts)). For 3+ unions it is
  **residual 1b** — a point can't have 3 neighbours on a line, so the 3rd+ union's
  spouse is stranded with a co-spouse between (achievable form).

## 9. Consanguinity / cross-branch marriage

- **kinship2** flags a shared-ancestor couple `spouse=2` → **double connecting
  line**; `kindepth` refuses to realign across the loop; and duplicates the shared
  individual with a dashed arc if it can't linearize.
- **Pedigree Canvas** has a purpose-built coordinate phase,
  `retidyCrossBranchComponent`
  ([`reformatLayout.ts:553`](../../src/utils/reformatLayout.ts)): split at the cross
  union, then either lay out two unrelated blood sides separately and compose them
  (`retidyTwoSided`), or, for true consanguinity, **spine-bias seed** each branch's
  lineage to opposite edges (`±SPINE_BIAS`) so the couple's branches end up adjacent
  — all as a **single copy** of every person, bounded by `boundedPartnerDistance`.
  The double line is a render concern (`CONSANGUINITY_GAP`), decoupled from layout.

**Consequence.** Same clinical signal (double line), opposite layout strategy.
kinship2's robustness comes from duplication + dashed arcs; the app's from
*geometric adjacency of single symbols within a bounded width*. The app's result is
cleaner but has an unsolved corner (consanguineous sib-union / married twin →
residual 1b); kinship2 always draws something but accepts the noise.

## 10. Twins

Closest convergence. Both keep twin groups **contiguous** and render a shared apex,
an MZ bar, and a `?` for unknown zygosity.

- **kinship2**: `autohint` clusters a twinset with fractional `horder`
  (6.01, 6.02…), moves the whole set together via `shift`, drags the MZ subset along
  inside a DZ set (`monoset`).
- **Pedigree Canvas**: `orderSiblingsWithTwins` / `makeTwinsContiguous` pull members
  into a contiguous run and **orient couples so a spouse can't land between twins**
  ([`reformatLayout.ts:1171`](../../src/utils/reformatLayout.ts)).

**Edge difference.** A **married twin**: kinship2 handles it via shift/monoset (and
duplication if needed). Pedigree Canvas's `makeTwinsContiguous` only pulls
*single-node* chains, so a non-twin sibling can tie-break between a coupled twin and
its co-twin — the `twinContiguity` half of residual 1b
([#150](https://github.com/Jdjellis/pedigree-canvas/issues/150)). kinship2 is more
robust here.

## 11. Optimization paradigm & failure modes

| | Pedigree Canvas | kinship2 |
|---|---|---|
| **Objective** | Satisfy a suite of pass/fail **invariants** + idempotence ([`invariants.ts`](../../src/utils/__fixtures__/invariants.ts)) | Minimize a scalar **stress cost** (`besthint`) / QP energy (`alignped4`) |
| **Ordering search** | Continuous barycentre relaxation | Discrete permutation search (factorial, opt-in) |
| **Final placement** | Local clamped centering + rigid separation | Global constrained quadratic program |
| **Verification** | Property-based testing + standing green gate + adversarial discovery harness | Inline special-casing; historical edge-case patches |
| **Hard failures** | None — always emits a valid (possibly suboptimal) layout; never crashes, never duplicates | Can `stop()` on impossible pedigrees; requires 0-or-2 parents; QP wrapped in `tryCatch` fallback |
| **Escape hatch** | Leave a *bounded, flagged* residual | Duplicate the person + dashed arc |

**Consequence.** Pedigree Canvas is engineered for an interactive product — it
cannot throw at the user, is idempotent, is machine-verified against a formal spec,
and prefers a clean bounded compromise over a noisy-but-complete drawing. kinship2
is engineered for a statistician's batch plot — it produces a drawing for
essentially any valid pedigree (duplicating and dash-arcing where necessary), can
hard-error on malformed input, and optimizes a genuine global cost when you pay for
`besthint`.

---

## 12. Net summary — where each wins

**kinship2 does things the app doesn't:**

- Actively re-levels generations across unequal-depth marriages (`kindepth
  align=TRUE`).
- Always produces a layout for *any* topology via duplication + dashed arcs
  (3+ hubs, married twins, arbitrary consanguinity) — the app's residual 1b.
- Global cost-optimal ordering via `besthint` (minimizes duplicate arcs /
  parent-bend).
- Global QP centering balancing all constraints simultaneously.
- Sex-convention default couple orientation.

**Pedigree Canvas does things kinship2 doesn't:**

- Interactive, incremental, order-preserving updates that respect the user's manual
  arrangement.
- Idempotent, canvas-stable re-tidy (no jump) with an opt-in "layout looks tangled"
  nudge.
- One symbol per person, always — no dashed duplicate arcs; cleaner consanguinity
  via geometric adjacency within a *bounded* width.
- A formal, machine-checked invariant spec + property/adversarial testing rather
  than accreted special-casing.
- Distinct, deliberate spacing rhythm (couples wider than siblings) rather than a
  uniform 1-unit floor.
- Never hard-fails.

The trade is coherent: **kinship2 optimizes completeness and global aesthetics for
a batch plot, accepting duplication and occasional hard errors; Pedigree Canvas
optimizes interactive stability, single-symbol cleanliness, and verifiable
correctness for a live editor, accepting a small set of bounded, explicitly-tracked
unsolved topologies (residual 1b) in exchange for never duplicating a person.**

## 13. Implication for residual 1b

kinship2 is **direct prior art** for the node-duplication fix option floated in
[#149](https://github.com/Jdjellis/pedigree-canvas/issues/149) /
[#150](https://github.com/Jdjellis/pedigree-canvas/issues/150): its entire strategy
for the shapes we leave as residual 1b is to duplicate the over-constrained
individual and connect the copies with a dashed arc. Adopting it would trade our
"one symbol per person" guarantee for kinship2-style completeness. The decision is
as much **clinical** as it is **technical** (blast radius across `CanvasContainer`,
`svgExport.ts`, the layout→doc contract, and every invariant — copies must count as
one logical node).

**Clinical-standards finding (checked July 2026).** The Bennett/NSGC standard
(1995 / 2008 / 2022) is **silent** on representing an individual more than once —
it is *not* a standardized convention; kinship2's duplicate-symbol + dashed-arc is
that software's layout convenience, not a sanctioned notation. See
[`bennett-pedigree-standards.md`](../bennett-pedigree-standards.md) §15 for the
sourced write-up. Two consequences: (1) a duplication feature would be
**non-standard** and needs an explicit label/legend key; (2) it **must not reuse a
dashed connector** — a dashed line already means *adoptive/nonbiological* in this
standard (§9), so it would collide. Silence is not prohibition (repeating a person
is common in complex consanguinity drawings), but the notation must be *designed*,
not copied. Design discussion continues on #149.
