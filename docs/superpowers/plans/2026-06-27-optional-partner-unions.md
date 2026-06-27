# Parents-optional and partner-optional unions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the radial menu add siblings to a person with no parents and a child to a person with no partner, by allowing a union (`PartnershipRelationship`) to have 0, 1, or 2 partners.

**Architecture:** Make `partner1Id`/`partner2Id` optional. A 0-partner union is a parentless sibship (bare horizontal bar, no descent line up); a 1-partner union drops a descent line straight down from the sole parent; a 2-partner union is today's couple. Rendering collapses to: anchor the descent on the *average of present partners*, or use a dedicated parentless-sibship geometry when there are none. New atomic store actions create these unions and fill empty partner slots later (one undo each).

**Tech Stack:** React + TypeScript, react-konva, Zustand (+ zundo temporal), Vitest. Canvas logic is unit-tested through pure modules and the `svgExport` parallel renderer because react-konva cannot render under jsdom.

## Global Constraints

- TypeScript strict; **never** use `any`. Type-annotate every function signature; JSDoc public interfaces.
- Conventional commits, one logical change each. Run `npm test` (and `npm run build` for type-only changes) before every commit.
- Konva components are **not** unit-testable (no canvas under jsdom). The real test surface for connector geometry is the pure geometry module and `src/io/svgExport.ts`. Any change to a Konva connector MUST be mirrored in `svgExport.ts`.
- Constants (verbatim): `GENERATION_SPACING = 150`, `SIBLING_SPACING = 80`, `PARTNER_SPACING = 120`, `LINE_COLOR = '#1a1a1a'`, `LINE_WIDTH = 2`, `MIN_GENERATION_NODE_SPACING = SYMBOL_SIZE * 2`.
- Every compound family action mutates the store in a **single `set(...)`** so one undo reverts the whole operation.

---

### Task 1: Optional partner ids, traversal helpers, and `hasParents` semantics

Make partner ids optional, add two helpers, and redefine `hasParents` so a parentless-sibship child reports *no* parents. The type change ripples to every site that indexes a partner id; fix each with an optional-safe read, preserving current behaviour (the full suite stays green).

**Files:**
- Modify: `src/types/pedigree.ts` (`PartnershipRelationship.partner1Id`/`partner2Id` → optional)
- Modify: `src/utils/graphTraversal.ts` (add `getPresentPartners`, `isParentlessUnion`; redefine `hasParents`; fix `findParents`)
- Modify (optional-safe reads, no behaviour change): `src/components/connections/PartnershipLine.tsx`, `src/components/connections/ParentChildLine.tsx`, `src/components/connections/TwinConnector.tsx`, `src/io/svgExport.ts`, `src/io/pedIO.ts`, `src/utils/respacing.ts`, `src/utils/annotationPlacement.ts`, `src/components/ui/LinkTypePopup.tsx`
- Test: `src/utils/graphTraversal.test.ts`

**Interfaces:**
- Produces:
  - `getPresentPartners(individuals: Record<string, Individual>, partnership: PartnershipRelationship): Individual[]` — the 0–2 partner individuals that actually exist, in `[partner1, partner2]` order.
  - `isParentlessUnion(partnership: PartnershipRelationship): boolean`
  - `hasParents(doc: PedigreeDocument, individualId: string): boolean` — true only when the parent union has ≥1 present partner.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/graphTraversal.test.ts` (it already imports `hasParents`, `RelationshipType`, `createDefaultDocument`, `createDefaultIndividual`):

```ts
import { getPresentPartners, isParentlessUnion } from './graphTraversal';

describe('getPresentPartners', () => {
  it('returns only the partner individuals that exist', () => {
    const doc = createDefaultDocument();
    const dad = createDefaultIndividual();
    doc.individuals[dad.id] = dad;

    const oneParent = {
      id: 'u1', type: RelationshipType.Partnership,
      partner1Id: dad.id, childrenIds: [],
    };
    expect(getPresentPartners(doc.individuals, oneParent).map((p) => p.id)).toEqual([dad.id]);

    const sibship = { id: 'u2', type: RelationshipType.Partnership, childrenIds: [] };
    expect(getPresentPartners(doc.individuals, sibship)).toEqual([]);
  });
});

describe('isParentlessUnion', () => {
  it('is true only when both partner slots are empty', () => {
    expect(isParentlessUnion({ id: 'u', type: RelationshipType.Partnership, childrenIds: [] })).toBe(true);
    expect(isParentlessUnion({ id: 'u', type: RelationshipType.Partnership, partner1Id: 'x', childrenIds: [] })).toBe(false);
  });
});

