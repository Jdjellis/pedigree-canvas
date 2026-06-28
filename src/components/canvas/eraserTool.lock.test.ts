import { beforeEach, describe, expect, test } from 'vitest';
import { eraseElementById } from './eraserTool';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';

describe('eraseElementById respects the edit lock', () => {
  beforeEach(() => {
    usePedigreeStore.getState().resetDocument();
    if (useUIStore.getState().editingLocked) useUIStore.getState().toggleEditingLocked();
  });

  test('does nothing while editing is locked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);
    useUIStore.getState().toggleEditingLocked(); // lock

    eraseElementById(ind.id);

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeDefined();
  });

  test('erases when unlocked', () => {
    const ind = createDefaultIndividual({});
    usePedigreeStore.getState().addIndividual(ind);

    eraseElementById(ind.id);

    expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeUndefined();
  });
});
