# Auto-spacing Tidy Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the greedy, path-dependent auto-spacing nudges with a single deterministic tidy-tree layout that centres every sibship under its parents and is reused by both adds and drag.

**Architecture:** A new pure module `src/utils/treeLayout.ts` computes x (tidy-tree packing) and y (one straight row per generation) for a whole connected blood family from the relationship graph plus the current left-to-right order. The store calls it via a single `relayoutFamily` helper inside each add's `set(...)` (one undo step) and on drag commit. The old `src/utils/respacing.ts` is retired.

**Tech Stack:** TypeScript, Zustand + zundo, Vitest. react-konva canvas logic is untestable under jsdom, so all layout logic lives in pure modules tested directly (see `src/utils/respacing.test.ts` for the established pattern).

## Global Constraints

- TypeScript: never use `any`; type-annotate every function signature; JSDoc on every exported function (per repo + global conventions).
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. One logical change per commit. Run tests before committing.
- Test runner: `npm test` (vitest). Run a single file with `npx vitest run <path>`.
- Layout constants live in `src/utils/constants.ts`: `SIBLING_SPACING = 80`, `PARTNER_SPACING = 120`, `GENERATION_SPACING = 150`, `MIN_GENERATION_NODE_SPACING = 80`.
- Every compound family add must remain a **single undo step** (insert + relayout share one `set(...)`).
- Layout must be **idempotent**: running it on an already-tidy family returns no moves.
- Coordinate model: x from tidy packing; y normalised to `rootY + (generation − rootGeneration) × GENERATION_SPACING`.
- Drag is already constrained to horizontal-only via `dragBoundFunc` in `PedigreeSymbol.tsx` — do not remove that; only change the commit.
- Test fixtures build individuals with `createDefaultIndividual({ id, generation, position })` from `src/stores/pedigreeStore.ts`.

---

## File Structure

