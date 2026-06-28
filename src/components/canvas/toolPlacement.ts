import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { generateId } from '../../utils/idGenerator';
import { computeSmartTextPosition } from '../../utils/annotationPlacement';
import {
  ANNOTATION_DEFAULT_FONT_SIZE,
  ANNOTATION_PLACEHOLDER_TEXT,
} from '../../utils/constants';

/**
 * Place an empty-placeholder text annotation at the given CANVAS-space position
 * (rounded to integers), open it straight into inline edit mode, and revert the
 * active tool to `'select'` unless editing is locked.
 *
 * @returns the new annotation's id.
 */
export function placeTextAt(position: { x: number; y: number }): string {
  const { document: doc } = usePedigreeStore.getState();
  const center = computeSmartTextPosition(
    position,
    ANNOTATION_DEFAULT_FONT_SIZE,
    Object.values(doc.individuals),
    Object.values(doc.textAnnotations),
    Object.values(doc.partnerships),
  );
  const annotation = {
    id: generateId(),
    text: ANNOTATION_PLACEHOLDER_TEXT,
    position: center,
    fontSize: ANNOTATION_DEFAULT_FONT_SIZE,
  };
  usePedigreeStore.getState().addTextAnnotation(annotation);

  const ui = useUIStore.getState();
  ui.startEditingAnnotation(annotation.id);
  if (!ui.editingLocked) ui.setActiveTool('select');

  return annotation.id;
}
