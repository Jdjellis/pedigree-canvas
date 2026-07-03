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

/**
 * MZ twins (`ta`, `tc`) with a singleton sibling (`tb`) whose id AND seed x both
 * sort *between* the twins. A layout that orders siblings purely by
 * id/seed tie-break (with no twin awareness) interleaves `tb` between the twins,
 * violating twin contiguity — the failing-first case for making `reformatLayout`
 * twin-aware. The single-family `computeTreeLayout` already passes this via
 * `orderSiblingsWithTwins`.
 */
export function twinsWithInterleavingSibling(): Fixture {
  const twinGroups: Record<string, TwinGroup> = {
    g: {
      id: 'g',
      twinType: TwinType.Monozygotic,
      individualIds: ['ta', 'tc'],
      parentPartnershipId: 'u',
    },
  };
  return {
    name: 'twinsWithInterleavingSibling',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        ta: ind('ta', -80, 1),
        tb: ind('tb', 0, 1), // id + seed both sort BETWEEN the twins
        tc: ind('tc', 80, 1),
      },
      partnerships: { u: union('u', 'p', undefined, ['ta', 'tb', 'tc']) },
      parentChildLinks: {
        l1: link('l1', 'u', 'ta'),
        l2: link('l2', 'u', 'tb'),
        l3: link('l3', 'u', 'tc'),
      },
      twinGroups,
    }),
    rootUnionId: 'u',
    twinGroups,
  };
}

// ---------------------------------------------------------------------------
// Synthetic reformat fixtures (issue #137) — multi-founder documents exercised
// through `reformatLayout`. The real reported document (which imports the
// `layout-bugs.json` asset) lives in `reformatFixtures.ts` so this shared module
// stays free of a JSON import — the Playwright e2e loader imports this file and
// only tolerates plain TS/ESM.
// ---------------------------------------------------------------------------

/**
 * Minimal synthetic cross-branch marriage seeded far apart with a sibling in the
 * gap — the reduced form of the `4a1d × ddf2` smoking gun.
 *
 *   Lgp1 + Lgp2 → La, Lsib   (left family, seeded far LEFT)
 *   Rgp1 + Rgp2 → Rb, Rsib   (right family, seeded far RIGHT)
 *   couple = La × Rb → kid    (both La and Rb are load-bearing)
 *
 * On the current engine `La` and `Rb` stay ~1440 px apart with `Lsib`/`Rsib`
 * stranded in the gap; `reformatLayout` must bring the couple adjacent.
 */
export function farApartCrossBranchCouple(): Fixture {
  return {
    name: 'farApartCrossBranchCouple',
    doc: doc({
      individuals: {
        Lgp1: ind('Lgp1', -60, 0), Lgp2: ind('Lgp2', 60, 0),
        Rgp1: ind('Rgp1', 1340, 0), Rgp2: ind('Rgp2', 1460, 0),
        La: ind('La', 0, 1), Lsib: ind('Lsib', 120, 1),
        Rb: ind('Rb', 1400, 1), Rsib: ind('Rsib', 1280, 1),
        kid: ind('kid', 700, 2),
      },
      partnerships: {
        Lroot: union('Lroot', 'Lgp1', 'Lgp2', ['La', 'Lsib']),
        Rroot: union('Rroot', 'Rgp1', 'Rgp2', ['Rb', 'Rsib']),
        couple: union('couple', 'La', 'Rb', ['kid']),
      },
      parentChildLinks: {
        a: link('a', 'Lroot', 'La'), b: link('b', 'Lroot', 'Lsib'),
        c: link('c', 'Rroot', 'Rb'), d: link('d', 'Rroot', 'Rsib'),
        e: link('e', 'couple', 'kid'),
      },
    }),
    rootUnionId: 'Lroot',
  };
}

/**
 * Three founder families spread far across a row (≈700 px apart), two joined by a
 * cross-branch marriage and the third left as a disconnected component. Exercises
 * global width compaction (the "very wide pedigree" symptom): every generation
 * row is far wider than its tight packing until `reformatLayout` squeezes it.
 */
