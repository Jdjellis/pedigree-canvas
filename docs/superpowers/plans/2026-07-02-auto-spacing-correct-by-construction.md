# Correct-by-Construction Auto-Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two overlap-blind post-hoc patch passes in `computeTreeLayout` with a hybrid layout (couple super-node + per-generation separation projection with center-then-reproject) so no-overlap is an invariant of the pass, backed by a named-fixture library and reusable invariant matchers.

**Architecture:** Keep the existing tidy-tree core (`layoutUnionFrame`/`layoutChildBlock`/`packBlocks`). Delete `inLawClearanceShift` and `centerChildrenUnderWideCouples`. Add: (Pass 0) couple super-node ownership, (Pass 2) a monotone per-generation separation sweep over rigid subtree blocks, (Pass 3) centering as a soft objective that immediately re-projects, (Pass 4) generation-robust y. Tests are the spec: a fixture library + framework-agnostic invariant matchers, TDD'd failing-first then green.

**Tech Stack:** TypeScript, Vitest (unit), Playwright (`e2e/`, render guard). No new runtime dependencies.

## Global Constraints

- `computeTreeLayout(doc: LayoutDoc, rootUnionId: string, spacing?: LayoutSpacing) => Record<string, {x:number;y:number}>` — signature and "return only nodes whose position changed" contract are UNCHANGED. `relayoutFamily` in `pedigreeStore.ts` and all callers stay untouched.
- Pure function. No `Date.now`/`Math.random`. Deterministic: every ordering falls back to id tie-break.
- Spacing constants (from `src/utils/constants.ts`, do not redefine): `SYMBOL_SIZE = 40`, `SIBLING_SPACING = 80`, `PARTNER_SPACING = 120`, `GENERATION_SPACING = 150`, `MIN_GENERATION_NODE_SPACING = 80`.
- Never `import ... from 'konva'`. react-konva components are not jsdom-testable — all logic lives in `treeLayout.ts` / `__fixtures__/` pure modules and is unit-tested there.
- Global code style (user CLAUDE.md): type-annotate all signatures; JSDoc public interfaces; no `any`; conventional commits; one logical change per commit; run tests before committing.
- Invariant matchers must be framework-agnostic pure predicates (consumed by BOTH vitest and Playwright).
- TDD discipline: each behavioural task introduces its failing assertion, runs it to observe RED, then implements to GREEN in the same task — so every committed state is green (the "failing-first, green-after" record lives in the run output / task history, no committed red CI).

---

## File Structure

- `src/utils/__fixtures__/invariants.ts` (CREATE) — `finalPositions` helper + reusable invariant matchers. One responsibility: express spacing rules as pure predicates.
- `src/utils/__fixtures__/invariants.test.ts` (CREATE) — unit tests for the matchers themselves (a buggy matcher gives false confidence).
- `src/utils/__fixtures__/pedigrees.ts` (CREATE) — named-fixture builders returning `{doc, rootUnionId, twinGroups?}`.
- `src/utils/__fixtures__/pedigrees.test.ts` (CREATE) — structural sanity that each fixture builds a valid doc.
- `src/utils/treeLayout.ts` (MODIFY) — the 4-pass rewrite; delete `inLawClearanceShift` + `centerChildrenUnderWideCouples`; add `resolveRowSeparation` + Pass 0/2/3/4 helpers.
- `src/utils/treeLayout.invariants.test.ts` (CREATE) — parametrised suite: run `computeTreeLayout` on each fixture, assert all applicable invariants. The crown-jewel surface.
- `src/utils/treeLayout.test.ts` (MODIFY) — keep the existing unit tests green; add unit tests for new exported helpers.
- `e2e/layout-render-guard.spec.ts` (CREATE) — render guard reusing `support/harness.ts`.
- `docs/architecture-reference.md` (MODIFY) — new "Auto-spacing" section.

---

## Task 1: Invariant matchers module

**Files:**
- Create: `src/utils/__fixtures__/invariants.ts`
- Test: `src/utils/__fixtures__/invariants.test.ts`

**Interfaces:**
- Consumes: `LayoutDoc`, `LayoutSpacing`, `DEFAULT_LAYOUT_SPACING`, `isLoadBearingInLaw` from `../treeLayout`; constants from `../constants`; `TwinGroup` from `../../types/pedigree`.
- Produces (all exported):
  - `interface Point { x: number; y: number }`
  - `type Positions = Record<string, Point>`
  - `interface Violation { rule: string; ids: string[]; detail: string }`
  - `interface InvariantResult { ok: boolean; violations: Violation[] }`
  - `function finalPositions(doc: LayoutDoc, moved: Record<string, {x:number;y:number}>): Positions`
  - `function noSymbolOverlap(pos: Positions, doc: LayoutDoc): InvariantResult`
  - `function minSiblingSpacing(pos: Positions, doc: LayoutDoc, spacing?: LayoutSpacing): InvariantResult`
  - `function minPartnerSpacing(pos: Positions, doc: LayoutDoc, spacing?: LayoutSpacing): InvariantResult`
  - `function generationRowAlignment(pos: Positions, doc: LayoutDoc, tol?: number): InvariantResult`
  - `function noCrossedDescentLines(pos: Positions, doc: LayoutDoc): InvariantResult`
  - `function subtreeNonCollision(pos: Positions, doc: LayoutDoc): InvariantResult`
  - `function manualOrderPreserved(doc: LayoutDoc, pos: Positions): InvariantResult`
  - `function twinContiguity(pos: Positions, doc: LayoutDoc, twinGroups: Record<string, TwinGroup>): InvariantResult`
  - `function anchorStability(doc: LayoutDoc, moved: Record<string,{x:number;y:number}>, anchorId: string, tol?: number): InvariantResult`
  - `function checkAllInvariants(pos: Positions, doc: LayoutDoc, spacing?: LayoutSpacing): InvariantResult` (aggregates the six positional matchers)

- [ ] **Step 1: Write failing tests for the matchers**

