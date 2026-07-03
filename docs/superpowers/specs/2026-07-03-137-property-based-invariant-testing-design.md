# Property-based invariant testing for `reformatLayout` (issue #137 follow-up)

**Issue:** [#141](https://github.com/Jdjellis/pedigree-canvas/issues/141) —
follow-up to #137 PR1 ([#138](https://github.com/Jdjellis/pedigree-canvas/pull/138)).
**Status:** design approved 2026-07-03.
**Depends on:** `reformatLayout` + the layout invariants from #138 (branch
`claude/cool-kare-264dd2`). This work is branched off, and its PR is **stacked on
#138** (rebase onto `main` once #138 merges).

---

## 1. Problem

The layout invariant suite is the correctness **oracle** for `reformatLayout`.
Today it is *example-based*: a hand-curated `ALL_FIXTURES` / `REFORMAT_FIXTURES`
list checked against the matchers in `invariants.ts`. Reviewing #138 surfaced two
real gaps — a 3+-union **hub** and a **married twin** — that passed CI not because
the engine handled them but because **no fixture expressed the failing topology**.

The oracle's blind spot is therefore *input coverage*, not matcher logic. We want
to convert "topologies we remembered to test" into "topologies the machine finds
for us," so future gaps surface automatically instead of at review time.

## 2. Goals / non-goals

**Goals:**

- A trustworthy **generator of structurally valid `LayoutDoc`s** (fast-check),
  parameterised over the structural knobs that matter (founder count, per-union
  child counts, multi-partner degree, twins, consanguinity, disconnected
  components).
- A **green CI property**: over the *currently-supported* topology space,
  `reformatLayout` output satisfies the hard invariants + idempotence. A standing
  regression guard that catches **new** gaps automatically. Deterministic (fixed
  seed) so it is never a flaky-CI liability.
- A **discovery harness**: over the *full* topology space, shrink any failure to a
  minimal counterexample. Manual/opt-in (never in CI). Used to harvest the initial
  gap set and to re-verify after each engine fix.
- A **generator meta-test** proving every generated doc is structurally valid, so
  the harness is trusted (a generator bug must not masquerade as an engine bug).
- A **CLAUDE.md note** prompting future sessions to run discovery when touching
  `reformatLayout` or the layout invariants.

**Non-goals:**

- Fixing the hub / married-twin engine gaps (that is recommendation #3, tracked in
  #141). This PR only *guards* the supported space and *discovers* the rest.
- Asserting the best-effort width bounds (`boundedPartnerDistance`, `chartWidth`)
  as universal properties — their `maxFactor`s are tuned to specific wide-seed
  fixtures, not post-reformat truths. They stay fixture-scoped.
- Touching `computeTreeLayout` or the existing fixture/invariant suites.

## 3. Approach

**Chosen: construct-valid-by-construction.** fast-check picks structural
parameters; a deterministic builder walks generation by generation creating
individuals, unions, and parent-child links, assigning generations as it goes.
Validity (no dangling refs, consistent generations, twin groups referencing real
siblings) is guaranteed by construction, and shrinking minimises the *parameters*,
so a failure reduces to the smallest topology that still breaks.

Rejected: *generate-then-repair* (repair logic is itself error-prone and can emit
invalid docs that cause false invariant failures); *model-based/stateful* (for
operation sequences, not static docs — overkill).

## 4. Detailed design

### 4.1 Generator (`src/utils/__fixtures__/arbitraryPedigree.ts`)

```ts
export interface PedigreeGenOptions {
  /** Max unions any one individual may participate in on its row. The supported
   *  space caps this at 2; discovery allows 3+. Default 2. */
  maxUnionDegree?: number;
  /** Whether a twin may also be a partner in a couple. Supported space: false;
   *  discovery: true. Default false. */
  allowMarriedTwins?: boolean;
  /** Structural ranges (generations, children per union, founder families, and
   *  probabilities for twins / consanguinity / disconnected components). */
  // ...tuned ranges with sensible defaults...
}

/** A fast-check arbitrary producing a structurally valid LayoutDoc. */
export function arbitraryLayoutDoc(opts?: PedigreeGenOptions): fc.Arbitrary<LayoutDoc>;

/** The two named configurations. */
export const SUPPORTED_SPACE: PedigreeGenOptions;   // maxUnionDegree: 2, allowMarriedTwins: false
export const FULL_SPACE: PedigreeGenOptions;        // maxUnionDegree: 3+, allowMarriedTwins: true
```

The builder emits seed positions the same way the fixtures do (`generation × 150`
for y, spread x), so generated docs are indistinguishable in shape from
hand-written ones. It reuses the `Individual` / `PartnershipRelationship` /
`ParentChildRelationship` / `TwinGroup` types and `createDefaultIndividual`.

### 4.2 Green CI property (`src/utils/reformatLayout.property.test.ts`)

```ts
fc.assert(
  fc.property(arbitraryLayoutDoc(SUPPORTED_SPACE), (doc) => {
    const pos = finalPositions(doc, reformatLayout(doc));
    expect(checkAllInvariants(pos, doc).violations).toEqual([]);
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    expect(twinContiguity(pos, doc, doc.twinGroups ?? {}).ok).toBe(true);
    // idempotence: a second pass moves nothing (<1px)
    // ...apply moves, reformat again, assert <1px...
  }),
  { seed: <FIXED>, numRuns: 500 },
);
```

Fixed `seed` + `numRuns: 500` → deterministic, no CI flakes. This is the standing
guard: any new gap inside the supported space fails it.

### 4.3 Discovery harness (`src/utils/reformatLayout.discovery.test.ts`)

```ts
describe.skipIf(!process.env.REFORMAT_DISCOVERY)('reformatLayout — discovery', () => {
  it('finds no invariant violation across the full topology space', () => {
    fc.assert(
      // Same invariant set as the green property (checkAllInvariants +
      // noNodeBetweenPartners + twinContiguity + idempotence) — NOT the
      // best-effort width bounds — but over FULL_SPACE instead of SUPPORTED_SPACE.
      fc.property(arbitraryLayoutDoc(FULL_SPACE), (doc) => { /* same asserts as §4.2 */ }),
      { numRuns: 2000 }, // rotating seed → explores new territory each run
    );
  });
});
```

Env-gated + an npm script `test:discovery`. Rotating seed and high `numRuns`.
On failure fast-check prints the shrunk counterexample **and** the seed
(reproducible). Never runs in CI (shows as skipped).

**Triggered — three manual moments:**
1. **Now**, during this PR: harvest the initial gap set; triage each shrunk
   counterexample into #141 (known-shape → confirm it is inside the exclusion
   caps; new-shape → new finding).
