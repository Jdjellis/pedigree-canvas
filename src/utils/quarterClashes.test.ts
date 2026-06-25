import { describe, it, expect } from 'vitest';
import {
  detectQuarterClashes,
  freeQuartersFor,
  ALL_QUARTERS,
} from './quarterClashes';
import type { LegendEntry } from '../types/pedigree';

/**
 * Build a minimal legend entry. Only the fields read by the clash helpers
 * (`id` and `quarter`) need to be meaningful for these tests.
 */
function makeEntry(id: string, quarter: LegendEntry['quarter']): LegendEntry {
  return {
    id,
    quarter,
    fillColor: '#1a1a1a',
    fillPattern: 'solid',
    name: id,
  };
}

describe('detectQuarterClashes', () => {
  it('detectQuarterClashes_returns_empty_when_no_conditions_applied', () => {
    const entries = [makeEntry('a', 'topRight'), makeEntry('b', 'topLeft')];
    expect(detectQuarterClashes([], entries)).toEqual([]);
  });

  it('detectQuarterClashes_returns_empty_when_applied_conditions_use_distinct_quarters', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topLeft'),
      makeEntry('c', 'bottomLeft'),
    ];
    expect(detectQuarterClashes(['a', 'b', 'c'], entries)).toEqual([]);
  });

  it('detectQuarterClashes_returns_quarter_when_two_applied_conditions_share_it', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topRight'),
    ];
    const clashes = detectQuarterClashes(['a', 'b'], entries);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].quarter).toBe('topRight');
    expect(clashes[0].entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('detectQuarterClashes_ignores_conditions_that_are_not_applied', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topRight'),
    ];
    // Only 'a' is applied, so the shared quarter is not a clash for this individual.
    expect(detectQuarterClashes(['a'], entries)).toEqual([]);
  });

  it('detectQuarterClashes_groups_three_conditions_sharing_one_quarter', () => {
    const entries = [
      makeEntry('a', 'bottomRight'),
      makeEntry('b', 'bottomRight'),
      makeEntry('c', 'bottomRight'),
    ];
    const clashes = detectQuarterClashes(['a', 'b', 'c'], entries);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('detectQuarterClashes_reports_multiple_independent_clashes', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topRight'),
      makeEntry('c', 'bottomLeft'),
      makeEntry('d', 'bottomLeft'),
    ];
    const clashes = detectQuarterClashes(['a', 'b', 'c', 'd'], entries);
    expect(clashes.map((c) => c.quarter).sort()).toEqual([
      'bottomLeft',
      'topRight',
    ]);
  });

  it('detectQuarterClashes_ignores_condition_ids_with_no_matching_entry', () => {
    const entries = [makeEntry('a', 'topRight')];
    expect(detectQuarterClashes(['a', 'ghost'], entries)).toEqual([]);
  });
});

describe('freeQuartersFor', () => {
  it('freeQuartersFor_returns_quarters_not_occupied_by_other_applied_conditions', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topRight'),
    ];
    // Moving 'a' away: topLeft, bottomLeft, bottomRight are free because 'b'
    // still occupies topRight. topRight is excluded (still in use by 'b').
    const free = freeQuartersFor('a', ['a', 'b'], entries);
    expect(free.sort()).toEqual(['bottomLeft', 'bottomRight', 'topLeft']);
  });

  it('freeQuartersFor_excludes_quarters_used_by_any_other_applied_condition', () => {
    const entries = [
      makeEntry('a', 'topRight'),
      makeEntry('b', 'topRight'),
      makeEntry('c', 'topLeft'),
    ];
    const free = freeQuartersFor('a', ['a', 'b', 'c'], entries);
    expect(free.sort()).toEqual(['bottomLeft', 'bottomRight']);
  });

  it('freeQuartersFor_returns_all_quarters_when_no_other_conditions_applied', () => {
    // The entry being moved does not block itself, so its current quarter is
    // also offered as a (no-op) target.
    const entries = [makeEntry('a', 'topRight')];
    const free = freeQuartersFor('a', ['a'], entries);
    expect(free.sort()).toEqual([...ALL_QUARTERS].sort());
  });
});
