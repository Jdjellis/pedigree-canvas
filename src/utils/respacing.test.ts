import { describe, it, expect } from 'vitest';
import {
  respaceRow,
  respaceGeneration,
  respaceGenerationWithSubtrees,
  collectDescendants,
  centerParentsOverChildren,
  computeParentClearanceShift,
  makeRoomForPartner,
} from './respacing';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../types/pedigree';
import { RelationshipType } from '../types/enums';
import { createDefaultIndividual } from '../stores/pedigreeStore';

function ind(
  id: string,
  x: number,
  generation: number | undefined = 0,
): Individual {
  return createDefaultIndividual({ id, generation, position: { x, y: 0 } });
}

function partnership(
  id: string,
  partner1Id: string,
  partner2Id: string,
  childrenIds: string[] = [],
): PartnershipRelationship {
  return {
    id,
    type: RelationshipType.Partnership,
    partner1Id,
    partner2Id,
    childrenIds,
  };
}

function parentChildLink(
  id: string,
  parentPartnershipId: string,
  childId: string,
): ParentChildRelationship {
  return {
    id,
    type: RelationshipType.ParentChild,
    parentPartnershipId,
    childId,
    isAdopted: false,
  };
}

describe('respaceRow', () => {
  it('returns an empty array unchanged for empty input', () => {
    expect(respaceRow([], 80)).toEqual([]);
  });

  it('returns a single node unchanged', () => {
    expect(respaceRow([{ id: 'a', x: 42 }], 80)).toEqual([{ id: 'a', x: 42 }]);
  });

  it('leaves nodes that are already at least minSpacing apart untouched', () => {
    const result = respaceRow(
      [
        { id: 'a', x: 0 },
        { id: 'b', x: 100 },
      ],
      80,
    );
    expect(result).toEqual([
      { id: 'a', x: 0 },
      { id: 'b', x: 100 },
    ]);
  });

  it('pushes the right neighbour by exactly the deficit on a single overlap', () => {
    // a at 0, b at 50: deficit is 80 - 50 = 30, so b moves to 80.
    const result = respaceRow(
      [
        { id: 'a', x: 0 },
        { id: 'b', x: 50 },
      ],
      80,
    );
    expect(result).toEqual([
      { id: 'a', x: 0 },
      { id: 'b', x: 80 },
    ]);
  });

  it('cascades a chain of overlaps left to right', () => {
    // All clustered at 0,10,20 with minSpacing 80 -> 0,80,160.
    const result = respaceRow(
      [
        { id: 'a', x: 0 },
        { id: 'b', x: 10 },
        { id: 'c', x: 20 },
      ],
      80,
    );
    expect(result).toEqual([
      { id: 'a', x: 0 },
      { id: 'b', x: 80 },
      { id: 'c', x: 160 },
    ]);
  });

  it('sorts unsorted input by x and preserves left-to-right order in the result', () => {
    const result = respaceRow(
      [
        { id: 'c', x: 20 },
        { id: 'a', x: 0 },
        { id: 'b', x: 10 },
      ],
      80,
    );
    // Output is ordered by ascending (resolved) x.
    expect(result).toEqual([
      { id: 'a', x: 0 },
      { id: 'b', x: 80 },
      { id: 'c', x: 160 },
    ]);
  });

  it('does not disturb partners at PARTNER_SPACING (120) when minSpacing is smaller (80)', () => {
    const result = respaceRow(
      [
        { id: 'p1', x: 0 },
        { id: 'p2', x: 120 },
      ],
      80,
    );
    expect(result).toEqual([
      { id: 'p1', x: 0 },
      { id: 'p2', x: 120 },
    ]);
  });

  it('only pushes the overlapping node, leaving an already-spaced trailing node alone', () => {
    // a at 0, b at 50 (overlap -> 80), c at 200 (already clear of 80).
    const result = respaceRow(
      [
        { id: 'a', x: 0 },
        { id: 'b', x: 50 },
        { id: 'c', x: 200 },
      ],
      80,
    );
    expect(result).toEqual([
      { id: 'a', x: 0 },
      { id: 'b', x: 80 },
      { id: 'c', x: 200 },
    ]);
  });
});

