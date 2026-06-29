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
