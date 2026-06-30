import { describe, expect, test } from 'vitest';
import { createSeededDocument } from './pedigreeStore';
import { GenderIdentity } from '../types/enums';

describe('createSeededDocument', () => {
  test('contains exactly one Unknown non-proband individual at the given position', () => {
    const doc = createSeededDocument({ x: 5, y: 7 });
    const people = Object.values(doc.individuals);
    expect(people).toHaveLength(1);
    expect(people[0].genderIdentity).toBe(GenderIdentity.Unknown);
    expect(people[0].isProband).toBe(false);
    expect(people[0].position).toEqual({ x: 5, y: 7 });
  });

  test('defaults position to origin', () => {
    const doc = createSeededDocument();
    expect(Object.values(doc.individuals)[0].position).toEqual({ x: 0, y: 0 });
  });
});
