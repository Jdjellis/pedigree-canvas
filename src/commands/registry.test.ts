import { buildCommands, getCommand } from './registry';
import type { EditorActions } from './useEditorActions';

/** Build a no-op EditorActions stub where every method is a vi.fn(). */
function makeNoopActions(): EditorActions {
  return {
    newDocument: vi.fn(),
    openDocument: vi.fn(),
    importPed: vi.fn(),
    exportDocument: vi.fn(),
    openLegend: vi.fn(),
    addPerson: vi.fn(),
    addPersonAt: vi.fn(),
    addText: vi.fn(),
    deleteSelected: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetView: vi.fn(),
    selectTool: vi.fn(),
    handTool: vi.fn(),
    maleTool: vi.fn(),
    femaleTool: vi.fn(),
    unknownTool: vi.fn(),
    partnershipTool: vi.fn(),
    textTool: vi.fn(),
    eraserTool: vi.fn(),
    toggleToolLock: vi.fn(),
  };
}

describe('buildCommands / getCommand', () => {
  test('exposes an export command', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    expect(getCommand(cmds, 'document.export')).toBeDefined();
  });

  test('delete is unavailable with empty selection', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    const del = getCommand(cmds, 'edit.deleteSelected')!;
    expect(del.isAvailable!({ selectedIds: new Set() })).toBe(false);
    expect(del.isAvailable!({ selectedIds: new Set(['a']) })).toBe(true);
  });

  test('running export calls the action', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    getCommand(cmds, 'document.export')!.run();
    expect(actions.exportDocument).toHaveBeenCalled();
  });

  test('every command has a unique id', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    const ids = cmds.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('getCommand returns undefined for an unknown id', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    expect(getCommand(cmds, 'nonexistent.command')).toBeUndefined();
  });

  test('all commands have the required fields (id, title, category, run)', () => {
    const actions = makeNoopActions();
    const cmds = buildCommands(actions);
    for (const cmd of cmds) {
      expect(typeof cmd.id).toBe('string');
      expect(cmd.id.length).toBeGreaterThan(0);
      expect(typeof cmd.title).toBe('string');
      expect(cmd.title.length).toBeGreaterThan(0);
      expect(['document', 'edit', 'view', 'tools']).toContain(cmd.category);
      expect(typeof cmd.run).toBe('function');
    }
  });
});
