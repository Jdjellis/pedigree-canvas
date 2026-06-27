import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore defaultSex', () => {
  beforeEach(() => {
    useUIStore.getState().setDefaultSex('unknown');
  });

  test('defaults to unknown', () => {
    expect(useUIStore.getState().defaultSex).toBe('unknown');
  });

  test('setDefaultSex updates the value', () => {
    useUIStore.getState().setDefaultSex('female');
    expect(useUIStore.getState().defaultSex).toBe('female');
  });
});
