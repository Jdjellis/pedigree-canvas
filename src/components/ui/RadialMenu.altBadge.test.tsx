// src/components/ui/RadialMenu.altBadge.test.tsx
//
// Coverage for the persistent ⌥ discovery badge on the Sibling and Child
// buttons. The badge is an aria-hidden decoration, so the buttons must keep
// their plain accessible names ("Sibling"/"Child") that the rest of the
// radial-menu tests query by.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RadialMenu } from './RadialMenu';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';

const ROOT = 'root';

beforeEach(() => {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(createDefaultIndividual({ id: ROOT, generation: 0, position: { x: 0, y: 0 } }));
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  ui.hideUnionPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
  ui.showRadialMenu(ROOT, { x: 0, y: 0 });
});

describe('RadialMenu ⌥ discovery badge', () => {
  it('shows a ⌥ badge on both the Sibling and Child buttons', () => {
    render(<RadialMenu />);
    const sibling = screen.getByRole('button', { name: 'Sibling' });
    const child = screen.getByRole('button', { name: 'Child' });
    expect(within(sibling).getByText('⌥')).toBeTruthy();
    expect(within(child).getByText('⌥')).toBeTruthy();
  });

  it('keeps the buttons’ accessible names plain, and adds no badge to Parent/Partner', () => {
    render(<RadialMenu />);
    // Would throw if the ⌥ glyph leaked into the accessible name.
    expect(screen.getByRole('button', { name: 'Sibling' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Child' })).toBeTruthy();

    const parent = screen.getByRole('button', { name: 'Parent' });
    const partner = screen.getByRole('button', { name: 'Partner' });
    expect(within(parent).queryByText('⌥')).toBeNull();
    expect(within(partner).queryByText('⌥')).toBeNull();
  });
});