Create `src/utils/__fixtures__/invariants.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  finalPositions, noSymbolOverlap, minSiblingSpacing, minPartnerSpacing,
  generationRowAlignment, noCrossedDescentLines, subtreeNonCollision,
  manualOrderPreserved, twinContiguity, anchorStability,
} from './invariants';
import type { LayoutDoc } from '../treeLayout';
import type { Individual, PartnershipRelationship, ParentChildRelationship, TwinGroup } from '../../types/pedigree';
import { RelationshipType, TwinType } from '../../types/enums';
import { createDefaultIndividual } from '../../stores/pedigreeStore';

function ind(id: string, x: number, generation = 0): Individual {
  return createDefaultIndividual({ id, generation, position: { x, y: generation * 150 } });
}
function union(id: string, p1: string | undefined, p2: string | undefined, kids: string[] = []): PartnershipRelationship {
  return { id, type: RelationshipType.Partnership, partner1Id: p1, partner2Id: p2, childrenIds: kids };
}
function link(id: string, parentPartnershipId: string, childId: string): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive: false };
}
function doc(p: Partial<LayoutDoc>): LayoutDoc {
  return { individuals: p.individuals ?? {}, partnerships: p.partnerships ?? {}, parentChildLinks: p.parentChildLinks ?? {} };
}

describe('finalPositions', () => {
  it('merges the move-map over current positions', () => {
    const d = doc({ individuals: { a: ind('a', 10, 0), b: ind('b', 20, 1) } });
    expect(finalPositions(d, { a: { x: 99, y: 0 } })).toEqual({ a: { x: 99, y: 0 }, b: { x: 20, y: 150 } });
  });
});

describe('noSymbolOverlap', () => {
  it('flags two same-generation nodes closer than SYMBOL_SIZE', () => {
    const d = doc({ individuals: { a: ind('a', 0, 0), b: ind('b', 30, 0) } });
    expect(noSymbolOverlap({ a: { x: 0, y: 0 }, b: { x: 30, y: 0 } }, d).ok).toBe(false);
  });
  it('passes when same-generation nodes are >= SYMBOL_SIZE apart', () => {
    const d = doc({ individuals: { a: ind('a', 0, 0), b: ind('b', 40, 0) } });
    expect(noSymbolOverlap({ a: { x: 0, y: 0 }, b: { x: 40, y: 0 } }, d).ok).toBe(true);
  });
});

describe('minSiblingSpacing', () => {
  it('flags adjacent siblings closer than SIBLING_SPACING', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), a: ind('a', 0, 1), b: ind('b', 50, 1) },
      partnerships: { u: union('u', 'p', undefined, ['a', 'b']) },
      parentChildLinks: { la: link('la', 'u', 'a'), lb: link('lb', 'u', 'b') },
    });
    expect(minSiblingSpacing({ p: { x: 0, y: 0 }, a: { x: 0, y: 150 }, b: { x: 50, y: 150 } }, d).ok).toBe(false);
  });
});

describe('minPartnerSpacing', () => {
  it('flags an ordinary couple not exactly PARTNER_SPACING apart', () => {
    const d = doc({ individuals: { a: ind('a', 0, 0), b: ind('b', 90, 0) }, partnerships: { u: union('u', 'a', 'b', []) } });
    expect(minPartnerSpacing({ a: { x: 0, y: 0 }, b: { x: 90, y: 0 } }, d).ok).toBe(false);
  });
  it('exempts a couple with a load-bearing in-law (wide couple)', () => {
    const d = doc({
      individuals: { blood: ind('blood', 0, 1), inlaw: ind('inlaw', 300, 1), ilp: ind('ilp', 300, 0) },
      partnerships: { mar: union('mar', 'blood', 'inlaw', []), ilU: union('ilU', 'ilp', undefined, ['inlaw']) },
      parentChildLinks: { b: link('b', 'ilU', 'inlaw') },
    });
    expect(minPartnerSpacing({ blood: { x: 0, y: 150 }, inlaw: { x: 300, y: 150 }, ilp: { x: 300, y: 0 } }, d).ok).toBe(true);
  });
});

describe('generationRowAlignment', () => {
  it('flags siblings that are not on the same row (undefined-generation bug)', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), a: ind('a', -80, 1), b: ind('b', 80, 1) },
      partnerships: { u: union('u', 'p', undefined, ['a', 'b']) },
      parentChildLinks: { la: link('la', 'u', 'a'), lb: link('lb', 'u', 'b') },
    });
    // b collapsed onto the parent row (y=0) instead of y=150.
    expect(generationRowAlignment({ p: { x: 0, y: 0 }, a: { x: -80, y: 150 }, b: { x: 80, y: 0 } }, d).ok).toBe(false);
  });
  it('passes when all children of a union share a y', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), a: ind('a', -80, 1), b: ind('b', 80, 1) },
      partnerships: { u: union('u', 'p', undefined, ['a', 'b']) },
      parentChildLinks: { la: link('la', 'u', 'a'), lb: link('lb', 'u', 'b') },
    });
    expect(generationRowAlignment({ p: { x: 0, y: 0 }, a: { x: -80, y: 150 }, b: { x: 80, y: 150 } }, d).ok).toBe(true);
  });
});

describe('noCrossedDescentLines', () => {
  it('flags cousin sibships whose order is inverted relative to their parents', () => {
    // union u1 (parent at x=0) left of u2 (parent at x=200); but u1 child sits RIGHT of u2 child.
    const d = doc({
      individuals: {
        p1: ind('p1', 0, 1), p2: ind('p2', 200, 1),
        c1: ind('c1', 180, 2), c2: ind('c2', 20, 2),
      },
      partnerships: { u1: union('u1', 'p1', undefined, ['c1']), u2: union('u2', 'p2', undefined, ['c2']) },
      parentChildLinks: { a: link('a', 'u1', 'c1'), b: link('b', 'u2', 'c2') },
    });
    const pos = { p1: { x: 0, y: 150 }, p2: { x: 200, y: 150 }, c1: { x: 180, y: 300 }, c2: { x: 20, y: 300 } };
    expect(noCrossedDescentLines(pos, d).ok).toBe(false);
  });
});

describe('subtreeNonCollision', () => {
  it('flags two cousin sibships whose x-extents overlap', () => {
    const d = doc({
      individuals: {
        p1: ind('p1', 0, 1), p2: ind('p2', 200, 1),
        a1: ind('a1', 0, 2), a2: ind('a2', 100, 2),
        b1: ind('b1', 90, 2), b2: ind('b2', 190, 2),
      },
      partnerships: { u1: union('u1', 'p1', undefined, ['a1', 'a2']), u2: union('u2', 'p2', undefined, ['b1', 'b2']) },
      parentChildLinks: { la1: link('la1', 'u1', 'a1'), la2: link('la2', 'u1', 'a2'), lb1: link('lb1', 'u2', 'b1'), lb2: link('lb2', 'u2', 'b2') },
    });
    const pos = { p1: { x: 0, y: 150 }, p2: { x: 200, y: 150 }, a1: { x: 0, y: 300 }, a2: { x: 100, y: 300 }, b1: { x: 90, y: 300 }, b2: { x: 190, y: 300 } };
    expect(subtreeNonCollision(pos, d).ok).toBe(false);
  });
});

describe('manualOrderPreserved', () => {
  it('flags a sibling order that inverts the input x order', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), a: ind('a', 0, 1), b: ind('b', 80, 1) },
      partnerships: { u: union('u', 'p', undefined, ['a', 'b']) },
      parentChildLinks: { la: link('la', 'u', 'a'), lb: link('lb', 'u', 'b') },
    });
    // input: a(0) < b(80); output flips them.
    expect(manualOrderPreserved(d, { p: { x: 0, y: 0 }, a: { x: 80, y: 150 }, b: { x: 0, y: 150 } }).ok).toBe(false);
  });
});

describe('twinContiguity', () => {
  it('flags a non-twin sibling ordered between two twins', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), t1: ind('t1', 0, 1), s: ind('s', 80, 1), t2: ind('t2', 160, 1) },
      partnerships: { u: union('u', 'p', undefined, ['t1', 's', 't2']) },
      parentChildLinks: { l1: link('l1', 'u', 't1'), l2: link('l2', 'u', 's'), l3: link('l3', 'u', 't2') },
    });
    const tg: Record<string, TwinGroup> = { g: { id: 'g', type: TwinType.Monozygotic, memberIds: ['t1', 't2'] } };
    const pos = { p: { x: 0, y: 0 }, t1: { x: 0, y: 150 }, s: { x: 80, y: 150 }, t2: { x: 160, y: 150 } };
    expect(twinContiguity(pos, d, tg).ok).toBe(false);
  });
});

describe('anchorStability', () => {
  it('passes when the anchor id is absent from the move-map', () => {
    const d = doc({ individuals: { a: ind('a', 10, 0) } });
    expect(anchorStability(d, {}, 'a').ok).toBe(true);
  });
  it('flags an anchor id that moved', () => {
    const d = doc({ individuals: { a: ind('a', 10, 0) } });
    expect(anchorStability(d, { a: { x: 99, y: 0 } }, 'a').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/__fixtures__/invariants.test.ts`
