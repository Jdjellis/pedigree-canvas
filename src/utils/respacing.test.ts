import { describe, it, expect } from 'vitest';
import { respaceRow, respaceGeneration } from './respacing';
import type { Individual } from '../types/pedigree';
import { createDefaultIndividual } from '../stores/pedigreeStore';

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
