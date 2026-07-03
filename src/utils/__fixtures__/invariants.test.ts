import { describe, it, expect } from 'vitest';
import {
  finalPositions, noSymbolOverlap, minSiblingSpacing, minPartnerSpacing,
  generationRowAlignment, noCrossedDescentLines, subtreeNonCollision,
  manualOrderPreserved, twinContiguity, anchorStability,
  noNodeBetweenPartners, boundedPartnerDistance, chartWidth,
} from './invariants';
import type { Positions } from './invariants';
import type { LayoutDoc } from '../treeLayout';
import { DEFAULT_LAYOUT_SPACING } from '../treeLayout';
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
  it('does not flag a self-partnered union (partner1Id === partner2Id)', () => {
    // Degenerate union: same individual is both partners. Gap is 0 — must be skipped.
    const d = doc({
      individuals: { a: ind('a', 0, 0), k: ind('k', 0, 1) },
      partnerships: { u: union('u', 'a', 'a', ['k']) },
      parentChildLinks: { lk: link('lk', 'u', 'k') },
    });
    expect(minPartnerSpacing({ a: { x: 0, y: 0 }, k: { x: 0, y: 150 } }, d).ok).toBe(true);
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
  it('passes when cousins are in the same left-to-right order as their parents', () => {
    const d = doc({
      individuals: {
        p1: ind('p1', 0, 1), p2: ind('p2', 200, 1),
        c1: ind('c1', 20, 2), c2: ind('c2', 180, 2),
      },
      partnerships: { u1: union('u1', 'p1', undefined, ['c1']), u2: union('u2', 'p2', undefined, ['c2']) },
      parentChildLinks: { a: link('a', 'u1', 'c1'), b: link('b', 'u2', 'c2') },
    });
    const pos = { p1: { x: 0, y: 150 }, p2: { x: 200, y: 150 }, c1: { x: 20, y: 300 }, c2: { x: 180, y: 300 } };
    expect(noCrossedDescentLines(pos, d).ok).toBe(true);
  });
  it('does not flag a shallow union and a deep union whose old cross-generation x-extents would have overlapped', () => {
    // top union: parents at gen 0, children pa/pb at y=150 (gen 1).
    // cousinUnion: parents at gen 2 (y=300), child gc at y=450 (gen 3).
    // Positioned so that, if compared cross-generation, the old matcher would flag them
    // (top anchor x=0 < cousinUnion anchor x=100, but pa.x=150 >= gc.x=100).
    // They are different generations and must NOT be flagged.
    const d = doc({
      individuals: {
        gp1: ind('gp1', 0, 0), gp2: ind('gp2', 0, 0),
        pa: ind('pa', 0, 1), pb: ind('pb', 150, 1),
        cp1: ind('cp1', 80, 2), cp2: ind('cp2', 120, 2),
        gc: ind('gc', 100, 3),
      },
      partnerships: {
        top: union('top', 'gp1', 'gp2', ['pa', 'pb']),
        cousinUnion: union('cousinUnion', 'cp1', 'cp2', ['gc']),
      },
      parentChildLinks: {
        la: link('la', 'top', 'pa'),
        lb: link('lb', 'top', 'pb'),
        lc: link('lc', 'cousinUnion', 'gc'),
      },
    });
    const pos = {
      gp1: { x: 0, y: 0 }, gp2: { x: 0, y: 0 },
      pa: { x: 0, y: 150 }, pb: { x: 150, y: 150 },
      cp1: { x: 80, y: 300 }, cp2: { x: 120, y: 300 },
      gc: { x: 100, y: 450 },
    };
    expect(noCrossedDescentLines(pos, d).ok).toBe(true);
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
  it('passes when output sibling order agrees with input x order', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), a: ind('a', 0, 1), b: ind('b', 80, 1) },
      partnerships: { u: union('u', 'p', undefined, ['a', 'b']) },
      parentChildLinks: { la: link('la', 'u', 'a'), lb: link('lb', 'u', 'b') },
    });
    // input: a(0) < b(80); output keeps that order (a left of b).
    expect(manualOrderPreserved(d, { p: { x: 0, y: 0 }, a: { x: -40, y: 150 }, b: { x: 40, y: 150 } }).ok).toBe(true);
  });
});

