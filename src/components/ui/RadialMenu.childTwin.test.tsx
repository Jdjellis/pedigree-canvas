// src/components/ui/RadialMenu.childTwin.test.tsx
//
// Coverage for the "hold ⌥ over Child" flow: adding a pair of twin CHILDREN
// (the mirror of the Sibling twin split). Because the menu target is the parent,
// a twin child is created as two new siblings born together.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { UnionPicker } from './UnionPicker';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity, RelationshipType, TwinType } from '../../types/enums';

const MOM = 'mom';
const DAD = 'dad';
const UNION = 'u1';

/** New (non-seed) individuals in the doc. */
function created(...seedIds: string[]) {
  const seed = new Set(seedIds);
  return Object.values(usePedigreeStore.getState().document.individuals).filter(
    (i) => !seed.has(i.id),
  );
}

function seedCoupleAndOpenMenu(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(
    createDefaultIndividual({ id: MOM, genderIdentity: GenderIdentity.Woman, generation: 0, position: { x: 0, y: 0 } }),
  );
  store.addIndividual(
    createDefaultIndividual({ id: DAD, genderIdentity: GenderIdentity.Man, generation: 0, position: { x: 120, y: 0 } }),
  );
  store.addPartnership({
    id: UNION,
    type: RelationshipType.Partnership,
    partner1Id: MOM,
    partner2Id: DAD,
    childrenIds: [],
  });
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  ui.hideUnionPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(MOM, { x: 0, y: 0 });
}

describe('RadialMenu Add Child twins (single union)', () => {
  beforeEach(seedCoupleAndOpenMenu);

  it('creates a monozygotic pair grouped together under the union', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByTitle('Add Monozygotic (MZ) twin children'));

    const kids = created(MOM, DAD);
    expect(kids).toHaveLength(2);

    const doc = usePedigreeStore.getState().document;
    expect(doc.partnerships[UNION].childrenIds).toHaveLength(2);

    const groups = Object.values(doc.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Monozygotic);
    expect(groups[0].individualIds.sort()).toEqual(kids.map((k) => k.id).sort());

    // Gender picker opens on one of the twins; the radial menu closed.
    expect(kids.map((k) => k.id)).toContain(useUIStore.getState().genderPicker.targetId);
    expect(useUIStore.getState().radialMenu.visible).toBe(false);
  });
});

describe('RadialMenu Add Child twins (no union yet)', () => {
  beforeEach(() => {
    const store = usePedigreeStore.getState();
    store.resetDocument();
    store.addIndividual(
      createDefaultIndividual({ id: MOM, genderIdentity: GenderIdentity.Woman, generation: 0, position: { x: 0, y: 0 } }),
    );
    const ui = useUIStore.getState();
    ui.hideGenderPicker();
    ui.hideUnionPicker();
    if (ui.editingLocked) ui.toggleEditingLocked();
    ui.showRadialMenu(MOM, { x: 0, y: 0 });
  });

  it('creates a fresh 1-parent union holding a dizygotic pair', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByTitle('Add Dizygotic (DZ) twin children'));

    const kids = created(MOM);
    expect(kids).toHaveLength(2);

    const doc = usePedigreeStore.getState().document;
    // Exactly one new union with MOM as the sole present parent.
    const unions = Object.values(doc.partnerships);
    expect(unions).toHaveLength(1);
    expect(unions[0].partner1Id).toBe(MOM);
    expect(unions[0].childrenIds).toHaveLength(2);

    const groups = Object.values(doc.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Dizygotic);
  });
});

describe('RadialMenu Add Child twins (multiple unions → union picker)', () => {
  const OTHER = 'other';
  const U2 = 'u2';

  beforeEach(() => {
    const store = usePedigreeStore.getState();
    store.resetDocument();
    store.addIndividual(createDefaultIndividual({ id: MOM, displayName: 'Mom', generation: 0, position: { x: 0, y: 0 } }));
    store.addIndividual(createDefaultIndividual({ id: DAD, displayName: 'Dad', generation: 0, position: { x: 120, y: 0 } }));
    store.addIndividual(createDefaultIndividual({ id: OTHER, displayName: 'Other', generation: 0, position: { x: -120, y: 0 } }));
    store.addPartnership({ id: UNION, type: RelationshipType.Partnership, partner1Id: MOM, partner2Id: DAD, childrenIds: [] });
    store.addPartnership({ id: U2, type: RelationshipType.Partnership, partner1Id: MOM, partner2Id: OTHER, childrenIds: [] });
    const ui = useUIStore.getState();
    ui.hideGenderPicker();
    ui.hideUnionPicker();
    if (ui.editingLocked) ui.toggleEditingLocked();
    ui.showRadialMenu(MOM, { x: 0, y: 0 });
  });

  it('defers to the union picker carrying the twin intent, then adds a pair', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByTitle('Add Monozygotic (MZ) twin children'));

    // No children yet; the picker is armed with the twin type.
    expect(created(MOM, DAD, OTHER)).toHaveLength(0);
    expect(useUIStore.getState().unionPicker.targetId).toBe(MOM);
    expect(useUIStore.getState().unionPicker.twinType).toBe(TwinType.Monozygotic);

    render(<UnionPicker />);
    fireEvent.click(screen.getByRole('button', { name: /With Dad/ }));

    const kids = created(MOM, DAD, OTHER);
    expect(kids).toHaveLength(2);
    const doc = usePedigreeStore.getState().document;
    expect(doc.partnerships[UNION].childrenIds).toHaveLength(2);
    expect(doc.partnerships[U2].childrenIds).toHaveLength(0);
    expect(Object.values(doc.twinGroups)[0].twinType).toBe(TwinType.Monozygotic);
  });
});
