import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';

/**
 * Delete the document element with the given id, routing to the correct remover
 * by entity type: text annotation, partnership, or individual. Removing an
 * individual cascades to its partnerships, parent-child links, and twin-group
 * membership (handled inside the store). A no-op if `id` matches nothing.
 */
export function eraseElementById(id: string): void {
  if (useUIStore.getState().editingLocked) return;
  const store = usePedigreeStore.getState();
  const { textAnnotations, partnerships } = store.document;
  if (textAnnotations[id]) {
    store.removeTextAnnotation(id);
  } else if (partnerships[id]) {
    store.removePartnership(id);
  } else {
    store.removeIndividual(id);
  }
  clearDanglingSelection();
}

/**
 * Drop any selection that now points at an entity the latest removal deleted.
 * Removing an individual cascades to its partnerships, parent-child links, and
 * twin groups, so a selected *connection* can be left dangling even when the
 * erased id was an individual — reconcile against the resulting document rather
 * than the erased id alone.
 */
function clearDanglingSelection(): void {
  const ui = useUIStore.getState();
  const doc = usePedigreeStore.getState().document;

  const sc = ui.selectedConnection;
  if (sc) {
    const stillExists =
      (sc.kind === 'partnership' && !!doc.partnerships[sc.id]) ||
      (sc.kind === 'parentChild' && !!doc.parentChildLinks[sc.id]) ||
      (sc.kind === 'twin' && !!doc.twinGroups[sc.id]);
    if (!stillExists) ui.clearConnectionSelection();
  }

  if (ui.selectedIds.size > 0) {
    const remaining = [...ui.selectedIds].filter(
      (sid) => doc.individuals[sid] || doc.textAnnotations[sid],
    );
    if (remaining.length !== ui.selectedIds.size) {
      if (remaining.length === 0) ui.clearSelection();
      else ui.selectMultiple(remaining);
    }
  }
}
