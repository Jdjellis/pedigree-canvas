# Property-Based Invariant Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a construct-valid-by-construction `fast-check` pedigree generator and wire it to a fixed-seed green CI property + an env-gated discovery harness, so `reformatLayout` invariant coverage is adversarial instead of example-based.

**Architecture:** One generator (`arbitraryPedigree.ts`) exposes `arbitraryLayoutDoc(opts)` built on `fc.gen()`; it descends generation-by-generation so every doc is structurally valid. `SUPPORTED_SPACE` (≤2 unions/person, no married twins) feeds a deterministic green property; `FULL_SPACE` (3-hubs, married twins) feeds an opt-in discovery run that shrinks failures to minimal counterexamples. A meta-test proves the generator only emits valid docs.

**Tech Stack:** TypeScript, Vitest, fast-check.

## Global Constraints

- Branched off `claude/cool-kare-264dd2`; PR **stacked on #138** (rebase onto `main` after #138 merges).
- Never `import ... from 'konva'`; these are pure store/util modules — no React/Konva.
- No `any` (user rule); type all signatures.
- `fast-check` is a **devDependency** only.
- Green property MUST be deterministic (fixed seed) — no CI flakes.
- Discovery MUST be env-gated (`REFORMAT_DISCOVERY`) — never runs in normal CI.
- Do NOT touch `computeTreeLayout`, `ALL_FIXTURES`, or existing invariant matchers.
- The best-effort bounds `boundedPartnerDistance` / `chartWidth` are NOT asserted as properties (fixture-scoped only).

---

### Task 1: Generator + validity meta-test

**Files:**
- Modify: `package.json` (add `fast-check` devDependency + `test:discovery` script)
- Create: `src/utils/__fixtures__/arbitraryPedigree.ts`
- Test: `src/utils/__fixtures__/arbitraryPedigree.test.ts`

**Interfaces:**
- Consumes: `LayoutDoc` (`../treeLayout`); `Individual`, `PartnershipRelationship`, `ParentChildRelationship`, `TwinGroup` (`../../types/pedigree`); `RelationshipType`, `TwinType` (`../../types/enums`); `createDefaultIndividual` (`../../stores/pedigreeStore`).
- Produces: `arbitraryLayoutDoc(opts: PedigreeGenOptions): fc.Arbitrary<LayoutDoc>`; `SUPPORTED_SPACE`, `FULL_SPACE: PedigreeGenOptions`; `PedigreeGenOptions` interface.

- [ ] **Step 1: Install deps in the worktree + add fast-check**

Run:
```bash
cd /Users/joshuaellis/Documents/Dev/Pedigree/.claude/worktrees/reformat-pbt
npm install
npm install -D fast-check
```
Expected: `fast-check` appears under `devDependencies` in `package.json`; `npm test` (existing suite) is green.

- [ ] **Step 2: Add the `test:discovery` script**

In `package.json` `"scripts"`, add after `"test:coverage"`:
```jsonc
"test:discovery": "REFORMAT_DISCOVERY=1 vitest run src/utils/reformatLayout.discovery.test.ts",
```

- [ ] **Step 3: Write the failing meta-validity test**

