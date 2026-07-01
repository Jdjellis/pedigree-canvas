import { describe, expect, it } from 'vitest';

describe('__APP_VERSION__', () => {
  it('is a non-empty semver-shaped string injected at build time', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });
});
