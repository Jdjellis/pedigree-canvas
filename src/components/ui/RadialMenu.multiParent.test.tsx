// src/components/ui/RadialMenu.multiParent.test.tsx
//
// Multi-parentage (#64): clicking "Parent" on a child who already has a complete
// parent couple attaches a SECOND parent set (e.g. a biological couple alongside
// an adoptive one) rather than being a no-op. The new couple is placed clear of
// the first and its descent edge defaults to biological (solid), to be switched
// to adoptive in the properties panel.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { RelationshipType } from '../../types/enums';
import type { PartnershipRelationship, ParentChildRelationship } from '../../types/pedigree';

const CHILD = 'child';

/** Seed a child with one COMPLETE parent couple (both slots filled). */
function seedChildWithCouple(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  const child = createDefaultIndividual({ id: CHILD, generation: 1, position: { x: 0, y: 0 } });
  const dad = createDefaultIndividual({ id: 'dad', generation: 0, position: { x: -60, y: -150 } });
  const mom = createDefaultIndividual({ id: 'mom', generation: 0, position: { x: 60, y: -150 } });
  store.addIndividual(child);
  const union: PartnershipRelationship = {
    id: 'u-bio', type: RelationshipType.Partnership,
    partner1Id: dad.id, partner2Id: mom.id, childrenIds: [child.id],
  };
  const link: ParentChildRelationship = {
    id: 'l-bio', type: RelationshipType.ParentChild,
    parentPartnershipId: 'u-bio', childId: child.id,
  };
  store.addParentsForChild(dad, mom, union, link, child.id, 1);
}

beforeEach(() => {
  seedChildWithCouple();
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  ui.hideUnionPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(CHILD, { x: 0, y: 0 });
});

describe('RadialMenu multi-parentage (#64)', () => {
  it('keeps the Parent button enabled when a complete couple already exists', () => {
    render(<RadialMenu />);
    const parent = screen.getByRole('button', { name: 'Parent' });
    expect(parent.className).not.toMatch(/disabled/);
    expect(parent.getAttribute('title')).toMatch(/another parent set/i);
  });

  it('attaches a second parent set with its own partnership and link on click', () => {
    render(<RadialMenu />);

    const linksBefore = Object.values(usePedigreeStore.getState().document.parentChildLinks)
      .filter((l) => l.childId === CHILD).length;
    const partnershipsBefore = Object.keys(usePedigreeStore.getState().document.partnerships).length;

    fireEvent.click(screen.getByRole('button', { name: 'Parent' }));

    const doc = usePedigreeStore.getState().document;
    const childLinks = Object.values(doc.parentChildLinks).filter((l) => l.childId === CHILD);
    expect(childLinks).toHaveLength(linksBefore + 1);
    expect(Object.keys(doc.partnerships)).toHaveLength(partnershipsBefore + 1);

    // The new set is a distinct partnership that also lists the child, with two
    // fresh present partners, and a biological (non-adoptive) default edge.
    const newLink = childLinks.find((l) => l.parentPartnershipId !== 'u-bio');
    expect(newLink).toBeDefined();
    expect(newLink!.isAdoptive).toBeFalsy();
    const newUnion = doc.partnerships[newLink!.parentPartnershipId];
    expect(newUnion.childrenIds).toContain(CHILD);
    expect(newUnion.partner1Id).toBeDefined();
    expect(newUnion.partner2Id).toBeDefined();
  });

  it('places the second couple clear (to the right) of the first', () => {
    render(<RadialMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Parent' }));

    const doc = usePedigreeStore.getState().document;
    const firstRight = Math.max(doc.individuals['dad'].position.x, doc.individuals['mom'].position.x);
    const newLink = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === CHILD && l.parentPartnershipId !== 'u-bio',
    )!;
    const newUnion = doc.partnerships[newLink.parentPartnershipId];
    const newXs = [newUnion.partner1Id!, newUnion.partner2Id!].map((id) => doc.individuals[id].position.x);
    // Every new partner sits to the right of the existing couple's right edge.
    expect(Math.min(...newXs)).toBeGreaterThan(firstRight);
  });
});
