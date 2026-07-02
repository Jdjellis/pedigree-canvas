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

describe('uiStore view preferences', () => {
  beforeEach(() => {
    useUIStore.setState({ zenMode: false, showGrid: true });
  });

  it('defaults zen mode off and grid on', () => {
    expect(useUIStore.getState().zenMode).toBe(false);
    expect(useUIStore.getState().showGrid).toBe(true);
  });

  it('toggleZenMode flips the flag', () => {
    useUIStore.getState().toggleZenMode();
    expect(useUIStore.getState().zenMode).toBe(true);
    useUIStore.getState().toggleZenMode();
    expect(useUIStore.getState().zenMode).toBe(false);
  });

  it('setZenMode sets the flag explicitly', () => {
    useUIStore.getState().setZenMode(true);
    expect(useUIStore.getState().zenMode).toBe(true);
    useUIStore.getState().setZenMode(false);
    expect(useUIStore.getState().zenMode).toBe(false);
  });

  it('toggleShowGrid flips the flag', () => {
    useUIStore.getState().toggleShowGrid();
    expect(useUIStore.getState().showGrid).toBe(false);
    useUIStore.getState().toggleShowGrid();
    expect(useUIStore.getState().showGrid).toBe(true);
  });

  it('setShowGrid sets the flag explicitly', () => {
    useUIStore.getState().setShowGrid(false);
    expect(useUIStore.getState().showGrid).toBe(false);
    useUIStore.getState().setShowGrid(true);
    expect(useUIStore.getState().showGrid).toBe(true);
  });
});
