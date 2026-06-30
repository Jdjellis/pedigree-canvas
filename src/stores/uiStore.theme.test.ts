import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as safeStorage from '../utils/safeStorage';
import { THEME_STORAGE_KEY } from '../theme/themes';

/**
 * Theme selection lives in `uiStore` and is persisted browser-local via
 * `safeStorage`, mirroring the `onboarded` pattern. These tests cover the
 * setter (state + persistence) and the storage-seeded initial value.
 */

describe('uiStore theme', () => {
  beforeEach(() => {
    safeStorage.removeItem(THEME_STORAGE_KEY);
    vi.resetModules();
  });

  afterEach(() => {
    safeStorage.removeItem(THEME_STORAGE_KEY);
  });

  it('defaults to light when nothing is stored', async () => {
    const { useUIStore } = await import('./uiStore');
    expect(useUIStore.getState().theme).toBe('light');
  });

  it('setTheme updates state and persists the choice', async () => {
    const { useUIStore } = await import('./uiStore');
    useUIStore.getState().setTheme('warm');
    expect(useUIStore.getState().theme).toBe('warm');
    expect(safeStorage.getItem(THEME_STORAGE_KEY)).toBe('warm');
  });

  it('seeds the initial theme from storage', async () => {
    safeStorage.setItem(THEME_STORAGE_KEY, 'dim');
    vi.resetModules();
    const { useUIStore } = await import('./uiStore');
    expect(useUIStore.getState().theme).toBe('dim');
  });

  it('ignores an unknown stored value and falls back to light', async () => {
    safeStorage.setItem(THEME_STORAGE_KEY, 'banana');
    vi.resetModules();
    const { useUIStore } = await import('./uiStore');
    expect(useUIStore.getState().theme).toBe('light');
  });
});
