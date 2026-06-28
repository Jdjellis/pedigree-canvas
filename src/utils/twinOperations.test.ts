import { describe, it, expect } from 'vitest';
import {
  sharedParentPartnershipId,
  buildTwinGroup,
  findTwinGroupForIndividual,
} from './twinOperations';
import { createDefaultDocument, createDefaultIndividual } from '../stores/pedigreeStore';
import { RelationshipType, TwinType } from '../types/enums';
import type { PedigreeDocument } from '../types/pedigree';

/**
 * Build a document with one parent union ("u1") and three children (c1, c2, c3),
 * plus a fourth child (lone) of a different union ("u2").
 */
function makeDoc(): PedigreeDocument {
  const doc = createDefaultDocument();
  for (const id of ['c1', 'c2', 'c3', 'lone']) {
    doc.individuals[id] = createDefaultIndividual({ id });
  }
  doc.partnerships.u1 = {
    id: 'u1',
    type: RelationshipType.Partnership,
    childrenIds: ['c1', 'c2', 'c3'],
  };
  doc.partnerships.u2 = {
    id: 'u2',
    type: RelationshipType.Partnership,
    childrenIds: ['lone'],
  };
  let n = 0;
  for (const [child, union] of [
    ['c1', 'u1'],
    ['c2', 'u1'],
    ['c3', 'u1'],
    ['lone', 'u2'],
  ] as const) {
    doc.parentChildLinks[`l${n++}`] = {
      id: `l${n}`,
      type: RelationshipType.ParentChild,
      parentPartnershipId: union,
      childId: child,
      isAdopted: false,
    };
  }
  return doc;
}

describe('sharedParentPartnershipId', () => {
  it('returns the partnership id when all individuals are siblings', () => {
    expect(sharedParentPartnershipId(makeDoc(), ['c1', 'c2'])).toBe('u1');
    expect(sharedParentPartnershipId(makeDoc(), ['c1', 'c2', 'c3'])).toBe('u1');
  });

  it('returns null when individuals belong to different unions', () => {
    expect(sharedParentPartnershipId(makeDoc(), ['c1', 'lone'])).toBeNull();
  });

  it('returns null when any individual has no parent link', () => {
    const doc = makeDoc();
    doc.individuals.orphan = createDefaultIndividual({ id: 'orphan' });
    expect(sharedParentPartnershipId(doc, ['c1', 'orphan'])).toBeNull();
  });
});

describe('buildTwinGroup', () => {
  it('builds a group from two or more siblings with the given zygosity', () => {
    const group = buildTwinGroup(makeDoc(), ['c1', 'c2'], TwinType.Monozygotic);
    expect(group).not.toBeNull();
    expect(group!.twinType).toBe(TwinType.Monozygotic);
    expect(group!.parentPartnershipId).toBe('u1');
    expect(group!.individualIds).toEqual(['c1', 'c2']);
    expect(group!.id).toBeTruthy();
  });

  it('deduplicates repeated ids before counting', () => {
    expect(buildTwinGroup(makeDoc(), ['c1', 'c1'], TwinType.Unknown)).toBeNull();
  });

  it('returns null for fewer than two distinct individuals', () => {
    expect(buildTwinGroup(makeDoc(), ['c1'], TwinType.Dizygotic)).toBeNull();
  });

  it('returns null when individuals are not siblings', () => {
    expect(buildTwinGroup(makeDoc(), ['c1', 'lone'], TwinType.Dizygotic)).toBeNull();
  });

  it('returns null when an individual is missing from the document', () => {
    expect(buildTwinGroup(makeDoc(), ['c1', 'ghost'], TwinType.Dizygotic)).toBeNull();
  });
});

describe('findTwinGroupForIndividual', () => {
  it('finds the group containing the individual', () => {
    const doc = makeDoc();
    const group = buildTwinGroup(doc, ['c1', 'c2'], TwinType.Dizygotic)!;
    doc.twinGroups[group.id] = group;
    expect(findTwinGroupForIndividual(doc, 'c2')?.id).toBe(group.id);
  });

  it('returns undefined when the individual is in no group', () => {
    expect(findTwinGroupForIndividual(makeDoc(), 'c3')).toBeUndefined();
  });
});
