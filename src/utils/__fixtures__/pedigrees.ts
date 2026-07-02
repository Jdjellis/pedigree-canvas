/**
 * Named fixture library for the pedigree layout engine.
 *
 * Each exported builder returns a {@link Fixture} describing a structurally
 * valid pedigree document (individuals + partnerships + parentChildLinks)
 * together with a `rootUnionId` pointing at the topmost union the layout
 * engine should anchor on.
 *
 * Positions encode the *current* (pre-relayout) canvas state — deliberately
 * including the seeded overlaps/misplacements that document known bugs.
 * Used by Tasks 3–11 of the auto-spacing rewrite (issue #131).
 */

import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { RelationshipType, TwinType } from '../../types/enums';
import { createDefaultIndividual } from '../../stores/pedigreeStore';
import type { LayoutDoc } from '../treeLayout';

// ---------------------------------------------------------------------------
// Local helpers (mirrors treeLayout.test.ts)
// ---------------------------------------------------------------------------

/**
 * Create a minimal Individual for layout purposes.
 * Gender/sex are irrelevant to the layout algorithm; only id, x, and
 * generation matter.
 */
function ind(id: string, x: number, generation: number | undefined = 0): Individual {
  return createDefaultIndividual({
    id,
    generation,
    position: { x, y: (generation ?? 0) * 150 },
  });
}

/** Create a minimal PartnershipRelationship. */
function union(
  id: string,
  p1: string | undefined,
  p2: string | undefined,
  kids: string[] = [],
): PartnershipRelationship {
  return { id, type: RelationshipType.Partnership, partner1Id: p1, partner2Id: p2, childrenIds: kids };
}

/** Create a minimal ParentChildRelationship. */
function link(
  id: string,
  parentPartnershipId: string,
  childId: string,
): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive: false };
}

/** Assemble a LayoutDoc from partial record sets. */
function doc(parts: {
  individuals?: Record<string, Individual>;
  partnerships?: Record<string, PartnershipRelationship>;
  parentChildLinks?: Record<string, ParentChildRelationship>;
  twinGroups?: Record<string, TwinGroup>;
}): LayoutDoc {
  return {
    individuals: parts.individuals ?? {},
    partnerships: parts.partnerships ?? {},
    parentChildLinks: parts.parentChildLinks ?? {},
    ...(parts.twinGroups !== undefined ? { twinGroups: parts.twinGroups } : {}),
  };
}

// ---------------------------------------------------------------------------
// Fixture interface
// ---------------------------------------------------------------------------

/**
 * A named pedigree fixture for layout testing.
 *
 * `doc` is a structurally valid {@link LayoutDoc} (individuals +
 * partnerships + parentChildLinks). `rootUnionId` is the topmost union the
 * layout engine should anchor on. `twinGroups` (optional) holds any twin
 * metadata needed by twin-specific invariants.
 */
