import React, { useCallback, useRef } from 'react';
import { Group, Rect, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Individual } from '../../../types/pedigree';
import { GenderIdentity, VitalStatus } from '../../../types/enums';
import { useUIStore } from '../../../stores/uiStore';
import { useViewportStore } from '../../../stores/viewportStore';
import {
  SYMBOL_SIZE,
  SYMBOL_STROKE_WIDTH,
  SYMBOL_COLOR,
  SYMBOL_FILL,
  SELECTION_COLOR,
} from '../../../utils/constants';

import {
  beginSymbolDrag,
  updateSymbolDragPosition,
  commitSymbolDrag,
  cancelSymbolDrag,
} from './symbolDrag';
import { SquareShape } from './SquareShape';
import { CircleShape } from './CircleShape';
import { DiamondShape } from './DiamondShape';
import { TriangleShape } from './TriangleShape';
import { ConditionOverlay } from './ConditionOverlay';
import type { ActiveQuarter } from './ConditionOverlay';
import { DeceasedSlash } from './DeceasedSlash';
import { AdoptionBrackets } from './AdoptionBrackets';
import { ProbandArrow } from './ProbandArrow';
import { SymbolLabel } from './SymbolLabel';
import { eraseElementById } from '../eraserTool';

export interface PedigreeSymbolProps {
  individual: Individual;
  isSelected: boolean;
  isHovered: boolean;
  activeQuarters: ActiveQuarter[];
  individualNumber?: number;
  /**
   * When true the canvas is in "pan anywhere" mode (spacebar held): dragging
   * this symbol is suspended so a left-drag pans the stage, and hover affordances
   * (pointer cursor, radial menu) are skipped.
   */
  panMode?: boolean;
  /**
   * When true the eraser drag is in progress — entering this symbol erases it
   * immediately, enabling swath deletion by holding and dragging.
   */
  eraseOnHover?: boolean;
  /**
   * When true the document is locked for editing: dragging is disabled and
   * mutation interactions (erase, radial menu) are blocked.
   */
  editingLocked?: boolean;
}

const SELECTION_STROKE_WIDTH = 2;
const HOVER_OPACITY = 0.08;

/**
 * Renders the base shape determined by genderIdentity.
 * For pregnancies not carried to term, renders a triangle instead.
 */
function BaseShape({
  individual,
  fill,
  strokeColor,
}: {
  individual: Individual;
  fill: string;
  strokeColor: string;
}) {
  // Pregnancy not carried to term -> triangle
  if (individual.isPregnancy && individual.pregnancyOutcome) {
    return (
      <TriangleShape
        size={SYMBOL_SIZE}
        strokeColor={strokeColor}
        strokeWidth={SYMBOL_STROKE_WIDTH}
        fill={fill}
      />
    );
  }

  switch (individual.genderIdentity) {
    case GenderIdentity.Man:
      return (
        <SquareShape
          size={SYMBOL_SIZE}
          strokeColor={strokeColor}
          strokeWidth={SYMBOL_STROKE_WIDTH}
          fill={fill}
        />
      );

    case GenderIdentity.Woman:
      return (
        <CircleShape
          size={SYMBOL_SIZE}
          strokeColor={strokeColor}
          strokeWidth={SYMBOL_STROKE_WIDTH}
          fill={fill}
        />
      );

    case GenderIdentity.NonBinary:
    case GenderIdentity.Unknown:
    default:
      return (
        <DiamondShape
          size={SYMBOL_SIZE}
          strokeColor={strokeColor}
          strokeWidth={SYMBOL_STROKE_WIDTH}
          fill={fill}
        />
      );
  }
}

/**
 * Renders a highlight shape behind the base symbol when selected.
 */