describe('hasParents with partnerless unions', () => {
  function sibshipDoc() {
    const doc = createDefaultDocument();
    const a = createDefaultIndividual();
    const b = createDefaultIndividual();
    doc.individuals[a.id] = a;
    doc.individuals[b.id] = b;
    doc.partnerships['s1'] = { id: 's1', type: RelationshipType.Partnership, childrenIds: [a.id, b.id] };
    doc.parentChildLinks['l1'] = { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 's1', childId: a.id, isAdopted: false };
    doc.parentChildLinks['l2'] = { id: 'l2', type: RelationshipType.ParentChild, parentPartnershipId: 's1', childId: b.id, isAdopted: false };
    return { doc, aId: a.id };
  }

  it('reports no parents for a member of a 0-partner sibship', () => {
    const { doc, aId } = sibshipDoc();
    expect(hasParents(doc, aId)).toBe(false);
  });

  it('reports parents once a partner is filled into the union', () => {
    const { doc, aId } = sibshipDoc();
    const parent = createDefaultIndividual();
    doc.individuals[parent.id] = parent;
    doc.partnerships['s1'].partner1Id = parent.id;
    expect(hasParents(doc, aId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- src/utils/graphTraversal.test.ts`
Expected: FAIL — `getPresentPartners`/`isParentlessUnion` are not exported, and `hasParents` returns `true` for the 0-partner sibship.

- [ ] **Step 3: Make partner ids optional**

In `src/types/pedigree.ts`, change the two fields:

```ts
export interface PartnershipRelationship {
  id: string;
  type:
    | RelationshipType.Partnership
    | RelationshipType.Consanguinity
    | RelationshipType.Separation;
  partner1Id?: string;
  partner2Id?: string;
  childrenIds: string[];
  isAdoptive?: boolean;
}
```

- [ ] **Step 4: Add helpers and redefine `hasParents` in `graphTraversal.ts`**

Add the helpers and replace the existing `hasParents` body. Also make `findParents` read partners optional-safe:

```ts
/** The partner individuals that actually exist for a union (0, 1, or 2). */
export function getPresentPartners(
  individuals: Record<string, Individual>,
  partnership: PartnershipRelationship,
): Individual[] {
  const result: Individual[] = [];
  const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
  const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;
  if (p1) result.push(p1);
  if (p2) result.push(p2);
  return result;
}

/** A union with no partners — a parentless sibship. */
export function isParentlessUnion(partnership: PartnershipRelationship): boolean {
  return !partnership.partner1Id && !partnership.partner2Id;
}

/** True only when the individual's parent union has at least one present partner. */
export function hasParents(
  doc: PedigreeDocument,
  individualId: string,
): boolean {
  for (const link of Object.values(doc.parentChildLinks)) {
    if (link.childId !== individualId) continue;
    const p = doc.partnerships[link.parentPartnershipId];
    if (p && (p.partner1Id || p.partner2Id)) return true;
  }
  return false;
}
```

In `findParents`, change the two partner reads (currently `const p1 = doc.individuals[partnership.partner1Id];`) to:

```ts
const p1 = partnership.partner1Id ? doc.individuals[partnership.partner1Id] : undefined;
const p2 = partnership.partner2Id ? doc.individuals[partnership.partner2Id] : undefined;
```

- [ ] **Step 5: Fix the remaining optional-safe reads so the project type-checks**

Run `npm run build` and fix each reported error using this exact pattern at every direct partner-id index:

```ts
const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;
```

Known sites (apply the pattern; surrounding `if (!p1 || !p2) return …` guards stay unchanged so behaviour is identical):
- `src/components/connections/PartnershipLine.tsx` lines ~16–17.
- `src/components/connections/ParentChildLine.tsx` lines ~22–23 (kept guarded for now; rewritten in Task 5).
- `src/components/connections/TwinConnector.tsx` (partner reads near the top).
- `src/io/svgExport.ts` `renderPartnershipLine` (~486–487) and `renderTwinConnector` (~574–575). `renderParentChildLines` (~518–519) is rewritten in Task 4 — for now apply the same optional-safe pattern so it compiles.
- `src/io/pedIO.ts` lines ~264–265.
- `src/utils/respacing.ts` `centerParentsOverChildren` (~312–313) and any partner index in `computeParentClearanceShift`.
- `src/utils/annotationPlacement.ts` ~139–140: `const a = p.partner1Id ? byId.get(p.partner1Id) : undefined;` and likewise for `partner2Id`.
- `src/components/ui/LinkTypePopup.tsx` (any partner index read).

For files that do not index but only compare (`p.partner1Id === id`) or assign, no change is needed — `string | undefined === string` is valid.

- [ ] **Step 6: Run the targeted tests, the full suite, and the build**

Run: `npm test -- src/utils/graphTraversal.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS (no behaviour change anywhere else).

Run: `npm run build`
Expected: type-check + build succeed with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/pedigree.ts src/utils/graphTraversal.ts src/utils/graphTraversal.test.ts \
  src/components/connections/PartnershipLine.tsx src/components/connections/ParentChildLine.tsx \
  src/components/connections/TwinConnector.tsx src/io/svgExport.ts src/io/pedIO.ts \
  src/utils/respacing.ts src/utils/annotationPlacement.ts src/components/ui/LinkTypePopup.tsx
git commit -m "refactor(model): allow unions to have 0, 1, or 2 partners"
```

---

### Task 2: Parentless-sibship geometry

A pure function for the 0-partner connector: a horizontal bar a fixed rise above the children with a drop to each child, and **no** parent drop. Konva-free so it is unit-tested directly.

**Files:**
- Modify: `src/utils/constants.ts` (add `PARENTLESS_SIBSHIP_RISE`)
- Modify: `src/components/connections/parentChildGeometry.ts` (add `computeParentlessSibshipSegments`)
- Test: `src/components/connections/parentChildGeometry.test.ts`

**Interfaces:**
- Consumes: `PARENTLESS_SIBSHIP_RISE: number` from constants; existing `ChildAnchor`, `LineSegment` from `parentChildGeometry.ts`.
- Produces:
  - `computeParentlessSibshipSegments(children: ChildAnchor[]): { sibshipY: number; sibship: LineSegment | null; childDrops: LineSegment[] }`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/connections/parentChildGeometry.test.ts`:

```ts
import { computeParentlessSibshipSegments } from './parentChildGeometry';
import { PARENTLESS_SIBSHIP_RISE } from '../../utils/constants';

describe('computeParentlessSibshipSegments', () => {
  it('draws a bar above two children with a drop to each and no parent drop', () => {
    const result = computeParentlessSibshipSegments([
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ]);
    const sibshipY = 300 - PARENTLESS_SIBSHIP_RISE;

    expect(result.sibshipY).toBe(sibshipY);
    expect(result.sibship).toEqual([100, sibshipY, 200, sibshipY]);
    expect(result.childDrops).toEqual([
      [100, sibshipY, 100, 300],
      [200, sibshipY, 200, 300],
    ]);
    expect('parentDrop' in result).toBe(false);
  });

  it('omits the bar for a single child (just a short stub above it)', () => {
    const result = computeParentlessSibshipSegments([{ x: 150, y: 300 }]);
    const sibshipY = 300 - PARENTLESS_SIBSHIP_RISE;

    expect(result.sibship).toBeNull();
    expect(result.childDrops).toEqual([[150, sibshipY, 150, 300]]);
  });

  it('places the bar above the topmost child when children differ in y', () => {
    const result = computeParentlessSibshipSegments([
      { x: 100, y: 320 },
      { x: 200, y: 300 },
    ]);
    expect(result.sibshipY).toBe(300 - PARENTLESS_SIBSHIP_RISE);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/connections/parentChildGeometry.test.ts`
Expected: FAIL — `computeParentlessSibshipSegments` and `PARENTLESS_SIBSHIP_RISE` are not defined.

- [ ] **Step 3: Add the constant**

In `src/utils/constants.ts`, directly below `export const GENERATION_SPACING = 150;`:

```ts
/**
 * Vertical gap between a parentless sibship's horizontal bar and the top of its
 * children. Half a generation reads as "these are siblings" without implying a
 * parent couple sits above.
 */
export const PARENTLESS_SIBSHIP_RISE = GENERATION_SPACING / 2;
```

- [ ] **Step 4: Add the geometry function**

In `src/components/connections/parentChildGeometry.ts`, add the import and the function:

```ts
import { PARENTLESS_SIBSHIP_RISE } from '../../utils/constants';

/**
 * Segments for a sibship that has NO parents: a horizontal bar a fixed rise
 * above the children, a vertical drop to each child, and no parent drop.
 *
 * @param children Anchor points of the children (must be non-empty).
 */
export function computeParentlessSibshipSegments(
  children: ChildAnchor[],
): { sibshipY: number; sibship: LineSegment | null; childDrops: LineSegment[] } {
  const childTopY = Math.min(...children.map((c) => c.y));
  const sibshipY = childTopY - PARENTLESS_SIBSHIP_RISE;

  const childXs = children.map((c) => c.x);
  const spanMinX = Math.min(...childXs);
  const spanMaxX = Math.max(...childXs);

  return {
    sibshipY,
    sibship: spanMinX === spanMaxX ? null : [spanMinX, sibshipY, spanMaxX, sibshipY],
    childDrops: children.map((c) => [c.x, sibshipY, c.x, c.y]),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/components/connections/parentChildGeometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/constants.ts src/components/connections/parentChildGeometry.ts \
  src/components/connections/parentChildGeometry.test.ts
git commit -m "feat(geometry): parentless sibship connector segments"
```

---

### Task 3: Store actions for partnerless unions

Four atomic actions (each one `set`, one undo). Two create new unions; two fill empty partner slots later.

**Files:**
- Modify: `src/stores/pedigreeStore.ts` (extend the `PedigreeState` interface and the store object)
- Test: `src/stores/pedigreeStore.test.ts`

**Interfaces:**
- Consumes: existing internal helpers `applyMoves`, `applyGenerationRespacing`, and `centerParentsOverChildren` (imported from `../utils/respacing`); `createDefaultIndividual`.
- Produces (added to `PedigreeState`):
  - `addSiblingViaNewUnion(target: Individual, sibling: Individual, partnership: PartnershipRelationship, targetLink: ParentChildRelationship, siblingLink: ParentChildRelationship): void` — inserts a 0-partner union holding `[target, sibling]`, the new `sibling`, and both child links; respaces the sibling's generation.
  - `addChildViaNewUnion(child: Individual, partnership: PartnershipRelationship, link: ParentChildRelationship): void` — inserts a 1-partner union (sole parent already exists), the new `child`, and its link; respaces the child's generation.
  - `fillUnionPartner(partner: Individual, partnershipId: string): void` — inserts `partner`, sets the union's one empty partner slot, and re-centres the couple over their children.
  - `addParentsToParentlessUnion(parent1: Individual, parent2: Individual, partnershipId: string): void` — inserts both parents, sets both partner slots of a 0-partner union, centres them over the children, and respaces the parents' generation.

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/pedigreeStore.test.ts`:

```ts
function parentChildLink(partnershipId: string, childId: string): ParentChildRelationship {
  return { id: generateId(), type: RelationshipType.ParentChild, parentPartnershipId: partnershipId, childId, isAdopted: false };
}

describe('addSiblingViaNewUnion', () => {
  it('creates a 0-partner union holding the target and the new sibling', () => {
    const store = usePedigreeStore.getState();
    const target = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    store.addIndividual(target);

    const sibling = createDefaultIndividual({ generation: 1, position: { x: 80, y: 0 } });
    const partnership: PartnershipRelationship = {
      id: 'u1', type: RelationshipType.Partnership, childrenIds: [target.id, sibling.id],
    };
    store.addSiblingViaNewUnion(
      target, sibling, partnership,
      parentChildLink('u1', target.id), parentChildLink('u1', sibling.id),
    );

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[sibling.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner1Id).toBeUndefined();
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
    expect(doc.partnerships['u1'].childrenIds).toEqual([target.id, sibling.id]);
    expect(Object.values(doc.parentChildLinks).filter((l) => l.parentPartnershipId === 'u1')).toHaveLength(2);
  });

  it('is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const target = createDefaultIndividual({ generation: 1 });
    store.addIndividual(target);
    usePedigreeStore.temporal.getState().clear();

    const sibling = createDefaultIndividual({ generation: 1 });
    store.addSiblingViaNewUnion(
      target, sibling,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [target.id, sibling.id] },
      parentChildLink('u1', target.id), parentChildLink('u1', sibling.id),
    );
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[sibling.id]).toBeUndefined();
    expect(doc.partnerships['u1']).toBeUndefined();
  });
});

describe('addChildViaNewUnion', () => {
  it('creates a 1-partner union with the target as sole parent', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[child.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner1Id).toBe(parent.id);
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
    expect(doc.partnerships['u1'].childrenIds).toEqual([child.id]);
  });
});

describe('fillUnionPartner', () => {
  it('fills the empty slot of a 1-partner union', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addIndividual(parent);
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    const partner = createDefaultIndividual({ generation: 0, position: { x: 120, y: 0 } });
    store.fillUnionPartner(partner, 'u1');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[partner.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner2Id).toBe(partner.id);
  });
});

describe('addParentsToParentlessUnion', () => {
  it('fills both slots of a 0-partner sibship without adding a child link', () => {
    const store = usePedigreeStore.getState();
    const a = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ generation: 1, position: { x: 80, y: 0 } });
    store.addIndividual(a);
    store.addSiblingViaNewUnion(
      a, b,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [a.id, b.id] },
      parentChildLink('u1', a.id), parentChildLink('u1', b.id),
    );
    const linksBefore = Object.keys(usePedigreeStore.getState().document.parentChildLinks).length;

    const dad = createDefaultIndividual({ generation: 0, position: { x: -60, y: -150 } });
    const mom = createDefaultIndividual({ generation: 0, position: { x: 60, y: -150 } });
    store.addParentsToParentlessUnion(dad, mom, 'u1');

    const doc = usePedigreeStore.getState().document;
    expect(doc.partnerships['u1'].partner1Id).toBe(dad.id);
    expect(doc.partnerships['u1'].partner2Id).toBe(mom.id);
    expect(Object.keys(doc.parentChildLinks)).toHaveLength(linksBefore);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/stores/pedigreeStore.test.ts`
Expected: FAIL — the four actions are not defined on the store.

- [ ] **Step 3: Declare the actions in the `PedigreeState` interface**

In `src/stores/pedigreeStore.ts`, in the "Compound / atomic family actions" group (just after `addChildToFamily`'s declaration, ~line 191):

```ts
  addSiblingViaNewUnion: (
    target: Individual,
    sibling: Individual,
    partnership: PartnershipRelationship,
    targetLink: ParentChildRelationship,
    siblingLink: ParentChildRelationship,
  ) => void;
  addChildViaNewUnion: (
    child: Individual,
    partnership: PartnershipRelationship,
    link: ParentChildRelationship,
  ) => void;
  fillUnionPartner: (partner: Individual, partnershipId: string) => void;
  addParentsToParentlessUnion: (
    parent1: Individual,
    parent2: Individual,
    partnershipId: string,
  ) => void;
```

- [ ] **Step 4: Implement the actions**

In the store object, directly after the `addChildToFamily` implementation (~line 698), add:

```ts
      addSiblingViaNewUnion: (target, sibling, partnership, targetLink, siblingLink) =>
        set((state) => {
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [sibling.id]: sibling,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          if (sibling.generation !== undefined) {
            individuals = applyGenerationRespacing(individuals, partnerships, sibling.generation);
          }
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
              parentChildLinks: {
                ...state.document.parentChildLinks,
                [targetLink.id]: targetLink,
                [siblingLink.id]: siblingLink,
              },
            },
          };
        }),

      addChildViaNewUnion: (child, partnership, link) =>
        set((state) => {
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [child.id]: child,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          if (child.generation !== undefined) {
            individuals = applyGenerationRespacing(individuals, partnerships, child.generation);
          }
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
              parentChildLinks: { ...state.document.parentChildLinks, [link.id]: link },
            },
          };
        }),

      fillUnionPartner: (partner, partnershipId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;

          const updatedPartnership = { ...partnership };
          if (!updatedPartnership.partner1Id) updatedPartnership.partner1Id = partner.id;
          else updatedPartnership.partner2Id = partner.id;

          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [partner.id]: partner,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnershipId]: updatedPartnership,
          };
          // Both slots are now filled, so re-centre the couple over their children.
          individuals = applyMoves(
            individuals,
            centerParentsOverChildren(individuals, updatedPartnership),
          );
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
            },
          };
        }),

      addParentsToParentlessUnion: (parent1, parent2, partnershipId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;

          const updatedPartnership = {
            ...partnership,
            partner1Id: parent1.id,
            partner2Id: parent2.id,
          };
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [parent1.id]: parent1,
            [parent2.id]: parent2,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnershipId]: updatedPartnership,
          };
          individuals = applyMoves(
            individuals,
            centerParentsOverChildren(individuals, updatedPartnership),
          );
          if (parent1.generation !== undefined) {
            individuals = applyGenerationRespacing(individuals, partnerships, parent1.generation);
          }
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
            },
          };
        }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/stores/pedigreeStore.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/pedigreeStore.ts src/stores/pedigreeStore.test.ts
