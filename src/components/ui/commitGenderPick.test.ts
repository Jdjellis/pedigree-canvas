import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity } from '../../types/enums';
import { commitGenderPick } from './commitGenderPick';

const CHILD = 'child-1';

function seedUnknownChild(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  usePedigreeStore.temporal.getState().clear();
  // The creation is its own tracked undo entry, exactly as the radial/seed paths do.
  store.addIndividual(
    createDefaultIndividual({ id: CHILD, genderIdentity: GenderIdentity.Unknown }),
  );
}

function genderOf(id: string): GenderIdentity {
  return usePedigreeStore.getState().document.individuals[id].genderIdentity;
}

describe('commitGenderPick', () => {
  beforeEach(() => {
    seedUnknownChild();
    useUIStore.getState().showGenderPicker(CHILD);
  });

  it('sets the chosen gender and closes the picker', () => {
    commitGenderPick(CHILD, GenderIdentity.Woman);
    expect(genderOf(CHILD)).toBe(GenderIdentity.Woman);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('keeps create + pick as a single undo step', () => {
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);
    commitGenderPick(CHILD, GenderIdentity.Man);
    // The pick amended the creation entry rather than adding its own.
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);

    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals[CHILD]).toBeUndefined();
  });

  it('restores node and gender together on redo', () => {
    commitGenderPick(CHILD, GenderIdentity.Man);
    usePedigreeStore.temporal.getState().undo();
    usePedigreeStore.temporal.getState().redo();
    expect(genderOf(CHILD)).toBe(GenderIdentity.Man);
  });

  it('dismiss (null) keeps Unknown, adds no undo entry, still removes node on undo', () => {
    commitGenderPick(CHILD, null);
    expect(genderOf(CHILD)).toBe(GenderIdentity.Unknown);
    expect(usePedigreeStore.temporal.getState().pastStates.length).toBe(1);
    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals[CHILD]).toBeUndefined();
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });
});
