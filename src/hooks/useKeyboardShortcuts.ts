import { useEffect } from 'react';
import { usePedigreeStore } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { loadFromFile, saveToFile } from '../io/jsonIO';

/**
 * Global keyboard shortcuts for the pedigree editor.
 *
 * Shortcuts:
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+S: Save to JSON
 * - Cmd/Ctrl+O: Open JSON file
 * - Cmd/Ctrl+E: Open export modal
 * - Delete/Backspace: Delete selected individuals
 * - Escape: Clear selection, close modal, hide radial menu
 * - A: Toggle select tool
 * - P: Toggle pan tool
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
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
            const pedigree = usePedigreeStore.getState();
            const { removeIndividual, removeTextAnnotation } = pedigree;
            const annotations = pedigree.document.textAnnotations;
            for (const id of ui.selectedIds) {
              if (annotations[id]) {
                removeTextAnnotation(id);
              } else {
                removeIndividual(id);
              }
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