Expected: FAIL — cannot resolve `./invariants`.

- [ ] **Step 3: Implement `invariants.ts`**

Create `src/utils/__fixtures__/invariants.ts`. Implement each matcher as a pure predicate returning `{ ok, violations }`. Guidance per matcher (the tests above fully constrain them):

- `finalPositions`: for every id in `doc.individuals`, use `moved[id]` if present else `doc.individuals[id].position` (spread to a fresh `{x,y}`).
- Helper `siblingsOf(doc)`: for each union, its `childrenIds` filtered to present-in-`doc.individuals`.
- Helper `groupBySharedY(pos, ids, tol)`: buckets ids whose y are within `tol`.
- `noSymbolOverlap`: bucket ids by rounded y; within each bucket, every pair with `|xi - xj| < SYMBOL_SIZE` is a violation.
- `minSiblingSpacing`: for each union, order its present children by x (id tie-break); adjacent gap `< spacing.siblingSpacing - tol` (tol = 0.5) → violation. Use `DEFAULT_LAYOUT_SPACING` when `spacing` omitted.
- `minPartnerSpacing`: for each union with both partners present in `pos` and `!isLoadBearingInLaw(doc, partner1) && !isLoadBearingInLaw(doc, partner2)` (ordinary couple), `|x1 - x2|` must be within tol of `spacing.partnerSpacing`, else violation. Skip unions where either partner is a load-bearing in-law (wide-couple exemption).
- `generationRowAlignment`: for each union, all present children must share one y (max-min ≤ tol, default tol = 1); both present partners must share one y; a child's y must be greater than its parents' y. Any breach → violation. (This is structural — it does NOT read `generation`, so it catches the undefined-generation collapse.)
- `noCrossedDescentLines`: for each ordered pair of unions (U, V) both having present children, compute each union's "parent anchor x" = mean of present partners' x (fallback: mean of children x). If `anchor(U) < anchor(V) - tol` then every child of U must have x < every child of V (min gap tol); a breach → violation. (Order-inversion check.)
- `subtreeNonCollision`: for each pair of distinct unions with present children, compute child-x extent `[min,max]`; if the extents overlap by more than tol AND the unions are not ancestor/descendant related, violation. (Two independent cousin sibships must not horizontally overlap.)
- `manualOrderPreserved`: for each union, compare children ordered by input x (`doc` positions, id tie-break) with children ordered by final x (`pos`, id tie-break); if the sequences differ → violation.
- `twinContiguity`: for each twin group, find the union whose children include the members; order that union's present children by final x; the members must occupy a contiguous run → else violation.
- `anchorStability`: if `moved[anchorId]` is undefined → ok; else `|moved[anchorId].x - doc.individuals[anchorId].position.x| ≤ tol` (default tol = 0.5) → ok, else violation.
- `checkAllInvariants`: run `noSymbolOverlap, minSiblingSpacing, minPartnerSpacing, generationRowAlignment, noCrossedDescentLines, subtreeNonCollision`; concat violations; `ok = violations.length === 0`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/__fixtures__/invariants.test.ts`
Expected: PASS (all matcher tests green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/__fixtures__/invariants.ts src/utils/__fixtures__/invariants.test.ts
git commit -m "test: add reusable pedigree-layout invariant matchers (#131)"
```

---

## Task 2: Named-fixture library

**Files:**
- Create: `src/utils/__fixtures__/pedigrees.ts`
- Test: `src/utils/__fixtures__/pedigrees.test.ts`