git commit -m "feat(store): atomic actions for partnerless unions"
```

---

### Task 4: Render partnerless unions in `svgExport` (the test surface)

Rewrite `renderParentChildLines` to branch on the number of present partners and reuse the shared geometry. This is the authoritative, unit-testable rendering of the connector.

**Files:**
- Modify: `src/io/svgExport.ts` (`renderParentChildLines`; add imports)
- Test: `src/io/svgExport.test.ts`

**Interfaces:**
- Consumes: `getPresentPartners` (Task 1); `computeParentChildSegments`, `computeParentlessSibshipSegments` (Task 2); existing local `line(x1,y1,x2,y2,dashed?)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/io/svgExport.test.ts` (it already imports `buildPedigreeSvg`, `GenderIdentity`, `RelationshipType`, `VitalStatus` and defines `makeFixture`). Add a local minimal-doc helper and tests:

```ts
import { PARENTLESS_SIBSHIP_RISE } from '../utils/constants';

function minimalDoc(
  individuals: Record<string, Individual>,
  partnerships: PedigreeDocument['partnerships'],
  parentChildLinks: PedigreeDocument['parentChildLinks'],
): PedigreeDocument {
  return {
    metadata: { id: 'd', title: 'T', createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z', version: '1.0.0' },
    individuals, partnerships, parentChildLinks,
    twinGroups: {}, textAnnotations: {},
    generationOrder: [], legendConfig: { entries: [], position: { x: 0, y: 0 } },
  };
}

function person(id: string, x: number, y: number): Individual {
  return {
    id, genderIdentity: GenderIdentity.Unknown, vitalStatus: VitalStatus.Alive,
    conditionIds: [], conditions: [], investigations: [],
    isProband: false, isPregnancy: false, position: { x, y }, annotations: [],
  };
}

describe('parentless sibship rendering', () => {
  it('draws a bar above the siblings and a drop to each, with no parent descent', () => {
    const a = person('a', 100, 300);
    const b = person('b', 200, 300);
    const doc = minimalDoc(
      { a, b },
      { u1: { id: 'u1', type: RelationshipType.Partnership, childrenIds: ['a', 'b'] } },
      {
        l1: { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'a', isAdopted: false },
        l2: { id: 'l2', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'b', isAdopted: false },
      },
    );
    const svg = buildPedigreeSvg(doc);
    const barY = 300 - PARENTLESS_SIBSHIP_RISE; // 225

    expect(svg).toContain(`<line x1="100" y1="${barY}" x2="200" y2="${barY}"`); // bar
    expect(svg).toContain(`<line x1="100" y1="${barY}" x2="100" y2="300"`); // drop to a
    expect(svg).toContain(`<line x1="200" y1="${barY}" x2="200" y2="300"`); // drop to b
    // No descent line rises above the bar.
    expect(svg).not.toContain(`y2="${barY - 1}"`);
  });
});

describe('single-parent union rendering', () => {
  it('drops a straight vertical line from the lone parent to the child', () => {
    const parent = person('p', 100, 100);
    const child = person('c', 100, 250);
    const doc = minimalDoc(
      { p: parent, c: child },
      { u1: { id: 'u1', type: RelationshipType.Partnership, partner1Id: 'p', childrenIds: ['c'] } },
      { l1: { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'c', isAdopted: false } },
    );
    const svg = buildPedigreeSvg(doc);
    const midY = 100 + (250 - 100) / 2; // 175

    // Two collinear segments at x=100 forming one straight descent.
    expect(svg).toContain(`<line x1="100" y1="100" x2="100" y2="${midY}"`);
    expect(svg).toContain(`<line x1="100" y1="${midY}" x2="100" y2="250"`);
  });
});
```

Add `Individual` and `PedigreeDocument` to the existing type import at the top of the test file if not already present.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/io/svgExport.test.ts`
Expected: FAIL — a 0-partner union currently renders nothing (old `if (!p1 || !p2) return ''`), so the bar/drop assertions fail.

- [ ] **Step 3: Add imports to `svgExport.ts`**

Add `getPresentPartners` to the import from `../utils/graphTraversal` (create the import if none exists), and add the geometry imports:

```ts
import { getPresentPartners } from '../utils/graphTraversal';
import {
  computeParentChildSegments,
  computeParentlessSibshipSegments,
} from '../components/connections/parentChildGeometry';
```

- [ ] **Step 4: Rewrite `renderParentChildLines`**

Replace the whole function body with:

```ts
/** Render parent-child / sibship lines, matching `ParentChildLine.tsx`. */
function renderParentChildLines(
  partnership: PartnershipRelationship,
  individuals: Record<string, Individual>,
  parentChildLinks: Record<string, ParentChildRelationship>,
): string {
  if (partnership.childrenIds.length === 0) return '';

  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c));
  if (children.length === 0) return '';

  const partners = getPresentPartners(individuals, partnership);
  const anchors = children.map((c) => ({ x: c.position.x, y: c.position.y }));

  let parentDrop: [number, number, number, number] | null = null;
  let sibship: [number, number, number, number] | null;
  let childDrops: [number, number, number, number][];

  if (partners.length === 0) {
    ({ sibship, childDrops } = computeParentlessSibshipSegments(anchors));
  } else {
    const anchorX = partners.reduce((s, p) => s + p.position.x, 0) / partners.length;
    const anchorY = partners.reduce((s, p) => s + p.position.y, 0) / partners.length;
    ({ parentDrop, sibship, childDrops } = computeParentChildSegments(anchorX, anchorY, anchors));
  }

  const parts: string[] = [];
  if (parentDrop) parts.push(line(...parentDrop));
  if (sibship) parts.push(line(...sibship));

  children.forEach((child, i) => {
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    const isAdopted = link?.isAdopted ?? false;
    const [x1, y1, x2, y2] = childDrops[i];
    parts.push(line(x1, y1, x2, y2, isAdopted));
  });

  return parts.join('');
}
```

- [ ] **Step 5: Run the new tests, the full suite, and the build**

Run: `npm test -- src/io/svgExport.test.ts`
Expected: PASS (existing svgExport tests still pass — they only assert `<line>` presence).

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/io/svgExport.ts src/io/svgExport.test.ts
git commit -m "feat(export): render 0- and 1-partner union connectors"
```

---

### Task 5: Mirror the connector in the Konva `ParentChildLine`

Bring the on-canvas renderer in line with `svgExport` so 0- and 1-partner unions draw correctly. No unit test (Konva can't render under jsdom); verified by build + the manual smoke test in Task 6.

**Files:**
- Modify: `src/components/connections/ParentChildLine.tsx`

**Interfaces:**
- Consumes: `getPresentPartners` (Task 1); `computeParentChildSegments`, `computeParentlessSibshipSegments` (Task 2).

- [ ] **Step 1: Rewrite the component body**

Replace the contents of `src/components/connections/ParentChildLine.tsx` with:

```tsx
import type { JSX } from 'react';
import { Line } from 'react-konva';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../../types/pedigree';
import { LINE_COLOR, LINE_WIDTH, DASH_PATTERN } from '../../utils/constants';
import { getPresentPartners } from '../../utils/graphTraversal';
import {
  computeParentChildSegments,
  computeParentlessSibshipSegments,
} from './parentChildGeometry';

interface ParentChildLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  parentChildLinks: Record<string, ParentChildRelationship>;
}