describe('respaceGeneration', () => {
  function makeIndividual(
    id: string,
    x: number,
    generation: number | undefined,
  ): Individual {
    return createDefaultIndividual({
      id,
      generation,
      position: { x, y: 0 },
    });
  }

  it('returns an empty map when no node in the generation overlaps', () => {
    const individuals: Record<string, Individual> = {
      a: makeIndividual('a', 0, 1),
      b: makeIndividual('b', 100, 1),
    };
    expect(respaceGeneration(individuals, 1, 80)).toEqual({});
  });

  it('returns id->newX only for nodes whose x actually changed', () => {
    const individuals: Record<string, Individual> = {
      a: makeIndividual('a', 0, 1),
      b: makeIndividual('b', 50, 1),
      c: makeIndividual('c', 200, 1),
    };
    const moved = respaceGeneration(individuals, 1, 80);
    // Only b overlaps and is pushed to 80; a and c are unchanged.
    expect(moved).toEqual({ b: 80 });
  });

  it('ignores individuals in other generations', () => {
    const individuals: Record<string, Individual> = {
      a: makeIndividual('a', 0, 1),
      b: makeIndividual('b', 10, 1),
      // Same x cluster but a different generation: must not be considered.
      other: makeIndividual('other', 5, 2),
    };
    const moved = respaceGeneration(individuals, 1, 80);
    expect(moved).toEqual({ b: 80 });
  });

  it('ignores individuals with an undefined generation', () => {
    const individuals: Record<string, Individual> = {
      a: makeIndividual('a', 0, 1),
      b: makeIndividual('b', 10, 1),
      loose: makeIndividual('loose', 5, undefined),
    };
    const moved = respaceGeneration(individuals, 1, 80);
    expect(moved).toEqual({ b: 80 });
  });
});

describe('collectDescendants', () => {
  it('returns an empty set for a node with no children', () => {
    const partnerships = { p: partnership('p', 'a', 'b') };
    expect(collectDescendants('a', partnerships)).toEqual(new Set());
  });

  it('collects children, grandchildren, but not the root or in-laws', () => {
    const partnerships = {
      // a + b -> child c
      p1: partnership('p1', 'a', 'b', ['c']),
      // c + spouse s -> grandchild g
      p2: partnership('p2', 'c', 's', ['g']),
    };
    const descendants = collectDescendants('a', partnerships);
    // c and g flow down from a; the spouse `s` married in and is excluded.
    expect(descendants).toEqual(new Set(['c', 'g']));
  });
});

describe('respaceGenerationWithSubtrees', () => {
  it('carries a pushed node\'s subtree along by the same delta', () => {
    const individuals: Record<string, Individual> = {
      a: ind('a', 0, 0),
      b: ind('b', 10, 0), // overlaps a -> pushed to 80 (delta 70)
      // b's child sits below b and must travel the same 70 units.
      bChild: ind('bChild', 10, 1),
    };
    const partnerships = { p: partnership('p', 'b', 'spouse', ['bChild']) };
    const moved = respaceGenerationWithSubtrees(individuals, partnerships, 0, 80);
    expect(moved.b).toBe(80);
    expect(moved.bChild).toBe(80); // 10 + 70
    // a never moved, so it is absent from the result.
    expect(moved.a).toBeUndefined();
  });
});

describe('makeRoomForPartner', () => {
  it('sweeps a singleton sibling clear of the new partner', () => {
    const individuals: Record<string, Individual> = {
      target: ind('target', 0, 0),
      partner: ind('partner', 120, 0),
      sibling: ind('sibling', 80, 0), // between target and partner
    };
    const moved = makeRoomForPartner(individuals, {}, 'target', 'partner', 80);
    // Sibling clears the partner (120) by 80 -> 200; target/partner stay put.
    expect(moved).toEqual({ sibling: 200 });
  });

  it('moves a partnered sibling as a rigid union, preserving its gap', () => {
    const individuals: Record<string, Individual> = {
      target: ind('target', 0, 0),
      partner: ind('partner', 120, 0),
      sibling: ind('sibling', 80, 0),
      sibSpouse: ind('sibSpouse', 200, 0),
      sibChild: ind('sibChild', 140, 1),
    };
    const partnerships = {
      sib: partnership('sib', 'sibling', 'sibSpouse', ['sibChild']),
    };
    const moved = makeRoomForPartner(
      individuals,
      partnerships,
      'target',
      'partner',
      80,
    );
    // The sibling block {80,200} clears the target block's right edge (120) by
    // 80, so it slides right by 120 as a unit, child carried along.
    expect(moved).toEqual({
      sibling: 200,
      sibSpouse: 320,
      sibChild: 260,
    });
  });

  it('leaves a sibling that already clears the partner untouched', () => {
    const individuals: Record<string, Individual> = {
      target: ind('target', 0, 0),
      partner: ind('partner', 120, 0),
      sibling: ind('sibling', 400, 0),
    };
    const moved = makeRoomForPartner(individuals, {}, 'target', 'partner', 80);
    expect(moved).toEqual({});
  });
});

