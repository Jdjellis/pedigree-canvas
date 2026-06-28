import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore editingLocked', () => {
  beforeEach(() => {
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('defaults to false', () => {
    expect(useUIStore.getState().editingLocked).toBe(false);
  });

  test('toggles', () => {
    useUIStore.getState().toggleEditingLocked();
    expect(useUIStore.getState().editingLocked).toBe(true);
  });
});
