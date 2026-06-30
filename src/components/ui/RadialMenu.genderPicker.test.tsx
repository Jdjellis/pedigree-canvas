// src/components/ui/RadialMenu.genderPicker.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity, RelationshipType } from '../../types/enums';

const ROOT = 'root-1';

function seedRoot(): void {
  const pedigree = usePedigreeStore.getState();
  pedigree.resetDocument();
  pedigree.addIndividual(
    createDefaultIndividual({
      id: ROOT,
      genderIdentity: GenderIdentity.Woman,
      generation: 0,
      position: { x: 0, y: 0 },
    }),
  );
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(ROOT, { x: 0, y: 0 });
}

describe('RadialMenu gender-picker wiring', () => {
  beforeEach(() => {
    seedRoot();
  });

  it('Add Child creates an Unknown child and opens the gender picker on it', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Child' }));

    const doc = usePedigreeStore.getState().document;
    const newPeople = Object.values(doc.individuals).filter((i) => i.id !== ROOT);
    expect(newPeople).toHaveLength(1);
    expect(newPeople[0].genderIdentity).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBe(newPeople[0].id);
  });

  it('is hidden while a gender picker is open', () => {
    useUIStore.getState().showGenderPicker(ROOT);
    const { container } = render(<RadialMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Add Sibling (existing-parents branch) creates an Unknown sibling and opens the gender picker on it', () => {
    // Seed two parents and wire them as ROOT's parents so handleAddSibling
    // takes the "Has real parents" branch (the regression path that previously
    // ignored the default sex by not opening the gender picker).
    const pedigree = usePedigreeStore.getState();
    const parent1 = createDefaultIndividual({
      id: 'p1',
      genderIdentity: GenderIdentity.Man,
      generation: -1,
      position: { x: -60, y: -150 },
    });
    const parent2 = createDefaultIndividual({
      id: 'p2',
      genderIdentity: GenderIdentity.Woman,
      generation: -1,
      position: { x: 60, y: -150 },
    });
    pedigree.addIndividual(parent1);
    pedigree.addIndividual(parent2);
    pedigree.addPartnership({
      id: 'pship',
      type: RelationshipType.Partnership,
      partner1Id: 'p1',
      partner2Id: 'p2',
      childrenIds: [ROOT],
    });
    pedigree.addParentChildLink({
      id: 'pcl1',
      type: RelationshipType.ParentChild,
      parentPartnershipId: 'pship',
      childId: ROOT,
    });

    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Sibling/i }));

    const doc = usePedigreeStore.getState().document;
    const newPeople = Object.values(doc.individuals).filter(
      (i) => i.id !== ROOT && i.id !== 'p1' && i.id !== 'p2',
    );
    expect(newPeople).toHaveLength(1);
    // The new sibling must be Unknown so the gender picker can offer a choice.
    expect(newPeople[0].genderIdentity).toBe(GenderIdentity.Unknown);
    // The gender picker must have opened on the new sibling so the user is
    // prompted — this is the regression guard: before the fix this was skipped.
    expect(useUIStore.getState().genderPicker.targetId).toBe(newPeople[0].id);
  });
});