export function ParentChildLine({
  partnership,
  individuals,
  parentChildLinks,
}: ParentChildLineProps) {
  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c));
  if (children.length === 0) return null;

  const partners = getPresentPartners(individuals, partnership);
  const anchors = children.map((c) => ({ x: c.position.x, y: c.position.y }));

  let parentDrop: [number, number, number, number] | null = null;
  let sibship: [number, number, number, number] | null;
  let childDrops: [number, number, number, number][];

  if (partners.length === 0) {
    ({ sibship, childDrops } = computeParentlessSibshipSegments(anchors));
  } else {
    const anchorX = partners.reduce((s, p) => s + p.position.x, 0) / partners.length;
    const anchorY = partners.reduce((s, p) => s + p.position.y, 0) / partners.length;
    ({ parentDrop, sibship, childDrops } = computeParentChildSegments(anchorX, anchorY, anchors));
  }

  const lines: JSX.Element[] = [];

  if (parentDrop) {
    lines.push(
      <Line key={`vert-${partnership.id}`} points={parentDrop} stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} />,
    );
  }

  if (sibship) {
    lines.push(
      <Line key={`sib-${partnership.id}`} points={sibship} stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} />,
    );
  }

  children.forEach((child, i) => {
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    const isAdopted = link?.isAdopted ?? false;
    lines.push(
      <Line
        key={`drop-${child.id}`}
        points={childDrops[i]}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        dash={isAdopted ? DASH_PATTERN : undefined}
      />,
    );
  });

  return <>{lines}</>;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/connections/ParentChildLine.tsx
