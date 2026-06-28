import React, { useCallback } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { TextAnnotation } from '../../types/pedigree';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { estimateAnnotationBlock } from '../../utils/annotationPlacement';
import { LABEL_FONT_FAMILY, LABEL_COLOR } from '../../utils/constants';

/** Selection outline colour, matching the individual-symbol selection chrome. */
const SELECTION_COLOR = '#6965db';
const SELECTION_STROKE_WIDTH = 2;
/** Padding around the text used for the selection rectangle and click target. */
const SELECTION_PADDING = 4;

export interface TextAnnotationLayerProps {
  /** All text annotations in the document, keyed by id. */
  annotations: Record<string, TextAnnotation>;
  /** The current selection set (annotation ids appear here when selected). */
  selectedIds: Set<string>;
  /** Id of the annotation currently being edited inline, or null. */
  editingId: string | null;
  /**
   * When true the document is locked against editing: dragging and
   * double-click-to-edit are both blocked.
   */
  editingLocked: boolean;
}

interface AnnotationTextProps {
  annotation: TextAnnotation;
  isSelected: boolean;
  isEditing: boolean;
  /** Mirrors {@link TextAnnotationLayerProps.editingLocked}. */
  editingLocked: boolean;
}

/**
 * A single draggable text annotation. The text is hidden while it is being
 * edited inline (the HTML `<textarea>` overlay takes its place), so the user
 * never sees a duplicate.
 */
const AnnotationText: React.FC<AnnotationTextProps> = React.memo(
  ({ annotation, isSelected, isEditing, editingLocked }) => {
    const handleClick = useCallback(
      (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true;
        useUIStore.getState().select(annotation.id);
      },
      [annotation.id],
    );

    const handleDoubleClick = useCallback(
      (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true;
        if (editingLocked) return;
        useUIStore.getState().startEditingAnnotation(annotation.id);
      },
      [annotation.id, editingLocked],
    );

    const handleDragEnd = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        const node = e.target;
        usePedigreeStore.getState().updateTextAnnotation(annotation.id, {
          position: { x: node.x(), y: node.y() },
        });
      },
      [annotation.id],
    );

    // The Group is anchored at the annotation CENTRE; the text and selection box
    // are offset by half the estimated block so the block is centred on it.
    const { width: blockWidth, height: blockHeight } = estimateAnnotationBlock(
      annotation.text,
      annotation.fontSize,
    );

    return (
      <Group
        x={annotation.position.x}
        y={annotation.position.y}
        draggable={!editingLocked}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onDragEnd={handleDragEnd}
        visible={!isEditing}
      >
        {isSelected && (
          <Rect
            x={-blockWidth / 2 - SELECTION_PADDING}
            y={-blockHeight / 2 - SELECTION_PADDING}
            width={blockWidth + SELECTION_PADDING * 2}
            height={blockHeight + SELECTION_PADDING * 2}
            stroke={SELECTION_COLOR}
            strokeWidth={SELECTION_STROKE_WIDTH}
            dash={[4, 3]}
            cornerRadius={2}
            listening={false}
            name="export-exclude"
          />
        )}
        <Text
          text={annotation.text}
          fontSize={annotation.fontSize}
          fontFamily={LABEL_FONT_FAMILY}
          fill={LABEL_COLOR}
          width={blockWidth}
          align="center"
          x={-blockWidth / 2}
          y={-blockHeight / 2}
        />
      </Group>
    );
  },
);

AnnotationText.displayName = 'AnnotationText';

/**
 * Konva layer rendering all free-text annotations.
 *
 * IMPORTANT: like the other canvas layers, this renders inside react-konva's
 * custom reconciler. All reactive data (annotations, selection, editing id)
 * arrives as props from {@link CanvasContainer}; store actions are reached via
 * `getState()` inside event handlers only.
 */
export const TextAnnotationLayer: React.FC<TextAnnotationLayerProps> =
  React.memo(({ annotations, selectedIds, editingId, editingLocked }) => {
    return (
      <>
        {Object.values(annotations).map((annotation) => (
          <AnnotationText
            key={annotation.id}
            annotation={annotation}
            isSelected={selectedIds.has(annotation.id)}
            isEditing={editingId === annotation.id}
            editingLocked={editingLocked}
          />
        ))}
      </>
    );
  });

TextAnnotationLayer.displayName = 'TextAnnotationLayer';
