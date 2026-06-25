import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePedigreeStore,
  createDefaultIndividual,
} from '../../../stores/pedigreeStore';
import type { PartnershipRelationship } from '../../../types/pedigree';
import { RelationshipType } from '../../../types/enums';
import {
  beginSymbolDrag,
  updateSymbolDragPosition,
  commitSymbolDrag,
} from './symbolDrag';

/**
 * Regression coverage for issue #13 — "connector lines don't follow nodes when
 * dragged". Connector lines read symbol positions from the store, so the drag
 * orchestration must (1) update the store live on every move and (2) collapse
 * the whole drag into a single undo step.
 *
 * react-konva needs a real canvas (unavailable under jsdom), so we exercise the
 * extracted `symbolDrag` helpers that `PedigreeSymbol`'s drag handlers call,
 * against the real pedigree + temporal stores.
 */

const PARTNER_A = 'partner-a';
const PARTNER_B = 'partner-b';

function seedPartnership(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();

  store.addIndividual(
    createDefaultIndividual({ id: PARTNER_A, position: { x: 100, y: 100 } }),
  );
  store.addIndividual(
    createDefaultIndividual({ id: PARTNER_B, position: { x: 300, y: 100 } }),
  );

  const partnership: PartnershipRelationship = {
    id: 'partnership-1',
    partner1Id: PARTNER_A,
    partner2Id: PARTNER_B,
    type: RelationshipType.Partnership,
    childrenIds: [],
  };
  store.addPartnership(partnership);

  // Start each test from a clean history so undo-step counts are unambiguous.
  usePedigreeStore.temporal.getState().clear();
}

function positionOf(id: string) {
  return usePedigreeStore.getState().document.individuals[id].position;
}

describe('symbolDrag orchestration (issue #13)', () => {
  beforeEach(() => {
    seedPartnership();
  });

  it('updates the store live on every move so connector lines follow the node', () => {
    beginSymbolDrag();

    updateSymbolDragPosition(PARTNER_A, { x: 160, y: 220 });
    // A connector line reading partner A's position from the store would now
    // re-anchor here, mid-drag, rather than dangling at the old position.
    expect(positionOf(PARTNER_A)).toEqual({ x: 160, y: 220 });

    updateSymbolDragPosition(PARTNER_A, { x: 240, y: 260 });
    expect(positionOf(PARTNER_A)).toEqual({ x: 240, y: 260 });

    commitSymbolDrag(PARTNER_A, { x: 100, y: 100 }, { x: 240, y: 260 });
  });

  it('does not record intermediate moves as undo steps while dragging', () => {
    const temporal = usePedigreeStore.temporal.getState();
    expect(temporal.pastStates.length).toBe(0);

    beginSymbolDrag();
    updateSymbolDragPosition(PARTNER_A, { x: 160, y: 220 });
    updateSymbolDragPosition(PARTNER_A, { x: 200, y: 240 });
    updateSymbolDragPosition(PARTNER_A, { x: 240, y: 260 });

    // History is paused during the drag: no intermediate steps recorded.
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(0);

    // Leave history resumed for subsequent tests.
    usePedigreeStore.temporal.getState().resume();
  });

  it('collapses the whole drag into a single undo step that reverts to the start', () => {
    const startPos = positionOf(PARTNER_A); // { x: 100, y: 100 }
    const endPos = { x: 240, y: 260 };

    beginSymbolDrag();
    updateSymbolDragPosition(PARTNER_A, { x: 160, y: 220 });
    updateSymbolDragPosition(PARTNER_A, endPos);
    commitSymbolDrag(PARTNER_A, startPos, endPos);

    // Final state sits at the drop point...
    expect(positionOf(PARTNER_A)).toEqual(endPos);
    // ...recorded as exactly one undo step.
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);

    usePedigreeStore.temporal.getState().undo();
    expect(positionOf(PARTNER_A)).toEqual(startPos);

    usePedigreeStore.temporal.getState().redo();
    expect(positionOf(PARTNER_A)).toEqual(endPos);
  });
});
