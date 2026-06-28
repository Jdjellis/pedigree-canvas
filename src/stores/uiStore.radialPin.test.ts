import { beforeEach, describe, expect, test } from 'vitest';
import { useUIStore } from './uiStore';

describe('radial menu pin state', () => {
  beforeEach(() => useUIStore.getState().hideRadialMenu());

  test('starts unpinned', () => {
    useUIStore.getState().showRadialMenu('a', { x: 0, y: 0 });
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
  });

  test('pin/unpin toggle the flag; hide clears it', () => {
    useUIStore.getState().showRadialMenu('a', { x: 0, y: 0 });
    useUIStore.getState().pinRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(true);
    useUIStore.getState().unpinRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
    useUIStore.getState().pinRadialMenu();
    useUIStore.getState().hideRadialMenu();
    expect(useUIStore.getState().radialMenu.pinned).toBe(false);
    expect(useUIStore.getState().radialMenu.visible).toBe(false);
  });
});
