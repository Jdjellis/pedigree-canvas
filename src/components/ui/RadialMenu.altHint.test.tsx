// src/components/ui/RadialMenu.altHint.test.tsx
//
// Coverage for the twins-discovery affordance: a persistent ⌥ badge + a
// "Hold ⌥ for twins" hover tooltip on the Sibling and Child buttons. The
// decorations must be aria-hidden so the buttons keep their plain accessible
// names ("Sibling"/"Child") that the rest of the flow queries by.
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

describe('RadialMenu twins-discovery affordance', () => {
  it('shows a ⌥ hint tooltip on both the Sibling and Child buttons', () => {
    render(<RadialMenu />);

    const sibling = screen.getByRole('button', { name: 'Sibling' });
    const child = screen.getByRole('button', { name: 'Child' });

    expect(within(sibling).getByText('Hold ⌥ for twins')).toBeTruthy();
    expect(within(child).getByText('Hold ⌥ for twins')).toBeTruthy();
  });

  it('keeps the buttons’ accessible names plain (decorations are aria-hidden)', () => {
    render(<RadialMenu />);

    // If the ⌥ badge / tooltip leaked into the accessible name these queries
    // (relied on across the radial-menu tests) would throw.
    expect(screen.getByRole('button', { name: 'Sibling' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Child' })).toBeTruthy();

    // The Parent/Partner buttons carry no twin affordance.
    const parent = screen.getByRole('button', { name: 'Parent' });
    expect(within(parent).queryByText('Hold ⌥ for twins')).toBeNull();
  });
});
