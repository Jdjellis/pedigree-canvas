// src/components/ui/InlineGenderPicker.twin.test.tsx
//
// Coverage for the gender popup's "make twins" section: a post-creation path to
// turn the just-created person into a twin (discovery experiment #3).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineGenderPicker } from './InlineGenderPicker';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity, RelationshipType, TwinType } from '../../types/enums';

const TARGET = 'target-1';

function seedTarget(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(
    createDefaultIndividual({ id: TARGET, genderIdentity: GenderIdentity.Unknown, position: { x: 0, y: 0 } }),
  );
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
}

beforeEach(seedTarget);

describe('InlineGenderPicker make-twins section', () => {
  it('offers MZ / DZ twin buttons for a non-twin target', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    expect(screen.getByRole('button', { name: 'MZ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DZ' })).toBeInTheDocument();
  });

  it('clicking MZ creates a co-twin, groups the pair, and re-anchors the picker onto the twin', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.click(screen.getByRole('button', { name: 'MZ' }));

    const doc = usePedigreeStore.getState().document;
    const created = Object.values(doc.individuals).filter((i) => i.id !== TARGET);
    expect(created).toHaveLength(1);
    const twin = created[0];

    // Exactly one MZ group binding the original and the new twin.
    const groups = Object.values(doc.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Monozygotic);
    expect(groups[0].individualIds.sort()).toEqual([TARGET, twin.id].sort());

    // The new twin is Unknown and the picker moves to it so its sex can be set.
    expect(twin.genderIdentity).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBe(twin.id);
  });

  it('hides the section once the target is already a twin', () => {
    // Give the target a sibling and group them as twins up front.
    const store = usePedigreeStore.getState();
    const sib = createDefaultIndividual({ id: 'sib', position: { x: 80, y: 0 } });
    store.addIndividual(sib);
    store.addPartnership({
      id: 'u1', type: RelationshipType.Partnership, childrenIds: [TARGET, 'sib'],
    });
    store.addTwinGroup({
      id: 'tg1', twinType: TwinType.Dizygotic,
      individualIds: [TARGET, 'sib'], parentPartnershipId: 'u1',
    });

    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    expect(screen.queryByRole('button', { name: 'MZ' })).toBeNull();
  });
});