describe('centerParentsOverChildren', () => {
  it('shifts a couple so their midpoint sits over the sibling row', () => {
    const individuals: Record<string, Individual> = {
      // Parents centred over x=0 ...
      p1: ind('p1', -60, -1),
      p2: ind('p2', 60, -1),
      // ... but the children now span 0..160 (centre 80).
      c1: ind('c1', 0, 0),
      c2: ind('c2', 80, 0),
      c3: ind('c3', 160, 0),
    };
    const moved = centerParentsOverChildren(
      individuals,
      partnership('p', 'p1', 'p2', ['c1', 'c2', 'c3']),
    );
    // Couple slides right by 80, preserving its 120-unit gap.
    expect(moved).toEqual({ p1: 20, p2: 140 });
  });

  it('returns empty when the couple is already centred', () => {
    const individuals: Record<string, Individual> = {
      p1: ind('p1', -60, -1),
      p2: ind('p2', 60, -1),
      c1: ind('c1', 0, 0),
    };
    const moved = centerParentsOverChildren(
      individuals,
      partnership('p', 'p1', 'p2', ['c1']),
    );
    expect(moved).toEqual({});
  });
});

describe('computeParentClearanceShift', () => {
  it('returns 0 when the child has no partner', () => {
    const individuals: Record<string, Individual> = {
      np1: ind('np1', -60, -1),
      np2: ind('np2', 60, -1),
      child: ind('child', 0, 0),
    };
    const shift = computeParentClearanceShift(
      individuals,
      {},
      {},
      'np1',
      'np2',
      'child',
      80,
    );
    expect(shift).toBe(0);
  });

  it('slides a left child\'s parents left to clear the spouse\'s parents', () => {
    // Union: child (left, x=0) + spouse (right, x=120).
    // Spouse already has parents centred over 120: at 60 and 180.
    // New parents for the child are centred over 0: at -60 and 60. The new
    // right parent (60) collides with the spouse's left parent (60).
    const individuals: Record<string, Individual> = {
      child: ind('child', 0, 0),
      spouse: ind('spouse', 120, 0),
      sp1: ind('sp1', 60, -1),
      sp2: ind('sp2', 180, -1),
      np1: ind('np1', -60, -1),
      np2: ind('np2', 60, -1),
    };
    const partnerships = {
      union: partnership('union', 'child', 'spouse'),
      spParents: partnership('spParents', 'sp1', 'sp2', ['spouse']),
    };
    const links = { l: parentChildLink('l', 'spParents', 'spouse') };
    const shift = computeParentClearanceShift(
      individuals,
      partnerships,
      links,
      'np1',
      'np2',
      'child',
      80,
    );
    // New pair's right edge (60) must reach 60-80 = -20, so shift = -80.
    expect(shift).toBe(-80);
  });

  it('returns 0 when the new parents already clear the in-laws', () => {
    const individuals: Record<string, Individual> = {
      child: ind('child', 0, 0),
      spouse: ind('spouse', 400, 0),
      sp1: ind('sp1', 340, -1),
      sp2: ind('sp2', 460, -1),
      np1: ind('np1', -60, -1),
      np2: ind('np2', 60, -1),
    };
    const partnerships = {
      union: partnership('union', 'child', 'spouse'),
      spParents: partnership('spParents', 'sp1', 'sp2', ['spouse']),
    };
    const links = { l: parentChildLink('l', 'spParents', 'spouse') };
    const shift = computeParentClearanceShift(
      individuals,
      partnerships,
      links,
      'np1',
      'np2',
      'child',
      80,
    );
    expect(shift).toBe(0);
  });
});
