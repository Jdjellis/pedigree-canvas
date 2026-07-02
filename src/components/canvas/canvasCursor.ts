import type { ActiveTool } from '../../stores/uiStore';

/**
 * The set of cursor values the canvas container writes to its stage-container
 * element. An empty string clears the inline cursor so the per-tool CSS cursor
 * (see CanvasContainer.module.css) takes over.
 */
export type CanvasCursor = 'grabbing' | 'grab' | 'crosshair' | 'pointer' | '';

export interface CanvasCursorInputs {
  /** A pan gesture is actively in progress (stage drag or middle-mouse pan). */
  panning: boolean;
  /** The spacebar is held — the canvas is in "pan anywhere" ready state. */
  spaceHeld: boolean;
  /** A symbol (or other clickable canvas node) is currently hovered. */
  hovering: boolean;
  /** The active tool. The hover pointer affordance only applies in 'select'. */
  tool: ActiveTool;
  /**
   * The "connect two people" gesture is armed: Alt is held over a person, or an
   * alt-drag link is already in progress. Shows the same crosshair as the
   * connect tool and persists across empty canvas until the drop finishes.
   * Defaults to false when omitted.
   */
  connectArmed?: boolean;
}

/**
 * Resolve the cursor the canvas container should show, given the current pan and
 * hover state. This is the single source of truth for the container cursor so
 * the pan/space-held affordances and the symbol hover pointer never fight over
 * `container().style.cursor` (they used to be written by separate owners).
 *
 * Priority, highest first:
 *  1. An in-progress pan gesture → `grabbing`.
 *  2. Spacebar held ("pan anywhere" ready) → `grab`.
 *  3. The connect gesture is armed → `crosshair` (matches the connect tool).
 *  4. Hovering a clickable node in the select tool → `pointer`.
 *  5. Otherwise `''`, clearing the inline cursor so the per-tool CSS cursor
 *     (crosshair, custom eraser, etc.) takes over.
 */
export function resolveCanvasCursor({
  panning,
  spaceHeld,
  hovering,
  tool,
  connectArmed = false,
}: CanvasCursorInputs): CanvasCursor {
  if (panning) return 'grabbing';
  if (spaceHeld) return 'grab';
  if (connectArmed) return 'crosshair';
  if (hovering && tool === 'select') return 'pointer';
  return '';
}