export function wideMultiFounderChart(): Fixture {
  return {
    name: 'wideMultiFounderChart',
    doc: doc({
      individuals: {
        m1: ind('m1', 0, 0), f1: ind('f1', 120, 0),
        m2: ind('m2', 800, 0), f2: ind('f2', 920, 0),
        m3: ind('m3', 1600, 0), f3: ind('f3', 1720, 0),
        c1: ind('c1', 60, 1), c2: ind('c2', 860, 1), c3: ind('c3', 1660, 1),
        g1: ind('g1', 460, 2),
      },
      partnerships: {
        u1: union('u1', 'm1', 'f1', ['c1']),
        u2: union('u2', 'm2', 'f2', ['c2']),
        u3: union('u3', 'm3', 'f3', ['c3']),
        couple: union('couple', 'c1', 'c2', ['g1']),
      },
      parentChildLinks: {
        l1: link('l1', 'u1', 'c1'),
        l2: link('l2', 'u2', 'c2'),
        l3: link('l3', 'u3', 'c3'),
        l4: link('l4', 'couple', 'g1'),
      },
    }),
    rootUnionId: 'u1',
  };
}

/**
 * A hub individual married to THREE spouses on the same generation row, each
 * union bearing a child (`hub × s1 → k1`, `hub × s2 → k2`, `hub × s3 → k3`).
 *
 * A hub with more than two same-row partnerships cannot be laid out as a single
 * line with *every* couple adjacent: a point has only two neighbours in a line.
 * `orderChainMembers` walks the partner graph as a path, reaches only two of the
 * three spouses (`s1, hub, s2`), and appends the third (`s3`) — so in the packed
 * row `s2` sits between `hub` and `s3`, and `hub × s3` spans `2 × partnerSpacing`.
 * This is the reduced form of the reported `c912` hub generalised to 3 spouses.
 *
 * Both facts are structurally forced, so BOTH hard invariants take their
 * *achievable* form (issue #141): `noNodeBetweenPartners` permits a hub's own
 * co-spouse between its partners, and `minPartnerSpacing` permits a hub union up
 * to `(degree − 1) × partnerSpacing` — the tight bound the linear packing hits.
 * `reformatLayout` meets both, so `checkAllInvariants` passes and this fixture is
 * a member of `REFORMAT_FIXTURES`.
 */
export function threeUnionHub(): Fixture {
  return {
    name: 'threeUnionHub',
    doc: doc({
      individuals: {
        s1: ind('s1', -120, 0), hub: ind('hub', 0, 0),
        s2: ind('s2', 120, 0), s3: ind('s3', 240, 0),
        k1: ind('k1', -60, 1), k2: ind('k2', 60, 1), k3: ind('k3', 180, 1),
      },
      partnerships: {
        u1: union('u1', 's1', 'hub', ['k1']),
        u2: union('u2', 'hub', 's2', ['k2']),
        u3: union('u3', 'hub', 's3', ['k3']),
      },
      parentChildLinks: {
        l1: link('l1', 'u1', 'k1'),
        l2: link('l2', 'u2', 'k2'),
        l3: link('l3', 'u3', 'k3'),
      },
    }),
    rootUnionId: 'u1',
  };
}

/**
 * A twin who is themselves married. `a_tw1` and `c_tw2` are MZ twins (children
 * of `p`); `c_tw2` is also partnered with married-in `d_sp`, and a plain sibling
 * `b_sib` shares their row.
 *
 * `makeTwinsContiguous` only pulls *single-node* chains into a twin group's
 * contiguous run, so the coupled twin `c_tw2` (locked into the `c_tw2 × d_sp`
 * chain) is excluded from the group's contiguity pass. With only one of the two
 * twins eligible, nothing prevents `b_sib` from tie-breaking between them: the
 * barycentre order settles on `a_tw1, b_sib, c_tw2`, leaving a non-twin between
 * the twins. Exposes the twin-contiguity gap for a married twin (issue #137).
 * Ids are chosen so the deterministic tie-break produces the interleaving.
 */