export interface Fixture {
  /** Human-readable name used in test failure messages. */
  name: string;
  /** The pedigree document to lay out. */
  doc: LayoutDoc;
  /** Id of the topmost union that `computeTreeLayout` should receive. */
  rootUnionId: string;
  /** Twin groups keyed by group id, if any. */
  twinGroups?: Record<string, TwinGroup>;
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * A single founder with no children and no partner.
 * Exercises the degenerate case of a lone individual inside a childless union.
 */
export function loneFounder(): Fixture {
  return {
    name: 'loneFounder',
    doc: doc({
      individuals: { a: ind('a', 0, 0) },
      partnerships: { root: union('root', 'a', undefined, []) },
      parentChildLinks: {},
    }),
    rootUnionId: 'root',
  };
}

/**
 * A couple with three children (one generation of sibship).
 * Regression guard for basic centring and sibling spacing.
 */
export function coupleWithSibship(): Fixture {
  return {
    name: 'coupleWithSibship',
    doc: doc({
      individuals: {
        m: ind('m', 0, 0),
        f: ind('f', 120, 0),
        c1: ind('c1', 0, 1),
        c2: ind('c2', 80, 1),
        c3: ind('c3', 160, 1),
      },
      partnerships: { u: union('u', 'm', 'f', ['c1', 'c2', 'c3']) },
      parentChildLinks: {
        l1: link('l1', 'u', 'c1'),
        l2: link('l2', 'u', 'c2'),
        l3: link('l3', 'u', 'c3'),
      },
    }),
    rootUnionId: 'u',
  };
}

/**
 * Three generations: grandparents → two parents → two children.
 * Tests multi-generation descent alignment.
 */
export function threeGenerations(): Fixture {
  return {
    name: 'threeGenerations',
    doc: doc({
      individuals: {
        gp1: ind('gp1', -60, 0),
        gp2: ind('gp2', 60, 0),
        pa: ind('pa', 0, 1),
        inlaw: ind('inlaw', 120, 1),
        c1: ind('c1', 0, 2),
        c2: ind('c2', 80, 2),
      },
      partnerships: {
        top: union('top', 'gp1', 'gp2', ['pa']),
        mid: union('mid', 'pa', 'inlaw', ['c1', 'c2']),
      },
      parentChildLinks: {
        l1: link('l1', 'top', 'pa'),
        l2: link('l2', 'mid', 'c1'),
        l3: link('l3', 'mid', 'c2'),
      },
    }),
    rootUnionId: 'top',
  };
}

/**
 * A parent with a monozygotic (MZ) twin pair as children.
 * Tests twin contiguity and twin group metadata.
 */
export function twins(): Fixture {
  const twinGroups: Record<string, TwinGroup> = {
    g: {
      id: 'g',
      twinType: TwinType.Monozygotic,
      individualIds: ['t1', 't2'],
      parentPartnershipId: 'u',
    },
  };
  return {
    name: 'twins',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        t1: ind('t1', -40, 1),
        t2: ind('t2', 40, 1),
      },
      partnerships: { u: union('u', 'p', undefined, ['t1', 't2']) },
      parentChildLinks: {
        l1: link('l1', 'u', 't1'),
        l2: link('l2', 'u', 't2'),
      },
      twinGroups,
    }),
    rootUnionId: 'u',
    twinGroups,
  };
}

/**
 * A blood partner married to a load-bearing in-law (the in-law has a parent
 * above it), with one child. Documents the #105 single-wide-couple case where
 * the child must centre under the couple midpoint, not under the blood parent.
 */
export function marriedInWithParents(): Fixture {
  return {
    name: 'marriedInWithParents',
    doc: doc({
      individuals: {
        p: ind('p', 0, 1),
        inlaw: ind('inlaw', 300, 1),
        ilp: ind('ilp', 300, 0),
        kid: ind('kid', 0, 2),
      },
      partnerships: {
        mar: union('mar', 'p', 'inlaw', ['kid']),
        ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
      },
      parentChildLinks: {
        a: link('a', 'mar', 'kid'),
        b: link('b', 'ilUnion', 'inlaw'),
      },
    }),
    rootUnionId: 'mar',
  };
}

/**
 * Cross-branch marriage: the EXACT #115 canonical failing fixture.
 *
 * gp1 + gp2 → s1, s2
 * ilp → inlaw
 * couple1 = s1 × inlaw → kidA
 * couple2 = s2 × s2mate → kidB
 *
 * Positions seeded so that `kidA.x === kidB.x === 100` on the current
 * (pre-fix) layout code, reproducing the exact overlap bug.
 */