Create `src/utils/__fixtures__/arbitraryPedigree.test.ts`:
```ts
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { arbitraryLayoutDoc, SUPPORTED_SPACE, FULL_SPACE } from './arbitraryPedigree';
import type { LayoutDoc } from '../treeLayout';

/** Assert a generated doc has no dangling references and consistent generations. */
function assertStructurallyValid(doc: LayoutDoc): void {
  const has = (id: string | undefined): boolean => !!id && id in doc.individuals;
  for (const u of Object.values(doc.partnerships)) {
    if (u.partner1Id && !has(u.partner1Id)) throw new Error(`dangling partner1 ${u.partner1Id}`);
    if (u.partner2Id && !has(u.partner2Id)) throw new Error(`dangling partner2 ${u.partner2Id}`);
    for (const c of u.childrenIds) if (!has(c)) throw new Error(`dangling child ${c}`);
  }
  for (const l of Object.values(doc.parentChildLinks)) {
    if (!has(l.childId)) throw new Error(`link to missing child ${l.childId}`);
    if (!(l.parentPartnershipId in doc.partnerships)) throw new Error(`link to missing union ${l.parentPartnershipId}`);
    // child sits exactly one generation below its (equal-generation) parents
    const u = doc.partnerships[l.parentPartnershipId];
    const parentGens = [u.partner1Id, u.partner2Id]
      .filter((p): p is string => has(p))
      .map((p) => doc.individuals[p].generation as number);
    const childGen = doc.individuals[l.childId].generation as number;
    for (const pg of parentGens) if (childGen !== pg + 1) throw new Error(`child gen ${childGen} not parentGen+1 (${pg})`);
  }
  for (const t of Object.values(doc.twinGroups ?? {})) {
    if (t.individualIds.length < 2) throw new Error(`twin group ${t.id} < 2 members`);
    for (const m of t.individualIds) if (!has(m)) throw new Error(`twin group refs missing ${m}`);
  }
}

describe('arbitraryLayoutDoc', () => {
  it('always produces a structurally valid doc (SUPPORTED_SPACE)', () => {
    fc.assert(fc.property(arbitraryLayoutDoc(SUPPORTED_SPACE), (doc) => { assertStructurallyValid(doc); }), { numRuns: 300 });
  });
  it('always produces a structurally valid doc (FULL_SPACE)', () => {
    fc.assert(fc.property(arbitraryLayoutDoc(FULL_SPACE), (doc) => { assertStructurallyValid(doc); }), { numRuns: 300 });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/utils/__fixtures__/arbitraryPedigree.test.ts`
Expected: FAIL — `Cannot find module './arbitraryPedigree'`.

- [ ] **Step 5: Implement the generator**

