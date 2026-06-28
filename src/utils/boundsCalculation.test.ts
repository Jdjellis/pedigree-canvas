import { describe, it, expect } from 'vitest';
import {
  toRomanNumeral,
  computeGenerationNumerals,
  computeContentExtent,
} from './boundsCalculation';
import type { Individual, TextAnnotation } from '../types/pedigree';
import { GenderIdentity, VitalStatus } from '../types/enums';
import { SYMBOL_SIZE } from './constants';

/**
 * Build a minimal individual at a given generation and y position. Only the
 * fields read by `computeGenerationNumerals` need to be meaningful.
 */
function makeIndividual(
  id: string,
  generation: number,
  y: number,
): Individual {
  return {
    id,
    genderIdentity: GenderIdentity.Unknown,
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 0, y },
    generation,
    annotations: [],
  };
}

describe('toRomanNumeral', () => {
  it('maps the 0-indexed top generation to I', () => {
    expect(toRomanNumeral(0)).toBe('I');
  });

  it('maps subsequent generations to II, III', () => {
    expect(toRomanNumeral(1)).toBe('II');
    expect(toRomanNumeral(2)).toBe('III');
  });
});

describe('computeGenerationNumerals', () => {
  it('ranks the minimum (topmost) generation as I regardless of negative values', () => {
    // Generations {-1, 0, 1} top-to-bottom should read I, II, III.
    const individuals: Individual[] = [
      makeIndividual('grandparent', -1, 50),
      makeIndividual('parent', 0, 150),
      makeIndividual('child', 1, 250),
    ];

    const result = computeGenerationNumerals(individuals);

    expect(result).toEqual([
      { generation: -1, roman: 'I', y: 50 },
      { generation: 0, roman: 'II', y: 150 },
      { generation: 1, roman: 'III', y: 250 },
    ]);
  });

  it('is min-relative, not absolute, when the top generation is greater than zero', () => {
    // Generations {2, 3} should still read I, II.
    const individuals: Individual[] = [
      makeIndividual('a', 2, 100),
      makeIndividual('b', 3, 200),
    ];

    const result = computeGenerationNumerals(individuals);

    expect(result).toEqual([
      { generation: 2, roman: 'I', y: 100 },
      { generation: 3, roman: 'II', y: 200 },
    ]);
  });

  it('averages the y position of all individuals within a generation', () => {
    const individuals: Individual[] = [
      makeIndividual('a', 0, 100),
      makeIndividual('b', 0, 200),
    ];

    const result = computeGenerationNumerals(individuals);

    expect(result).toEqual([{ generation: 0, roman: 'I', y: 150 }]);
  });

  it('returns an empty list for no individuals', () => {
    expect(computeGenerationNumerals([])).toEqual([]);
  });

  it('treats a missing generation as 0', () => {
    const withGen = makeIndividual('a', 0, 100);
    const missingGen = makeIndividual('b', 0, 200);
    // Simulate a legacy record without an explicit generation.
    delete (missingGen as { generation?: number }).generation;

    const result = computeGenerationNumerals([withGen, missingGen]);

    expect(result).toEqual([{ generation: 0, roman: 'I', y: 150 }]);
  });
});

describe('computeContentExtent', () => {
  const HALF = SYMBOL_SIZE / 2; // 20
  const LABEL = SYMBOL_SIZE; // 40

  /** Individual at an explicit (x, y); makeIndividual pins x to 0 otherwise. */
  function indAt(x: number, y: number): Individual {
    return { ...makeIndividual('i', 0, y), position: { x, y } };
  }

  function annoAt(
    x: number,
    y: number,
    text: string,
    fontSize: number,
  ): TextAnnotation {
    return { id: 'a', text, position: { x, y }, fontSize };
  }

  it('returns null when there is no content', () => {
    expect(computeContentExtent([])).toBeNull();
    expect(computeContentExtent([], [])).toBeNull();
  });

  it('expands a single symbol by its half-size, with label room below', () => {
    expect(computeContentExtent([indAt(0, 200)])).toEqual({
      minX: -HALF,
      minY: 200 - HALF,
      maxX: HALF,
      maxY: 200 + HALF + LABEL,
    });
  });

  it('spans the extreme symbols on every side', () => {
    expect(computeContentExtent([indAt(0, 0), indAt(100, 100)])).toEqual({
      minX: -HALF,
      minY: -HALF,
      maxX: 100 + HALF,
      maxY: 100 + HALF + LABEL,
    });
  });

  it('grows the box to include an annotation beyond the symbols', () => {
    // 'AB' at fontSize 10: width = max(10, 2*10*0.6) = 12 → half 6.
    const extent = computeContentExtent([indAt(0, 0)], [annoAt(200, 0, 'AB', 10)]);
    expect(extent?.maxX).toBe(206);
  });
});