export function marriedTwinInterleaved(): Fixture {
  const twinGroups: Record<string, TwinGroup> = {
    g: {
      id: 'g',
      twinType: TwinType.Monozygotic,
      individualIds: ['a_tw1', 'c_tw2'],
      parentPartnershipId: 'u',
    },
  };
  return {
    name: 'marriedTwinInterleaved',
    doc: doc({
      individuals: {
        p: ind('p', 0, 0),
        a_tw1: ind('a_tw1', -80, 1),
        b_sib: ind('b_sib', 0, 1),
        c_tw2: ind('c_tw2', 80, 1),
        d_sp: ind('d_sp', 200, 1),
      },
      partnerships: {
        u: union('u', 'p', undefined, ['a_tw1', 'b_sib', 'c_tw2']),
        couple: union('couple', 'c_tw2', 'd_sp', []),
      },
      parentChildLinks: {
        l1: link('l1', 'u', 'a_tw1'),
        l2: link('l2', 'u', 'b_sib'),
        l3: link('l3', 'u', 'c_tw2'),
      },
      twinGroups,
    }),
    rootUnionId: 'u',
    twinGroups,
  };
}

/**
 * A connected single-family pedigree that `reformatLayout` lays out with
 * **overlapping subtrees** (`subtreeNonCollision` fails). Found by the
 * property-based discovery harness and shrunk to 14 nodes; no hub, no twins, no
 * disconnection — an ordinary branching family four generations deep.
 *
 *   i0 × i1 → i3, i5, i7
 *   i5 × i9  → i13, i15      i7 × i11 → i19, i21
 *   i15 × i17 → i23
 *   i23 × i25 → (childless)
 *
 * Originally `reformatLayout` reordered the rows, packed each row, and did only a
 * rigid per-row shift — with no contour/subtree-separation step — so a deep
 * subtree slid over its sibling. Fixed in #141: the coordinate phase now re-tidies
 * each plain branching family (every union blood × married-in, no hub, no
 * cross-branch couple) through `computeTreeLayout`'s contour separation, so cousin
 * subtrees stay disjoint. Now a member of `ALL_FIXTURES`.
 */
export function subtreeCollisionRegression(): Fixture {
  return {
    name: 'subtreeCollisionRegression',
    doc: doc({
      individuals: {
        i0: ind('i0', 0, 0), i1: ind('i1', 0, 0),
        i3: ind('i3', 0, 1), i5: ind('i5', 0, 1), i7: ind('i7', 0, 1),
        i9: ind('i9', 0, 1), i11: ind('i11', 0, 1),
        i13: ind('i13', 0, 2), i15: ind('i15', 0, 2), i17: ind('i17', 0, 2),
        i19: ind('i19', 0, 2), i21: ind('i21', 0, 2),
        i23: ind('i23', 0, 3), i25: ind('i25', 0, 3),
      },
      partnerships: {
        u2: union('u2', 'i0', 'i1', ['i3', 'i5', 'i7']),
        u10: union('u10', 'i5', 'i9', ['i13', 'i15']),
        u12: union('u12', 'i7', 'i11', ['i19', 'i21']),
        u18: union('u18', 'i15', 'i17', ['i23']),
        u26: union('u26', 'i23', 'i25', []),
      },
      parentChildLinks: {
        l3: link('l3', 'u2', 'i3'), l5: link('l5', 'u2', 'i5'), l7: link('l7', 'u2', 'i7'),
        l13: link('l13', 'u10', 'i13'), l15: link('l15', 'u10', 'i15'),
        l19: link('l19', 'u12', 'i19'), l21: link('l21', 'u12', 'i21'),
        l23: link('l23', 'u18', 'i23'),
      },
    }),
    rootUnionId: 'u2',
  };
}

/**
 * A deep, asymmetric single-family pedigree that `computeTreeLayout` (the
 * incremental engine, and the delegate `reformatLayout` uses for a plain family)
 * laid out with **overlapping cousin subtrees** (`subtreeNonCollision`). Found by
 * the property harness and shrunk to 18 nodes; no hub, no twins, no
 * cross-branch — an ordinary branching family whose left spine runs a generation
 * deeper than its right.
 *
 *   i0 × i1 → i3, i5
 *   i3 × i7  → i13                 (left spine)
 *   i13 × i17 → i30, i32, i34      (i32 sits between its siblings)
 *   i32 × i36 → i38, i40           (deep subtree hanging under i32)
 *   i5 × i9  → i19, i21, i23       (right branch, shallow and wide)
 *
 * `i32`'s descent block (`u37`) is nested *between* its parent `u18`'s children
 * (`i30 … i34`). The per-row separation sweep in `separateGenerations` treated
 * `u18`'s row span as solid — hole and all — and so shoved the nested `u37` block
 * clear past `i34`, out of the left band and horizontally into `i5`'s shallow
 * right-branch sibship. Fixed in #141 (residual 4): the sweep excludes an
 * ancestor/descendant block from a block's separation barrier, so a nested
 * descendant is no longer spuriously pushed. Member of `ALL_FIXTURES`.
 */
