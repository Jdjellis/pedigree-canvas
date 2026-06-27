import { describe, expect, test } from 'vitest';
import { createRelativeIndividual } from './RadialMenu';
import { GenderIdentity } from '../../types/enums';

describe('createRelativeIndividual', () => {
  test('applies the default sex as the gender identity', () => {
    expect(createRelativeIndividual('male', {}).genderIdentity).toBe(GenderIdentity.Man);
    expect(createRelativeIndividual('female', {}).genderIdentity).toBe(GenderIdentity.Woman);
    expect(createRelativeIndividual('unknown', {}).genderIdentity).toBe(GenderIdentity.Unknown);
  });

  test('passes through position/generation overrides', () => {
    const ind = createRelativeIndividual('male', { generation: 2, position: { x: 10, y: 20 } });
    expect(ind.generation).toBe(2);
    expect(ind.position).toEqual({ x: 10, y: 20 });
  });
});
