/**
 * A Konva drag event relevant to stage panning.
 *
 * `targetIsStage` distinguishes the stage's own drag (a pan) from a child
 * symbol's drag, whose `dragstart`/`dragend` bubble up to the same stage
 * handlers.
 */
export interface StageDragEvent {
  phase: 'start' | 'end';
  /** Whether the drag event's target is the stage node itself, not a child. */
  targetIsStage: boolean;
}

/**
 * Compute the next value of the stage "is panning" flag from a drag event.
 *
 * Only the stage's *own* drag toggles panning. A child symbol's drag bubbles a
 * `dragstart` up to the stage's handler, but must not switch panning on: an
 * alt-drag "connect two people" gesture cancels the symbol drag with
 * `stopDrag()` and so never emits a matching stage `dragend`, which would leave
 * the grab cursor stuck on forever (issue #91).
 *
 * @param current - The current panning flag.
 * @param event - The incoming stage drag event.
 * @returns The panning flag after applying the event.
 */
export function nextPanningState(current: boolean, event: StageDragEvent): boolean {
  if (!event.targetIsStage) return current;
  return event.phase === 'start';
}