2. **After any engine fix** (#141 rec #3): re-run to confirm the widened space is
   clean *before* relaxing `SUPPORTED_SPACE` caps in the green property. This is
   the gate that promotes a topology from "excluded" to "guarded".
3. **Ad hoc** — when a new topology class is suspected, or as a nightly
   non-blocking job. Never gates a merge.

### 4.4 Generator meta-test (`src/utils/__fixtures__/arbitraryPedigree.test.ts`)

A fast-check property asserting **every** generated doc (in both `SUPPORTED_SPACE`
and `FULL_SPACE`) is structurally valid: every partnership/parentChildLink
references present individuals; every child's generation is below its parents';
every twin group references present same-sibship individuals; no id collisions.
This is what earns trust in the harness.

### 4.5 CLAUDE.md note

Add to the project `CLAUDE.md` (Auto-spacing / layout section): a rule that any
change to `reformatLayout` **or** the layout invariants must run
`npm run test:discovery` and triage findings before merge — so future sessions are
prompted to exercise the permissive harness on engine fixes, and to re-verify
before widening the supported-space caps.

### 4.6 Dependency & scripts

- Add `fast-check` as a `devDependency`.
- Add `"test:discovery": "REFORMAT_DISCOVERY=1 vitest run src/utils/reformatLayout.discovery.test.ts"`.

## 5. Test surface

| File | Role | Runs in CI? |
| --- | --- | --- |
| `arbitraryPedigree.ts` | generator + options | — |
| `arbitraryPedigree.test.ts` | generator validity meta-test | yes (green) |
| `reformatLayout.property.test.ts` | supported-space green guard | yes (green, fixed seed) |
| `reformatLayout.discovery.test.ts` | full-space discovery | no (env-gated, opt-in) |

## 6. Risks & edge cases

- **Generator bug emits invalid docs → false failures.** Mitigated by the
  meta-test (4.4); it must pass before the property tests are trusted.
- **Flaky CI from random seeds.** Mitigated by a fixed seed in the green property;
  only discovery rotates seeds, and discovery never runs in CI.
- **Performance.** 500 runs × `reformatLayout` on modest docs is cheap; cap
  generated doc size (founders, generations, children) so a run stays well under a
  second. Discovery's 2000 runs is a manual command, so cost is acceptable.
- **Shrinking must stay meaningful.** Because we shrink *parameters* of a
  by-construction builder, the minimal counterexample is a real, valid, minimal
  pedigree — directly usable as a named fixture.

## 7. Out of scope

- The engine fixes for hub / married-twin (recommendation #3, #141).
- The `minPartnerSpacing` achievable-form redefinition (recommendation #2 remnant,
  #141) — may land alongside the engine fix; not required for this harness (the
  supported space excludes the hub shape that trips it).