function SelectionHighlight({
  individual,
  isSelected,
}: {
  individual: Individual;
  isSelected: boolean;
}) {
  if (!isSelected) return null;

  const pad = 4;
  const size = SYMBOL_SIZE + pad * 2;
  const half = size / 2;

  if (individual.isPregnancy && individual.pregnancyOutcome) {
    return (
      <Rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        stroke={SELECTION_COLOR}
        strokeWidth={SELECTION_STROKE_WIDTH}
        dash={[4, 3]}
        cornerRadius={2}
        listening={false}
        name="export-exclude"
      />
    );
  }

  switch (individual.genderIdentity) {
    case GenderIdentity.Man:
      return (
        <Rect
          x={-half}
          y={-half}
          width={size}
          height={size}
          stroke={SELECTION_COLOR}
          strokeWidth={SELECTION_STROKE_WIDTH}
          dash={[4, 3]}
          cornerRadius={2}
          listening={false}
          name="export-exclude"
        />
      );

    case GenderIdentity.Woman:
      return (
        <Circle
          x={0}
          y={0}
          radius={half}
          stroke={SELECTION_COLOR}
          strokeWidth={SELECTION_STROKE_WIDTH}
          dash={[4, 3]}
          listening={false}
          name="export-exclude"
        />
      );

    case GenderIdentity.NonBinary:
    case GenderIdentity.Unknown:
    default:
      return (
        <Rect
          x={-half}
          y={-half}
          width={size}
          height={size}
          stroke={SELECTION_COLOR}
          strokeWidth={SELECTION_STROKE_WIDTH}
          dash={[4, 3]}
          cornerRadius={2}
          listening={false}
          name="export-exclude"
        />
      );
  }
}

/**
 * Renders a subtle hover highlight behind the symbol.
 */
function HoverHighlight({ isHovered }: { isHovered: boolean }) {
  if (!isHovered) return null;

  const pad = 6;
  const size = SYMBOL_SIZE + pad * 2;

  return (
    <Rect
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      fill={SELECTION_COLOR}
      opacity={HOVER_OPACITY}
      cornerRadius={4}
      listening={false}
      name="export-exclude"
    />
  );
}

/**
 * Main pedigree symbol component.
 *
 * IMPORTANT: This component renders inside react-konva's custom reconciler,
 * NOT react-dom. Zustand hook subscriptions do not trigger re-renders here.
 * All reactive data (isSelected, isHovered, individual) must be passed as
 * props from a react-dom ancestor. Store actions are accessed via getState()
 * inside event handlers (imperative, not reactive).
 */
