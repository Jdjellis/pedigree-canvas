/**
 * Tests for the ShortcutsOverlay component.
 *
 * Radix Dialog renders into a portal (document.body), so we use `screen`
 * which searches the full document tree.
 *
 * Store state is reset in `beforeEach` for test isolation.
 */
import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, test, expect } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { ShortcutsOverlay } from './ShortcutsOverlay';

/** Open or close the shortcuts modal via the store. */
function setModal(modal: 'shortcuts' | null): void {
  act(() => {
    useUIStore.setState({ activeModal: modal });
  });
}

/** Reset UI store to defaults before each test. */
beforeEach(() => {
  act(() => {
    useUIStore.setState({ activeModal: null });
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('when activeModal is not shortcuts', () => {
  test('renders nothing (no dialog in the DOM)', () => {
    setModal(null);
    render(<ShortcutsOverlay />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('when activeModal is shortcuts', () => {
  test('renders a dialog with heading "Keyboard shortcuts"', () => {
    setModal('shortcuts');
    render(<ShortcutsOverlay />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
  });

  test('includes a row mentioning the Command palette binding', () => {
    setModal('shortcuts');
    render(<ShortcutsOverlay />);

    // The overlay must list "Command palette" as a recognisable shortcut
    expect(screen.getByText(/command palette/i)).toBeInTheDocument();
  });
});