Create `src/utils/__fixtures__/arbitraryPedigree.ts`:
```ts
import * as fc from 'fast-check';
import type { LayoutDoc } from '../treeLayout';
import type {
  Individual, PartnershipRelationship, ParentChildRelationship, TwinGroup,
} from '../../types/pedigree';
import { RelationshipType, TwinType } from '../../types/enums';
import { createDefaultIndividual } from '../../stores/pedigreeStore';

export interface PedigreeGenOptions {
  /** Max unions any one individual may hold. Supported space: 2; full: 3. */
  maxUnionDegree: number;
  /** May a twin also be a partner in a couple? Supported: false; full: true. */
  allowMarriedTwins: boolean;
  maxGenerations: number;
  maxFounderFamilies: number;
  maxChildrenPerUnion: number;
}

export const SUPPORTED_SPACE: PedigreeGenOptions = {
  maxUnionDegree: 2, allowMarriedTwins: false,
  maxGenerations: 4, maxFounderFamilies: 3, maxChildrenPerUnion: 3,
};
export const FULL_SPACE: PedigreeGenOptions = {
  maxUnionDegree: 3, allowMarriedTwins: true,
  maxGenerations: 4, maxFounderFamilies: 3, maxChildrenPerUnion: 3,
};

/**
 * A fast-check arbitrary producing a structurally valid LayoutDoc, built
 * top-down (founders → descendants) so validity holds by construction. Uses
 * `fc.gen()` so the imperative builder still shrinks (fast-check shrinks the
 * underlying draws), yielding minimal, valid counterexamples.
 */
export function arbitraryLayoutDoc(opts: PedigreeGenOptions): fc.Arbitrary<LayoutDoc> {
  return fc.gen().map((gen) => buildDoc(gen, opts));
}

function buildDoc(gen: fc.GeneratorValue, opts: PedigreeGenOptions): LayoutDoc {
  const individuals: Record<string, Individual> = {};
  const partnerships: Record<string, PartnershipRelationship> = {};
  const parentChildLinks: Record<string, ParentChildRelationship> = {};
  const twinGroups: Record<string, TwinGroup> = {};
  let n = 0;
  const nextId = (p: string): string => `${p}${n++}`;
  const unionDegree = new Map<string, number>(); // individual → #unions held

  const addInd = (generation: number): string => {
    const id = nextId('i');
    individuals[id] = createDefaultIndividual({ id, generation, position: { x: 0, y: generation * 150 } });
    return id;
  };
  const addUnion = (a: string | undefined, b: string | undefined): string => {
    const id = nextId('u');
    partnerships[id] = { id, type: RelationshipType.Partnership, partner1Id: a, partner2Id: b, childrenIds: [] };
    for (const p of [a, b]) if (p) unionDegree.set(p, (unionDegree.get(p) ?? 0) + 1);
    return id;
  };
  const addChild = (unionId: string, childGen: number): string => {
    const c = addInd(childGen);
    partnerships[unionId].childrenIds.push(c);
    const lid = nextId('l');
    parentChildLinks[lid] = { id: lid, type: RelationshipType.ParentChild, parentPartnershipId: unionId, childId: c, isAdoptive: false };
    return c;
  };
  const isTwin = (id: string): boolean =>
    Object.values(twinGroups).some((t) => t.individualIds.includes(id));

  // Gen 0: founder couples.
  const families = gen(fc.integer, { min: 1, max: opts.maxFounderFamilies });
  let fertile: Array<{ unionId: string; gen: number }> = [];
  const eligible: string[] = []; // individuals that could take another spouse

  for (let f = 0; f < families; f++) {
    const u = addUnion(addInd(0), addInd(0));
    fertile.push({ unionId: u, gen: 1 });
  }

  // Descend.
  const maxGen = gen(fc.integer, { min: 1, max: opts.maxGenerations });
  for (let g = 1; g <= maxGen; g++) {
    const nextFertile: Array<{ unionId: string; gen: number }> = [];
    for (const fu of fertile) {
      if (fu.gen !== g) { nextFertile.push(fu); continue; }
      const childCount = gen(fc.integer, { min: 0, max: opts.maxChildrenPerUnion });
      const kids: string[] = [];
      for (let c = 0; c < childCount; c++) kids.push(addChild(fu.unionId, g));
      if (kids.length >= 2 && gen(fc.boolean)) {
        const tid = nextId('t');
        twinGroups[tid] = { id: tid, twinType: TwinType.Monozygotic, individualIds: [kids[0], kids[1]], parentPartnershipId: fu.unionId };
      }
      for (const kid of kids) {
        if (gen(fc.boolean) && (opts.allowMarriedTwins || !isTwin(kid))) {
          const u = addUnion(kid, addInd(g));
          nextFertile.push({ unionId: u, gen: g + 1 });
          eligible.push(kid);
        }
      }
    }
    fertile = nextFertile;
  }

  // Cross-branch marriage: marry two eligible same-generation individuals from
  // different unions (both load-bearing) — reformatLayout's core case.
  if (eligible.length >= 2 && gen(fc.boolean)) {
    const byGen = new Map<number, string[]>();
    for (const id of eligible) {
      const gg = individuals[id].generation as number;
      (byGen.get(gg) ?? byGen.set(gg, []).get(gg)!).push(id);
    }
    const rows = [...byGen.values()].filter((r) => r.length >= 2);
    if (rows.length) {
      const row = rows[gen(fc.integer, { min: 0, max: rows.length - 1 })];
      const a = row[0];
      const b = row[1];
      if (a !== b && (unionDegree.get(a) ?? 0) < opts.maxUnionDegree && (unionDegree.get(b) ?? 0) < opts.maxUnionDegree) {
        addUnion(a, b);
      }
    }
  }

  // Hub boost: give one eligible individual extra spouses up to maxUnionDegree.
  if (eligible.length && opts.maxUnionDegree > 2 && gen(fc.boolean)) {
    const hub = eligible[gen(fc.integer, { min: 0, max: eligible.length - 1 })];
    const hg = individuals[hub].generation as number;
    while ((unionDegree.get(hub) ?? 0) < opts.maxUnionDegree) addUnion(hub, addInd(hg));
  }

  return { individuals, partnerships, parentChildLinks, twinGroups };
}
```

- [ ] **Step 6: Run the meta-test to verify it passes**

