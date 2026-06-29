import { beforeEach, describe, expect, test } from 'vitest';
import { deleteSelectedAction } from './editorActions';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';

describe('deleteSelectedAction respects the edit lock', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    useUIStore.getState().clearSelection();
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('does nothing while editing is locked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().select(ind.id);
    useUIStore.getState().toggleEditingLocked(); // lock

    deleteSelectedAction();

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeDefined();
  });

  test('deletes when unlocked', () => {
    const other = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(other); // unselected — ensures one remains
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().select(ind.id);

    deleteSelectedAction();

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeUndefined();
  });
});