export function crossBranchMarriage(): Fixture {
  return {
    name: 'crossBranchMarriage',
    doc: doc({
      individuals: {
        gp1: ind('gp1', -60, 0),
        gp2: ind('gp2', 60, 0),
        ilp: ind('ilp', 240, 0),
        s1: ind('s1', 0, 1),
        inlaw: ind('inlaw', 240, 1),
        s2: ind('s2', 100, 1),
        s2mate: ind('s2mate', 220, 1),
        kidA: ind('kidA', 0, 2),
        kidB: ind('kidB', 160, 2),
      },
      partnerships: {
        root: union('root', 'gp1', 'gp2', ['s1', 's2']),
        ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
        couple1: union('couple1', 's1', 'inlaw', ['kidA']),
        couple2: union('couple2', 's2', 's2mate', ['kidB']),
      },
      parentChildLinks: {
        l1: link('l1', 'root', 's1'),
        l2: link('l2', 'root', 's2'),
        l3: link('l3', 'ilUnion', 'inlaw'),
        l4: link('l4', 'couple1', 'kidA'),
        l5: link('l5', 'couple2', 'kidB'),
      },
    }),
    rootUnionId: 'root',
  };
}

/**
 * First-cousin consanguinity: two founders → pa, pb; pa → ca; pb → cb;
 * cousin union = ca × cb → gc. Documents that the layout handles cycles
 * (consanguineous pedigrees) without crashing.
 */
export function consanguinity(): Fixture {
  return {
    name: 'consanguinity',
    doc: doc({
      individuals: {
        g1: ind('g1', -60, 0),
        g2: ind('g2', 60, 0),
        pa: ind('pa', -60, 1),
        pb: ind('pb', 60, 1),
        ca: ind('ca', -60, 2),
        cb: ind('cb', 60, 2),
        gc: ind('gc', 0, 3),
      },
      partnerships: {
        top: union('top', 'g1', 'g2', ['pa', 'pb']),
        uA: union('uA', 'pa', undefined, ['ca']),
        uB: union('uB', 'pb', undefined, ['cb']),
        cousinUnion: union('cousinUnion', 'ca', 'cb', ['gc']),
      },
      parentChildLinks: {
        l1: link('l1', 'top', 'pa'),
        l2: link('l2', 'top', 'pb'),
        l3: link('l3', 'uA', 'ca'),
        l4: link('l4', 'uB', 'cb'),
        l5: link('l5', 'cousinUnion', 'gc'),
      },
    }),
    rootUnionId: 'top',
  };
}

/**
 * LEFT-RIGHT mirror of {@link crossBranchMarriage}: the load-bearing in-law
 * is placed far to the LEFT so the wide couple's recentred sibship is pulled
 * leftward toward a cousin sibship that sits to its left.
 *
 * Structure (same as crossBranchMarriage, x-negated):
 *   gp1 + gp2 → s1, s2 (grandparent root union)
 *   ilp → inlaw (load-bearing in-law pinned far LEFT)
 *   couple1 = s1 × inlaw → kidA  (cross-branch; inlaw is pinned)
 *   couple2 = s2 × s2mate → kidB (ordinary movable couple; kidB centres exactly)
 *
 * Regression guard for the clamp's LEFT-side direction: the shift that centres
 * kidB under couple2 must not push kidA into the inlaw's obstacle on its left.
 */
export function wideCoupleOppositeCousin(): Fixture {
  return {
    name: 'wideCoupleOppositeCousin',
    doc: doc({
      individuals: {
        // Negate x of every individual from crossBranchMarriage; keep generation.
        gp1: ind('gp1', 60, 0),    // was -60
        gp2: ind('gp2', -60, 0),   // was  60
        ilp: ind('ilp', -240, 0),  // was  240 (pinned far LEFT)
        s1: ind('s1', 0, 1),       // was    0
        inlaw: ind('inlaw', -240, 1), // was 240 (load-bearing in-law far LEFT)
        s2: ind('s2', -100, 1),    // was  100
        s2mate: ind('s2mate', -220, 1), // was 220
        kidA: ind('kidA', 0, 2),   // was    0
        kidB: ind('kidB', -160, 2), // was  160
      },
      partnerships: {
        root: union('root', 'gp1', 'gp2', ['s1', 's2']),
        ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
        couple1: union('couple1', 's1', 'inlaw', ['kidA']),
        couple2: union('couple2', 's2', 's2mate', ['kidB']),
      },
      parentChildLinks: {
        l1: link('l1', 'root', 's1'),
        l2: link('l2', 'root', 's2'),
        l3: link('l3', 'ilUnion', 'inlaw'),
        l4: link('l4', 'couple1', 'kidA'),
        l5: link('l5', 'couple2', 'kidB'),
      },
    }),
    rootUnionId: 'root',
  };
}