git commit -m "feat(canvas): render 0- and 1-partner union connectors"
```

---

### Task 6: Wire the radial menu

Make Add Sibling / Add Child always enabled, disable Add Parents only when two parents already exist, and route each action to the right store call.

**Files:**
- Modify: `src/components/ui/RadialMenu.tsx`

**Interfaces:**
- Consumes: store actions `addSiblingViaNewUnion`, `addChildViaNewUnion`, `fillUnionPartner`, `addParentsToParentlessUnion` (Task 3), plus existing `addParentsForChild`, `addPartnerToIndividual`, `addChildToFamily`; helpers `getPresentPartners`, `findPartnerships` from `graphTraversal`.

- [ ] **Step 1: Import helpers and store actions**

In `src/components/ui/RadialMenu.tsx`, update the graphTraversal import and add the new store-action subscriptions:

```ts
import { getPresentPartners, findPartnerships } from '../../utils/graphTraversal';
```

(Remove `hasParents`/`hasPartnership` from that import — they are no longer used here.) Near the existing `const addChildToFamily = ...` subscriptions, add:

```ts
  const addSiblingViaNewUnion = usePedigreeStore((s) => s.addSiblingViaNewUnion);
  const addChildViaNewUnion = usePedigreeStore((s) => s.addChildViaNewUnion);
  const fillUnionPartner = usePedigreeStore((s) => s.fillUnionPartner);
  const addParentsToParentlessUnion = usePedigreeStore((s) => s.addParentsToParentlessUnion);