export const PedigreeSymbol: React.FC<PedigreeSymbolProps> = React.memo(
  ({
    individual,
    isSelected,
    isHovered,
    activeQuarters,
    individualNumber,
    panMode = false,
    eraseOnHover = false,
    editingLocked = false,
  }) => {
    // Position of the symbol when a drag began. Captured so the whole drag can
    // be committed as a single undo step on drag end (see handleDragEnd).
    const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
    // Absolute y the symbol is pinned to during a drag. Dragging is constrained
    // to the horizontal axis so a symbol stays within its generation; see
    // dragBoundFunc and handleDragStart.
    const dragLockYRef = useRef<number | null>(null);

    const isDeceased =
      individual.vitalStatus === VitalStatus.Deceased ||
      individual.vitalStatus === VitalStatus.Stillborn;

    const strokeColor = isSelected ? SELECTION_COLOR : SYMBOL_COLOR;

    const handleClick = useCallback(
      (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        e.cancelBubble = true;
        const ui = useUIStore.getState();
        const tool = ui.activeTool;

        if (tool === 'eraser') {
          ui.hideRadialMenu();
          eraseElementById(individual.id);
          return;
        }

        const { select, toggleSelection, hideRadialMenu } = ui;
        const evt = e.evt;
        if ('shiftKey' in evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey)) {
          hideRadialMenu();
          toggleSelection(individual.id);
        } else {
          select(individual.id);
          if (tool === 'select' && !ui.editingLocked) {
            ui.showRadialMenu(individual.id, individual.position);
            ui.pinRadialMenu();
          }
        }
      },
      [individual.id, individual.position],
    );

    const handleMouseEnter = useCallback(() => {
      // In pan mode, suppress hover affordances so panning feels uninterrupted.
      if (panMode) return;
      if (eraseOnHover && useUIStore.getState().activeTool === 'eraser') {
        eraseElementById(individual.id);
        return;
      }
      const uiState = useUIStore.getState();
      if (uiState.editingLocked) return;
      uiState.setHovered(individual.id);
      if (uiState.dragLink.active) uiState.setDragLinkTarget(individual.id);
      const stageEl = document.querySelector('canvas');
      if (stageEl) stageEl.style.cursor = 'pointer';
      // Opening the radial add-menu is handled by the proximity controller
      // (useRadialHover), which uses a generous enter radius + hysteresis so the
      // menu does not vanish the moment the cursor leaves this 40px hit area.
    }, [individual.id, panMode, eraseOnHover]);

    const handleMouseLeave = useCallback(() => {
      const uiState = useUIStore.getState();
      uiState.setHovered(null);
      if (uiState.dragLink.active) {
        uiState.setDragLinkTarget(null);
      }
      // Note: the radial menu is NOT dismissed here. Closing is owned by the
      // proximity controller (useRadialHover), which keeps the menu open until
      // the pointer leaves a radius wide enough to reach the option buttons.
      const stage = document.querySelector('canvas');
      if (stage) stage.style.cursor = 'default';
    }, []);

    const handleDragStart = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        if (e.evt.altKey) {
          // Cancel the Konva drag (don't move the symbol)
          e.target.stopDrag();
          // Start link mode
          useUIStore.getState().startDragLink(individual.id);
          return;
        }
        const node = e.target;
        // Remember where the symbol started so the final commit can be recorded
        // as a single pre-drag -> drop-point undo step (see handleDragEnd).
        dragStartPosRef.current = { x: node.x(), y: node.y() };
        // Pin the vertical position for the duration of the drag (horizontal-only).
        dragLockYRef.current = node.absolutePosition().y;
        beginSymbolDrag();
      },
      [individual.id],
    );

    const dragBoundFunc = useCallback((pos: { x: number; y: number }) => {
      // Constrain dragging to the horizontal axis: a symbol may be repositioned
      // within its generation but cannot be moved between generations, which
      // would misalign parent/child connectors. Vertical position is locked to
      // where the drag began (dragBoundFunc receives absolute coordinates).
      const lockedY = dragLockYRef.current;
      return { x: pos.x, y: lockedY ?? pos.y };
    }, []);

    const handleDragMove = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        const node = e.target;
        updateSymbolDragPosition(individual.id, { x: node.x(), y: node.y() });
      },
      [individual.id]
    );

    const handleDragEnd = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        const startPos = dragStartPosRef.current;
        dragStartPosRef.current = null;

        // No drag was actually tracked (e.g. the alt-drag link gesture, which
        // calls stopDrag in handleDragStart). Just make sure history is resumed.
        if (!startPos) {
          cancelSymbolDrag();
          return;
        }

        const node = e.target;
        commitSymbolDrag(individual.id, startPos, { x: node.x(), y: node.y() });
      },
      [individual.id]
    );

    const handleMouseUp = useCallback(() => {
      const { dragLink, showLinkPopup } = useUIStore.getState();
      if (dragLink.active && dragLink.sourceId && dragLink.sourceId !== individual.id) {
        const { canvasToScreen } = useViewportStore.getState();
        const canvasEl = document.querySelector('.konvajs-content');
        const screenPos = canvasToScreen(individual.position);
        if (canvasEl) {
          const rect = canvasEl.getBoundingClientRect();
          screenPos.x += rect.left;
          screenPos.y += rect.top;
        }
        showLinkPopup(dragLink.sourceId, individual.id, screenPos);
      }
    }, [individual.id, individual.position]);

    return (
      <Group
        x={individual.position.x}
        y={individual.position.y}
        draggable={!panMode && !editingLocked}
        dragBoundFunc={dragBoundFunc}
        onClick={handleClick}
        onTap={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onMouseUp={handleMouseUp}
      >
        {/* Hover highlight (behind everything) */}
        <HoverHighlight isHovered={isHovered} />

        {/* Selection highlight */}
        <SelectionHighlight individual={individual} isSelected={isSelected} />

        {/* Base shape */}
        <BaseShape
          individual={individual}
          fill={SYMBOL_FILL}
          strokeColor={strokeColor}
        />

        {/* Adoption brackets */}
        {individual.adopted && <AdoptionBrackets strokeColor={SYMBOL_COLOR} />}

        {/* Condition quarter overlay */}
        <ConditionOverlay
          size={SYMBOL_SIZE}
          genderIdentity={individual.genderIdentity}
          activeQuarters={activeQuarters}
        />

        {/* Deceased slash */}
        {isDeceased && (
          <DeceasedSlash
            size={SYMBOL_SIZE}
            strokeColor={SYMBOL_COLOR}
            strokeWidth={SYMBOL_STROKE_WIDTH}
          />
        )}

        {/* Proband / Consultand arrow */}
        <ProbandArrow
          size={SYMBOL_SIZE}
          isProband={individual.isProband}
          isConsultand={individual.isConsultand ?? false}
        />

        {/* Text label */}
        <SymbolLabel individual={individual} individualNumber={individualNumber} />
      </Group>
    );
  }
);

PedigreeSymbol.displayName = 'PedigreeSymbol';