Run: `npx vitest run src/utils/__fixtures__/arbitraryPedigree.test.ts`
Expected: PASS (2 tests). If a validity error shrinks out, fix the builder until green — the generator must be trusted before Task 2.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc -b && npx eslint src/utils/__fixtures__/arbitraryPedigree.ts src/utils/__fixtures__/arbitraryPedigree.test.ts`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/utils/__fixtures__/arbitraryPedigree.ts src/utils/__fixtures__/arbitraryPedigree.test.ts
git commit -m "test: add fast-check valid-LayoutDoc generator + validity meta-test (#141)"
```

---

### Task 2: Green CI property (supported space)

**Files:**
- Create: `src/utils/reformatLayout.property.test.ts`

**Interfaces:**
- Consumes: `arbitraryLayoutDoc`, `SUPPORTED_SPACE` (Task 1); `reformatLayout` (`./reformatLayout`); `finalPositions`, `checkAllInvariants`, `noNodeBetweenPartners`, `twinContiguity` (`./__fixtures__/invariants`).
- Produces: standing green regression property (no exports).

- [ ] **Step 1: Write the property test**

Create `src/utils/reformatLayout.property.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import { arbitraryLayoutDoc, SUPPORTED_SPACE } from './__fixtures__/arbitraryPedigree';
import {
  finalPositions, checkAllInvariants, noNodeBetweenPartners, twinContiguity,
} from './__fixtures__/invariants';

/** Apply reformat moves back onto the doc (for the idempotence check). */
function settle(doc: LayoutDoc, moves: Record<string, { x: number; y: number }>): LayoutDoc {
  return {
    ...doc,
    individuals: Object.fromEntries(
      Object.entries(doc.individuals).map(([id, node]) => [
        id, moves[id] ? { ...node, position: { x: moves[id].x, y: moves[id].y } } : node,
      ]),
    ),
  };
}

describe('reformatLayout property (supported space)', () => {
  it('satisfies every hard invariant and is idempotent over random valid docs', () => {
    fc.assert(
      fc.property(arbitraryLayoutDoc(SUPPORTED_SPACE), (doc) => {
        const pos = finalPositions(doc, reformatLayout(doc));
        expect(checkAllInvariants(pos, doc).violations).toEqual([]);
        expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
        expect(twinContiguity(pos, doc, doc.twinGroups ?? {}).ok).toBe(true);
        // idempotence: a second pass moves nothing (<1px)
        const settled = settle(doc, reformatLayout(doc));
        const twice = reformatLayout(settled);
        for (const [id, p] of Object.entries(twice)) {
          expect(Math.abs(p.x - settled.individuals[id].position.x)).toBeLessThan(1);
          expect(Math.abs(p.y - settled.individuals[id].position.y)).toBeLessThan(1);
        }
      }),
      { seed: 42, numRuns: 500 },
    );
  });
});
```

- [ ] **Step 2: Run the property**

