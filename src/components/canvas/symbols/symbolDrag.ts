import type { Position } from '../../../types/pedigree';
import { usePedigreeStore } from '../../../stores/pedigreeStore';

/**
 * Drag orchestration for pedigree symbols.
 *
 * A symbol drag streams many position updates (one per pointer move), and two
 * properties must hold simultaneously:
 *
 *  1. Connector lines (PartnershipLine / ParentChildLine / TwinConnector) read
 *     symbol positions from the store, so the store must be updated live on
 *     every move — otherwise the lines stay anchored to the old position and
 *     dangle until the drag ends (issue #13).
 *  2. The whole drag must collapse into a single undo step, not one per move.
 *
 * These helpers coordinate the pedigree store and its zundo temporal store to
 * satisfy both. They are extracted from `PedigreeSymbol` so the contract can be
 * unit-tested without rendering the Konva canvas — react-konva requires a real
 * canvas, which is unavailable under jsdom.
 */

/**
 * Begin a drag. Pauses undo/redo history so the stream of live position
 * updates during the drag does not flood the history with intermediate steps.
 */
export function beginSymbolDrag(): void {
  usePedigreeStore.temporal.getState().pause();
}

/**
 * Push a live position to the store mid-drag so connector lines, which read
 * positions from the store, re-anchor to the symbol in real time.
 */
export function updateSymbolDragPosition(id: string, position: Position): void {
  usePedigreeStore.getState().moveIndividual(id, position);
}

/**
 * Commit a finished drag as a single undo step.
 *
 * History is paused on entry and the store already sits at `endPos` from the
 * last live move. zundo records the state *before* a tracked set, so we first
 * restore `startPos` while still paused (untracked), then resume history and
 * re-commit `endPos`. The net result is exactly one undo step that reverts to
 * the pre-drag position.
 */
export function commitSymbolDrag(
  id: string,
  startPos: Position,
  endPos: Position,
): void {
  const { moveIndividual, commitDragWithRelayout } = usePedigreeStore.getState();
  // Restore the pre-drag position while history is still paused (untracked) so
  // zundo records it as the undo target, then resume and commit the drop +
  // relayout as a single tracked step.
  moveIndividual(id, startPos);
  usePedigreeStore.temporal.getState().resume();
  commitDragWithRelayout(id, endPos);
}

/**
 * Abort a drag that never committed (e.g. the alt-drag link gesture, which
 * cancels the Konva drag before it moves the symbol). Ensures history is
 * resumed so a paused state can never leak past the interaction.
 */
export function cancelSymbolDrag(): void {
  usePedigreeStore.temporal.getState().resume();
}