- **Create** `src/utils/treeLayout.ts` — the pure layout engine and its small helpers.
- **Create** `src/utils/treeLayout.test.ts` — unit tests for the engine.
- **Modify** `src/stores/pedigreeStore.ts` — add `relayoutFamily` helper + `applyPositions`; rewrite the 7 family add ops to call it; add `commitDragWithRelayout` action; remove dead helpers and `respacing` imports.
- **Modify** `src/stores/pedigreeStore.test.ts` — replace the old reflow expectations (issues #17/#30) with the new centred expectations; add scenario acceptance tests.
- **Modify** `src/components/canvas/symbols/symbolDrag.ts` — commit a drag via `commitDragWithRelayout`.
- **Modify** `src/components/canvas/symbols/symbolDrag.test.ts` — assert drop triggers relayout, still one undo step.
- **Delete** `src/utils/respacing.ts` and `src/utils/respacing.test.ts` — superseded.

## Interface summary (treeLayout.ts public API)

```ts
export interface LayoutSpacing { siblingSpacing: number; partnerSpacing: number; generationSpacing: number; }
export const DEFAULT_LAYOUT_SPACING: LayoutSpacing;
export type LayoutDoc = Pick<PedigreeDocument, 'individuals' | 'partnerships' | 'parentChildLinks'>;
export interface Block { anchorX: number; minX: number; maxX: number; }

export function orderChildrenByX(childIds: readonly string[], individuals: Record<string, Individual>): string[];
export function isLoadBearingInLaw(doc: LayoutDoc, individualId: string): boolean;
export function findRootUnion(doc: LayoutDoc, nodeId: string): string | null;
export function coupleAround(center: number, bloodId: string, inLawId: string | null, individuals: Record<string, Individual>, partnerSpacing: number): Record<string, number>;
export function packBlocks(blocks: readonly Block[], spacing: number): number[];
export function computeTreeLayout(doc: LayoutDoc, rootUnionId: string, spacing?: LayoutSpacing): Record<string, { x: number; y: number }>;
```

---

### Task 1: Small pure helpers in `treeLayout.ts`

**Files:**
- Create: `src/utils/treeLayout.ts`
- Test: `src/utils/treeLayout.test.ts`

**Interfaces:**
- Consumes: `Individual`, `PartnershipRelationship`, `ParentChildRelationship`, `PedigreeDocument` from `src/types/pedigree.ts`; constants from `src/utils/constants.ts`; `createDefaultIndividual` from `src/stores/pedigreeStore.ts`.
- Produces: `LayoutSpacing`, `DEFAULT_LAYOUT_SPACING`, `LayoutDoc`, `Block`, `orderChildrenByX`, `isLoadBearingInLaw`, `findRootUnion`, `coupleAround`, `packBlocks` (signatures above).

- [ ] **Step 1: Write the failing tests**

```ts
// src/utils/treeLayout.test.ts
import { describe, it, expect } from 'vitest';
import {
  orderChildrenByX,
  isLoadBearingInLaw,
  findRootUnion,
  coupleAround,
  packBlocks,
  type LayoutDoc,
} from './treeLayout';
import type { Individual, PartnershipRelationship, ParentChildRelationship } from '../types/pedigree';
import { RelationshipType } from '../types/enums';
import { createDefaultIndividual } from '../stores/pedigreeStore';

function ind(id: string, x: number, generation = 0): Individual {
  return createDefaultIndividual({ id, generation, position: { x, y: generation * 150 } });
}
function union(id: string, p1: string | undefined, p2: string | undefined, kids: string[] = []): PartnershipRelationship {
  return { id, type: RelationshipType.Partnership, partner1Id: p1, partner2Id: p2, childrenIds: kids };
}
function link(id: string, parentPartnershipId: string, childId: string): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdopted: false };
}
function doc(parts: {
  individuals?: Record<string, Individual>;
  partnerships?: Record<string, PartnershipRelationship>;
  parentChildLinks?: Record<string, ParentChildRelationship>;
}): LayoutDoc {
  return { individuals: parts.individuals ?? {}, partnerships: parts.partnerships ?? {}, parentChildLinks: parts.parentChildLinks ?? {} };
}

describe('orderChildrenByX', () => {
  it('sorts present children by ascending x, dropping missing ids', () => {
    const individuals = { a: ind('a', 30), b: ind('b', 10), c: ind('c', 20) };
    expect(orderChildrenByX(['a', 'b', 'c', 'ghost'], individuals)).toEqual(['b', 'c', 'a']);
  });
  it('breaks x ties deterministically by id', () => {
    const individuals = { a: ind('a', 0), b: ind('b', 0) };
    expect(orderChildrenByX(['b', 'a'], individuals)).toEqual(['a', 'b']);
  });
});

describe('isLoadBearingInLaw', () => {
  it('is true when the individual has a parent link', () => {
    const d = doc({ parentChildLinks: { l: link('l', 'u', 'x') } });
    expect(isLoadBearingInLaw(d, 'x')).toBe(true);
  });
  it('is false when the individual has no parents in the document', () => {
    expect(isLoadBearingInLaw(doc({}), 'x')).toBe(false);
  });
});

describe('findRootUnion', () => {
  it('climbs parent links to the topmost union', () => {
    // grandparents gp -> parent p -> child c
    const d = doc({
      partnerships: { top: union('top', 'gp1', 'gp2', ['p']), low: union('low', 'p', 'inlaw', ['c']) },
      parentChildLinks: { l1: link('l1', 'top', 'p'), l2: link('l2', 'low', 'c') },
    });
    expect(findRootUnion(d, 'c')).toBe('top');
  });
  it('returns a founder\'s own child-bearing union when it has no parents', () => {
    const d = doc({ partnerships: { u: union('u', 'a', 'b', ['c']) } });
    expect(findRootUnion(d, 'a')).toBe('u');
  });
  it('returns null for a lone node with no union', () => {
    expect(findRootUnion(doc({ individuals: { a: ind('a', 0) } }), 'a')).toBeNull();
  });
});

describe('coupleAround', () => {
  it('places a sole parent at the centre', () => {
    expect(coupleAround(100, 'p', null, { p: ind('p', 0) }, 120)).toEqual({ p: 100 });
  });
  it('splits a couple by partnerSpacing around the centre, preserving current side', () => {
    // in-law currently to the right of blood -> stays right
    const individuals = { blood: ind('blood', 0), inlaw: ind('inlaw', 120) };
    expect(coupleAround(100, 'blood', 'inlaw', individuals, 120)).toEqual({ blood: 40, inlaw: 160 });
  });
  it('keeps an in-law on the left when it currently sits left', () => {
    const individuals = { blood: ind('blood', 120), inlaw: ind('inlaw', 0) };
    expect(coupleAround(100, 'blood', 'inlaw', individuals, 120)).toEqual({ inlaw: 40, blood: 160 });
  });
});

describe('packBlocks', () => {
  it('spaces single-point blocks exactly sibling-spacing apart', () => {
    const leaves = [{ anchorX: 0, minX: 0, maxX: 0 }, { anchorX: 0, minX: 0, maxX: 0 }, { anchorX: 0, minX: 0, maxX: 0 }];
    expect(packBlocks(leaves, 80)).toEqual([0, 80, 160]);
  });
  it('separates wide blocks by their extents plus spacing', () => {
    // block0 a point at 0; block1 spans -60..60 (a couple)
    const offsets = packBlocks([{ anchorX: 0, minX: 0, maxX: 0 }, { anchorX: 0, minX: -60, maxX: 60 }], 80);
    // block1 must start at 0+80=80 -> offset = 80 - (-60) = 140
    expect(offsets).toEqual([0, 140]);
  });
  it('never pulls an already-clear block left', () => {
    const offsets = packBlocks([{ anchorX: 0, minX: 0, maxX: 0 }, { anchorX: 0, minX: 500, maxX: 500 }], 80);
    expect(offsets).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/treeLayout.test.ts`
Expected: FAIL — `treeLayout` module / exports do not exist.

- [ ] **Step 3: Implement the helpers**

```ts
// src/utils/treeLayout.ts
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  PedigreeDocument,
} from '../types/pedigree';
import { SIBLING_SPACING, PARTNER_SPACING, GENERATION_SPACING } from './constants';

/** Horizontal/vertical spacing knobs for the tidy layout. */
export interface LayoutSpacing {
  siblingSpacing: number;
  partnerSpacing: number;
  generationSpacing: number;
}

/** Default spacing, sourced from the shared layout constants. */
export const DEFAULT_LAYOUT_SPACING: LayoutSpacing = {
  siblingSpacing: SIBLING_SPACING,
  partnerSpacing: PARTNER_SPACING,
  generationSpacing: GENERATION_SPACING,
};

/** The slice of a document the layout reads. */
export type LayoutDoc = Pick<
  PedigreeDocument,
  'individuals' | 'partnerships' | 'parentChildLinks'
>;

/** A laid-out subtree's horizontal footprint: its blood anchor and its extent. */
export interface Block {
  anchorX: number;
  minX: number;
  maxX: number;
}

/**
 * Order children by their current x (ascending), so a manual left-to-right
 * arrangement survives a relayout. Missing ids are dropped; x ties break by id
 * for determinism.
 */
export function orderChildrenByX(
  childIds: readonly string[],
  individuals: Record<string, Individual>,
): string[] {
  return [...childIds]
    .filter((id) => individuals[id])
    .sort((a, b) => {
      const ax = individuals[a].position.x;
      const bx = individuals[b].position.x;
      if (ax !== bx) return ax - bx;
      return a < b ? -1 : a > b ? 1 : 0;
    });
}

/**
 * True when `individualId` has its own parents present in the document, i.e. it
 * is "load-bearing" for its own blood family and must not be dragged across to
 * sit beside a spouse during another family's relayout.
 */
export function isLoadBearingInLaw(doc: LayoutDoc, individualId: string): boolean {
  return Object.values(doc.parentChildLinks).some(
    (l) => l.childId === individualId,
  );
}

/**
 * Climb parent links from `nodeId` to the topmost ancestor union of its
 * connected blood family. When the node is itself a founder (no parents), return
 * its own child-bearing union if it has one. Returns null when the node heads no
 * union. Guards against consanguinity cycles.
 */
export function findRootUnion(doc: LayoutDoc, nodeId: string): string | null {
  let childId = nodeId;
  let rootUnion: string | null = null;
  const seen = new Set<string>();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const parentLink = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === childId,
    );
    if (!parentLink) break;
    rootUnion = parentLink.parentPartnershipId;
    if (seen.has(rootUnion)) break;
    seen.add(rootUnion);
    const u = doc.partnerships[rootUnion];
    if (!u) break;
    const next = u.partner1Id ?? u.partner2Id;
    if (!next) break;
    childId = next;
  }
  if (rootUnion) return rootUnion;
  const own = Object.values(doc.partnerships).find(
    (p) =>
      (p.partner1Id === nodeId || p.partner2Id === nodeId) &&
      p.childrenIds.length > 0,
  );
  return own ? own.id : null;
}

/**
 * Position a blood individual (and its married-in partner, if any) centred on
 * `center`. A sole parent sits exactly on the centre; a couple splits by
 * `partnerSpacing`, preserving whichever side the in-law currently occupies.
 */
export function coupleAround(
  center: number,
  bloodId: string,
  inLawId: string | null,
  individuals: Record<string, Individual>,
  partnerSpacing: number,
): Record<string, number> {
  if (!inLawId || !individuals[inLawId]) return { [bloodId]: center };
  const bloodX = individuals[bloodId]?.position.x ?? 0;
  const inLawX = individuals[inLawId].position.x;
  const half = partnerSpacing / 2;
  return inLawX < bloodX
    ? { [inLawId]: center - half, [bloodId]: center + half }
    : { [bloodId]: center - half, [inLawId]: center + half };
}

/**
 * Pack laid-out sibling blocks left-to-right. Returns the x-offset to add to
 * each block so adjacent blocks clear each other by at least `spacing`
 * (measured between their extents). The first block keeps its own coordinates;
 * a block already clear of its predecessor is never pulled left.
 */
export function packBlocks(blocks: readonly Block[], spacing: number): number[] {
  const offsets: number[] = [];
  let prevMaxPlaced: number | null = null;
  for (const b of blocks) {
    let offset: number;
    if (prevMaxPlaced === null) {
      offset = 0;
    } else {
      offset = prevMaxPlaced + spacing - b.minX;
      if (offset < 0) offset = 0;
    }
    offsets.push(offset);
    prevMaxPlaced = b.maxX + offset;
  }
  return offsets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/treeLayout.test.ts`
Expected: PASS (all helper tests green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.test.ts
git commit -m "feat: add pure layout helpers for tidy tree engine (#55)"
```

---

### Task 2: Recursive tidy layout — `computeTreeLayout` (centring)

**Files:**
- Modify: `src/utils/treeLayout.ts`
- Test: `src/utils/treeLayout.test.ts`

**Interfaces:**
- Consumes: all Task 1 helpers.
- Produces: `computeTreeLayout(doc: LayoutDoc, rootUnionId: string, spacing?: LayoutSpacing): Record<string, { x: number; y: number }>`. Returns only nodes whose position changes.

This task adds the recursion and proves **centring** (scenario 4) and **idempotence**. Scenarios 1 and 2 are proven in Task 3 (same function, more tests).

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/utils/treeLayout.test.ts
import { computeTreeLayout } from './treeLayout';
import type { LayoutDoc as _LD } from './treeLayout';

describe('computeTreeLayout — centring', () => {
  it('centres a sole parent over a fanned-right sibling row (scenario 4)', () => {
    // Parent p (gen 0) at x=0; three children fanned right at 0,80,160 (gen 1).
    const individuals = {
      p: ind('p', 0, 0),
      c1: ind('c1', 0, 1), c2: ind('c2', 80, 1), c3: ind('c3', 160, 1),
    };
    const partnerships = { u: union('u', 'p', undefined, ['c1', 'c2', 'c3']) };
    const parentChildLinks = {
      a: link('a', 'u', 'c1'), b: link('b', 'u', 'c2'), c: link('c', 'u', 'c3'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'u');
    // Anchor keeps the parent's x (0) fixed; children re-centre symmetrically.
    expect(moved.p?.x ?? 0).toBe(0);
    const xs = [moved.c1?.x ?? 0, moved.c2?.x ?? 80, moved.c3?.x ?? 160];
    // Children span 160 wide, centred on parent (0): -80, 0, 80.
    expect(xs).toEqual([-80, 0, 80]);
  });

  it('centres a two-parent couple over their children', () => {
    const individuals = {
      m: ind('m', 0, 0), f: ind('f', 120, 0),
      c1: ind('c1', 0, 1), c2: ind('c2', 80, 1), c3: ind('c3', 160, 1),
    };
    const partnerships = { u: union('u', 'm', 'f', ['c1', 'c2', 'c3']) };
    const parentChildLinks = {
      a: link('a', 'u', 'c1'), b: link('b', 'u', 'c2'), c: link('c', 'u', 'c3'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'u');
    // Couple midpoint (60) is the anchor and stays fixed; children centre on 60.
    const cxs = [moved.c1?.x, moved.c2?.x, moved.c3?.x].map((x, i) => x ?? [0, 80, 160][i]);
    const childCentre = (Math.min(...cxs) + Math.max(...cxs)) / 2;
    expect(childCentre).toBe(60);
  });

  it('is idempotent: a tidy family returns no moves', () => {
    const individuals = {
      p: ind('p', 0, 0),
      c1: ind('c1', -80, 1), c2: ind('c2', 0, 1), c3: ind('c3', 80, 1),
    };
    const partnerships = { u: union('u', 'p', undefined, ['c1', 'c2', 'c3']) };
    const parentChildLinks = {
      a: link('a', 'u', 'c1'), b: link('b', 'u', 'c2'), c: link('c', 'u', 'c3'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'u');
    expect(moved).toEqual({});
  });

  it('normalises y to one row per generation', () => {
    const individuals = {
      p: ind('p', 0, 0),
      c1: ind('c1', -80, 1),
      // c2 dropped a few px off the row (e.g. mid-drag); layout pulls it back.
      c2: { ...ind('c2', 0, 1), position: { x: 0, y: 137 } },
    };
    const partnerships = { u: union('u', 'p', undefined, ['c1', 'c2']) };
    const parentChildLinks = { a: link('a', 'u', 'c1'), b: link('b', 'u', 'c2') };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'u');
    // Root p at gen 0, y=0; gen 1 row sits at y = 0 + 1*150 = 150.
    expect(moved.c2?.y).toBe(150);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/treeLayout.test.ts -t 'centring'`
Expected: FAIL — `computeTreeLayout` not exported.

- [ ] **Step 3: Implement the recursion + `computeTreeLayout`**

```ts
// append to src/utils/treeLayout.ts

/** A laid-out subtree in local frame coordinates. */
interface Frame {
  positions: Record<string, number>;
  anchorX: number;
  minX: number;
  maxX: number;
}

/**
 * Lay out the subtree headed by `childId` (a blood node): the child, its
 * married-in partner(s), and everything below. `anchorX` is the blood child's
 * own x, used by the parent union to centre over its children.
 */
function layoutChildBlock(
  childId: string,
  doc: LayoutDoc,
  spacing: LayoutSpacing,
  visited: Set<string>,
): Frame {
  const childUnions = Object.values(doc.partnerships).filter(
    (p) =>
      (p.partner1Id === childId || p.partner2Id === childId) &&
      p.childrenIds.length > 0,
  );
  if (childUnions.length === 0) {
    // Leaf — but the child may have a childless partner forming a couple block.
    const childless = Object.values(doc.partnerships).find(
      (p) => p.partner1Id === childId || p.partner2Id === childId,
    );
    const inLaw = childless
      ? childless.partner1Id === childId
        ? childless.partner2Id
        : childless.partner1Id
      : undefined;
    const placeInLaw =
      inLaw && doc.individuals[inLaw] && !isLoadBearingInLaw(doc, inLaw)
        ? inLaw
        : null;
    const positions = coupleAround(0, childId, placeInLaw, doc.individuals, spacing.partnerSpacing);
    const xs = Object.values(positions);
    return { positions, anchorX: positions[childId], minX: Math.min(...xs), maxX: Math.max(...xs) };
  }
  // Use the child's first child-bearing union as the primary line.
  const frame = layoutUnionFrame(childUnions[0].id, childId, doc, spacing, visited);
  return { ...frame, anchorX: frame.positions[childId] ?? frame.anchorX };
}

/**
 * Lay out the union `unionId`: its children (ordered by x, packed with sibling
 * spacing), then its partners centred over the children. `bloodPartnerId` is the
 * partner that descends from above (null at the root, where both partners are
 * founders). A load-bearing in-law is left in place rather than relocated.
 */
function layoutUnionFrame(
  unionId: string,
  bloodPartnerId: string | null,
  doc: LayoutDoc,
  spacing: LayoutSpacing,
  visited: Set<string>,
): Frame {
  if (visited.has(unionId)) return { positions: {}, anchorX: 0, minX: 0, maxX: 0 };
  visited.add(unionId);

  const union = doc.partnerships[unionId];
  const orderedChildren = orderChildrenByX(union.childrenIds, doc.individuals);
  const childFrames = orderedChildren.map((cid) =>
    layoutChildBlock(cid, doc, spacing, visited),
  );
  const offsets = packBlocks(
    childFrames.map((f) => ({ anchorX: f.anchorX, minX: f.minX, maxX: f.maxX })),
    spacing.siblingSpacing,
  );

  const positions: Record<string, number> = {};
  const childAnchors: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  childFrames.forEach((f, i) => {
    const off = offsets[i];
    for (const [id, x] of Object.entries(f.positions)) positions[id] = x + off;
    childAnchors.push(f.anchorX + off);
    minX = Math.min(minX, f.minX + off);
    maxX = Math.max(maxX, f.maxX + off);
  });

  const sibshipCenter =
    childAnchors.length > 0
      ? (childAnchors[0] + childAnchors[childAnchors.length - 1]) / 2
      : 0;

  // Place the union's partners over the sibship. A partner is "pinned" (left
  // where it is, omitted from this frame so it never moves) when it is a
  // load-bearing in-law — it belongs to another blood family and must not be
  // dragged across. The incoming blood partner (`bloodPartnerId`) always has
  // parents above and so would trip the load-bearing check, so it is exempt.
  const present = [union.partner1Id, union.partner2Id].filter(
    (id): id is string => !!id && !!doc.individuals[id],
  );
  const placeable = present.filter(
    (id) => id === bloodPartnerId || !isLoadBearingInLaw(doc, id),
  );
  let couple: Record<string, number> = {};
  if (placeable.length === 1) {
    couple = { [placeable[0]]: sibshipCenter };
  } else if (placeable.length === 2) {
    couple = coupleAround(
      sibshipCenter,
      placeable[0],
      placeable[1],
      doc.individuals,
      spacing.partnerSpacing,
    );
  }
  // placeable.length === 0 → parentless sibship (or both partners pinned).
  for (const [id, x] of Object.entries(couple)) {
    positions[id] = x;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  if (!isFinite(minX)) {
    minX = sibshipCenter;
    maxX = sibshipCenter;
  }
  const anchorX = bloodPartnerId
    ? positions[bloodPartnerId] ?? sibshipCenter
    : sibshipCenter;
  return { positions, anchorX, minX, maxX };
}

/**
 * Compute tidy x and per-generation-row y for every node in the blood family
 * rooted at `rootUnionId`, plus its married-in partners. Anchored so the root
 * union's centre keeps its current x (the canvas does not jump). Returns only
 * the nodes whose position changes, so a tidy family yields an empty map.
 */
export function computeTreeLayout(
  doc: LayoutDoc,
  rootUnionId: string,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): Record<string, { x: number; y: number }> {
  const rootUnion = doc.partnerships[rootUnionId];
  if (!rootUnion) return {};

  const frame = layoutUnionFrame(rootUnionId, null, doc, spacing, new Set());

  // Horizontal anchor: keep the root's current centre fixed. Anchor only on
  // partners actually placed in the frame (a pinned load-bearing partner is
  // absent), falling back to the placed children for a parentless sibship.
  const rootPartners = [rootUnion.partner1Id, rootUnion.partner2Id].filter(
    (id): id is string => !!id && !!doc.individuals[id],
  );
  const placedRootPartners = rootPartners.filter((id) => id in frame.positions);
  const anchorIds =
    placedRootPartners.length > 0
      ? placedRootPartners
      : rootUnion.childrenIds.filter(
          (id) => doc.individuals[id] && id in frame.positions,
        );
  const avg = (ids: string[], pick: (id: string) => number): number =>
    ids.length ? ids.reduce((s, id) => s + pick(id), 0) / ids.length : 0;
  const currentAnchor = avg(anchorIds, (id) => doc.individuals[id].position.x);
  const frameAnchor = avg(anchorIds, (id) => frame.positions[id] ?? 0);
  const dx = currentAnchor - frameAnchor;

  // Vertical anchor: generation rows relative to the root reference node.
  const refId = placedRootPartners[0] ?? anchorIds[0];
  const ref = refId ? doc.individuals[refId] : undefined;
  const rootGen = ref?.generation ?? 0;
  const rootY = ref?.position.y ?? 0;

  const result: Record<string, { x: number; y: number }> = {};
  for (const [id, fx] of Object.entries(frame.positions)) {
    const node = doc.individuals[id];
    if (!node) continue;
    const x = fx + dx;
    const gen = node.generation ?? rootGen;
    const y = rootY + (gen - rootGen) * spacing.generationSpacing;
    if (node.position.x !== x || node.position.y !== y) result[id] = { x, y };
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/treeLayout.test.ts`
Expected: PASS (helpers + centring + idempotence + y-row).

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.ts src/utils/treeLayout.test.ts
git commit -m "feat: deterministic tidy-tree layout with centring + y rows (#55)"
```

---

### Task 3: Engine coverage — in-law clearance, cross-sibship, in-law guard

**Files:**
- Modify: `src/utils/treeLayout.test.ts` (tests only; recursion from Task 2 should already satisfy these — fix the engine if any fail).

**Interfaces:**
- Consumes: `computeTreeLayout`.

- [ ] **Step 1: Write the failing/again-green tests**

```ts
// append to src/utils/treeLayout.test.ts
describe('computeTreeLayout — clearance & cross-sibship', () => {
  it('keeps a sibling clear of the target\'s partner (scenario 1)', () => {
    // Parentless sibship {target, sib}; target also has partner (in-law).
    // Seeded: target 0, partner 120 (right), sibling 80 (between them — the bug).
    const individuals = {
      target: ind('target', 0, 0),
      partner: ind('partner', 120, 0),
      sib: ind('sib', 80, 0),
    };
    const partnerships = {
      sibship: union('sibship', undefined, undefined, ['target', 'sib']),
      mar: union('mar', 'target', 'partner', []),
    };
    const parentChildLinks = {
      a: link('a', 'sibship', 'target'),
      b: link('b', 'sibship', 'sib'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'sibship');
    const posOf = (id: string, fallback: number) => moved[id]?.x ?? individuals[id].position.x;
    // The sibling must end clear of the partner: at least SIBLING_SPACING (80) past it.
    expect(posOf('sib', 80)).toBeGreaterThanOrEqual(posOf('partner', 120) + 80);
  });

  it('separates two cousin sibships under sibling parents (scenario 2)', () => {
    // Grandparent gp (gen 0). Two children p1,p2 (gen 1), each a parent.
    // p1's kids and p2's kids (gen 2) must not overlap.
    const individuals = {
      gp: ind('gp', 0, 0),
      p1: ind('p1', 0, 1), p2: ind('p2', 80, 1),
      a1: ind('a1', 0, 2), a2: ind('a2', 40, 2),       // p1's children, clustered
      b1: ind('b1', 40, 2), b2: ind('b2', 80, 2),       // p2's children, clustered/overlapping a*
    };
    const partnerships = {
      top: union('top', 'gp', undefined, ['p1', 'p2']),
      u1: union('u1', 'p1', undefined, ['a1', 'a2']),
      u2: union('u2', 'p2', undefined, ['b1', 'b2']),
    };
    const parentChildLinks = {
      l1: link('l1', 'top', 'p1'), l2: link('l2', 'top', 'p2'),
      l3: link('l3', 'u1', 'a1'), l4: link('l4', 'u1', 'a2'),
      l5: link('l5', 'u2', 'b1'), l6: link('l6', 'u2', 'b2'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'top');
    const x = (id: string) => moved[id]?.x ?? individuals[id].position.x;
    const gen2 = ['a1', 'a2', 'b1', 'b2'].map(x).sort((m, n) => m - n);
    // Every adjacent pair in gen 2 is at least SIBLING_SPACING apart (no overlap).
    for (let i = 1; i < gen2.length; i++) expect(gen2[i] - gen2[i - 1]).toBeGreaterThanOrEqual(80);
  });

  it('does not relocate a load-bearing in-law', () => {
    // p (blood) married to inlaw, who has their own parents (load-bearing).
    const individuals = {
      p: ind('p', 0, 1), inlaw: ind('inlaw', 300, 1),
      ilp: ind('ilp', 300, 0),             // in-law's parent (founder)
      kid: ind('kid', 0, 2),
    };
    const partnerships = {
      mar: union('mar', 'p', 'inlaw', ['kid']),
      ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
    };
    const parentChildLinks = {
      a: link('a', 'mar', 'kid'),
      b: link('b', 'ilUnion', 'inlaw'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'mar');
    // The in-law keeps its x (not yanked beside p); only p / kid may move.
    expect(moved.inlaw).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/utils/treeLayout.test.ts`
Expected: ideally PASS. If `scenario 1` or `scenario 2` fail, the in-law extent or block packing needs fixing — the child block's `minX/maxX` must include the in-law (verify `layoutChildBlock` couple case) before sibling packing. Fix until green.

- [ ] **Step 3: (Only if a test failed) fix the recursion**

No new code is expected; debug `layoutChildBlock` / `layoutUnionFrame` so couple extents are included in packing.

- [ ] **Step 4: Confirm green**

Run: `npx vitest run src/utils/treeLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/treeLayout.test.ts
git commit -m "test: cover in-law clearance, cross-sibship, in-law guard (#55)"
```

---

### Task 4: Store integration — `relayoutFamily`, `applyPositions`, wire adds

**Files:**
- Modify: `src/stores/pedigreeStore.ts`
- Modify: `src/stores/pedigreeStore.test.ts`

**Interfaces:**
- Consumes: `computeTreeLayout`, `findRootUnion`, `DEFAULT_LAYOUT_SPACING`, `LayoutDoc` from `treeLayout`.
- Produces: store helper `relayoutFamily(doc: LayoutDoc, anchorId: string): Record<string, Individual>`; rewired add ops.

This task rewrites the 7 family add ops to insert then `relayoutFamily`, and replaces the old #17/#30 reflow expectations in `pedigreeStore.test.ts` with centred expectations.

- [ ] **Step 1: Update the existing reflow tests to the new behaviour**

In `src/stores/pedigreeStore.test.ts`, locate the describe blocks covering "bounded respacing on add" and "layout reflow on add" (issues #17/#30). Replace their assertions with centred-layout expectations. Example replacement for the "re-centres parents when a sibling is added" case:

```ts
it('keeps siblings centred under a sole parent after adding one', () => {
  const store = usePedigreeStore.getState();
  // Parent p with child c1; add a sibling c2 to the same union.
  // (Use the store's add ops exactly as the existing tests set up their fixtures.)
  // After the add, the parent's x is the midpoint of its children.
  const doc = usePedigreeStore.getState().document;
  const kids = Object.values(doc.individuals).filter((i) => i.generation === 1).map((i) => i.position.x);
  const parent = Object.values(doc.individuals).find((i) => i.generation === 0)!;
  expect(parent.position.x).toBe((Math.min(...kids) + Math.max(...kids)) / 2);
});
```

Keep each existing test's *setup* (the same `addChildToFamily` / `addPartnerToIndividual` calls); only swap the position assertions to "centred / no-overlap / one-undo". Preserve any test that asserts a single undo step verbatim.

- [ ] **Step 2: Run the store tests to verify the new expectations fail**

Run: `npx vitest run src/stores/pedigreeStore.test.ts`
Expected: FAIL — old code does not produce centred layout yet.

- [ ] **Step 3: Add the store helpers and rewire the add ops**

Add near the top of `src/stores/pedigreeStore.ts` (replacing the `applyMoves` import block usage):

```ts
import {
  computeTreeLayout,
  findRootUnion,
  DEFAULT_LAYOUT_SPACING,
  type LayoutDoc,
} from '../utils/treeLayout';

/** Apply id -> {x,y} position changes immutably; untouched individuals are kept. */
function applyPositions(
  individuals: Record<string, Individual>,
  positions: Record<string, { x: number; y: number }>,
): Record<string, Individual> {
  if (Object.keys(positions).length === 0) return individuals;
  const next: Record<string, Individual> = { ...individuals };
  for (const [id, pos] of Object.entries(positions)) {
    const ind = next[id];
    if (!ind) continue;
    next[id] = { ...ind, position: { x: pos.x, y: pos.y } };
  }
  return next;
}

/**
 * Re-tidy the connected blood family containing `anchorId`: find its root union,
 * run the deterministic layout, and return a new individuals map with the moves
 * applied. A no-op (returns the same map) when nothing needs to move.
 */
function relayoutFamily(doc: LayoutDoc, anchorId: string): Record<string, Individual> {
  const rootUnion = findRootUnion(doc, anchorId);
  if (!rootUnion) return doc.individuals;
  const positions = computeTreeLayout(doc, rootUnion, DEFAULT_LAYOUT_SPACING);
  return applyPositions(doc.individuals, positions);
}
```

Rewrite each family add op to: build the new `individuals`/`partnerships`/`parentChildLinks`, then `individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, <anchor>)`. Anchors: `addParentsForChild` → `childId`; `addPartnerToIndividual` → `partner.id`; `addChildToFamily` → `child.id`; `addSiblingViaNewUnion` → `sibling.id`; `addChildViaNewUnion` → `child.id`; `addParentsToParentlessUnion` → `parent1.id`; `fillUnionPartner` → `partner.id`. Worked example for `addChildToFamily`:

```ts
addChildToFamily: (child, partnershipId, link) =>
  set((state) => {
    const partnership = state.document.partnerships[partnershipId];
    if (!partnership) return state;
    const updatedPartnership = {
      ...partnership,
      childrenIds: [...partnership.childrenIds, child.id],
    };
    const partnerships = { ...state.document.partnerships, [partnershipId]: updatedPartnership };
    const parentChildLinks = { ...state.document.parentChildLinks, [link.id]: link };
    let individuals: Record<string, Individual> = { ...state.document.individuals, [child.id]: child };
    individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, child.id);
    return {
      document: {
        ...state.document,
        metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
        individuals,
        partnerships,
        parentChildLinks,
      },
    };
  }),
```

Apply the same shape to the other six ops, dropping their old `applyMoves` / `makeRoomForPartner` / `centerParentsOverChildren` / `computeParentClearanceShift` / `applyGenerationRespacing` / `shiftSubtree` calls. (The dead local helpers and `respacing` imports are removed in Task 6.)

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `npx vitest run src/stores/pedigreeStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/pedigreeStore.ts src/stores/pedigreeStore.test.ts
git commit -m "feat: re-tidy family on every add via tidy layout (#55)"
```

---

### Task 5: Scenario acceptance tests + single-undo invariant

**Files:**
- Modify: `src/stores/pedigreeStore.test.ts`

**Interfaces:**
- Consumes: the rewired store add ops; `usePedigreeStore`.

- [ ] **Step 1: Write the failing/again-green acceptance tests**

```ts
// append to src/stores/pedigreeStore.test.ts — adapt fixture builders to the file's existing helpers
describe('autospacing acceptance (#55)', () => {
  beforeEach(() => {
    usePedigreeStore.setState({ document: createDefaultDocument() });
    usePedigreeStore.temporal.getState().clear();
  });

  it('S4: repeatedly added siblings stay centred under a sole parent', () => {
    // Build: parent + first child via the store, then add two more siblings.
    // (Use addChildViaNewUnion then addChildToFamily, mirroring RadialMenu.)
    // Assert: parent.x === midpoint(children x) and adjacent children >= SIBLING_SPACING apart.
    const doc = usePedigreeStore.getState().document;
    const kids = Object.values(doc.individuals).filter((i) => i.generation === 1).map((i) => i.position.x).sort((a, b) => a - b);
    const parent = Object.values(doc.individuals).find((i) => i.generation === 0)!;
    expect(parent.position.x).toBe((kids[0] + kids[kids.length - 1]) / 2);
    for (let i = 1; i < kids.length; i++) expect(kids[i] - kids[i - 1]).toBeGreaterThanOrEqual(80);
  });

  it('every family add collapses to a single undo step', () => {
    const before = usePedigreeStore.getState().document;
    // perform one add (e.g. addPartnerToIndividual) ...
    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals).toEqual(before.individuals);
  });

  it('a manual reorder survives the next add (order-preserving relayout)', () => {
    // Drag sibling B left of sibling A (swap their x via moveIndividual), then add a third sibling.
    // Assert the order B,A,<new> is preserved left-to-right.
  });
});
```

Fill the placeholder bodies using the test file's existing fixture style (the file already constructs partnerships/links for the #30 tests — reuse those builders). Each `it` must end with concrete assertions as sketched.

- [ ] **Step 2: Run**

Run: `npx vitest run src/stores/pedigreeStore.test.ts -t 'acceptance'`
Expected: PASS (behaviour already implemented in Task 4; these lock it in).

- [ ] **Step 3: Commit**

```bash
git add src/stores/pedigreeStore.test.ts
git commit -m "test: scenario acceptance for tidy autospacing (#55)"
```

---

### Task 6: Drag — relayout on drop

**Files:**
- Modify: `src/stores/pedigreeStore.ts` (add `commitDragWithRelayout` action + interface entry)
- Modify: `src/components/canvas/symbols/symbolDrag.ts`
- Modify: `src/components/canvas/symbols/symbolDrag.test.ts`

**Interfaces:**
- Consumes: `relayoutFamily`, `usePedigreeStore`.
- Produces: action `commitDragWithRelayout: (id: string, position: Position) => void`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/components/canvas/symbols/symbolDrag.test.ts
import { commitSymbolDrag } from './symbolDrag';
import { usePedigreeStore, createDefaultIndividual } from '../../../stores/pedigreeStore';
import { RelationshipType } from '../../../types/enums';

it('relayouts the family on drop so an overlapping drop is separated', () => {
  // Two siblings under a sole parent; drop sibling B exactly onto sibling A.
  const a = createDefaultIndividual({ id: 'a', generation: 1, position: { x: -80, y: 150 } });
  const b = createDefaultIndividual({ id: 'b', generation: 1, position: { x: 80, y: 150 } });
  const p = createDefaultIndividual({ id: 'p', generation: 0, position: { x: 0, y: 0 } });
  usePedigreeStore.setState({
    document: {
      ...usePedigreeStore.getState().document,
      individuals: { a, b, p },
      partnerships: { u: { id: 'u', type: RelationshipType.Partnership, partner1Id: 'p', partner2Id: undefined, childrenIds: ['a', 'b'] } },
      parentChildLinks: {
        la: { id: 'la', type: RelationshipType.ParentChild, parentPartnershipId: 'u', childId: 'a', isAdopted: false },
        lb: { id: 'lb', type: RelationshipType.ParentChild, parentPartnershipId: 'u', childId: 'b', isAdopted: false },
      },
    },
  });
  usePedigreeStore.temporal.getState().clear();

  // Drop B onto A's x (-80). Relayout must re-separate them.
  commitSymbolDrag('b', { x: 80, y: 150 }, { x: -80, y: 150 });

  const out = usePedigreeStore.getState().document.individuals;
  expect(Math.abs(out.a.position.x - out.b.position.x)).toBeGreaterThanOrEqual(80);

  // And the whole drag is one undo step back to the pre-drag layout.
  usePedigreeStore.temporal.getState().undo();
  expect(usePedigreeStore.getState().document.individuals.b.position.x).toBe(80);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/canvas/symbols/symbolDrag.test.ts`
Expected: FAIL — drop commits raw position; no relayout; siblings still overlap.

- [ ] **Step 3: Add the store action and use it on commit**

In `src/stores/pedigreeStore.ts`, add to the `PedigreeState` interface (near `moveIndividual`):

```ts
  /** Commit a drag: set the dropped position, then re-tidy the family (one undo step). */
  commitDragWithRelayout: (id: string, position: Position) => void;
```

And implement it in the store object:

```ts
      commitDragWithRelayout: (id, position) =>
        set((state) => {
          const existing = state.document.individuals[id];
          if (!existing) return state;
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [id]: { ...existing, position },
          };
          individuals = relayoutFamily(
            {
              individuals,
              partnerships: state.document.partnerships,
              parentChildLinks: state.document.parentChildLinks,
            },
            id,
          );
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
            },
          };
        }),
```

In `src/components/canvas/symbols/symbolDrag.ts`, change `commitSymbolDrag` to relayout on the tracked commit:

```ts
export function commitSymbolDrag(
  id: string,
  startPos: Position,
  endPos: Position,
): void {
  const { moveIndividual, commitDragWithRelayout } = usePedigreeStore.getState();
  // Restore the pre-drag position while history is still paused (untracked) so
  // zundo records it as the undo target, then resume and commit the drop +
  // relayout as a single tracked step.
  moveIndividual(id, startPos);
  usePedigreeStore.temporal.getState().resume();
  commitDragWithRelayout(id, endPos);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/canvas/symbols/symbolDrag.test.ts`
Expected: PASS (separation + single undo).

- [ ] **Step 5: Commit**

```bash
git add src/stores/pedigreeStore.ts src/components/canvas/symbols/symbolDrag.ts src/components/canvas/symbols/symbolDrag.test.ts
git commit -m "feat: re-tidy the family on drag drop (#55)"
```

---

### Task 7: Retire `respacing.ts` and dead store helpers

**Files:**
- Delete: `src/utils/respacing.ts`, `src/utils/respacing.test.ts`
- Modify: `src/stores/pedigreeStore.ts` (remove `respacing` imports + now-dead `applyMoves`, `applyGenerationRespacing`, `shiftSubtree`, `collectDescendants` usage and `MIN_GENERATION_NODE_SPACING` import if unused)

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Confirm nothing else imports `respacing`**

Run: `grep -rn "utils/respacing" src`
Expected: only `src/stores/pedigreeStore.ts` (which Task 4/6 already stopped using at call sites).

- [ ] **Step 2: Delete the module and its test, remove dead code**

```bash
git rm src/utils/respacing.ts src/utils/respacing.test.ts
```

In `src/stores/pedigreeStore.ts`, delete the `import { ... } from '../utils/respacing'` block, and delete the now-unused local helpers `applyMoves`, `applyGenerationRespacing`, and `shiftSubtree`. Remove the `MIN_GENERATION_NODE_SPACING` import if no longer referenced. Keep `applyPositions` and `relayoutFamily`.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS, no references to deleted symbols.

Run: `npx tsc --noEmit`
Expected: no errors (catches any dangling import or unused symbol that would break the build).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: retire greedy respacing module, superseded by tidy layout (#55)"
```

---

### Task 8: Full verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Manual smoke against the four scenarios**

Run: `npm run dev`, then in the app:
1. Add a partner to a person, then add a sibling — sibling lands clear of the partner (not between).
2. Add a child to that person — no overlap in the child's generation.
3. Drag a node onto another / into a couple — it separates / the couple parts; the node only moves horizontally.
4. Add several siblings — the row stays centred under the parent (existing siblings shift left).

Expected: all four behave per spec. Note any deviation for follow-up.

- [ ] **Step 4: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "fix: address autospacing smoke-test findings (#55)"
```

---

## Self-Review

**Spec coverage:**
- Tidy two-pass engine (measure/assign), anchor on root x, y per generation → Tasks 2 (impl), covered.
- Order-preserving relayout (refinement 1) → `orderChildrenByX` (Task 1) + `coupleAround` side preservation (Task 1) + acceptance test (Task 5).
- Load-bearing in-law guard (refinement 2) → `isLoadBearingInLaw` (Task 1) + guard in recursion (Task 2) + test (Task 3).
- Store wiring, one undo step → Task 4 + Task 5 invariant test.
- Drag-as-reorder / relayout on drop (y-lock already present) → Task 6.
- Retire `respacing.ts` (incl. `collectDescendants`, unused by the new engine) → Task 7.
- Scenarios 1/2/4 → Task 3 (engine) + Task 5 (store acceptance); scenario 3 → Task 6.

**Placeholder scan:** Task 5's `it` bodies are intentionally sketched against the test file's existing fixture builders; the step text requires concrete assertions before commit. All other steps contain runnable code.

**Type consistency:** `LayoutDoc`, `Block`, `LayoutSpacing`, `computeTreeLayout`, `findRootUnion`, `relayoutFamily`, `applyPositions`, `commitDragWithRelayout` names and signatures match across Tasks 1, 2, 4, 6, 7.
