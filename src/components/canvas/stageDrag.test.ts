import { describe, expect, it } from 'vitest';
import { nextPanningState } from './stageDrag';

/**
 * The canvas shows a grab/grabbing cursor while the *stage* is being panned,
 * driven by an `isDragging` flag toggled from Konva drag events. Konva bubbles a
 * child symbol's `dragstart` up to the stage, so the flag must only react to the
 * stage's *own* drag — otherwise a symbol drag flips it on with no matching
 * stage `dragend` to turn it back off. Regression guard for issue #91, where an
 * alt-drag "connect two people" gesture left the grab cursor stuck as a hand.
 */
describe('nextPanningState', () => {
  it('begins panning when the stage itself starts dragging', () => {
    expect(nextPanningState(false, { phase: 'start', targetIsStage: true })).toBe(true);
  });

  it('ends panning when the stage itself stops dragging', () => {
    expect(nextPanningState(true, { phase: 'end', targetIsStage: true })).toBe(false);
  });

  it('ignores a symbol dragstart so panning is not switched on', () => {
    // A symbol's dragstart bubbles to the stage but is not a pan.
    expect(nextPanningState(false, { phase: 'start', targetIsStage: false })).toBe(false);
  });

  it('leaves panning untouched on a symbol dragend', () => {
    expect(nextPanningState(false, { phase: 'end', targetIsStage: false })).toBe(false);
  });

  it('never leaves the grab cursor stuck after an alt-drag connect (issue #91)', () => {
    // The alt-drag gesture: the symbol's dragstart bubbles to the stage, then the
    // symbol calls stopDrag() to convert into a relationship link, so NO stage
    // dragend ever arrives. Panning must stay off throughout.
    let panning = false;
    panning = nextPanningState(panning, { phase: 'start', targetIsStage: false });
    // ...no stage dragend follows...
    expect(panning).toBe(false);
  });
});
