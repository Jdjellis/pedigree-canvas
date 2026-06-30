import { describe, it, expect } from 'vitest';
import { twinGroupsTouching, pickSurvivingTwinGroup } from './twinGrouping';
import { TwinType } from '../types/enums';
import type { TwinGroup } from '../types/pedigree';

function group(id: string, individualIds: string[], twinType = TwinType.Dizygotic): TwinGroup {
  return { id, twinType, individualIds, parentPartnershipId: 'u1' };
}

function record(groups: TwinGroup[]): Record<string, TwinGroup> {
  return Object.fromEntries(groups.map((g) => [g.id, g]));
}

describe('twinGroupsTouching', () => {
  it('returns only groups containing at least one selected id', () => {
    const groups = record([group('a', ['x', 'y']), group('b', ['z'])]);
    const touched = twinGroupsTouching(groups, ['y']);
    expect(touched.map((g) => g.id)).toEqual(['a']);
  });

  it('returns an empty array when no group is touched', () => {
    const groups = record([group('a', ['x'])]);
    expect(twinGroupsTouching(groups, ['nobody'])).toEqual([]);
  });
});

describe('pickSurvivingTwinGroup', () => {
  it('returns undefined for an empty list', () => {
    expect(pickSurvivingTwinGroup([])).toBeUndefined();
  });

  it('picks the group with the most members', () => {
    const survivor = pickSurvivingTwinGroup([group('small', ['a', 'b']), group('big', ['c', 'd', 'e'])]);
    expect(survivor?.id).toBe('big');
  });

  it('breaks an equal-size tie by lexicographically-smallest id', () => {
    const survivor = pickSurvivingTwinGroup([group('zeta', ['a', 'b']), group('alpha', ['c', 'd'])]);
    expect(survivor?.id).toBe('alpha');
  });

  it('does not mutate the input array order', () => {
    const input = [group('zeta', ['a', 'b']), group('alpha', ['c', 'd'])];
    pickSurvivingTwinGroup(input);
    expect(input.map((g) => g.id)).toEqual(['zeta', 'alpha']);
  });
});
