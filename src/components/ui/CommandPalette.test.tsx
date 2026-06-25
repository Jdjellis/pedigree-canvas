/**
 * Tests for the CommandPalette component.
 *
 * Radix Dialog renders into a portal (document.body), so we query via
 * `screen` which searches the full document, not just the render container.
 *
 * Store reset is done via `useUIStore.setState` in `beforeEach` to guarantee
 * a clean slate regardless of test ordering.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { CommandPalette } from './CommandPalette';

/** Reset all UI store state before each test. */
beforeEach(() => {
  useUIStore.setState({
    commandPaletteOpen: false,
    activeModal: null,
    selectedIds: new Set<string>(),
  });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test('renders nothing when commandPaletteOpen is false', () => {
  useUIStore.setState({ commandPaletteOpen: false });
  render(<CommandPalette />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('renders the dialog when commandPaletteOpen is true', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('renders a search input when open', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test('typing "export" filters the list to commands matching that query', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);

  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'export' } });

  // "Export…" should be in the list
  expect(screen.getByRole('option', { name: /export/i })).toBeInTheDocument();
  // "New document" should not appear with that query
  expect(screen.queryByRole('option', { name: /new document/i })).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Keyboard: Enter runs the highlighted command and closes the palette
// ---------------------------------------------------------------------------

test('pressing Enter on the highlighted export command opens the export modal and closes the palette', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);

  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'export' } });

  // The first (only) match should be highlighted; Enter should run it.
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(useUIStore.getState().activeModal).toBe('export');
  expect(useUIStore.getState().commandPaletteOpen).toBe(false);
});

// ---------------------------------------------------------------------------
// Keyboard: ArrowDown moves the highlight
// ---------------------------------------------------------------------------

test('ArrowDown moves highlight to the second item', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);

  const input = screen.getByRole('combobox');

  // With empty query all commands are shown; at least 2 should be present.
  const optionsBefore = screen.getAllByRole('option');
  expect(optionsBefore.length).toBeGreaterThan(1);

  fireEvent.keyDown(input, { key: 'ArrowDown' });

  // After one ArrowDown, index 1 should be highlighted (aria-selected=true).
  const options = screen.getAllByRole('option');
  expect(options[1]).toHaveAttribute('aria-selected', 'true');
});

// ---------------------------------------------------------------------------
// Keyboard: Escape closes the palette
// ---------------------------------------------------------------------------

test('pressing Escape closes the palette via store', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);

  // Radix Dialog fires onOpenChange(false) when Escape is pressed, but we
  // test by calling setCommandPaletteOpen(false) via onOpenChange; simulate
  // Radix's own Escape handling via a keyDown on the dialog element instead.
  fireEvent.keyDown(document, { key: 'Escape' });

  expect(useUIStore.getState().commandPaletteOpen).toBe(false);
});

// ---------------------------------------------------------------------------
// State reset on open
// ---------------------------------------------------------------------------

test('query is empty when the palette opens', () => {
  // First render with open=false, then flip to true
  useUIStore.setState({ commandPaletteOpen: false });
  const { rerender } = render(<CommandPalette />);

  // Set some query state by rendering open, typing, closing, reopening
  useUIStore.setState({ commandPaletteOpen: true });
  rerender(<CommandPalette />);

  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'zoom' } });
  expect((input as HTMLInputElement).value).toBe('zoom');

  // Close and reopen
  useUIStore.setState({ commandPaletteOpen: false });
  rerender(<CommandPalette />);
  useUIStore.setState({ commandPaletteOpen: true });
  rerender(<CommandPalette />);

  const freshInput = screen.getByRole('combobox');
  expect((freshInput as HTMLInputElement).value).toBe('');
});

// ---------------------------------------------------------------------------
// ArrowUp wraps around
// ---------------------------------------------------------------------------

test('ArrowUp from index 0 wraps to the last item', () => {
  useUIStore.setState({ commandPaletteOpen: true });
  render(<CommandPalette />);

  const input = screen.getByRole('combobox');
  const options = screen.getAllByRole('option');
  const lastIndex = options.length - 1;

  fireEvent.keyDown(input, { key: 'ArrowUp' });

  const updatedOptions = screen.getAllByRole('option');
  expect(updatedOptions[lastIndex]).toHaveAttribute('aria-selected', 'true');
});