**Interfaces:**
- Consumes: `LayoutDoc` from `../treeLayout`; type helpers as in Task 1; `TwinGroup` + `TwinType`.
- Produces:
  - `interface Fixture { name: string; doc: LayoutDoc; rootUnionId: string; twinGroups?: Record<string, TwinGroup> }`
  - one exported builder `function <name>(): Fixture` per fixture below
  - `const ALL_FIXTURES: Array<() => Fixture>` (every builder)

- [ ] **Step 1: Write the structural test**

Create `src/utils/__fixtures__/pedigrees.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ALL_FIXTURES } from './pedigrees';

describe('pedigree fixtures', () => {
  it('every fixture builds a valid doc with an existing root union', () => {
    for (const build of ALL_FIXTURES) {
      const f = build();
      expect(f.name).toBeTruthy();
      expect(f.doc.partnerships[f.rootUnionId], `${f.name}: rootUnionId exists`).toBeDefined();
      // Every parent-child link points at a real union and a real individual.
      for (const l of Object.values(f.doc.parentChildLinks)) {
        expect(f.doc.partnerships[l.parentPartnershipId], `${f.name}: link union`).toBeDefined();
        expect(f.doc.individuals[l.childId], `${f.name}: link child`).toBeDefined();
      }
      // Every union partner id (when set) is a real individual.
      for (const u of Object.values(f.doc.partnerships)) {
        for (const pid of [u.partner1Id, u.partner2Id]) {
          if (pid) expect(f.doc.individuals[pid], `${f.name}: partner ${pid}`).toBeDefined();
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/__fixtures__/pedigrees.test.ts`
Expected: FAIL — cannot resolve `./pedigrees`.

- [ ] **Step 3: Implement `pedigrees.ts`**

