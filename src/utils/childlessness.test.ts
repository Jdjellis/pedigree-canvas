import { describe, it, expect } from 'vitest';
import {
  individualChildlessAnchor,
  individualHasChildren,
  childlessMarksActive,
  childlessStatusChange,
  CHILDLESS_LABEL_OFFSET,
  type ChildlessCauseState,
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

describe('childlessStatusChange', () => {
  it('sets the status with no cause when starting from a clean slate', () => {
    expect(childlessStatusChange({}, 'noChildren')).toEqual({
      childlessStatus: 'noChildren',
      childlessReason: undefined,
      childlessReasonByStatus: undefined,
    });
  });

  it('parks the outgoing cause when switching between statuses, leaving the new one blank', () => {
    const patch = childlessStatusChange(
      { childlessStatus: 'noChildren', childlessReason: 'vasectomy' },
      'infertility',
    );
    expect(patch.childlessStatus).toBe('infertility');
    expect(patch.childlessReason).toBeUndefined();
    expect(patch.childlessReasonByStatus).toEqual({ noChildren: 'vasectomy' });
  });

  it('restores the parked cause when switching back to a status', () => {
    // On infertility with azoospermia; no-children's "vasectomy" was parked earlier.
    const patch = childlessStatusChange(
      {
        childlessStatus: 'infertility',
        childlessReason: 'azoospermia',
        childlessReasonByStatus: { noChildren: 'vasectomy' },
      },
      'noChildren',
    );
    expect(patch.childlessStatus).toBe('noChildren');
    expect(patch.childlessReason).toBe('vasectomy');
    // The now-active cause is no longer parked; infertility's is retained.
    expect(patch.childlessReasonByStatus).toEqual({ infertility: 'azoospermia' });
  });

  it('clears the active status and cause on none but keeps parked causes', () => {
    const patch = childlessStatusChange(
      {
        childlessStatus: 'infertility',
        childlessReason: 'azoospermia',
        childlessReasonByStatus: { noChildren: 'vasectomy' },
      },
      'none',
    );
    expect(patch.childlessStatus).toBeUndefined();
    expect(patch.childlessReason).toBeUndefined();
    expect(patch.childlessReasonByStatus).toEqual({
      noChildren: 'vasectomy',
      infertility: 'azoospermia',
    });
  });

  it('drops a status from the park when its cause was cleared before switching away', () => {
    const patch = childlessStatusChange(
      {
        childlessStatus: 'noChildren',
        childlessReason: undefined,
        childlessReasonByStatus: { infertility: 'azoospermia' },
      },
      'infertility',
    );
    expect(patch.childlessStatus).toBe('infertility');
    expect(patch.childlessReason).toBe('azoospermia');
    // noChildren had no cause to park, infertility's was restored → nothing parked.
    expect(patch.childlessReasonByStatus).toBeUndefined();
  });

  it('survives a full round-trip: no-children → infertility → no-children keeps both causes', () => {
    // Start: no children, cause vasectomy.
    let state: ChildlessCauseState = {
      childlessStatus: 'noChildren',
      childlessReason: 'vasectomy',
    };
    // Switch to infertility, then the user types azoospermia.
    let patch = childlessStatusChange(state, 'infertility');
    state = { ...state, ...patch, childlessReason: 'azoospermia' };
    // Switch back to no children.
    patch = childlessStatusChange(state, 'noChildren');
    expect(patch.childlessStatus).toBe('noChildren');
    expect(patch.childlessReason).toBe('vasectomy');
    expect(patch.childlessReasonByStatus).toEqual({ infertility: 'azoospermia' });
  });
});

describe('CHILDLESS_LABEL_OFFSET', () => {
  it('equals the stub length, so labels clear the cross-bars', () => {
    expect(CHILDLESS_LABEL_OFFSET).toBe(CHILDLESS_STUB);
  });
});
