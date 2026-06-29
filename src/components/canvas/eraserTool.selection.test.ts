import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePedigreeStore,
  createDefaultIndividual,
} from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType } from '../../types/enums';
import { eraseElementById } from './eraserTool';

/**
 * Erasing an element must not leave the selection pointing at an entity that no
 * longer exists. Removing an individual cascades to its partnerships,
 * parent-child links, and twin groups, so a selected *connection* can be left
 * dangling even when the erased id was an individual.
 */
describe('eraseElementById selection reconciliation', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    useUIStore.setState({
      selectedIds: new Set<string>(),
      selectedConnection: null,
      propertiesPanelOpen: false,
      editingLocked: false,
    });
  });

  it('clears a selected partnership connection when that partnership is erased', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));
    store.addPartnership({
      id: 'p1',
      type: RelationshipType.Partnership,
      partner1Id: 'a',
      partner2Id: 'b',
      childrenIds: [],
    });
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'p1' });

    eraseElementById('p1');

    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('clears a selected partnership connection cascaded away by erasing a partner', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));
    store.addPartnership({
      id: 'p1',
      type: RelationshipType.Partnership,
      partner1Id: 'a',
      partner2Id: 'b',
      childrenIds: [],
    });
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'p1' });

    // Erasing 'a' leaves p1 with <2 partners and no children, so the union is
    // pruned by the cascade — the selected connection now dangles.
    eraseElementById('a');

    expect(usePedigreeStore.getState().document.partnerships.p1).toBeUndefined();
    expect(useUIStore.getState().selectedConnection).toBeNull();
  });

  it('prunes an erased individual from selectedIds', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    useUIStore.getState().selectMultiple(['a']);

    eraseElementById('a');

    expect(useUIStore.getState().selectedIds.has('a')).toBe(false);
  });

  it('leaves an unaffected connection selection intact', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));
    store.addPartnership({
      id: 'p1',
      type: RelationshipType.Partnership,
      partner1Id: 'a',
      partner2Id: 'b',
      childrenIds: [],
    });
    store.addTextAnnotation({
      id: 't1',
      text: 'note',
      position: { x: 0, y: 0 },
      fontSize: 16,
    });
    useUIStore.getState().selectConnection({ kind: 'partnership', id: 'p1' });

    eraseElementById('t1'); // unrelated element

    expect(useUIStore.getState().selectedConnection).toEqual({
      kind: 'partnership',
      id: 'p1',
    });
    expect(usePedigreeStore.getState().document.partnerships.p1).toBeDefined();
  });
});
