import { describe, expect, test } from 'vitest';
import { genderForSex } from './sex';
import { GenderIdentity } from '../types/enums';

describe('genderForSex', () => {
  test('maps male -> Man, female -> Woman, unknown -> Unknown', () => {
    expect(genderForSex('male')).toBe(GenderIdentity.Man);
    expect(genderForSex('female')).toBe(GenderIdentity.Woman);
    expect(genderForSex('unknown')).toBe(GenderIdentity.Unknown);
  });
});