export function deepAsymmetricSubtree(): Fixture {
  return {
    name: 'deepAsymmetricSubtree',
    doc: doc({
      individuals: {
        i0: ind('i0', 0, 0), i1: ind('i1', 0, 0),
        i3: ind('i3', 0, 1), i5: ind('i5', 0, 1), i7: ind('i7', 0, 1), i9: ind('i9', 0, 1),
        i13: ind('i13', 0, 2), i17: ind('i17', 0, 2),
        i19: ind('i19', 0, 2), i21: ind('i21', 0, 2), i23: ind('i23', 0, 2),
        i30: ind('i30', 0, 3), i32: ind('i32', 0, 3), i34: ind('i34', 0, 3), i36: ind('i36', 0, 3),
        i38: ind('i38', 0, 4), i40: ind('i40', 0, 4),
      },
      partnerships: {
        u2: union('u2', 'i0', 'i1', ['i3', 'i5']),
        u8: union('u8', 'i3', 'i7', ['i13']),
        u18: union('u18', 'i13', 'i17', ['i30', 'i32', 'i34']),
        u37: union('u37', 'i32', 'i36', ['i38', 'i40']),
        u10: union('u10', 'i5', 'i9', ['i19', 'i21', 'i23']),
      },
      parentChildLinks: {
        l3: link('l3', 'u2', 'i3'), l5: link('l5', 'u2', 'i5'),
        l13: link('l13', 'u8', 'i13'),
        l30: link('l30', 'u18', 'i30'), l32: link('l32', 'u18', 'i32'), l34: link('l34', 'u18', 'i34'),
        l38: link('l38', 'u37', 'i38'), l40: link('l40', 'u37', 'i40'),
        l19: link('l19', 'u10', 'i19'), l21: link('l21', 'u10', 'i21'), l23: link('l23', 'u10', 'i23'),
      },
    }),
    rootUnionId: 'u2',
  };
}

/**
 * The canonical consanguineous sib-couple (issue #141, residual 1a): `sibA` and
 * `sibB` are siblings who are ALSO married to each other (childless union), and
 * each holds a further child-bearing union with a married-in spouse. The row-1
 * partner graph is the path `spA – sibA – sibB – spB`, so the couple must read
 * adjacent with the spouses to the outside — the shape that made every
 * coordinate-sorted chain re-pack drop a spouse between the couple during the
 * residual-1a investigation (`noNodeBetweenPartners`), and that the cross-branch
 * phase's divergence-sibship bias now lays out as
 * `… spA, sibA, sibB, spB …` with the two sibships disjoint below.
 */
export function consanguineousSibCouple(): Fixture {
  return {
    name: 'consanguineousSibCouple',
    doc: doc({
      individuals: {
        gp1: ind('gp1', 0, 0), gp2: ind('gp2', 0, 0),
        sibA: ind('sibA', 0, 1), sibB: ind('sibB', 0, 1),
        spA: ind('spA', 0, 1), spB: ind('spB', 0, 1),
        kA1: ind('kA1', 0, 2), kA2: ind('kA2', 0, 2), kB1: ind('kB1', 0, 2),
      },
      partnerships: {
        top: union('top', 'gp1', 'gp2', ['sibA', 'sibB']),
        uA: union('uA', 'sibA', 'spA', ['kA1', 'kA2']),
        uB: union('uB', 'sibB', 'spB', ['kB1']),
        sibUnion: union('sibUnion', 'sibA', 'sibB', []),
      },
      parentChildLinks: {
        l1: link('l1', 'top', 'sibA'),
        l2: link('l2', 'top', 'sibB'),
        l3: link('l3', 'uA', 'kA1'),
        l4: link('l4', 'uA', 'kA2'),
        l5: link('l5', 'uB', 'kB1'),
      },
    }),
    rootUnionId: 'top',
  };
}