```

- [ ] **Step 2: Replace the enablement flags**

Replace lines 29–30 (`canAddSibling`/`canAddChild`) with:

```ts
  const canAddSibling = true;
  const canAddChild = true;

  // Add Parents is disabled only when the target already has two present parents.
  const canAddParents = (() => {
    if (!targetId) return false;
    const link = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);
    if (!link) return true;
    const union = doc.partnerships[link.parentPartnershipId];
    if (!union) return true;
    return getPresentPartners(doc.individuals, union).length < 2;
  })();
```

- [ ] **Step 3: Update `handleAddSibling` to handle the no-parents case**

Replace the body of `handleAddSibling` (lines ~173–217) with:

```ts
  const handleAddSibling = useCallback(() => {
    if (!target || !targetId) return;

    const parentLink = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);

    // Has real parents (or a single parent): add another child to that union.
    if (parentLink) {
      const partnership = doc.partnerships[parentLink.parentPartnershipId];
      if (!partnership) return;
      const siblings = partnership.childrenIds
        .map((id) => doc.individuals[id])
        .filter(Boolean);
      const maxX = Math.max(...siblings.map((s) => s.position.x));
      const sibling = createDefaultIndividual({
        generation: target.generation,
        position: { x: maxX + SIBLING_SPACING, y: target.position.y },
      });
      const link: ParentChildRelationship = {
        id: generateId(), type: RelationshipType.ParentChild,
        parentPartnershipId: partnership.id, childId: sibling.id, isAdopted: false,
      };
      addChildToFamily(sibling, partnership.id, link);
      hideRadialMenu();
      select(sibling.id);
      return;
    }

    // No parents: create a 0-partner sibship holding the target and the new sibling.
    const partnershipId = generateId();
    const sibling = createDefaultIndividual({
      generation: target.generation,
      position: { x: target.position.x + SIBLING_SPACING, y: target.position.y },
    });
    const partnership: PartnershipRelationship = {
      id: partnershipId, type: RelationshipType.Partnership,
      childrenIds: [target.id, sibling.id],
    };
    const targetLink: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId, childId: target.id, isAdopted: false,
    };
    const siblingLink: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId, childId: sibling.id, isAdopted: false,
    };
    addSiblingViaNewUnion(target, sibling, partnership, targetLink, siblingLink);
    hideRadialMenu();
    select(sibling.id);
  }, [target, targetId, doc, addChildToFamily, addSiblingViaNewUnion, hideRadialMenu, select]);