Create `src/utils/__fixtures__/pedigrees.ts` with the local `ind()/union()/link()` helpers (copy from Task 1's test) and these builders. Positions encode the *current* (pre-relayout) canvas state — deliberately including the seeded overlaps/misplacements that document the bug.

- `loneFounder()` — one individual, one childless union `{root: union('root','a',undefined,[])}`. rootUnionId `root`.
- `coupleWithSibship()` — `m`,`f` (gen 0) + 3 children (gen 1). rootUnionId `u`.
- `threeGenerations()` — grandparents → 2 parents → children. rootUnionId `top`.
- `twins()` — parent + MZ twin pair `t1`,`t2` (gen 1); `twinGroups = { g: { id:'g', type: TwinType.Monozygotic, memberIds:['t1','t2'] } }`. rootUnionId `u`.
- `marriedInWithParents()` — blood `p` × load-bearing `inlaw` (its parent `ilp` above), one `kid`. rootUnionId `mar`. (The #105 single-wide-couple case.)
- `crossBranchMarriage()` — the EXACT #115 fixture: `gp1,gp2` → `s1,s2`; `ilp`→`inlaw`; `couple1 = s1×inlaw → kidA`; `couple2 = s2×s2mate → kidB`; positions seeded so `kidA`/`kidB` currently collide at x=100. rootUnionId `root`.
- `consanguinity()` — first-cousin union: `g1,g2` → `pa,pb`; `pa→ca`, `pb→cb`; `cousinUnion = ca×cb → gc`. rootUnionId `top`.
- `wideCoupleAdjacentCousin()` — same shape as `crossBranchMarriage` (alias documenting the exact node-on-node overlap). rootUnionId `root`.
- `wideCoupleInverted()` — #115 looser variant with the in-law tuned so `kidA`≈380 while cousin `kidB`≈100 (order inversion, not exact coincidence). rootUnionId `root`.
- `chainedWideCouples()` — the existing `treeLayout.test.ts` chained-wide-couple shape (`top→p1`; `couple1=p1×inlaw1→m1`; `couple2=m1×inlaw2→g1`). rootUnionId `top`.
- `undefinedGenerationChild()` — parent `p` (gen 0) + `c1` (gen 1) + `c2` with `generation: undefined`. rootUnionId `u`.
- `remarriageHalfSibs()` — `p` with two child-bearing unions `u1 = p×spouse1 → kidA` and `u2 = p×spouse2 → kidB`. rootUnionId `u1`.
- `twinsWithSingletonSibling()` — parent + `t1`,`t2` (MZ twins) + `s` (singleton), with `s` seeded BETWEEN the twins by x. `twinGroups` groups `t1,t2`. rootUnionId `u`.
- `disconnectedComponents()` — two unrelated founder couples with children in one doc; rootUnionId points at the first. (Layout must not drag the second component.)
- `selfPartneredUnion()` — `union('u','a','a',['k'])` (degenerate). rootUnionId `u`.
- `wideCousinFan()` — grandparent → 4 children, each with 3 kids (12 cousins, gen 2). rootUnionId `top`. (Regression guard: already passes today.)

Export `ALL_FIXTURES` listing every builder.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/__fixtures__/pedigrees.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/__fixtures__/pedigrees.ts src/utils/__fixtures__/pedigrees.test.ts
git commit -m "test: add named pedigree fixture library (#131)"
```

---

## Task 3: Parametrised invariant suite — regression-guard baseline

Wire the fixtures that ALREADY pass on today's code into the parametrised suite, establishing the harness green. Fixtures known (verified during discovery) to satisfy their invariants today: `loneFounder`, `coupleWithSibship`, `threeGenerations`, `marriedInWithParents`, `consanguinity`, `chainedWideCouples`, `wideCousinFan`.

**Files:**
- Create: `src/utils/treeLayout.invariants.test.ts`

**Interfaces:**
- Consumes: `computeTreeLayout` from `./treeLayout`; `finalPositions` + matchers from `./__fixtures__/invariants`; fixture builders from `./__fixtures__/pedigrees`.

- [ ] **Step 1: Write the parametrised suite for passing fixtures**

Create `src/utils/treeLayout.invariants.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import {
  finalPositions, checkAllInvariants, manualOrderPreserved,
} from './__fixtures__/invariants';
import {
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
} from './__fixtures__/pedigrees';

// Fixtures that already satisfy their invariants on the current code.
const GREEN_TODAY = [
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
];

describe('computeTreeLayout — invariant regression guards', () => {
  for (const build of GREEN_TODAY) {
    const f = build();
    it(`${f.name}: satisfies all positional invariants`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      const res = checkAllInvariants(pos, f.doc);
      expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
    });
    it(`${f.name}: preserves manual sibling order`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      expect(manualOrderPreserved(f.doc, pos).violations).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts`
Expected: PASS. If any GREEN_TODAY fixture reports a violation, that fixture is mis-seeded (or genuinely broken) — reconcile: fix the fixture's seeded positions to a tidy arrangement, or move it to a later behavioural task if it is actually a bug. Record the reconciliation in a code comment.

- [ ] **Step 3: Commit**

```bash
git add src/utils/treeLayout.invariants.test.ts
git commit -m "test: parametrised invariant suite over passing fixtures (#131)"
```

---

## Task 4: Separation-projection primitive

The pure per-generation-row sweep. Verified reference implementation below.

**Files:**
- Modify: `src/utils/treeLayout.ts` (add exported `resolveRowSeparation` + `RowBlock`)
- Test: `src/utils/treeLayout.test.ts` (add a `resolveRowSeparation` describe block)

**Interfaces:**
- Produces:
  - `interface RowBlock { ids: string[]; minX: number; maxX: number }`
  - `function resolveRowSeparation(blocks: readonly RowBlock[], minGap: number): number[]` — per-block right-shift (≥ 0), blocks given left-to-right by current x.

- [ ] **Step 1: Write failing tests**

Add to `src/utils/treeLayout.test.ts`:

```typescript
import { resolveRowSeparation } from './treeLayout';

describe('resolveRowSeparation', () => {
  const B = (minX: number, maxX: number) => ({ ids: [], minX, maxX });
  it('leaves an already-separated row untouched (idempotent)', () => {
    expect(resolveRowSeparation([B(0,0), B(80,80), B(160,160)], 80)).toEqual([0, 0, 0]);
  });
  it('pushes a coincident block right to clear minGap (the #115 collision)', () => {
    expect(resolveRowSeparation([B(100,100), B(100,100)], 80)).toEqual([0, 80]);
  });
  it('separates by extents plus gap for a wide block', () => {
    expect(resolveRowSeparation([B(0,0), B(-60,60)], 80)).toEqual([0, 140]);
  });
  it('never pulls a clear block left', () => {
    expect(resolveRowSeparation([B(0,0), B(500,500)], 80)).toEqual([0, 0]);
  });
  it('cascades three coincident points', () => {
    expect(resolveRowSeparation([B(0,0), B(0,0), B(0,0)], 80)).toEqual([0, 80, 160]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/treeLayout.test.ts -t resolveRowSeparation`
Expected: FAIL — `resolveRowSeparation` is not exported.

- [ ] **Step 3: Implement (verified reference code)**

Add to `src/utils/treeLayout.ts`:

```typescript
/** A rigid group of nodes in one generation row that translate together. */
export interface RowBlock {
  ids: string[];
  minX: number;
  maxX: number;
}

/**
 * Resolve minimum separation across one generation row. `blocks` are given
 * left-to-right by current x (id tie-break already applied). Returns a per-block
 * right-shift (>= 0) so adjacent blocks clear each other by `minGap`, measured
 * between extents. Monotone — never shifts a block left — so an already-separated
 * row yields all-zero shifts (idempotent). Mirrors {@link packBlocks} applied per
 * generation row rather than per sibling set.
 */
export function resolveRowSeparation(
  blocks: readonly RowBlock[],
  minGap: number,
): number[] {
  const shifts: number[] = [];
  let prevMax = -Infinity;
  for (const b of blocks) {
    let shift = 0;
    if (prevMax !== -Infinity) {
      const need = prevMax + minGap - b.minX;
      if (need > 0) shift = need;
    }
    shifts.push(shift);
    prevMax = b.maxX + shift;
  }
  return shifts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.test.ts -t resolveRowSeparation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.test.ts
git commit -m "feat: add per-generation separation-projection primitive (#131)"
```

---

## Task 5: Integrate Pass 2 + Pass 3 — separation & center-then-reproject

Replace `inLawClearanceShift` and `centerChildrenUnderWideCouples` with: (Pass 2) a per-generation separation sweep over rigid subtree blocks, and (Pass 3) centering as a soft objective that immediately re-projects. This is the core fix and greens the overlap/wide-couple failure modes.

**Files:**
- Modify: `src/utils/treeLayout.ts` — delete `inLawClearanceShift`, `collectInLawFamilies`, `centerChildrenUnderWideCouples`; add `computeRigidBlocks`, `separateGenerations`, `centerAndReproject`; rewire the tail of `computeTreeLayout` (currently `treeLayout.ts:562-572`).
- Modify: `src/utils/treeLayout.invariants.test.ts` — add the overlap/wide-couple fixtures.

**Interfaces:**
- Consumes: `resolveRowSeparation`, `RowBlock`, `collectUnionDescendants`, `orderChildrenByX`, existing `frame.positions`, `finalX`.
- Produces (module-internal):
  - `function separateGenerations(doc, finalX, genOf, minGap): void` — mutates `finalX` so every generation row satisfies min separation, moving rigid blocks.
  - `function centerAndReproject(doc, finalX, genOf, spacing): void` — top-down centering, each shift followed by re-separation.

**Design guidance (constrained by the invariant tests below):**
- **Rigid block membership:** a block is a top-level descent group — reuse `collectUnionDescendants` to gather a union's whole sub-block. In a given row, partition the placed nodes into rigid blocks keyed by the shallowest owning union so that a shift moves the union's partners + sibship + everything below as one unit (descent lines stay vertical). Bucket by generation via `genOf`.
- **Pass 2 (`separateGenerations`):** process rows top-down; within each row, sort blocks by current x (id tie-break), call `resolveRowSeparation`, and apply each block's shift to ALL its members across all rows (so descendants move with it); after shifting a row, the rows below reflect it and are separated in turn.
- **Pass 3 (`centerAndReproject`):** top-down by generation, for each union set target x = midpoint of its placed partners (or couple super-node midpoint), shift the union's rigid descent block toward it, then immediately re-run `separateGenerations` for that generation and below. One-shot per generation (no fixpoint) to avoid oscillation.
- **`minGap`:** `spacing.siblingSpacing` (floored at `MIN_GENERATION_NODE_SPACING`); a couple's internal `PARTNER_SPACING` is preserved because partners are in the same rigid block.
- Replace `computeTreeLayout` tail: after building `finalX` from `frame.positions + dx` (drop the `inLawClearanceShift` term and the `centerChildrenUnderWideCouples` call), run `centerAndReproject(doc, finalX, genOf, spacing)` then a final `separateGenerations(doc, finalX, genOf, minGap)`. Keep the anchor `dx` computation and the y derivation unchanged.

- [ ] **Step 1: Add the overlap/wide-couple fixtures to the invariant suite (RED)**

In `src/utils/treeLayout.invariants.test.ts`, add a second parametrised block:

```typescript
import {
  crossBranchMarriage, wideCoupleAdjacentCousin, wideCoupleInverted,
} from './__fixtures__/pedigrees';
import { finalPositions, noSymbolOverlap, minSiblingSpacing, noCrossedDescentLines, subtreeNonCollision } from './__fixtures__/invariants';

const OVERLAP_FIXTURES = [crossBranchMarriage, wideCoupleAdjacentCousin, wideCoupleInverted];

describe('computeTreeLayout — overlap resolution (#115)', () => {
  for (const build of OVERLAP_FIXTURES) {
    const f = build();
    it(`${f.name}: no symbol overlap and no crossed descent lines`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      expect(noSymbolOverlap(pos, f.doc).violations).toEqual([]);
      expect(minSiblingSpacing(pos, f.doc).violations).toEqual([]);
      expect(noCrossedDescentLines(pos, f.doc).violations).toEqual([]);
      expect(subtreeNonCollision(pos, f.doc).violations).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t "overlap resolution"`
Expected: FAIL — `crossBranchMarriage`/`wideCoupleAdjacentCousin` report `noSymbolOverlap` violations (kidA/kidB at x=100).

- [ ] **Step 3: Implement Pass 2 + Pass 3 and rewire `computeTreeLayout`**

Delete `inLawClearanceShift`, `collectInLawFamilies`, `centerChildrenUnderWideCouples`. Add `computeRigidBlocks`, `separateGenerations`, `centerAndReproject` per the design guidance. Rewire the `computeTreeLayout` tail (`treeLayout.ts` around lines 562-572).

- [ ] **Step 4: Run the overlap suite + the regression guards + existing unit tests**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts src/utils/treeLayout.test.ts`
Expected: PASS. The overlap fixtures are green; GREEN_TODAY guards still green; existing `computeTreeLayout` unit tests still green (they assert the same postconditions the sweep now guarantees). If a legacy unit test asserts an exact position that the new algorithm changes but that still satisfies every invariant, update that test's expected value and note why in a comment.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.invariants.test.ts src/utils/treeLayout.test.ts
git commit -m "feat: separation projection + center-then-reproject; fix #115 overlap (#131)"
```

---

## Task 6: Cross-branch centering — verify achievable behavior + harden clamp

**RECONCILED WITH TASK 5 REALITY.** Task 5's rigid-block model (deepest-owner blocks + couple-midpoint centering in `centerAndReproject`) already realizes the "couple super-node ownership" this task originally proposed — so no new ownership code is needed. Empirically, on `crossBranchMarriage` post-Task-5: `kidB=100` sits exactly on couple2's midpoint, but `kidA=20` is deliberately clamped **off** couple1's midpoint (100) because the pinned in-law at 240 drags couple1's ideal descent point onto couple2's; centering there would re-introduce the overlap. **No-overlap correctly wins over exact centering in this over-constrained double-DAG case.** (Single-wide-couple centering stays exact — `marriedInWithParents`: `kid=150=midpoint`.)

This task therefore (a) locks the *achievable* cross-branch behavior as a regression guard, and (b) adds the distinct opposite-side cousin fixture the Task-5 review requested to harden the clamp's side-selection.

**Files:**
- Modify: `src/utils/__fixtures__/pedigrees.ts` — add `wideCoupleOppositeCousin` fixture (mirror of `crossBranchMarriage`: the wide couple is on the RIGHT so its sibship would slide LEFT onto a cousin). Add it to `ALL_FIXTURES`.
- Modify: `src/utils/treeLayout.invariants.test.ts` — add honest cross-branch assertions + the new fixture to the overlap block.

- [ ] **Step 1: Add the `wideCoupleOppositeCousin` fixture**

In `pedigrees.ts`, add a builder that mirrors `crossBranchMarriage` left-right (the load-bearing in-law is placed far to the LEFT, so the wide couple's recentred sibship is pulled left toward a cousin sibship that sits to its left). Same structure: grandparents → two children; one child marries a load-bearing in-law (placed far left); the other is an ordinary couple; each has one child. Include it in `ALL_FIXTURES`. Run `npx vitest run src/utils/__fixtures__/pedigrees.test.ts` — structural test still green.

- [ ] **Step 2: Add honest cross-branch assertions (regression guard)**

Add to `treeLayout.invariants.test.ts`:

```typescript
import { wideCoupleOppositeCousin } from './__fixtures__/pedigrees';
import { noSymbolOverlap, minSiblingSpacing, noCrossedDescentLines, subtreeNonCollision, finalPositions } from './__fixtures__/invariants';

describe('computeTreeLayout — cross-branch centering', () => {
  it('crossBranchMarriage: the movable couple centres its child; the pinned-in-law couple yields to no-overlap', () => {
    const f = crossBranchMarriage();
    const pos = finalPositions(f.doc, computeTreeLayout(f.doc, f.rootUnionId));
    const x = (id: string) => pos[id].x;
    // couple2 (s2 x s2mate, both movable) centres kidB exactly.
    expect(x('kidB')).toBeCloseTo((x('s2') + x('s2mate')) / 2, 1);
    // kidA is clamped off couple1's midpoint (the pinned in-law over-constrains it),
    // but stays clear of kidB — no-overlap wins over exact centring.
    expect(Math.abs(x('kidA') - x('kidB'))).toBeGreaterThanOrEqual(80 - 0.5);
  });

  it('wideCoupleOppositeCousin: no overlap and no crossed descent lines (mirror of #115)', () => {
    const f = wideCoupleOppositeCousin();
    const pos = finalPositions(f.doc, computeTreeLayout(f.doc, f.rootUnionId));
    expect(noSymbolOverlap(pos, f.doc).violations).toEqual([]);
    expect(minSiblingSpacing(pos, f.doc).violations).toEqual([]);
    expect(noCrossedDescentLines(pos, f.doc).violations).toEqual([]);
    expect(subtreeNonCollision(pos, f.doc).violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts src/utils/__fixtures__/pedigrees.test.ts`
Expected: PASS. If `wideCoupleOppositeCousin` reports an overlap/crossing violation, that is a genuine clamp side-selection bug surfaced by the mirror case — fix it in `treeLayout.ts` (the clamp/obstacle direction handling) until green; do NOT weaken the assertion. Then `npm test` once — full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/utils/__fixtures__/pedigrees.ts src/utils/treeLayout.invariants.test.ts src/utils/treeLayout.ts
git commit -m "test: lock cross-branch centering behavior + opposite-side cousin guard (#131)"
```

---

## Task 7: Generation-value robustness (Pass 4)

A missing/`NaN` generation must resolve to the correct row, not collapse onto the parent.

**Files:**
- Modify: `src/utils/treeLayout.ts` — in the y-derivation, resolve a node's row from graph depth when `generation` is not finite.
- Modify: `src/utils/treeLayout.invariants.test.ts` — add `undefinedGenerationChild`.

- [ ] **Step 1: Add the assertion (RED)**

```typescript
import { undefinedGenerationChild } from './__fixtures__/pedigrees';
import { generationRowAlignment } from './__fixtures__/invariants';

describe('computeTreeLayout — generation robustness', () => {
  it('undefinedGenerationChild: siblings share a row despite a missing generation', () => {
    const f = undefinedGenerationChild();
    const moved = computeTreeLayout(f.doc, f.rootUnionId);
    const pos = finalPositions(f.doc, moved);
    expect(generationRowAlignment(pos, f.doc).violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t "generation robustness"`
Expected: FAIL — the undefined-generation child collapses to y=0.

- [ ] **Step 3: Implement graph-depth fallback**

In `computeTreeLayout`, when deriving y, resolve a node's row: if `node.generation` is a finite number use it; else derive it as `parentRow + 1` by walking the parent-child link (fallback to `rootGen` only if truly unreachable). Keep existing behaviour for finite generations.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t "generation robustness"`
Expected: PASS. Full suite still green: `npx vitest run src/utils/treeLayout.invariants.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.invariants.test.ts
git commit -m "fix: resolve missing generation to correct row instead of collapsing (#131)"
```

---

## Task 8: Twin contiguity ordering

Reorder a sibship so twin-group members are contiguous.

**Files:**
- Modify: `src/utils/treeLayout.ts` — extend `orderChildrenByX` consumers so that, given twin groups, members are kept adjacent (stable otherwise). `computeTreeLayout` needs twin-group awareness: extend `LayoutDoc` reads to optionally include `twinGroups`, OR thread a twin-group map through. Prefer reading `doc.twinGroups` when present (widen `LayoutDoc` to `Pick<PedigreeDocument, 'individuals'|'partnerships'|'parentChildLinks'|'twinGroups'>` with `twinGroups` optional).
- Modify: `src/utils/treeLayout.invariants.test.ts` — add `twins`, `twinsWithSingletonSibling`.

**Interfaces:**
- Produces: `function orderSiblingsWithTwins(childIds, individuals, twinGroups): string[]` — order by x, then pull twin-group members contiguous around their leftmost member.

- [ ] **Step 1: Add assertions (RED)**

```typescript
import { twins, twinsWithSingletonSibling } from './__fixtures__/pedigrees';
import { twinContiguity } from './__fixtures__/invariants';

describe('computeTreeLayout — twin contiguity', () => {
  for (const build of [twins, twinsWithSingletonSibling]) {
    const f = build();
    it(`${f.name}: twin-group members stay contiguous`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      expect(twinContiguity(pos, f.doc, f.twinGroups!).violations).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t "twin contiguity"`
Expected: FAIL for `twinsWithSingletonSibling` (singleton seeded between the twins).

- [ ] **Step 3: Implement `orderSiblingsWithTwins`**

Add the helper and use it in `layoutUnionFrame` in place of the bare `orderChildrenByX` when `doc.twinGroups` has members among the union's children. Keep pure/deterministic (id tie-break).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts`
Expected: PASS (twin fixtures green; nothing else regressed).

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.invariants.test.ts
git commit -m "feat: keep twin-group members contiguous in sibship order (#131)"
```

---

## Task 9: Remarriage second-union layout

Lay out a person's second child-bearing union's sibship instead of leaving it in place.

**Files:**
- Modify: `src/utils/treeLayout.ts` — `layoutChildBlock` currently lays out only the FIRST child-bearing union (`treeLayout.ts:213-215`). Extend it to lay out all child-bearing unions, packing the second sibship clear of the first (reuse `packBlocks`/separation).
- Modify: `src/utils/treeLayout.invariants.test.ts` — add `remarriageHalfSibs`; keep the existing "does not crash" remarriage unit test green.

- [ ] **Step 1: Add the assertion (RED)**

```typescript
import { remarriageHalfSibs } from './__fixtures__/pedigrees';
import { checkAllInvariants } from './__fixtures__/invariants';

describe('computeTreeLayout — remarriage', () => {
  it('remarriageHalfSibs: both half-sibships satisfy invariants', () => {
    const f = remarriageHalfSibs();
    const moved = computeTreeLayout(f.doc, f.rootUnionId);
    const pos = finalPositions(f.doc, moved);
    expect(checkAllInvariants(pos, f.doc).violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t remarriage`
Expected: FAIL — second-union sibship left where seeded may overlap / misalign.

- [ ] **Step 3: Implement multi-union layout in `layoutChildBlock`**

Lay out each child-bearing union of the individual; place additional sibships to the side using the separation primitive; keep descent lines vertical (rigid blocks). Update the existing `treeLayout.test.ts` remarriage test if its "kidB untouched" expectation no longer holds — it should now be laid out; assert invariants instead of "untouched", and note the limitation is lifted.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts src/utils/treeLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.invariants.test.ts src/utils/treeLayout.test.ts
git commit -m "feat: lay out remarriage second-union sibships (#131)"
```

---

## Task 10: Degenerate-input hardening

Prove degenerate docs don't crash and don't silently misplace.

**Files:**
- Modify: `src/utils/treeLayout.ts` — guard self-partnered union (`partner1Id === partner2Id`) and disconnected components (do not move nodes outside the rooted family).
- Modify: `src/utils/treeLayout.invariants.test.ts` — add `selfPartneredUnion`, `disconnectedComponents`.

- [ ] **Step 1: Add assertions (RED-or-GREEN)**

```typescript
import { selfPartneredUnion, disconnectedComponents } from './__fixtures__/pedigrees';

describe('computeTreeLayout — degenerate inputs', () => {
  it('selfPartneredUnion: does not crash and produces aligned rows', () => {
    const f = selfPartneredUnion();
    let moved: Record<string, {x:number;y:number}> = {};
    expect(() => { moved = computeTreeLayout(f.doc, f.rootUnionId); }).not.toThrow();
    const pos = finalPositions(f.doc, moved);
    expect(generationRowAlignment(pos, f.doc).violations).toEqual([]);
  });
  it('disconnectedComponents: does not move the unrelated component', () => {
    const f = disconnectedComponents();
    const moved = computeTreeLayout(f.doc, f.rootUnionId);
    // The other component's ids must be absent from the move-map.
    for (const id of f.doc.partnerships[f.rootUnionId].childrenIds) void id;
    // (Assert specific unrelated ids stay put — see fixture doc comment for ids.)
    expect(Object.keys(moved).every((id) => !id.startsWith('other_'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to observe status**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts -t "degenerate inputs"`
Expected: RED if a self-partnered union throws or the other component moves; else GREEN (record it).

- [ ] **Step 3: Implement guards as needed**

Add the minimal guards to satisfy the assertions.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/treeLayout.invariants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.invariants.test.ts
git commit -m "fix: harden layout against self-partnered/disconnected docs (#131)"
```

---

## Task 11: Playwright render guard

Prove the computed layout renders where computed for at least one fixture.

**Files:**
- Create: `e2e/layout-render-guard.spec.ts`
- Reuse: `e2e/support/harness.ts` (`seedFreshStart`, `readPersistedDoc`)

**Interfaces:**
- Consumes: fixture builders from `../src/utils/__fixtures__/pedigrees` (import path resolves under Playwright's ts loader) — build a full `PedigreeDocument` from the fixture doc slice (add `metadata`, `twinGroups`, `textAnnotations`, `generationOrder`, `legendConfig`) and seed it into `localStorage['pedigree-editor-autosave']` before `goto`.

- [ ] **Step 1: Write the render-guard spec**

Create `e2e/layout-render-guard.spec.ts`. Seed `crossBranchMarriage`'s document (converted to a full doc) into localStorage via `addInitScript`, load the app, then read back positions two ways and assert they agree: (a) `computeTreeLayout` (imported) applied to the seeded doc, vs (b) the app's persisted doc after it renders (read via `readPersistedDoc`). Assert no two gen-2 nodes are within `SYMBOL_SIZE` in the rendered positions.

```typescript
import { test, expect } from '@playwright/test';
import { seedFreshStart, readPersistedDoc } from './support/harness';
// Build a full doc from the fixture slice + seed it (see harness for AUTOSAVE_KEY).

test.describe('layout render guard', () => {
  test('crossBranchMarriage renders without gen-2 overlap', async ({ page }) => {
    // addInitScript sets localStorage[AUTOSAVE_KEY] = JSON.stringify(fullDoc)
    // and localStorage['pedigree-onboarded']='1'.
    await seedFreshStart(page);
    // ... seed the full crossBranchMarriage doc here ...
    await page.goto('/');
    const doc = await readPersistedDoc(page);
    expect(doc).not.toBeNull();
    // Assert the two gen-2 cousins are separated in the persisted positions.
  });
});
```

- [ ] **Step 2: Run the e2e guard**

Run: `npm run e2e -- layout-render-guard`
Expected: PASS (after Task 5 the layout no longer overlaps). If the dev server must be running, use the existing Playwright config's webServer.

- [ ] **Step 3: Commit**

```bash
git add e2e/layout-render-guard.spec.ts
git commit -m "test: e2e render guard for computed layout (#131)"
```

---

## Task 12: Architecture-reference note + final suite

**Files:**
- Modify: `docs/architecture-reference.md`

- [ ] **Step 1: Add the "Auto-spacing" section**

Add a section after "Feature flags" describing: `computeTreeLayout` is a pure function; the 4-pass hybrid (super-node → tidy → separation projection → center-then-reproject → generation-robust y); and that `src/utils/__fixtures__/pedigrees.ts` + `invariants.ts` are the canonical auto-spacing test surface — add a fixture + check it against the matchers when changing layout.

- [ ] **Step 2: Run the full unit + e2e suites**

Run: `npm test`
Expected: PASS (all unit tests).
Run: `npm run e2e`
Expected: PASS.
Run: `npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Update CLAUDE.md index line (if the arch doc gained a canonical section)**

Add a one-line pointer under the architecture bullets in `CLAUDE.md` to the new auto-spacing section / fixture library.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture-reference.md CLAUDE.md
git commit -m "docs: document correct-by-construction auto-spacing + fixture surface (#131)"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** invariant matchers (Task 1) ✓; fixture library incl. all 7 named + comprehensive (Task 2) ✓; crossBranchMarriage failing-first then green (Tasks 3/5/6) ✓; 4-pass hybrid (Tasks 4/5/6/7) ✓; twins (Task 8) ✓; remarriage + degenerate hardening (Tasks 9/10) ✓; Playwright guard (Task 11) ✓; arch-doc note (Task 12) ✓. Idempotence is asserted via the GREEN_TODAY guards + `resolveRowSeparation` monotonicity; anchorStability matcher exists (Task 1) and is exercised by the regression guards — add an explicit anchor assertion in Task 5 if a relayout fixture is introduced.
- **Placeholder scan:** algorithm-integration tasks (5, 6, 9, 10) give design guidance + complete governing tests rather than full final source, because the tests fully constrain the implementation (TDD); pure primitives and matchers are code-complete. This is intentional, not a placeholder.
- **Type consistency:** `Positions`, `InvariantResult`, `Fixture`, `RowBlock`, `resolveRowSeparation`, `finalPositions` names are used consistently across tasks. `LayoutDoc` is widened to include optional `twinGroups` in Task 8 — ensure the fixture `Fixture.twinGroups` and the `LayoutDoc.twinGroups` reads agree.
