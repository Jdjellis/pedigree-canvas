import { describe, it, expect } from 'vitest';
import { createConditionEntry } from './legendOptions';

describe('createConditionEntry', () => {
  it('createConditionEntry_builds_a_legend_entry_with_the_given_fields', () => {
    const entry = createConditionEntry(
      'cond-1',
      'Breast cancer',
      '#dc2626',
      'topLeft',
      'diagonalLines',
    );
    expect(entry).toEqual({
      id: 'cond-1',
      name: 'Breast cancer',
      fillColor: '#dc2626',
      quarter: 'topLeft',
      fillPattern: 'diagonalLines',
    });
  });

  it('createConditionEntry_trims_surrounding_whitespace_from_the_name', () => {
    const entry = createConditionEntry(
      'cond-2',
      '  Diabetes  ',
      '#2563eb',
      'topRight',
      'solid',
    );
    expect(entry.name).toBe('Diabetes');
  });

  it('createConditionEntry_does_not_set_applicableTo', () => {
    const entry = createConditionEntry(
      'cond-3',
      'Anything',
      '#16a34a',
      'bottomLeft',
      'dots',
    );
    expect(entry.applicableTo).toBeUndefined();
  });
});