```

- [ ] **Step 4: Update `handleAddChild` for the no-partner case and single-parent midpoint**

Replace the body of `handleAddChild` (lines ~128–171) with:

```ts
  const handleAddChild = useCallback(() => {
    if (!target || !targetId) return;

    const partnershipIds = findPartnerships(doc, targetId);

    // No union yet: create a 1-partner union with the target as sole parent.
    if (partnershipIds.length === 0) {
      const partnershipId = generateId();
      const child = createDefaultIndividual({
        generation: (target.generation ?? 0) + 1,
        position: { x: target.position.x, y: target.position.y + GENERATION_SPACING },
      });
      const partnership: PartnershipRelationship = {
        id: partnershipId, type: RelationshipType.Partnership,
        partner1Id: target.id, childrenIds: [child.id],
      };
      const link: ParentChildRelationship = {
        id: generateId(), type: RelationshipType.ParentChild,
        parentPartnershipId: partnershipId, childId: child.id, isAdopted: false,
      };
      addChildViaNewUnion(child, partnership, link);
      hideRadialMenu();
      select(child.id);
      return;
    }

    const partnership = doc.partnerships[partnershipIds[0]];
    if (!partnership) return;

    // Anchor under the average of whichever partners are present (1 or 2).
    const partners = getPresentPartners(doc.individuals, partnership);
    const midX = partners.length
      ? partners.reduce((s, p) => s + p.position.x, 0) / partners.length
      : target.position.x;
    const existingChildren = partnership.childrenIds.length;

    const child = createDefaultIndividual({
      generation: (target.generation ?? 0) + 1,
      position: { x: midX + existingChildren * SIBLING_SPACING, y: target.position.y + GENERATION_SPACING },
    });
    const link: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id, childId: child.id, isAdopted: false,
    };
    addChildToFamily(child, partnership.id, link);
    hideRadialMenu();
    select(child.id);
  }, [target, targetId, doc, addChildToFamily, addChildViaNewUnion, hideRadialMenu, select]);
```

- [ ] **Step 5: Update `handleAddPartner` to fill a single-parent union**

Replace the body of `handleAddPartner` (lines ~104–126) with:

```ts
  const handleAddPartner = useCallback(() => {
    if (!target || !targetId) return;

    // If the target is the sole partner of a 1-partner union, the new partner
    // becomes the co-parent of its existing children.
    const soleUnionId = findPartnerships(doc, targetId).find(
      (id) => getPresentPartners(doc.individuals, doc.partnerships[id]).length === 1,
    );
    if (soleUnionId) {
      const partner = createDefaultIndividual({
        generation: target.generation,
        position: { x: target.position.x + PARTNER_SPACING, y: target.position.y },
      });
      fillUnionPartner(partner, soleUnionId);
      hideRadialMenu();
      select(partner.id);
      return;
    }

    const partner = createDefaultIndividual({
      generation: target.generation,
      position: { x: target.position.x + PARTNER_SPACING, y: target.position.y },
    });
    const partnership: PartnershipRelationship = {
      id: generateId(), type: RelationshipType.Partnership,
      partner1Id: target.id, partner2Id: partner.id, childrenIds: [],
    };
    addPartnerToIndividual(partner, partnership);
    hideRadialMenu();
    select(partner.id);
  }, [target, targetId, doc, fillUnionPartner, addPartnerToIndividual, hideRadialMenu, select]);