Run: `npx vitest run src/utils/reformatLayout.property.test.ts`
Expected: PASS. If it FAILS, fast-check prints a shrunk counterexample — that is a **new gap in the supported space**. Do not weaken the property; capture the counterexample, add it as a named fixture reproducing the failure, and report it (comment on #141) before proceeding. Only continue once green.

- [ ] **Step 3: Typecheck + lint + full suite**

Run: `npx tsc -b && npx eslint src/utils/reformatLayout.property.test.ts && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/utils/reformatLayout.property.test.ts
git commit -m "test: fixed-seed property guard for reformatLayout over supported space (#141)"
```

---

### Task 3: Discovery harness + run + triage

**Files:**
- Create: `src/utils/reformatLayout.discovery.test.ts`

**Interfaces:**
- Consumes: same as Task 2 but `FULL_SPACE` instead of `SUPPORTED_SPACE`.
- Produces: env-gated discovery run (no exports).

- [ ] **Step 1: Write the discovery harness**

Create `src/utils/reformatLayout.discovery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import { arbitraryLayoutDoc, FULL_SPACE } from './__fixtures__/arbitraryPedigree';
import {
  finalPositions, checkAllInvariants, noNodeBetweenPartners, twinContiguity,
} from './__fixtures__/invariants';

function settle(doc: LayoutDoc, moves: Record<string, { x: number; y: number }>): LayoutDoc {
  return {
    ...doc,
    individuals: Object.fromEntries(
      Object.entries(doc.individuals).map(([id, node]) => [
        id, moves[id] ? { ...node, position: { x: moves[id].x, y: moves[id].y } } : node,
      ]),
    ),
  };
}

// Opt-in only: `npm run test:discovery`. Never runs in normal CI (shows skipped).
describe.skipIf(!process.env.REFORMAT_DISCOVERY)('reformatLayout — discovery (full space)', () => {
  it('finds no invariant violation across the full topology space', () => {
    fc.assert(
      // Same invariant set as the green property, over FULL_SPACE.
      fc.property(arbitraryLayoutDoc(FULL_SPACE), (doc) => {
        const pos = finalPositions(doc, reformatLayout(doc));
        expect(checkAllInvariants(pos, doc).violations).toEqual([]);
        expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
        expect(twinContiguity(pos, doc, doc.twinGroups ?? {}).ok).toBe(true);
        const settled = settle(doc, reformatLayout(doc));
        const twice = reformatLayout(settled);
        for (const [id, p] of Object.entries(twice)) {
          expect(Math.abs(p.x - settled.individuals[id].position.x)).toBeLessThan(1);
          expect(Math.abs(p.y - settled.individuals[id].position.y)).toBeLessThan(1);
        }
      }),
      { numRuns: 2000 }, // rotating seed → explores new territory each run
    );
  });
});
```

- [ ] **Step 2: Confirm it is skipped in a normal run**

Run: `npx vitest run src/utils/reformatLayout.discovery.test.ts`
Expected: the test is SKIPPED (0 run), suite green.

- [ ] **Step 3: Run discovery and harvest counterexamples**

Run: `npm run test:discovery`
Expected: FAIL — fast-check shrinks to minimal counterexample(s), printing the doc and seed. Record each shrunk doc.

- [ ] **Step 4: Triage each counterexample into #141**

For each shrunk counterexample, classify:
- **Known** (a 3+-union hub → `minPartnerSpacing`; a married twin → `twinContiguity`): confirms the `SUPPORTED_SPACE` caps are the right exclusions. Note it on #141.
- **New** (any other shape): a newly-discovered gap. Comment on #141 with the minimal doc + which invariant + the seed.

Run: `gh issue comment 141 --body "<triage summary: N counterexamples, classified known/new, with the minimal docs + seeds>"`

- [ ] **Step 5: Commit**

```bash
git add src/utils/reformatLayout.discovery.test.ts
git commit -m "test: env-gated full-space discovery harness for reformatLayout (#141)"
```

---

### Task 4: CLAUDE.md discovery-on-engine-change note

**Files:**
- Modify: `CLAUDE.md` (project root, the Auto-spacing bullet)

**Interfaces:**
- Consumes: nothing. Produces: nothing (docs).

- [ ] **Step 1: Add the note**

In `CLAUDE.md`, under the `- **Auto-spacing**` bullet, append a sub-note:
```markdown
  - When changing `reformatLayout` **or** any layout invariant, run
    `npm run test:discovery` (the env-gated full-space property harness) and
    triage findings before merge; re-run it after an engine fix before widening
    the `SUPPORTED_SPACE` caps in `reformatLayout.property.test.ts`. See issue #141.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: prompt discovery-harness runs on layout-engine changes (#141)"
```

---

## Self-Review

**Spec coverage:** §4.1 generator → Task 1; §4.2 green property → Task 2; §4.3 discovery + triggering → Task 3; §4.4 meta-test → Task 1 (Step 3); §4.5 CLAUDE.md note → Task 4; §4.6 dep + script → Task 1 (Steps 1–2). All spec sections covered.

**Placeholder scan:** No TBD/TODO. The only free-form step is Task 3 Step 4 (triage), which is inherently a human/agent judgement over discovered docs — its procedure and the exact `gh` command are specified.

**Type consistency:** `arbitraryLayoutDoc`, `SUPPORTED_SPACE`, `FULL_SPACE`, `PedigreeGenOptions` used identically across Tasks 1–3. `finalPositions`/`checkAllInvariants`/`noNodeBetweenPartners`/`twinContiguity` signatures match `invariants.ts`. `reformatLayout(doc)` return type `Record<string,{x,y}>` matches `settle`/`finalPositions` usage.