describe('twinContiguity', () => {
  it('flags a non-twin sibling ordered between two twins', () => {
    const d = doc({
      individuals: { p: ind('p', 0, 0), t1: ind('t1', 0, 1), s: ind('s', 80, 1), t2: ind('t2', 160, 1) },
      partnerships: { u: union('u', 'p', undefined, ['t1', 's', 't2']) },
      parentChildLinks: { l1: link('l1', 'u', 't1'), l2: link('l2', 'u', 's'), l3: link('l3', 'u', 't2') },
    });
    // NOTE: TwinGroup uses `twinType` and `individualIds` (not `type`/`memberIds`); also requires `parentPartnershipId`.
    const tg: Record<string, TwinGroup> = { g: { id: 'g', twinType: TwinType.Monozygotic, individualIds: ['t1', 't2'], parentPartnershipId: 'u' } };
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

describe('noNodeBetweenPartners', () => {
  it('flags a non-partner sibling sitting strictly between a couple’s two partners', () => {
    // Couple (blood, spouse); blood’s sibling `sib` is wedged between them on the row.
    // Mirrors the reported ae00-between-7a64/c912 bug.
    const d = doc({
      individuals: {
        blood: ind('blood', 0, 1), sib: ind('sib', 200, 1), spouse: ind('spouse', 400, 1),
      },
      partnerships: { u: union('u', 'blood', 'spouse', []) },
    });
    const pos = { blood: { x: 0, y: 150 }, sib: { x: 200, y: 150 }, spouse: { x: 400, y: 150 } };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(false);
  });

  it('passes when the couple’s partners are adjacent with nothing between them', () => {
    const d = doc({
      individuals: {
        blood: ind('blood', 0, 1), spouse: ind('spouse', 120, 1), sib: ind('sib', 260, 1),
      },
      partnerships: { u: union('u', 'blood', 'spouse', []) },
    });
    const pos = { blood: { x: 0, y: 150 }, spouse: { x: 120, y: 150 }, sib: { x: 260, y: 150 } };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(true);
  });

  it('permits a multi-union hub sitting between its own two spouses', () => {
    // hub married to s1 (left) and s2 (right); hub straddled. Each union’s own
    // partners are adjacent, so neither union is violated.
    const d = doc({
      individuals: { s1: ind('s1', 0, 1), hub: ind('hub', 120, 1), s2: ind('s2', 240, 1) },
      partnerships: { u1: union('u1', 's1', 'hub', []), u2: union('u2', 'hub', 's2', []) },
    });
    const pos = { s1: { x: 0, y: 150 }, hub: { x: 120, y: 150 }, s2: { x: 240, y: 150 } };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(true);
  });

  it('ignores a node on a different generation row', () => {
    // `other` is between the partners in x, but on a different row — not a violation.
    const d = doc({
      individuals: {
        blood: ind('blood', 0, 1), spouse: ind('spouse', 400, 1), other: ind('other', 200, 0),
      },
      partnerships: { u: union('u', 'blood', 'spouse', []) },
    });
    const pos = { blood: { x: 0, y: 150 }, spouse: { x: 400, y: 150 }, other: { x: 200, y: 0 } };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(true);
  });

  it('permits a co-spouse between a 3-union hub and its non-adjacent spouse (structurally unavoidable)', () => {
    // hub married to s1, s2, s3 (degree 3). Laid out s1, hub, s2, s3 — the union
    // hub × s3 unavoidably has s2 (another of hub's own spouses) between them,
    // because a point can be adjacent to at most two neighbours in a line.
    const d = doc({
      individuals: {
        s1: ind('s1', 0, 1), hub: ind('hub', 120, 1),
        s2: ind('s2', 240, 1), s3: ind('s3', 360, 1),
      },
      partnerships: {
        u1: union('u1', 's1', 'hub', []),
        u2: union('u2', 'hub', 's2', []),
        u3: union('u3', 'hub', 's3', []),
      },
    });
    const pos = {
      s1: { x: 0, y: 150 }, hub: { x: 120, y: 150 },
      s2: { x: 240, y: 150 }, s3: { x: 360, y: 150 },
    };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(true);
  });

  it('still flags a co-spouse between a 2-union hub’s partners (a fixable bad order)', () => {
    // hub married to only s1 and s2 (degree 2). Order s1, s2, hub wedges s2
    // between s1 and hub even though the clean straddle s1, hub, s2 exists — so
    // the carve-out does NOT apply and this remains a violation.
    const d = doc({
      individuals: { s1: ind('s1', 0, 1), s2: ind('s2', 120, 1), hub: ind('hub', 240, 1) },
      partnerships: { u1: union('u1', 's1', 'hub', []), u2: union('u2', 'hub', 's2', []) },
    });
    const pos = { s1: { x: 0, y: 150 }, s2: { x: 120, y: 150 }, hub: { x: 240, y: 150 } };
    expect(noNodeBetweenPartners(pos, d).ok).toBe(false);
  });

  it('still flags a foreign sibling between a 3-union hub’s partners', () => {
    // A hub (degree 3) does NOT license a *non-partner* between its partners:
    // `sib` is a plain sibling, not one of hub's spouses, so it is still flagged.
    const d = doc({
      individuals: {
        s1: ind('s1', 0, 1), hub: ind('hub', 120, 1), sib: ind('sib', 200, 1),
        s2: ind('s2', 280, 1), s3: ind('s3', 400, 1),
      },
      partnerships: {
        u1: union('u1', 's1', 'hub', []),
        u2: union('u2', 'hub', 's2', []),
        u3: union('u3', 'hub', 's3', []),
      },
    });
    const pos = {
      s1: { x: 0, y: 150 }, hub: { x: 120, y: 150 }, sib: { x: 200, y: 150 },
      s2: { x: 280, y: 150 }, s3: { x: 400, y: 150 },
    };
    // sib sits between hub and s2 (and hub and s3) but is not a co-spouse.
    expect(noNodeBetweenPartners(pos, d).ok).toBe(false);
  });
});

/** Build a cross-branch couple: x (child of fam1) × y (child of fam2), both
 *  load-bearing. `gap` sets the horizontal distance between the partners. */
function crossBranchCoupleDoc(gap: number): { d: LayoutDoc; pos: Positions } {
  const d = doc({
    individuals: {
      pa1: ind('pa1', -60, 0), pa2: ind('pa2', gap + 60, 0),
      x: ind('x', 0, 1), y: ind('y', gap, 1),
    },
    partnerships: {
      fam1: union('fam1', 'pa1', undefined, ['x']),
      fam2: union('fam2', 'pa2', undefined, ['y']),
      couple: union('couple', 'x', 'y', []),
    },
    parentChildLinks: { l1: link('l1', 'fam1', 'x'), l2: link('l2', 'fam2', 'y') },
  });
  const pos: Positions = {
    pa1: { x: -60, y: 0 }, pa2: { x: gap + 60, y: 0 },
    x: { x: 0, y: 150 }, y: { x: gap, y: 150 },
  };
  return { d, pos };
}

describe('boundedPartnerDistance', () => {
  it('flags a cross-branch couple (both load-bearing) further than maxFactor × PARTNER_SPACING', () => {
    const { d, pos } = crossBranchCoupleDoc(1415); // the smoking-gun distance
    expect(boundedPartnerDistance(pos, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(false);
  });

  it('passes a cross-branch couple within maxFactor × PARTNER_SPACING', () => {
    const { d, pos } = crossBranchCoupleDoc(120); // exactly PARTNER_SPACING
    expect(boundedPartnerDistance(pos, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(true);
  });

  it('ignores an ordinary couple where neither partner is load-bearing, however far apart', () => {
    // Two founders married, seeded 1000 apart. Not cross-branch → not this
    // invariant’s concern (minPartnerSpacing governs ordinary couples).
    const d = doc({
      individuals: { a: ind('a', 0, 0), b: ind('b', 1000, 0) },
      partnerships: { u: union('u', 'a', 'b', []) },
    });
    const pos = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } };
    expect(boundedPartnerDistance(pos, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(true);
  });
});

describe('chartWidth', () => {
  it('flags a generation row whose span exceeds maxFactor × (n − 1) × minSpacing', () => {
    // 3 nodes spanning 1600 px; bound = 2 × 2 × 80 = 320.
    const d = doc({ individuals: { a: ind('a', 0, 0), b: ind('b', 800, 0), c: ind('c', 1600, 0) } });
    const pos = { a: { x: 0, y: 0 }, b: { x: 800, y: 0 }, c: { x: 1600, y: 0 } };
    expect(chartWidth(pos, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(false);
  });

  it('passes a tightly-packed generation row', () => {
    // 3 nodes spanning 160 px; bound = 320.
    const d = doc({ individuals: { a: ind('a', 0, 0), b: ind('b', 80, 0), c: ind('c', 160, 0) } });
    const pos = { a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, c: { x: 160, y: 0 } };
    expect(chartWidth(pos, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(true);
  });

  it('passes a single-node row (bound and span both zero)', () => {
    const d = doc({ individuals: { a: ind('a', 0, 0) } });
    expect(chartWidth({ a: { x: 0, y: 0 } }, d, DEFAULT_LAYOUT_SPACING, 2).ok).toBe(true);
  });
});
