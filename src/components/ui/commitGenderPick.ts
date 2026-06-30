import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import type { GenderIdentity } from '../../types/enums';

/**
 * Commit (or dismiss) the inline gender picker for a just-created individual.
 *
 * The individual was created as its own tracked undo entry. To keep "create a
 * person + choose their gender" a SINGLE undo step, the gender change is applied
 * while zundo's temporal history is paused, so it amends the creation entry
 * instead of pushing a second one. Mirrors `commitSymbolDrag` in `symbolDrag.ts`.
 *
 * @param targetId - The individual whose gender is being set.
 * @param gender - The chosen gender identity, or `null` to dismiss (keep current shape).
 */
export function commitGenderPick(
  targetId: string,
  gender: GenderIdentity | null,
): void {
  if (gender !== null) {
    usePedigreeStore.temporal.getState().pause();
    usePedigreeStore.getState().updateIndividual(targetId, { genderIdentity: gender });
    usePedigreeStore.temporal.getState().resume();
  }
  useUIStore.getState().hideGenderPicker();
}
