// src/components/ui/RadialMenu.unionPicker.test.tsx
//
// Regression coverage for issue #97: "Add Child" on an individual who belongs to
// two or more unions must NOT silently attach the child to whichever union comes
// first in iteration order. Instead it opens the union picker so the user chooses.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { UnionPicker } from './UnionPicker';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity, RelationshipType } from '../../types/enums';

const I3 = 'i3';
const I4 = 'i4';
const OTHER = 'other'; // the consanguineous co-parent
const KID = 'kid'; // existing child of the consanguinity union

const CONSANG_UNION = 'consang';
const I3_I4_UNION = 'i3i4';

/**
 * Seed the bug's shape: I-3 is a partner in TWO unions —
 *  1. a consanguinity union with OTHER, created first, already has a child, and
 *  2. a partnership with I-4, created later, with no children.
 * The consanguinity union is inserted first, so `findPartnerships(...)[0]` returns
 * it — the exact wrong-default the picker must prevent.
 */
function seedTwoUnions(): void {
  const pedigree = usePedigreeStore.getState();
  pedigree.resetDocument();
  pedigree.addIndividual(
    createDefaultIndividual({ id: I3, genderIdentity: GenderIdentity.Unknown, generation: 0, position: { x: 140, y: 0 } }),
  );
  pedigree.addIndividual(
    createDefaultIndividual({ id: I4, genderIdentity: GenderIdentity.Unknown, generation: 0, position: { x: 260, y: 0 } }),
  );
  pedigree.addIndividual(
    createDefaultIndividual({ id: OTHER, genderIdentity: GenderIdentity.Unknown, generation: 0, position: { x: 20, y: 0 } }),
  );
  pedigree.addIndividual(
    createDefaultIndividual({ id: KID, genderIdentity: GenderIdentity.Unknown, generation: 1, position: { x: 20, y: 150 } }),
  );

  // Insert the consanguinity union FIRST so it wins iteration order.
  pedigree.addPartnership({
    id: CONSANG_UNION, type: RelationshipType.Partnership, consanguineous: true,
    partner1Id: I3, partner2Id: OTHER, childrenIds: [KID],
  });
  pedigree.addParentChildLink({
    id: 'pcl-kid', type: RelationshipType.ParentChild,
    parentPartnershipId: CONSANG_UNION, childId: KID,
  });
  pedigree.addPartnership({
    id: I3_I4_UNION, type: RelationshipType.Partnership,
    partner1Id: I3, partner2Id: I4, childrenIds: [],
  });

  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  ui.hideUnionPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(I3, { x: 140, y: 0 });
}

const SEED_IDS = new Set([I3, I4, OTHER, KID]);
function newIndividuals() {
  return Object.values(usePedigreeStore.getState().document.individuals).filter(
    (i) => !SEED_IDS.has(i.id),
  );
}

describe('RadialMenu Add Child with multiple unions (issue #97)', () => {
  beforeEach(() => {
    seedTwoUnions();
  });

  it('opens the union picker instead of adding a child to the first union', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Child' }));

    // No child created yet — the choice is deferred to the picker.
    expect(newIndividuals()).toHaveLength(0);
    expect(useUIStore.getState().unionPicker.targetId).toBe(I3);
    // The radial menu closed as it hands off to the picker.
    expect(useUIStore.getState().radialMenu.visible).toBe(false);
  });

  it('adds the child to the chosen I-3 × I-4 union, not the consanguinity one', () => {
    useUIStore.getState().showUnionPicker(I3);
    render(<UnionPicker />);

    // Two options, one per union; pick the I-3 × I-4 partnership by its co-parent.
    fireEvent.click(screen.getByRole('button', { name: /With I-3/ }));

    const created = newIndividuals();
    expect(created).toHaveLength(1);
    const child = created[0];

    const link = Object.values(usePedigreeStore.getState().document.parentChildLinks).find(
      (l) => l.childId === child.id,
    );
    // The bug attached it to CONSANG_UNION; the fix routes it to the chosen union.
    expect(link?.parentPartnershipId).toBe(I3_I4_UNION);

    const union = usePedigreeStore.getState().document.partnerships[I3_I4_UNION];
    expect(union.childrenIds).toContain(child.id);
    expect(usePedigreeStore.getState().document.partnerships[CONSANG_UNION].childrenIds).not.toContain(
      child.id,
    );

    // The new child is Unknown and the gender picker opens on it, like every
    // other create-a-relative flow; the union picker is dismissed.
    expect(child.genderIdentity).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBe(child.id);
    expect(useUIStore.getState().unionPicker.targetId).toBeNull();
  });

  it('dismissing the picker (click-away) adds no child', () => {
    useUIStore.getState().showUnionPicker(I3);
    const { container } = render(<UnionPicker />);

    // The transparent backdrop is the first child; clicking it dismisses.
    fireEvent.click(container.querySelector('[aria-hidden="true"]')!);

    expect(newIndividuals()).toHaveLength(0);
    expect(useUIStore.getState().unionPicker.targetId).toBeNull();
  });
});

describe('RadialMenu Add Child with a single union (unchanged behaviour)', () => {
  beforeEach(() => {
    const pedigree = usePedigreeStore.getState();
    pedigree.resetDocument();
    pedigree.addIndividual(
      createDefaultIndividual({ id: I3, genderIdentity: GenderIdentity.Woman, generation: 0, position: { x: 0, y: 0 } }),
    );
    pedigree.addIndividual(
      createDefaultIndividual({ id: I4, genderIdentity: GenderIdentity.Man, generation: 0, position: { x: 120, y: 0 } }),
    );
    pedigree.addPartnership({
      id: I3_I4_UNION, type: RelationshipType.Partnership,
      partner1Id: I3, partner2Id: I4, childrenIds: [],
    });
    const ui = useUIStore.getState();
    ui.hideGenderPicker();
    ui.hideUnionPicker();
    if (ui.editingLocked) ui.toggleEditingLocked();
    ui.showRadialMenu(I3, { x: 0, y: 0 });
  });

  it('adds the child directly and opens the gender picker, without prompting', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Child' }));

    const created = Object.values(usePedigreeStore.getState().document.individuals).filter(
      (i) => i.id !== I3 && i.id !== I4,
    );
    expect(created).toHaveLength(1);
    expect(useUIStore.getState().unionPicker.targetId).toBeNull();
    expect(useUIStore.getState().genderPicker.targetId).toBe(created[0].id);

    const union = usePedigreeStore.getState().document.partnerships[I3_I4_UNION];
    expect(union.childrenIds).toContain(created[0].id);
  });
});
