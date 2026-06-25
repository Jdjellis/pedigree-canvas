import { useEffect } from 'react';
import { usePedigreeStore } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { loadFromFile, saveToFile } from '../io/jsonIO';

/**
 * Global keyboard shortcuts for the pedigree editor.
 *
 * Shortcuts:
 * - Cmd/Ctrl+K: Toggle command palette (fires even when an input is focused)
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+S: Save to JSON
 * - Cmd/Ctrl+O: Open JSON file
 * - Cmd/Ctrl+E: Open export modal
 * - V: Select tool
 * - H: Hand (pan) tool
 * - P: Add Person tool
 * - ?: Open keyboard shortcuts overlay
 * - Delete/Backspace: Delete selected individuals
 * - Escape: Clear selection, close modal, hide radial menu
 *
 * All plain-letter shortcuts (V/H/P/?) are guarded by an input-focus check
 * so they do not fire while the user is typing in an INPUT, TEXTAREA, SELECT,
 * or contentEditable element.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // ⌘K / Ctrl+K: toggle the command palette from anywhere — even inside
      // an input field — so this check must precede the input-guard below.
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
        return;
      }

      const target = e.target as HTMLElement;

      // Don't intercept shortcuts when typing in inputs
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // --- Cmd/Ctrl shortcuts ---
      if (meta) {
        switch (e.key.toLowerCase()) {
          case 'z': {
            e.preventDefault();
            if (e.shiftKey) {
              usePedigreeStore.temporal.getState().redo();
            } else {
              usePedigreeStore.temporal.getState().undo();
            }
            return;
          }
          case 's': {
            e.preventDefault();
            saveToFile(usePedigreeStore.getState().document).catch(() => {
              // User cancelled save picker — ignore
            });
            return;
          }
          case 'o': {
            e.preventDefault();
            loadFromFile()
              .then((doc) => {
                usePedigreeStore.getState().setDocument(doc);
                useUIStore.getState().clearSelection();
              })
              .catch(() => {
                // User cancelled open picker — ignore
              });
            return;
          }
          case 'e': {
            e.preventDefault();
            useUIStore.getState().openModal('export');
            return;
          }
        }
      }

      // --- Non-modifier shortcuts ---
      switch (e.key) {
        case 'v': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('select');
          return;
        }
        case 'h': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('pan');
          return;
        }
        case 'p': {
          e.preventDefault();
          useUIStore.getState().setActiveTool('addIndividual');
          return;
        }
        case '?': {
          e.preventDefault();
          useUIStore.getState().openModal('shortcuts');
          return;
        }
        case 'Escape': {
          const ui = useUIStore.getState();
          if (ui.activeModal) {
            ui.closeModal();
          } else if (ui.radialMenu.visible) {
            ui.hideRadialMenu();
          } else {
            ui.clearSelection();
          }
          return;
        }
        case 'Delete':
        case 'Backspace': {
          const ui = useUIStore.getState();
          if (ui.selectedIds.size > 0) {
            e.preventDefault();
            const { removeIndividual } = usePedigreeStore.getState();
            for (const id of ui.selectedIds) {
              removeIndividual(id);
            }
            ui.clearSelection();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
