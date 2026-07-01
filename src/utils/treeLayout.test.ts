import { describe, it, expect } from 'vitest';
import {
  orderChildrenByX,
  isLoadBearingInLaw,
  findRootUnion,
  coupleAround,
  packBlocks,
  computeTreeLayout,
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
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive: false };
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
    const posOf = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // The sibling must end clear of the partner: at least SIBLING_SPACING (80) past it.
    expect(posOf('sib')).toBeGreaterThanOrEqual(posOf('partner') + 80);
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
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    const gen2 = (['a1', 'a2', 'b1', 'b2'] as const).map(x).sort((m, n) => m - n);
    // Every adjacent pair in gen 2 is at least SIBLING_SPACING apart (no overlap).
    for (let i = 1; i < gen2.length; i++) expect(gen2[i] - gen2[i - 1]).toBeGreaterThanOrEqual(80);
  });

  it('separates the two parent couples when a married pair both have parents', () => {
    // Reproduces the overlap bug: a couple s1 (864) — s2 (984), 120 apart, where
    // BOTH partners have their own parents. Each parent couple is 120 wide and
    // centred over its child, so s1's mother (924) and s2's father (924) collide.
    // Adding s2's parents roots the relayout at s2's union and pins s1 (a
    // load-bearing in-law), so the packer never sees s1's parents. The layout
    // must shift s2's family clear so the grandparent row no longer overlaps.
    const individuals = {
      s1: ind('s1', 864, 0), s2: ind('s2', 984, 0),
      d1: ind('d1', 804, -1), m1: ind('m1', 924, -1),   // s1's parents
      d2: ind('d2', 924, -1), m2: ind('m2', 1044, -1),  // s2's parents (d2 overlaps m1)
    };
    const partnerships = {
      couple: union('couple', 's1', 's2', []),
      left: union('left', 'd1', 'm1', ['s1']),
      right: union('right', 'd2', 'm2', ['s2']),
    };
    const parentChildLinks = {
      ls1: link('ls1', 'left', 's1'),
      ls2: link('ls2', 'right', 's2'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'right');
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // Grandparent row has no overlap: every adjacent pair ≥ SIBLING_SPACING apart.
    const gp = (['d1', 'm1', 'd2', 'm2'] as const).map(x).sort((a, b) => a - b);
    for (let i = 1; i < gp.length; i++) expect(gp[i] - gp[i - 1]).toBeGreaterThanOrEqual(80);
    // Descent lines stay vertical: each parent couple stays centred over its child.
    expect((x('d2') + x('m2')) / 2).toBe(x('s2'));
    expect((x('d1') + x('m1')) / 2).toBe(x('s1'));
  });

  it('centres a single child under a wide couple with one load-bearing in-law (#105)', () => {
    // p (blood, gen 1) married to inlaw (load-bearing — its parent ilp sits
    // above it). Their single child must sit at the COUPLE MIDPOINT so the
    // descent line (drawn from the couple midpoint) stays vertical, rather than
    // hanging directly under p.
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
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // Child centred at the couple midpoint (descent stays vertical).
    expect(x('kid')).toBe((x('p') + x('inlaw')) / 2);
    // The load-bearing in-law is not relocated.
    expect(moved.inlaw).toBeUndefined();
  });

  it('centres the child of a cross-branch couple when the relayout roots in one branch (#105)', () => {
    // The reported case: s1 descends from a LEFT branch (gp1+gp2), s2 descends
    // from a RIGHT in-law (ilp). They marry (both load-bearing) and have a
    // child. findRootUnion(child) climbs into the left branch, so the couple is
    // laid out deep in the tree with s1 as the blood partner and s2 pinned far
    // to the right. The child must still centre between s1 and s2.
    const individuals = {
      gp1: ind('gp1', -60, 0), gp2: ind('gp2', 60, 0),
      s1: ind('s1', 0, 1), s2: ind('s2', 600, 1),
      ilp: ind('ilp', 600, 0),
      child: ind('child', 0, 2),
    };
    const partnerships = {
      leftRoot: union('leftRoot', 'gp1', 'gp2', ['s1']),
      ilUnion: union('ilUnion', 'ilp', undefined, ['s2']),
      couple: union('couple', 's1', 's2', ['child']),
    };
    const parentChildLinks = {
      l1: link('l1', 'leftRoot', 's1'),
      l2: link('l2', 'ilUnion', 's2'),
      l3: link('l3', 'couple', 'child'),
    };
    const d = { individuals, partnerships, parentChildLinks };
    // Sanity: the relayout roots in the left branch, not at the couple.
    expect(findRootUnion(d, 'child')).toBe('leftRoot');
    const moved = computeTreeLayout(d, 'leftRoot');
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // Child sits at the couple midpoint between the two far-apart branches.
    expect(x('child')).toBe((x('s1') + x('s2')) / 2);
    // The right in-law is pinned (not relocated).
    expect(moved.s2).toBeUndefined();
  });

  it('centres a multi-child sibship under a wide couple, preserving spacing (#105)', () => {
    // Same wide couple as above but with THREE children. The whole sibship must
    // slide as one block so its centre lands on the couple midpoint, and the
    // sibling spacing is preserved (not squashed).
    const individuals = {
      p: ind('p', 0, 1), inlaw: ind('inlaw', 400, 1),
      ilp: ind('ilp', 400, 0),
      k1: ind('k1', 0, 2), k2: ind('k2', 80, 2), k3: ind('k3', 160, 2),
    };
    const partnerships = {
      mar: union('mar', 'p', 'inlaw', ['k1', 'k2', 'k3']),
      ilUnion: union('ilUnion', 'ilp', undefined, ['inlaw']),
    };
    const parentChildLinks = {
      a: link('a', 'mar', 'k1'), b: link('b', 'mar', 'k2'), c: link('c', 'mar', 'k3'),
      d: link('d', 'ilUnion', 'inlaw'),
    };
    const moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'mar');
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // Sibship centre lands on the couple midpoint: mid = (0 + 400) / 2 = 200.
    const sibCentre = (x('k1') + x('k3')) / 2;
    expect(sibCentre).toBe((x('p') + x('inlaw')) / 2);
    // Sibling spacing is uniform (the block moved rigidly, not squashed).
    expect(x('k2') - x('k1')).toBe(x('k3') - x('k2'));
    // The load-bearing in-law is not relocated.
    expect(moved.inlaw).toBeUndefined();
  });

  it('centres each generation of chained wide couples on its own shifted midpoint (#105)', () => {
    // A wide couple's child (m1) is itself a partner in a lower wide couple.
    // Processing must be top-down: m1 is re-centred under couple1 FIRST, then
    // g1 re-centres under couple2 using m1's ALREADY-SHIFTED x (not its original
    // position) — otherwise g1 picks up an extra half-shift.
    const individuals = {
      gp1: ind('gp1', -60, 0), gp2: ind('gp2', 60, 0),
      p1: ind('p1', 0, 1),
      inlaw1: ind('inlaw1', 500, 1), ilp1: ind('ilp1', 500, 0),
      m1: ind('m1', 0, 2),
      inlaw2: ind('inlaw2', 900, 2), ilp2: ind('ilp2', 900, 1),
      g1: ind('g1', 0, 3),
    };
    const partnerships = {
      top: union('top', 'gp1', 'gp2', ['p1']),
      couple1: union('couple1', 'p1', 'inlaw1', ['m1']),
      ilUnion1: union('ilUnion1', 'ilp1', undefined, ['inlaw1']),
      couple2: union('couple2', 'm1', 'inlaw2', ['g1']),
      ilUnion2: union('ilUnion2', 'ilp2', undefined, ['inlaw2']),
    };
    const parentChildLinks = {
      a: link('a', 'top', 'p1'),
      b: link('b', 'couple1', 'm1'),
      c: link('c', 'ilUnion1', 'inlaw1'),
      d: link('d', 'couple2', 'g1'),
      e: link('e', 'ilUnion2', 'inlaw2'),
    };
    const d = { individuals, partnerships, parentChildLinks };
    // The relayout roots at the top of the left blood line.
    expect(findRootUnion(d, 'g1')).toBe('top');
    const moved = computeTreeLayout(d, 'top');
    const x = (id: keyof typeof individuals) => moved[id]?.x ?? individuals[id].position.x;
    // m1 centres under couple1: (p1 + inlaw1) / 2 = (0 + 500) / 2 = 250.
    expect(x('m1')).toBe((x('p1') + x('inlaw1')) / 2);
    // g1 centres under couple2 using m1's shifted x: (250 + 900) / 2 = 575.
    expect(x('g1')).toBe((x('m1') + x('inlaw2')) / 2);
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

describe('computeTreeLayout — remarriage (best-effort limitation)', () => {
  it('does not crash when a person has two child-bearing unions; second sibship is left untouched', () => {
    // layoutChildBlock only lays out the first child-bearing union (by insertion
    // order).  Children from a second union (remarriage) are left in place.
    // This test documents the known limitation and guards against a crash.
    const individuals = {
      p: ind('p', 0, 0),
      spouse1: ind('spouse1', 120, 0),
      spouse2: ind('spouse2', -120, 0),
      kidA: ind('kidA', 60, 1),
      kidB: ind('kidB', -60, 1),
    };
    const partnerships = {
      u1: union('u1', 'p', 'spouse1', ['kidA']),
      u2: union('u2', 'p', 'spouse2', ['kidB']),
    };
    const parentChildLinks = {
      la: link('la', 'u1', 'kidA'),
      lb: link('lb', 'u2', 'kidB'),
    };
    // Must not throw.
    let moved: Record<string, { x: number; y: number }> | undefined;
    expect(() => {
      moved = computeTreeLayout({ individuals, partnerships, parentChildLinks }, 'u1');
    }).not.toThrow();
    // kidB belongs to the second union (u2) which is not laid out; it must be
    // absent from the moves map (left at its current position).
    expect(moved!['kidB']).toBeUndefined();
  });
});

describe('findRootUnion — blood-line preference', () => {
  it('climbs the partner WITH a parent link when partner1Id has none', () => {
    // Bug: current code picks u.partner1Id unconditionally; if partner1Id is an
    // in-law founder (no parents in this doc) the climb stops at the low union
    // instead of reaching the blood root.
    //
    // Fixture: bloodRoot (gp1+gp2) → blood; low union: partner1Id=inlaw (no parents),
    // partner2Id=blood (has parents in bloodRoot); child C belongs to low union.
    const d = doc({
      individuals: {
        gp1: ind('gp1', -120, 0), gp2: ind('gp2', 0, 0),
        blood: ind('blood', -60, 1),
        inlaw: ind('inlaw', 60, 1),
        C: ind('C', 0, 2),
      },
      partnerships: {
        bloodRoot: union('bloodRoot', 'gp1', 'gp2', ['blood']),
        low: union('low', 'inlaw', 'blood', ['C']),
      },
      parentChildLinks: {
        l1: link('l1', 'bloodRoot', 'blood'),
        l2: link('l2', 'low', 'C'),
      },
    });
    // findRootUnion from C should reach bloodRoot, not stop at low.
    expect(findRootUnion(d, 'C')).toBe('bloodRoot');
  });
});