/**
 * Same shape as {@link crossBranchMarriage} — documents the identical
 * exact-overlap case from the perspective of a wide-couple adjacent cousin.
 * Both fixtures serve as regression guards for the same #115 bug.
 */
export function wideCoupleAdjacentCousin(): Fixture {
  const f = crossBranchMarriage();
  return { ...f, name: 'wideCoupleAdjacentCousin' };
}

/**
 * A looser #115 variant: in-law is tuned so kidA ≈ 380 while cousin kidB ≈ 100,
 * causing an order-inversion (kidA nominally right of kidB) rather than
 * exact coincidence. Tests that the layout resolves order inversions.
 */
export function wideCoupleInverted(): Fixture {
  return {
    name: 'wideCoupleInverted',
    doc: doc({
      individuals: {
        gp1: ind('gp1', -60, 0),
        gp2: ind('gp2', 60, 0),
        ilp: ind('ilp', 600, 0),
        s1: ind('s1', 0, 1),
        inlaw: ind('inlaw', 600, 1),
        s2: ind('s2', 100, 1),
        s2mate: ind('s2mate', 180, 1),
        kidA: ind('kidA', 380, 2),
        kidB: ind('kidB', 100, 2),
      },
      partnerships: {
        root: union('root', 'gp1', 'gp2', ['s1', 's2']),
        ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
        couple1: union('couple1', 's1', 'inlaw', ['kidA']),
        couple2: union('couple2', 's2', 's2mate', ['kidB']),
      },
      parentChildLinks: {
        l1: link('l1', 'root', 's1'),
        l2: link('l2', 'root', 's2'),
        l3: link('l3', 'ilUnion', 'inlaw'),
        l4: link('l4', 'couple1', 'kidA'),
        l5: link('l5', 'couple2', 'kidB'),
      },
    }),
    rootUnionId: 'root',
  };
}

/**
 * Chained wide couples: the blood line p1 → m1 → g1, where each generation
 * is also partnered with a load-bearing in-law far to the right.
 * Tests top-down sequential re-centering (the m1 shift must feed into g1's
 * re-centering, not the original position).
 */
export function chainedWideCouples(): Fixture {
  return {
    name: 'chainedWideCouples',
    doc: doc({
      individuals: {
        gp1: ind('gp1', -60, 0),
        gp2: ind('gp2', 60, 0),
        p1: ind('p1', 0, 1),
        inlaw1: ind('inlaw1', 500, 1),
        ilp1: ind('ilp1', 500, 0),
        m1: ind('m1', 0, 2),
        inlaw2: ind('inlaw2', 900, 2),
        ilp2: ind('ilp2', 900, 1),
        g1: ind('g1', 0, 3),
      },
      partnerships: {
        top: union('top', 'gp1', 'gp2', ['p1']),
        couple1: union('couple1', 'p1', 'inlaw1', ['m1']),
        ilUnion1: union('ilUnion1', 'ilp1', undefined, ['inlaw1']),
        couple2: union('couple2', 'm1', 'inlaw2', ['g1']),
        ilUnion2: union('ilUnion2', 'ilp2', undefined, ['inlaw2']),
      },
      parentChildLinks: {
        a: link('a', 'top', 'p1'),
        b: link('b', 'couple1', 'm1'),
        c: link('c', 'ilUnion1', 'inlaw1'),
        d: link('d', 'couple2', 'g1'),
        e: link('e', 'ilUnion2', 'inlaw2'),
      },
    }),
    rootUnionId: 'top',
  };
}

