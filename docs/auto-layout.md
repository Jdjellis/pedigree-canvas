# Auto-Layout & Spacing — a guided tour

This is the **entry-point** for how Pedigree Canvas positions symbols on the
canvas automatically. It is written to be read top-to-bottom by someone new to
the codebase — a developer or a genetic counselor — and then to hand off into
the code, invariants, and tests for the full detail.

> **Where to go for depth**
> - The execution-order pipeline and react-konva gotchas live in
>   [`architecture-reference.md` → Auto-spacing](architecture-reference.md#auto-spacing).
> - Every rule the layout must satisfy is a pure function in
>   [`src/utils/__fixtures__/invariants.ts`](../src/utils/__fixtures__/invariants.ts).
> - Every shape we lay out is a named fixture in
>   [`src/utils/__fixtures__/pedigrees.ts`](../src/utils/__fixtures__/pedigrees.ts).
> - Symbol/line standards come from
>   [`bennett-pedigree-standards.md`](bennett-pedigree-standards.md).

---

## 1. The mental model

A pedigree is a family tree drawn with clinical conventions. Auto-layout's job
is to turn the *relationships* a user enters (who partners whom, whose child is
whose) into *coordinates* that read cleanly, without the user hand-placing every
symbol.

The whole engine thinks in five nouns. Learn these and the rest follows:

| Term | Meaning | In code |
|---|---|---|
| **Generation row** | A horizontal band; everyone the same number of steps from the founders shares one y. | `resolveGenerationRows` |
| **Union** (partnership) | A couple — an edge between two people on the same row. May bear children. | `PartnershipRelationship` |
| **Sibship** | The set of children of one union; they share a row and sit under their parents. | `siblingsOf` |
| **Twin group** | Siblings that must be drawn side-by-side (contiguous) with a shared apex. | `TwinGroup`, `orderSiblingsWithTwins` |
| **Load-bearing in-law** | A partner who is *also* a blood descendant elsewhere in the chart (has their own parents present). Their position is constrained by two families at once. | `isLoadBearingInLaw` |

Two shapes matter because they are *hard* to place and drive most of the
engine's complexity:

- **Multi-union hub** — one person with several unions on the same row (serial
  partners, or a common ancestor married into more than one branch). A hub wants
  to sit next to *all* of its partners, but a point on a line has only two
  neighbours.
- **Cross-branch couple** — a union where *both* partners are load-bearing (two
  blood branches joined by a marriage — cousin marriages, consanguinity). Both
  subtrees below want to stay contiguous *and* the couple wants to stay adjacent.

Almost everything subtle in layout — and every remaining bug — comes from these
two shapes. Keep them in mind.

---

## 2. Two engines, two jobs

There are **two** layout functions. They exist for different moments and have
different freedoms.

| | `computeTreeLayout` | `reformatLayout` |
|---|---|---|
| **File** | [`src/utils/treeLayout.ts`](../src/utils/treeLayout.ts) | [`src/utils/reformatLayout.ts`](../src/utils/reformatLayout.ts) |
| **When it runs** | On **every incremental edit** (add a person, drag, link). | Only when the user hits **Reformat** (⌘K / actions island). |
| **May it reorder a row?** | **No** — order-preserving. Respects the user's manual arrangement. | **Yes** — free to reorder for a from-scratch tidy. |
| **Scope** | One blood family, rooted at a union; pins other families as fixed obstacles. | The **whole document** at once; pulls families together, compacts slack. |
| **Style** | Contour / descent-block separation (Reingold–Tilford lineage). | Layered (Sugiyama / Brandes–Köpf lineage): layer → order → coordinate. |

Why two? Because the per-edit engine must be *stable and local* — it can't yank
the user's layout around on every keystroke, so it deliberately **won't**
reorder rows or bring a cross-branch couple together. That restraint is also its
limitation, which is exactly what `reformatLayout` exists to fix on demand.

### `computeTreeLayout` — the per-edit contour engine

A pure function: `computeTreeLayout(doc, rootUnionId, spacing?)` returns *only
the nodes whose position changed* (a clean input returns an empty map). Its
pipeline, in execution order, is documented step-by-step in
[architecture-reference.md → The pipeline](architecture-reference.md#the-pipeline-in-execution-order).
The load-bearing idea is **`separateGenerations`**: it groups each couple + its
sibship + everything below into a rigid *descent block* and sweeps each row
left-to-right so blocks never overlap — no-overlap **by construction**, not by
hope.

### `reformatLayout` — the whole-document re-tidy

`reformatLayout(doc, spacing?)` runs three classic layered phases
([`reformatLayout.ts`](../src/utils/reformatLayout.ts)):

1. **Layer** — bucket everyone by generation (`resolveGenerationRows`).
2. **Order** — within each row, group people into partnership **chains** so
   couples stay adjacent (`buildChains`), then order the chains by an iterated,
   row-size-normalised **barycentre** of their cross-row neighbours. This drops a
   cross-branch couple *between* its two families and keeps a hub straddled by its
   spouses.
3. **Coordinate** — pack each row tightly, then reconcile subtrees. Plain
   families are re-tidied through `computeTreeLayout`'s contour separation;
   a lone cross-branch couple gets a purpose-built coordinate phase
   (`retidyCrossBranchComponent`); everything is iterated to a fixed point so the
   result is **idempotent** (running it twice moves nothing).

The engine keeps the document centroid fixed so the canvas doesn't jump.

> **Nudge, don't auto-run.** `reformatLayout` is never triggered automatically —
> that would blow away the user's manual arrangement. When the cheaper per-edit
> engine leaves a foreign node wedged between a couple, `shouldSuggestReformat`
> ([`src/utils/reformatSuggestion.ts`](../src/utils/reformatSuggestion.ts))
> surfaces a dismissible *"Layout looks tangled → Reformat"* prompt instead. See
> [architecture-reference.md → Suggesting a reformat](architecture-reference.md#suggesting-a-reformat-the-discovery-gap-nudge).

> **⚠️ Parallel renderer.** [`src/io/svgExport.ts`](../src/io/svgExport.ts)
> re-implements rendering for vector export. Any change to symbols, labels,
> legend, or layout must be mirrored there or the canvas and the SVG drift apart.
> See CLAUDE.md.

---

## 3. What "correct" means — the invariants

The engine's definition of a good layout is not prose — it is a set of **pure
predicate functions** in
[`src/utils/__fixtures__/invariants.ts`](../src/utils/__fixtures__/invariants.ts),
each returning `{ ok, violations }`. This is the machine-checkable spec; read a
function to know *exactly* what a rule permits (including its tolerance).

**Correctness** — a violation means the drawing is *wrong* (symbols overlap,
lines cross). These can never be relaxed:

| Invariant | Rule (plain language) |
|---|---|
| `noSymbolOverlap` | No two symbols on the same row are closer than one symbol width. |
| `subtreeNonCollision` | Two cousin sibships never horizontally overlap (ancestor/descendant pairs exempt). |
| `noCrossedDescentLines` | For two unions on a row, the left one's children stay entirely left of the right one's — descent lines don't cross. |
| `generationRowAlignment` | Both partners share a row; all children of a union share a row; children sit below both parents. |
| `minSiblingSpacing` | Adjacent siblings are at least `siblingSpacing` apart. |
| `noNodeBetweenPartners` | No *foreign* (non-partner) node sits between a couple. *(See "achievable form" below.)* |

**Aesthetic / stability** — a violation reads worse but is not geometrically
wrong; some are best-effort and tuned to what a compacted layout actually
achieves:

| Invariant | Rule (plain language) |
|---|---|
| `minPartnerSpacing` | Ordinary couples sit at exact `partnerSpacing`. *(Achievable form for hubs — below.)* |
| `twinContiguity` | All members of a twin group form a contiguous run in their sibship. |
| `boundedPartnerDistance` | A cross-branch couple is no wider than `maxFactor × partnerSpacing`. |
| `chartWidth` | No row spans more than `maxFactor × (n−1) × minSpacing` — bounds overall width. |
| `manualOrderPreserved` | A re-tidy keeps the user's left-to-right sibling order. |
| `anchorStability` | The anchor individual doesn't jump on relayout. |

`checkAllInvariants` runs the six positional invariants together; `twinContiguity`
and the order/anchor rules take extra inputs and are called explicitly.

### "Achievable form" — why two rules were redefined

Two invariants originally asserted something **geometrically impossible** for a
multi-union hub, so they were redefined to what a line layout *can* achieve
(issue #141):

- **`noNodeBetweenPartners`** — a hub with 3+ same-row unions can be adjacent to
  at most two spouses, so a *co-spouse* necessarily sits between it and any
  further spouse. The rule now permits exactly that one case (a co-spouse of a
  genuine ≥3-union hub) while still flagging any foreign node — the real bug.
- **`minPartnerSpacing`** — for the same reason, a hub's 3rd+ union is permitted
  a gap up to `(degree − 1) × partnerSpacing`; ordinary couples still require
  exact spacing.

This "redefine the oracle to the achievable target" move is the pattern behind
several of the closed residuals. See the docstrings in `invariants.ts` for the
precise conditions.

---

## 4. How it's verified — the test surface

Because react-konva can't render under vitest/jsdom, **the layout logic is
tested as pure store-operating functions, not through components.** There are
three layers of verification, from hand-picked to machine-found.

### a. Named fixtures (example-based)

[`src/utils/__fixtures__/pedigrees.ts`](../src/utils/__fixtures__/pedigrees.ts)
holds builder functions — `coupleWithSibship`, `crossBranchMarriage`,
`remarriageHalfSibs`, `twins`, `consanguinity`, `subtreeCollisionRegression`,
`deepAsymmetricSubtree`, and more — each a `{ doc, rootUnionId }` pair with seed
positions that reproduce a known bug or pin a passing case. `ALL_FIXTURES` feeds
`computeTreeLayout`; `REFORMAT_FIXTURES` feeds the whole-document engine. Consumed
by `pedigrees.test.ts`, `treeLayout.invariants.test.ts`, and
[`reformatLayout.test.ts`](../src/utils/reformatLayout.test.ts).

> **Changing layout? Add a fixture that exposes the new structure, then assert
> it against the invariant matchers before merging.**

### b. The property gate (machine-generated, standing green)

Example fixtures only cover topologies we *remembered*. The property test
generates thousands of **random valid** pedigrees and asserts every invariant
holds on all of them:

- Generator: `arbitraryLayoutDoc` in
  [`src/utils/__fixtures__/arbitraryPedigree.ts`](../src/utils/__fixtures__/arbitraryPedigree.ts)
  builds top-down (founders → descendants) so validity holds by construction, and
  shrinks to minimal counterexamples.
- Gate: [`reformatLayout.property.test.ts`](../src/utils/reformatLayout.property.test.ts)
  runs it over **`SUPPORTED_SPACE`** and must stay green in CI.

`SUPPORTED_SPACE` is the set of topologies the engine **fully handles today**:
plain branching families of any depth, twins, remarriage half-sibs, disconnected
components, and cross-branch couples. It excludes the shapes still being worked
(`maxUnionDegree: 2`, `allowMarriedTwins: false`). As each residual closes, its
cap widens.

### c. The discovery harness (machine-generated, adversarial)

[`reformatLayout.discovery.test.ts`](../src/utils/reformatLayout.discovery.test.ts)
runs the same invariants over **`FULL_SPACE`** — everything, including the
unhandled shapes (3+-union hubs, married twins). It is **opt-in** (`npm run
test:discovery`), never in normal CI, and uses a rotating seed to explore new
territory. Its job is to *find* the next failing topology and shrink it to a
fixture.

> **When you change `reformatLayout` or any invariant:** run `npm run
> test:discovery`, triage findings, and — after an engine fix — widen the
> `SUPPORTED_SPACE` caps. See CLAUDE.md.

---

## 5. Known limitations — the open residual (1b)

`SUPPORTED_SPACE` is green. The one **open** engine residual, tracked as
**residual 1b**, is two structurally-related shapes the layered engine keeps on
its linear path because delegating would balloon chart width
([`reformatLayout.ts` → `retidyHubFreeComponents`](../src/utils/reformatLayout.ts)):

| Scenario | What fails | Tracking issue |
|---|---|---|
| **Multi-union hub** (3+ same-row unions) | `subtreeNonCollision`, `noCrossedDescentLines` (correctness) + a foreign node between partners | *(filed — see issues labelled `layout`)* |
| **Twin-as-hub** (a twin who is also partnered ≥2×, e.g. a consanguineous sib-union) | `twinContiguity` — a non-twin sibling tie-breaks between the twins | *(filed — see issues labelled `layout`)* |

**The root cause is one fact.** `reformatLayout` models each generation as a
*total order* — a 1-D line, where a node has ≤2 neighbours. A hub needing 3+
adjacencies (three unions, or two unions plus a twin sibling) cannot be a single
point on a line. This is a limitation of the representation, not of the problem:
the fix needs either the *achievable-form* relaxation (for the aesthetic half) or
a representation change such as **hub-node duplication** (for the correctness
half). Node duplication is a new rendering concept — it would touch
`CanvasContainer`, `svgExport.ts`, and every invariant — so it is deferred
against its blast radius. The reference tool **kinship2** solves exactly these
shapes this way (draw the person twice, join the copies with a dashed arc); see
[`discussions/auto-spacing-vs-kinship2.md`](discussions/auto-spacing-vs-kinship2.md)
for the full comparison and [issue #149](https://github.com/Jdjellis/pedigree-canvas/issues/149)
for the duplication design proposal.

**How often does it bite?** A census of 8,000 random `FULL_SPACE` documents
(`reformatLayout` + all invariants) after the cross-branch fix (#148):

```
overall:        675 / 8000 (8.4%) fail — every one involves a hub or married twin
plain families:   0 / 3332 (0.0%) fail — the supported space is solid
cross-branch:     0 pure failures  — closed by #148
worst class:    twin-as-hub, 26.8% fail-rate among docs that contain one
invariants hit: noNodeBetweenPartners 35% · subtreeNonCollision 31%
                · noCrossedDescentLines 23% · twinContiguity 20% · idempotence 14%
```

**Important caveat on that 8.4%:** the generator is *adversarial* — it injects a
hub with ~50% probability and allows married twins freely, on tiny ≤4-generation
docs, precisely to hunt these shapes. It is **not** the rate real pedigrees hit
this. In practice residual 1b requires a person with 3+ partners each bearing
tracked children, or a twin who is themselves partnered in the chart — uncommon
in typical use, though genetic-counseling pedigrees over-represent exactly the
consanguinity and multi-partner cases where it can appear.

Other documented, by-design limitations (not bugs):

- **Disconnected components** — an unrelated family sharing a row is treated as a
  fixed obstacle; the rooted family may translate sideways to clear it (no
  overlap results, the unrelated family never moves).
- **Over-constrained cross-branch centring** (single-family `computeTreeLayout`
  only) — clamped rather than exact; resolved for the whole document by
  `reformatLayout`.

---

## 6. Checklist — changing layout safely

1. **Read first:** the relevant section of
   [architecture-reference.md](architecture-reference.md#auto-spacing), and — for
   any symbol/line/annotation change — [bennett-pedigree-standards.md](bennett-pedigree-standards.md).
2. **Add a fixture** in `pedigrees.ts` that exposes the structure you're changing.
3. **Assert invariants** (`checkAllInvariants` + the relevant extra matchers) on
   your fixture.
4. **Mirror in `svgExport.ts`** if you touched anything visual.
5. **Run `npm run test:discovery`** if you touched `reformatLayout` or an
   invariant; triage findings before merge.
6. **Widen `SUPPORTED_SPACE`** and un-skip / re-arm the property gate if you
   closed a residual.
7. `npm test`, `npm run lint`, `npm run typecheck`.

---

## Appendix — file map for deep navigation

| File | What lives there |
|---|---|
| [`src/utils/treeLayout.ts`](../src/utils/treeLayout.ts) | `computeTreeLayout` (per-edit engine), `separateGenerations`, `centerAndReproject`, `clearExternalObstacles`, `composeHubUnions`, `resolveGenerationRows`, `isLoadBearingInLaw`, `DEFAULT_LAYOUT_SPACING`, the `LayoutDoc` type. |
| [`src/utils/reformatLayout.ts`](../src/utils/reformatLayout.ts) | `reformatLayout` (whole-document engine), `buildChains`, `orderChainMembers`, `makeTwinsContiguous`, `retidyHubFreeComponents`, `retidyCrossBranchComponent`. |
| [`src/utils/reformatSuggestion.ts`](../src/utils/reformatSuggestion.ts) | `shouldSuggestReformat` — the production tangle detector behind the reformat nudge. |
| [`src/utils/__fixtures__/invariants.ts`](../src/utils/__fixtures__/invariants.ts) | Every layout rule as a pure predicate + `checkAllInvariants`. |
| [`src/utils/__fixtures__/pedigrees.ts`](../src/utils/__fixtures__/pedigrees.ts) | Named fixtures; `ALL_FIXTURES`, `REFORMAT_FIXTURES`. |
| [`src/utils/__fixtures__/arbitraryPedigree.ts`](../src/utils/__fixtures__/arbitraryPedigree.ts) | Property generator; `SUPPORTED_SPACE`, `FULL_SPACE`. |
| `src/utils/reformatLayout.property.test.ts` | Standing green property gate (`SUPPORTED_SPACE`). |
| `src/utils/reformatLayout.discovery.test.ts` | Opt-in adversarial harness (`FULL_SPACE`, `npm run test:discovery`). |
| [`src/io/svgExport.ts`](../src/io/svgExport.ts) | Parallel vector renderer — mirror layout/symbol changes here. |
