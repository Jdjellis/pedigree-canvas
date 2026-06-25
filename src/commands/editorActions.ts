import { usePedigreeStore } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';
import { loadFromFile } from '../io/jsonIO';

/**
 * Module-level action functions that use `getState()` to read store values
 * at call time, avoiding stale closures. These are the canonical implementations
 * shared by `useEditorActions` (for islands / ⌘K palette) and
 * `useKeyboardShortcuts` (for keyboard handlers).
 *
 * Extracting them as plain functions (not hooks) allows keyboard event handlers
 * — which cannot call React hooks — to delegate here without duplicating logic.
 */

/**
 * Open a JSON file from disk, load it as the current document, clear the
 * selection, and reset the viewport. Handles the file-picker cancel cases
 * (AbortError or a "cancelled" message) silently; shows an alert for other
 * errors.
 */
export async function openDocumentAction(): Promise<void> {
  try {
    const loaded = await loadFromFile();
    usePedigreeStore.getState().setDocument(loaded);
    useUIStore.getState().clearSelection();
    useViewportStore.getState().resetView();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    // Silently ignore cancelled file pickers
    if (err instanceof Error && err.message.includes('cancelled')) return;
    alert(
      `Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

/**
 * Delete every currently-selected node from the document, then clear the
 * selection. Selected ids may reference either individuals or text
 * annotations, so route each id to the matching remover.
 */
export function deleteSelectedAction(): void {
  const { selectedIds } = useUIStore.getState();
  const { textAnnotations } = usePedigreeStore.getState().document;
  for (const id of selectedIds) {
    if (textAnnotations[id]) {
      usePedigreeStore.getState().removeTextAnnotation(id);
    } else {
      usePedigreeStore.getState().removeIndividual(id);
    }
  }
  useUIStore.getState().clearSelection();
}