/**
 * Parent with two children where one child has an undefined generation.
 * Documents the bug where a child with no generation coordinate collapses
 * onto the root row (y=0) instead of landing on the correct child row
 * (y = GENERATION_SPACING). `c2` is constructed without a `generation`
 * field so it is genuinely `undefined` on the individual — bypassing the
 * `ind()` helper's `= 0` default which would silently coerce it to 0.
 */
export function undefinedGenerationChild(): Fixture {
  // Build c2 directly so its generation stays undefined (the ind() helper's
  // default parameter `= 0` would replace an explicit `undefined` argument).
  const c2 = createDefaultIndividual({ id: 'c2', position: { x: 40, y: 0 } });
  return {
    name: 'undefinedGenerationChild',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        c1: ind('c1', -40, 1),
        c2,
      },
      partnerships: { u: union('u', 'p', undefined, ['c1', 'c2']) },
      parentChildLinks: {
        l1: link('l1', 'u', 'c1'),
        l2: link('l2', 'u', 'c2'),
      },
    }),
    rootUnionId: 'u',
  };
}

/**
 * Remarriage with half-siblings: parent `p` appears in two child-bearing
 * unions — u1 (with spouse1 → kidA) and u2 (with spouse2 → kidB).
 *
 * Both children are seeded at the SAME x (0) in the same generation row, so a
 * layout that lays out only the first union (`u1`/`kidA`) and leaves the second
 * union (`u2`/`kidB`) in place produces a genuine `noSymbolOverlap` /
 * `subtreeNonCollision` violation. Multi-union layout (issue #131) must place
 * the second sibship clear of the first. `p` is the shared parent whose two
 * spouses sit on either side.
 */
export function remarriageHalfSibs(): Fixture {
  return {
    name: 'remarriageHalfSibs',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        spouse1: ind('spouse1', 120, 0),
        spouse2: ind('spouse2', -120, 0),
        // Both half-sibs seeded at the SAME x → overlap unless u2 is laid out.
        kidA: ind('kidA', 0, 1),
        kidB: ind('kidB', 0, 1),
      },
      partnerships: {
        u1: union('u1', 'p', 'spouse1', ['kidA']),
        u2: union('u2', 'p', 'spouse2', ['kidB']),
      },
      parentChildLinks: {
        la: link('la', 'u1', 'kidA'),
        lb: link('lb', 'u2', 'kidB'),
      },
    }),
    rootUnionId: 'u1',
  };
}

/**
 * Parent with MZ twin pair (t1, t2) plus a singleton sibling (s) whose seed
 * x lies between the two twins. Tests that the layout keeps the singleton
 * outside the twin run (twin contiguity) and respects the seeded order.
 */
export function twinsWithSingletonSibling(): Fixture {
  const twinGroups: Record<string, TwinGroup> = {
    tg: {
      id: 'tg',
      twinType: TwinType.Monozygotic,
      individualIds: ['t1', 't2'],
      parentPartnershipId: 'u',
    },
  };
  return {
    name: 'twinsWithSingletonSibling',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        t1: ind('t1', -80, 1),
        s: ind('s', 0, 1),   // seeded BETWEEN the twins
        t2: ind('t2', 80, 1),
      },
      partnerships: { u: union('u', 'p', undefined, ['t1', 's', 't2']) },
      parentChildLinks: {
        l1: link('l1', 'u', 't1'),
        l2: link('l2', 'u', 's'),
        l3: link('l3', 'u', 't2'),
      },
      twinGroups,
    }),
    rootUnionId: 'u',
    twinGroups,
  };
}

