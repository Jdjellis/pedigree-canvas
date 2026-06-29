import { describe, it, expect } from 'vitest';
import { commonSibshipId } from './sibship';
import { RelationshipType } from '../types/enums';
import type { ParentChildRelationship, PedigreeDocument } from '../types/pedigree';

function link(id: string, childId: string, parentPartnershipId: string): ParentChildRelationship {
  return { id, type: RelationshipType.ParentChild, parentPartnershipId, childId, isAdoptive: false };
}

function doc(links: ParentChildRelationship[]): Pick<PedigreeDocument, 'parentChildLinks'> {
  return { parentChildLinks: Object.fromEntries(links.map((l) => [l.id, l])) };
}

describe('commonSibshipId', () => {
  it('returns null for fewer than two ids', () => {
    const d = doc([link('l1', 'a', 'u1')]);
    expect(commonSibshipId(d, ['a'])).toBeNull();
    expect(commonSibshipId(d, [])).toBeNull();
  });

  it('returns the shared partnership for two siblings', () => {
    const d = doc([link('l1', 'a', 'u1'), link('l2', 'b', 'u1')]);
    expect(commonSibshipId(d, ['a', 'b'])).toBe('u1');
  });

  it('returns the shared partnership for three siblings (triplets)', () => {
    const d = doc([link('l1', 'a', 'u1'), link('l2', 'b', 'u1'), link('l3', 'c', 'u1')]);
    expect(commonSibshipId(d, ['a', 'b', 'c'])).toBe('u1');
  });

  it('returns null when ids are in different sibships', () => {
    const d = doc([link('l1', 'a', 'u1'), link('l2', 'b', 'u2')]);
    expect(commonSibshipId(d, ['a', 'b'])).toBeNull();
  });

  it('returns null when any id is a founder with no parent links', () => {
    const d = doc([link('l1', 'a', 'u1')]);
    expect(commonSibshipId(d, ['a', 'founder'])).toBeNull();
  });
});
