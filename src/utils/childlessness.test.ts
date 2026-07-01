import { describe, it, expect } from 'vitest';
import {
  individualChildlessAnchor,
  individualHasChildren,
  childlessMarksActive,
  CHILDLESS_LABEL_OFFSET,
} from './childlessness';
import { SYMBOL_SIZE, CHILDLESS_STUB } from './constants';
import { RelationshipType } from '../types/enums';
import type { Individual, PartnershipRelationship } from '../types/pedigree';

function person(id: string, x: number, y: number): Individual {
  return {
    id,
    genderIdentity: 'unknown' as Individual['genderIdentity'],
    vitalStatus: 'alive' as Individual['vitalStatus'],
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x, y },
    annotations: [],
  };
}

function union(
  id: string,
  partner1Id: string | undefined,
  partner2Id: string | undefined,
  childrenIds: string[],
): PartnershipRelationship {
  return { id, type: RelationshipType.Partnership, partner1Id, partner2Id, childrenIds };
}

describe('individualChildlessAnchor', () => {
  it('anchors at the bottom-centre of the symbol', () => {
    const anchor = individualChildlessAnchor(person('p', 100, 100));
    expect(anchor).toEqual({ x: 100, y: 100 + SYMBOL_SIZE / 2 });
  });
});

describe('individualHasChildren', () => {
  it('is true when the individual is a partner in a union with children', () => {
    const partnerships = { u1: union('u1', 'a', 'b', ['c']) };
    expect(individualHasChildren(partnerships, 'a')).toBe(true);
    expect(individualHasChildren(partnerships, 'b')).toBe(true);
  });

  it('is false when the individual has a childless union', () => {
    const partnerships = { u1: union('u1', 'a', 'b', []) };
    expect(individualHasChildren(partnerships, 'a')).toBe(false);
  });

  it('is false when the individual is not a partner in any union', () => {
    const partnerships = { u1: union('u1', 'a', 'b', ['c']) };
    expect(individualHasChildren(partnerships, 'z')).toBe(false);
  });
});

describe('childlessMarksActive', () => {
  it('is true when the status is set and the individual has no children', () => {
    const p = person('a', 0, 0);
    p.childlessStatus = 'infertility';
    expect(childlessMarksActive(p, {})).toBe(true);
  });

  it('is false when no status is set', () => {
    expect(childlessMarksActive(person('a', 0, 0), {})).toBe(false);
  });

  it('is false when the status is set but the individual has children (suppressed)', () => {
    const p = person('a', 0, 0);
    p.childlessStatus = 'noChildren';
    const partnerships = { u1: union('u1', 'a', 'b', ['c']) };
    expect(childlessMarksActive(p, partnerships)).toBe(false);
  });
});

describe('CHILDLESS_LABEL_OFFSET', () => {
  it('equals the stub length, so labels clear the cross-bars', () => {
    expect(CHILDLESS_LABEL_OFFSET).toBe(CHILDLESS_STUB);
  });
});