/**
 * Two completely unrelated founder couples with children in a single document.
 * The layout is rooted at the first couple; the second component must not move.
 * Prefixing the unrelated component's ids with `other_` makes it easy to
 * assert that none of those ids appear in the moves map.
 */
export function disconnectedComponents(): Fixture {
  return {
    name: 'disconnectedComponents',
    doc: doc({
      individuals: {
        a1: ind('a1', 0, 0),
        a2: ind('a2', 120, 0),
        ac: ind('ac', 60, 1),
        other_b1: ind('other_b1', 600, 0),
        other_b2: ind('other_b2', 720, 0),
        other_bc: ind('other_bc', 660, 1),
      },
      partnerships: {
        uA: union('uA', 'a1', 'a2', ['ac']),
        other_uB: union('other_uB', 'other_b1', 'other_b2', ['other_bc']),
      },
      parentChildLinks: {
        la: link('la', 'uA', 'ac'),
        other_lb: link('other_lb', 'other_uB', 'other_bc'),
      },
    }),
    rootUnionId: 'uA',
  };
}

/**
 * A degenerate union where both partner slots point at the same individual.
 * Documents graceful handling of a self-partnered node (should not crash).
 */
export function selfPartneredUnion(): Fixture {
  return {
    name: 'selfPartneredUnion',
    doc: doc({
      individuals: {
        a: ind('a', 0, 0),
        k: ind('k', 0, 1),
      },
      partnerships: { u: union('u', 'a', 'a', ['k']) },
      parentChildLinks: { l1: link('l1', 'u', 'k') },
    }),
    rootUnionId: 'u',
  };
}

/**
 * Wide cousin fan: one grandparent → 4 children, each with 3 children (12
 * cousins in generation 2). Regression guard — this shape already passes
 * today and must continue to pass after the rewrite.
 */
export function wideCousinFan(): Fixture {
  const individuals: Record<string, Individual> = {
    gp: ind('gp', 0, 0),
  };
  const partnerships: Record<string, PartnershipRelationship> = {
    top: union('top', 'gp', undefined, ['p1', 'p2', 'p3', 'p4']),
  };
  const parentChildLinks: Record<string, ParentChildRelationship> = {};

  for (let pi = 1; pi <= 4; pi++) {
    const pid = `p${pi}`;
    individuals[pid] = ind(pid, (pi - 1) * 240, 1);
    const uid = `u${pi}`;
    const kids: string[] = [];
    for (let ci = 1; ci <= 3; ci++) {
      const cid = `c${pi}_${ci}`;
      individuals[cid] = ind(cid, (pi - 1) * 240 + (ci - 1) * 80, 2);
      kids.push(cid);
      parentChildLinks[`l${pi}_${ci}`] = link(`l${pi}_${ci}`, uid, cid);
    }
    partnerships[uid] = union(uid, pid, undefined, kids);
    parentChildLinks[`lp${pi}`] = link(`lp${pi}`, 'top', pid);
  }

  return {
    name: 'wideCousinFan',
    doc: doc({ individuals, partnerships, parentChildLinks }),
    rootUnionId: 'top',
  };
}

// ---------------------------------------------------------------------------
// Exported fixture array
// ---------------------------------------------------------------------------

/**
 * Every fixture builder in this library. Tasks 3–11 iterate this array to
 * validate `computeTreeLayout` against the invariant matchers in
 * `invariants.ts`.
 */
export const ALL_FIXTURES: Array<() => Fixture> = [
  loneFounder,
  coupleWithSibship,
  threeGenerations,
  twins,
  marriedInWithParents,
  crossBranchMarriage,
  consanguinity,
  wideCoupleOppositeCousin,
  wideCoupleAdjacentCousin,
  wideCoupleInverted,
  chainedWideCouples,
  undefinedGenerationChild,
  remarriageHalfSibs,
  twinsWithSingletonSibling,
  disconnectedComponents,
  selfPartneredUnion,
  wideCousinFan,
];
