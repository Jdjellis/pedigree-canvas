import { describe, test, expect, beforeEach, vi } from 'vitest';
import { markSelectedAsTwinsAction } from './editorActions';
import {
  usePedigreeStore,
  createDefaultIndividual,
} from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { RelationshipType, TwinType } from '../types/enums';

/** Seed a parent union with the given sibling ids. */
function seedSiblings(ids: string[]): void {
  const store = usePedigreeStore.getState();
  for (const id of ids) {
    store.addIndividual(createDefaultIndividual({ id, generation: 0 }));
  }
  store.addPartnership({
    id: 'u1',
    type: RelationshipType.Partnership,
    childrenIds: ids,
  });
  ids.forEach((id, i) =>
    store.addParentChildLink({
      id: `l${i}`,
      type: RelationshipType.ParentChild,
      parentPartnershipId: 'u1',
      childId: id,
      isAdopted: false,
    }),
  );
}

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.setState({
    selectedIds: new Set<string>(),
    activeTool: 'select',
    propertiesPanelOpen: false,
    editingLocked: false,
  });
  vi.clearAllMocks();
});

describe('markSelectedAsTwinsAction', () => {
  test('groups two selected siblings into a dizygotic twin group', () => {
    seedSiblings(['a', 'b']);
    useUIStore.getState().selectMultiple(['a', 'b']);

    markSelectedAsTwinsAction();

    const groups = Object.values(usePedigreeStore.getState().document.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Dizygotic);
    expect(groups[0].individualIds.sort()).toEqual(['a', 'b']);
    expect(groups[0].parentPartnershipId).toBe('u1');
  });

  test('focuses a single twin so the properties panel can edit zygosity', () => {
    seedSiblings(['a', 'b']);
    useUIStore.getState().selectMultiple(['a', 'b']);

    markSelectedAsTwinsAction();

    expect(useUIStore.getState().selectedIds.size).toBe(1);
    expect(useUIStore.getState().propertiesPanelOpen).toBe(true);
  });

  test('alerts and makes no group when the selection is not siblings', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'x' }));
    store.addIndividual(createDefaultIndividual({ id: 'y' }));
    useUIStore.getState().selectMultiple(['x', 'y']);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    markSelectedAsTwinsAction();

    expect(Object.keys(usePedigreeStore.getState().document.twinGroups)).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledOnce();
    alertSpy.mockRestore();
  });

  test('does nothing when editing is locked', () => {
    seedSiblings(['a', 'b']);
    useUIStore.getState().selectMultiple(['a', 'b']);
    useUIStore.setState({ editingLocked: true });

    markSelectedAsTwinsAction();

    expect(Object.keys(usePedigreeStore.getState().document.twinGroups)).toHaveLength(0);
  });
});
