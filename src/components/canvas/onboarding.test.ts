import { describe, expect, test } from 'vitest';
import { shouldShowOnboarding } from './onboarding';

describe('shouldShowOnboarding', () => {
  test('shows for a fresh, un-onboarded seed (0 or 1 individual)', () => {
    expect(shouldShowOnboarding(0, false)).toBe(true);
    expect(shouldShowOnboarding(1, false)).toBe(true);
  });
  test('hides once a relative is added', () => {
    expect(shouldShowOnboarding(2, false)).toBe(false);
  });
  test('hides permanently once onboarded', () => {
    expect(shouldShowOnboarding(1, true)).toBe(false);
  });
});