```

- [ ] **Step 6: Update `handleAddParent` to fill an existing sibship / single-parent union**

Replace the body of `handleAddParent` (lines ~60–102) with:

```ts
  const handleAddParent = useCallback(() => {
    if (!target || !targetId) return;

    const childGeneration = target.generation ?? 1;
    const parentGeneration = childGeneration - 1;
    const parentY = target.position.y - GENERATION_SPACING;

    const existingLink = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);
    const union = existingLink ? doc.partnerships[existingLink.parentPartnershipId] : undefined;
    const partners = union ? getPresentPartners(doc.individuals, union) : [];

    // Case A — a 0-partner sibship: add a couple as parents of the whole sibship.
    if (union && partners.length === 0) {
      const childXs = union.childrenIds
        .map((id) => doc.individuals[id])
        .filter(Boolean)
        .map((c) => c.position.x);
      const midX = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const parent1 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Man, generation: parentGeneration,
        position: { x: midX - PARTNER_SPACING / 2, y: parentY },
      });
      const parent2 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Woman, generation: parentGeneration,
        position: { x: midX + PARTNER_SPACING / 2, y: parentY },
      });
      addParentsToParentlessUnion(parent1, parent2, union.id);
      hideRadialMenu();
      select(parent1.id);
      return;
    }

    // Case B — a 1-partner union: add the missing second parent.
    if (union && partners.length === 1) {
      const existing = partners[0];
      const secondParent = createDefaultIndividual({
        genderIdentity:
          existing.genderIdentity === GenderIdentity.Man ? GenderIdentity.Woman : GenderIdentity.Man,
        generation: existing.generation,
        position: { x: existing.position.x + PARTNER_SPACING, y: existing.position.y },
      });
      fillUnionPartner(secondParent, union.id);
      hideRadialMenu();
      select(secondParent.id);
      return;
    }

    // Case C — no parent union: create a fresh couple above the target.
    const parent1 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Man, generation: parentGeneration,
      position: { x: target.position.x - PARTNER_SPACING / 2, y: parentY },
    });
    const parent2 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Woman, generation: parentGeneration,
      position: { x: target.position.x + PARTNER_SPACING / 2, y: parentY },
    });
    const partnership: PartnershipRelationship = {
      id: generateId(), type: RelationshipType.Partnership,
      partner1Id: parent1.id, partner2Id: parent2.id, childrenIds: [target.id],
    };
    const link: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id, childId: target.id, isAdopted: false,
    };
    addParentsForChild(parent1, parent2, partnership, link, target.id, childGeneration);
    hideRadialMenu();
    select(parent1.id);
  }, [target, targetId, doc, addParentsForChild, addParentsToParentlessUnion, fillUnionPartner, hideRadialMenu, select]);
```

- [ ] **Step 7: Gate the Parent button on `canAddParents`**

Update the Parent button (lines ~231–237) to match the disabled pattern used by the others:

```tsx
        <button
          className={clsx(styles.option, styles.top, !canAddParents && styles.disabled)}
          onClick={canAddParents ? handleAddParent : undefined}
          title={canAddParents ? 'Add Parents' : 'Both parents already added'}
        >
          Parent
        </button>
```

Update the Sibling and Child button `title`s to drop the old "needs parents/partner" hints (they are always enabled now): Sibling → `"Add Sibling"`, Child → `"Add Child"`, and remove their `!canAdd… && styles.disabled` class usage (keep the buttons always enabled).

- [ ] **Step 8: Type-check and run the suite**

Run: `npm run build`
Expected: succeeds (no unused-import errors; `hasParents`/`hasPartnership` removed from the import).

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Manual smoke test**

Run: `npm run dev`, then in the browser:
1. Place one person. Open the radial menu (the Sibling and Child options are enabled). Click **Sibling** → a second symbol appears beside the first, joined by a bare horizontal bar with a drop to each, no line rising above. ✅
2. On that lone person, click **Child** → a child appears directly below, joined by a single straight vertical line. ✅
3. On the single parent, click **Partner** → a partner appears beside them and the descent becomes a normal drop from the couple's midpoint. ✅
4. On a parentless sibling, click **Parent** → a couple appears above and parents the whole sibship; the bar lifts to the midpoint and a descent line appears. The **Parent** option is now disabled for those children. ✅
5. Undo (`Cmd/Ctrl+Z`) once after each action reverts the whole step. ✅

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/RadialMenu.tsx
git commit -m "feat(radial-menu): add siblings without parents and children without a partner"
```

---

## Self-Review

**Spec coverage:**
- Optional partner ids + helpers + `hasParents` redefine → Task 1. ✅
- Parentless sibship geometry (bare bar, fixed rise) → Task 2. ✅
- 0/1/2-partner rendering in Konva + svgExport, `PartnershipLine` already no-ops → Tasks 4 & 5 (PartnershipLine confirmed unchanged in spec). ✅
- Store actions (create sibship, create single-parent union, fill slot(s)) → Task 3. ✅
- Radial-menu contextual matrix (Add Sibling/Child always on; Add Partner fills sole-parent slot; Add Parents fills 0→2 and 1→2, disabled at 2) → Task 6. ✅
- Tests: geometry, `hasParents`, store actions, svgExport 0/1-partner → Tasks 1–4. ✅
- Known limitation (PED degrades, no crash): no code required; `pedIO` reads made optional-safe in Task 1 so it cannot throw. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** Action names and signatures match between the `PedigreeState` declaration (Task 3 Step 3), implementations (Step 4), store-test calls (Step 1), and the radial-menu call sites (Task 6). Geometry function name `computeParentlessSibshipSegments` and constant `PARENTLESS_SIBSHIP_RISE` are identical across Tasks 2, 4, 5. `getPresentPartners` signature is identical across Tasks 1, 4, 5, 6.

**Note for the implementer:** `handleAddSibling`'s real-parents branch now also serves a *single-parent* union (the sibling becomes another child of the lone parent) because `hasParents`/`parentLink` is true whenever a parent union exists with ≥1 partner — this is intended and consistent with the model.