/**
 * Two founder families joined by a cross-branch couple (`i6 × i10`, both
 * load-bearing) where each partner also holds a childless union with a
 * married-in spouse — the row-1 partner path `i8 – i6 – i10 – i14`. Found by
 * the discovery harness and shrunk to 9 nodes: the linear engine kept the
 * couple adjacent but crossed the two families' descent lines
 * (`noCrossedDescentLines`: `u2`'s child reaches under `u5`'s children).
 * Fixed by the cross-branch coordinate phase (issue #141, residual 1a), which
 * tidies each blood side as its own plain family and composes them at the
 * couple.
 */
export function crossBranchChainCrossing(): Fixture {
  return {
    name: 'crossBranchChainCrossing',
    doc: doc({
      individuals: {
        i0: ind('i0', 0, 0), i1: ind('i1', 0, 0),
        i3: ind('i3', 0, 0), i4: ind('i4', 0, 0),
        i6: ind('i6', 0, 1), i8: ind('i8', 0, 1),
        i10: ind('i10', 0, 1), i12: ind('i12', 0, 1), i14: ind('i14', 0, 1),
      },
      partnerships: {
        u2: union('u2', 'i0', 'i1', ['i6']),
        u5: union('u5', 'i3', 'i4', ['i10', 'i12']),
        u9: union('u9', 'i6', 'i8', []),
        u15: union('u15', 'i10', 'i14', []),
        u16: union('u16', 'i6', 'i10', []),
      },
      parentChildLinks: {
        l7: link('l7', 'u2', 'i6'),
        l11: link('l11', 'u5', 'i10'),
        l13: link('l13', 'u5', 'i12'),
      },
    }),
    rootUnionId: 'u2',
  };
}

/**
 * A deep consanguineous cross-branch case: first cousins `i13 × i19` (children
 * of two siblings) marry — childless — while each also holds a further
 * childless union, and the two cousin sibships are wide. Found by the discovery
 * harness and shrunk to 15 nodes: the linear engine's rigid per-row alignment
 * left the two cousin sibships' extents overlapping by 120 px
 * (`subtreeNonCollision`). The cross-branch phase's divergence-sibship bias
 * re-tidies the whole family (cross union removed) so the cousins sit adjacent
 * at the seam with their sibships disjoint (issue #141, residual 1a).
 */
export function cousinCoupleSubtreeCollision(): Fixture {
  return {
    name: 'cousinCoupleSubtreeCollision',
    doc: doc({
      individuals: {
        i0: ind('i0', 0, 0), i1: ind('i1', 0, 0),
        i3: ind('i3', 0, 1), i5: ind('i5', 0, 1), i7: ind('i7', 0, 1),
        i9: ind('i9', 0, 1), i11: ind('i11', 0, 1),
        i13: ind('i13', 0, 2), i15: ind('i15', 0, 2), i17: ind('i17', 0, 2),
        i19: ind('i19', 0, 2), i21: ind('i21', 0, 2), i23: ind('i23', 0, 2),
        i25: ind('i25', 0, 2), i27: ind('i27', 0, 2),
      },
      partnerships: {
        u2: union('u2', 'i0', 'i1', ['i3', 'i5', 'i7']),
        u10: union('u10', 'i3', 'i9', ['i13', 'i15']),
        u12: union('u12', 'i7', 'i11', ['i19', 'i21', 'i23']),
        u18: union('u18', 'i13', 'i17', []),
        u26: union('u26', 'i19', 'i25', []),
        u28: union('u28', 'i23', 'i27', []),
        u29: union('u29', 'i13', 'i19', []),
      },
      parentChildLinks: {
        l4: link('l4', 'u2', 'i3'), l6: link('l6', 'u2', 'i5'), l8: link('l8', 'u2', 'i7'),
        l14: link('l14', 'u10', 'i13'), l16: link('l16', 'u10', 'i15'),
        l20: link('l20', 'u12', 'i19'), l22: link('l22', 'u12', 'i21'), l24: link('l24', 'u12', 'i23'),
      },
    }),
    rootUnionId: 'u2',
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
  twinsWithInterleavingSibling,
  disconnectedComponents,
  selfPartneredUnion,
  wideCousinFan,
  subtreeCollisionRegression,
  deepAsymmetricSubtree,
  marriedTwinInterleaved,
  consanguineousSibCouple,
  crossBranchChainCrossing,
  cousinCoupleSubtreeCollision,
];
