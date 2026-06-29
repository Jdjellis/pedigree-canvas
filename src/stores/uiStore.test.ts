import { describe, it, test, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

test('togglePropertiesPanel flips the flag', () => {
  useUIStore.setState({ propertiesPanelOpen: false });
  useUIStore.getState().togglePropertiesPanel();
  expect(useUIStore.getState().propertiesPanelOpen).toBe(true);
});

test('toggleCommandPalette flips palette state', () => {
  useUIStore.setState({ commandPaletteOpen: false });
  useUIStore.getState().toggleCommandPalette();
  expect(useUIStore.getState().commandPaletteOpen).toBe(true);
});

describe('uiStore tool state', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeTool: 'select',
      editingLocked: false,
    });
  });

  it('switches the active tool to any of the valid tool ids', () => {
    useUIStore.getState().setActiveTool('text');
    expect(useUIStore.getState().activeTool).toBe('text');
    useUIStore.getState().setActiveTool('eraser');
    expect(useUIStore.getState().activeTool).toBe('eraser');
  });

  it('toggles the editing lock on and off', () => {
    expect(useUIStore.getState().editingLocked).toBe(false);
    useUIStore.getState().toggleEditingLocked();
    expect(useUIStore.getState().editingLocked).toBe(true);
    useUIStore.getState().toggleEditingLocked();
    expect(useUIStore.getState().editingLocked).toBe(false);
  });
});
