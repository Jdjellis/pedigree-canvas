import { useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Command, CommandContext } from './types';
import { useEditorActions, type EditorActions } from './useEditorActions';

/**
 * Build the full command list from a stable `EditorActions` reference.
 *
 * Call this once per hook render (wrapped in `useMemo`) — the returned array
 * is cheap to create but callers should memoize it so the palette doesn't
 * re-render on every keystroke.
 *
 * Commands that operate on store state not exposed through `EditorActions`
 * (e.g. toggle properties panel, open shortcuts) call `useUIStore.getState()`
 * directly inside their `run` handler so they stay outside the React render
 * cycle.
 */
export function buildCommands(actions: EditorActions): Command[] {
  return [
    // ── Document ──────────────────────────────────────────────────────────
    {
      id: 'document.new',
      title: 'New document',
      category: 'document',
      keywords: ['new', 'create', 'reset', 'clear'],
      run: () => actions.newDocument(),
    },
    {
      id: 'document.open',
      title: 'Open…',
      category: 'document',
      shortcut: '⌘O',
      keywords: ['open', 'load', 'file', 'json'],
      run: () => { void actions.openDocument(); },
    },
    {
      id: 'document.import',
      title: 'Import PED file…',
      category: 'document',
      keywords: ['import', 'ped', 'pedigree file'],
      run: () => actions.importPed(),
    },
    {
      id: 'document.export',
      title: 'Export…',
      category: 'document',
      keywords: ['export', 'save', 'png', 'pdf', 'svg', 'download'],
      run: () => actions.exportDocument(),
    },
    {
      id: 'document.legend',
      title: 'Edit legend…',
      category: 'document',
      keywords: ['legend', 'key', 'symbols'],
      run: () => actions.openLegend(),
    },

    // ── Edit ──────────────────────────────────────────────────────────────
    {
      id: 'edit.undo',
      title: 'Undo',
      category: 'edit',
      shortcut: '⌘Z',
      keywords: ['undo', 'revert'],
      run: () => actions.undo(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      category: 'edit',
      shortcut: '⌘⇧Z',
      keywords: ['redo', 'repeat'],
      run: () => actions.redo(),
    },
    {
      id: 'edit.deleteSelected',
      title: 'Delete selected',
      category: 'edit',
      keywords: ['delete', 'remove', 'selected'],
      isAvailable: (ctx: CommandContext) => ctx.selectedIds.size > 0,
      run: () => actions.deleteSelected(),
    },
    {
      id: 'edit.addPerson',
      title: 'Add person',
      category: 'edit',
      keywords: ['add', 'new', 'person', 'individual', 'member'],
      run: () => actions.addPerson(),
    },

    // ── View ──────────────────────────────────────────────────────────────
    {
      id: 'view.zoomIn',
      title: 'Zoom in',
      category: 'view',
      keywords: ['zoom', 'in', 'bigger', 'larger'],
      run: () => actions.zoomIn(),
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom out',
      category: 'view',
      keywords: ['zoom', 'out', 'smaller'],
      run: () => actions.zoomOut(),
    },
    {
      id: 'view.resetView',
      title: 'Fit / reset view',
      category: 'view',
      keywords: ['fit', 'reset', 'view', 'zoom', 'center', 'origin'],
      run: () => actions.resetView(),
    },
    {
      id: 'view.togglePropertiesPanel',
      title: 'Toggle properties panel',
      category: 'view',
      keywords: ['properties', 'panel', 'sidebar', 'toggle'],
      run: () => useUIStore.getState().togglePropertiesPanel(),
    },
    {
      id: 'view.keyboardShortcuts',
      title: 'Keyboard shortcuts',
      category: 'view',
      shortcut: '?',
      keywords: ['keyboard', 'shortcuts', 'help', 'hotkeys'],
      run: () => useUIStore.getState().openModal('shortcuts'),
    },

    // ── Tools ─────────────────────────────────────────────────────────────
    {
      id: 'tools.select',
      title: 'Select tool',
      category: 'tools',
      shortcut: 'V',
      keywords: ['select', 'pointer', 'cursor', 'tool'],
      run: () => actions.selectTool(),
    },
    {
      id: 'tools.hand',
      title: 'Hand tool',
      category: 'tools',
      shortcut: 'H',
      keywords: ['hand', 'pan', 'drag', 'tool'],
      run: () => actions.handTool(),
    },
    {
      id: 'tools.addMale',
      title: 'Add male tool',
      category: 'tools',
      shortcut: '2',
      keywords: ['add', 'male', 'individual', 'tool'],
      run: () => actions.maleTool(),
    },
  ];
}

/**
 * Look up a command by its stable `id` from an already-built command list.
 *
 * @returns The matching `Command`, or `undefined` if not found.
 */
export function getCommand(
  commands: Command[],
  id: string
): Command | undefined {
  return commands.find((c) => c.id === id);
}

/**
 * React hook that returns a memoized command list derived from the current
 * editor actions.
 *
 * The returned array is stable across renders as long as the underlying
 * actions are stable (which they are — `useEditorActions` wraps its return
 * value in `useMemo` with empty deps).
 */
export function useCommands(): Command[] {
  const actions = useEditorActions();
  return useMemo(() => buildCommands(actions), [actions]);
}
