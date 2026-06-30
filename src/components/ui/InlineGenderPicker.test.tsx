// src/components/ui/InlineGenderPicker.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InlineGenderPicker } from './InlineGenderPicker';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { GenderIdentity } from '../../types/enums';

const TARGET = 'target-1';

function seedTarget(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(
    createDefaultIndividual({ id: TARGET, genderIdentity: GenderIdentity.Unknown }),
  );
  const ui = useUIStore.getState();
  ui.hideGenderPicker();
  if (ui.editingLocked) ui.toggleEditingLocked();
}

function genderOf(id: string): GenderIdentity {
  return usePedigreeStore.getState().document.individuals[id].genderIdentity;
}

describe('InlineGenderPicker', () => {
  beforeEach(() => {
    seedTarget();
  });

  it('renders nothing when no target is set', () => {
    const { container } = render(<InlineGenderPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the gender buttons when a target is set', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    expect(screen.getByRole('button', { name: 'Woman' })).toBeInTheDocument();
  });

  it('clicking a gender commits it and closes the picker', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Man' }));
    expect(genderOf(TARGET)).toBe(GenderIdentity.Man);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('pressing F commits Woman and closes', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.keyDown(window, { key: 'f' });
    expect(genderOf(TARGET)).toBe(GenderIdentity.Woman);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('Escape dismisses without changing the shape', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(genderOf(TARGET)).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('renders nothing when editing is locked', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    useUIStore.getState().toggleEditingLocked();
    const { container } = render(<InlineGenderPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('self-clears when the target individual is removed (radial menu gate is not left stuck)', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);

    // Remove the individual while the picker is still open.
    act(() => {
      usePedigreeStore.getState().removeIndividual(TARGET);
    });

    // The self-clear effect must fire: targetId becomes null so the radial
    // menu gate (which suppresses the menu while targetId is set) is released.
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('Enter dismisses without changing the shape', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(genderOf(TARGET)).toBe(GenderIdentity.Unknown);
    expect(useUIStore.getState().genderPicker.targetId).toBeNull();
  });

  it('does not leak to bubble-phase listeners (capture + stopPropagation)', () => {
    useUIStore.getState().showGenderPicker(TARGET);
    render(<InlineGenderPicker />);

    const spy = vi.fn();
    window.addEventListener('keydown', spy); // bubble phase
    fireEvent.keyDown(window, { key: 'm' });
    window.removeEventListener('keydown', spy);

    // The capture-phase handler called stopPropagation; the bubble spy must not fire.
    expect(spy).not.toHaveBeenCalled();
  });
});
