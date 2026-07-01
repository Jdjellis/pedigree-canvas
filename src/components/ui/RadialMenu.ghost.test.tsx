// src/components/ui/RadialMenu.ghost.test.tsx
//
// Coverage for the dwell-to-discover "ghost twins" affordance: hovering the
// Sibling or Child button for ~0.8s reveals faded MZ/DZ previews flanking it
// (no ⌥ needed), and clicking one creates the twins.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity, RelationshipType, TwinType } from '../../types/enums';

const MOM = 'mom';
const DAD = 'dad';
const UNION = 'u1';

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
    id: UNION, type: RelationshipType.Partnership, partner1Id: MOM, partner2Id: DAD, childrenIds: [],
  });
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  ui.hideUnionPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(MOM, { x: 0, y: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  seedCoupleAndOpenMenu();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RadialMenu ghost twins (dwell to discover)', () => {
  it('does not reveal ghosts before the dwell delay elapses', () => {
    render(<RadialMenu />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Child' }));
    act(() => {
      vi.advanceTimersByTime(400); // still under the ~800ms threshold
    });
    expect(screen.getByTitle('Add Monozygotic (MZ) twin children').className).not.toMatch(/ghostActive/);
  });

  it('reveals the child MZ/DZ ghosts after dwelling on Child', () => {
    render(<RadialMenu />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Child' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTitle('Add Monozygotic (MZ) twin children').className).toMatch(/ghostActive/);
    expect(screen.getByTitle('Add Dizygotic (DZ) twin children').className).toMatch(/ghostActive/);
    // The sibling ghosts stay hidden — only the dwelled group reveals.
    expect(screen.getByTitle('Add Monozygotic twin (MZ)').className).not.toMatch(/ghostActive/);
  });

  it('reveals the sibling ghosts after dwelling on Sibling', () => {
    render(<RadialMenu />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Sibling' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTitle('Add Monozygotic twin (MZ)').className).toMatch(/ghostActive/);
    expect(screen.getByTitle('Add Dizygotic twin (DZ)').className).toMatch(/ghostActive/);
  });

  it('hides the ghosts shortly after the pointer leaves', () => {
    render(<RadialMenu />);
    const child = screen.getByRole('button', { name: 'Child' });
    fireEvent.mouseEnter(child);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTitle('Add Monozygotic (MZ) twin children').className).toMatch(/ghostActive/);

    fireEvent.mouseLeave(child);
    act(() => {
      vi.advanceTimersByTime(200); // past the ~140ms grace period
    });
    expect(screen.getByTitle('Add Monozygotic (MZ) twin children').className).not.toMatch(/ghostActive/);
  });

  it('clicking a revealed ghost creates the twin children', () => {
    render(<RadialMenu />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Child' }));
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.click(screen.getByTitle('Add Dizygotic (DZ) twin children'));

    const doc = usePedigreeStore.getState().document;
    const kids = Object.values(doc.individuals).filter((i) => i.id !== MOM && i.id !== DAD);
    expect(kids).toHaveLength(2);
    const groups = Object.values(doc.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Dizygotic);
  });
});
