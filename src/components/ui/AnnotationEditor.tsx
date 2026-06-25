import { useCallback, useState } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import type { TextAnnotation } from '../../types/pedigree';
import {
  LABEL_FONT_FAMILY,
  LABEL_COLOR,
  ANNOTATION_PLACEHOLDER_TEXT,
} from '../../utils/constants';
import styles from './AnnotationEditor.module.css';

interface AnnotationEditorInnerProps {
  /** The annotation being edited. */
  annotation: TextAnnotation;
  /** Current viewport scale (zoom). */
  scale: number;
  /** Current viewport pan position (stage-local origin offset). */
  position: { x: number; y: number };
  /** Leave inline edit mode. */
  onClose: () => void;
}

/**
 * The actual `<textarea>` editor. Remounted (via a `key` on its parent) whenever
 * the edited annotation changes, so its draft state is initialised cleanly from
 * props without a synchronising effect.
 */
function AnnotationEditorInner({
  annotation,
  scale,
  position,
  onClose,
}: AnnotationEditorInnerProps): React.ReactElement {
  const updateTextAnnotation = usePedigreeStore((s) => s.updateTextAnnotation);
  const removeTextAnnotation = usePedigreeStore((s) => s.removeTextAnnotation);

  const [draft, setDraft] = useState(annotation.text);

  // Focus + select-all on mount via a ref callback (no effect needed).
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null): void => {
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // Empty annotations are meaningless — drop them entirely.
      removeTextAnnotation(annotation.id);
    } else if (trimmed !== annotation.text) {
      updateTextAnnotation(annotation.id, { text: trimmed });
    }
    onClose();
  };

  const cancel = (): void => {
    // A pristine placeholder annotation the user never touched is removed so a
    // stray "+ Text" click does not litter the canvas.
    if (annotation.text === ANNOTATION_PLACEHOLDER_TEXT) {
      removeTextAnnotation(annotation.id);
    }
    onClose();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  // Stage-local screen coordinates of the annotation's top-left, derived from
  // the live scale/position so the overlay re-renders on every pan/zoom.
  const screenX = annotation.position.x * scale + position.x;
  const screenY = annotation.position.y * scale + position.y;

  return (
    <textarea
      ref={focusOnMount}
      className={styles.editor}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      aria-label="Edit text annotation"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        // Match the on-canvas text size under the current zoom.
        fontSize: `${annotation.fontSize * scale}px`,
        fontFamily: LABEL_FONT_FAMILY,
        color: LABEL_COLOR,
      }}
    />
  );
}

/**
 * Inline editor overlay for a free-text annotation.
 *
 * Renders an HTML `<textarea>` absolutely positioned over the Konva stage using
 * the live viewport transform (scale + position), so it sits exactly on top of
 * the annotation's on-canvas text. This mirrors the positioning approach used
 * by {@link RadialMenu}: stage-local coordinates position an absolute element
 * inside `.canvasArea`, which wraps the stage. Because this component lives in
 * react-dom (not the Konva reconciler), subscribing to the viewport store here
 * makes the overlay follow pan/zoom.
 *
 * Returns null when no annotation is being edited.
 */
export function AnnotationEditor(): React.ReactElement | null {
  const editingId = useUIStore((s) => s.editingAnnotationId);
  const stopEditingAnnotation = useUIStore((s) => s.stopEditingAnnotation);

  const annotations = usePedigreeStore((s) => s.document.textAnnotations);
  const scale = useViewportStore((s) => s.scale);
  const position = useViewportStore((s) => s.position);

  const annotation = editingId ? annotations[editingId] : undefined;
  if (!annotation) {
    return null;
  }

  return (
    <AnnotationEditorInner
      // Remount when the target changes so draft state re-seeds from props.
      key={annotation.id}
      annotation={annotation}
      scale={scale}
      position={position}
      onClose={stopEditingAnnotation}
    />
  );
}
