import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { MenuIsland } from './MenuIsland';

beforeEach(() => {
  // Reset stores to clean state before each test.
  usePedigreeStore.getState().resetDocument();
  usePedigreeStore.temporal.getState().clear();
  useUIStore.getState().closeModal();
  useUIStore.getState().clearSelection();
  useUIStore.getState().setCommandPaletteOpen(false);
  // Default to persistent storage; individual tests opt into the blocked state.
  useUIStore.setState({ storagePersistent: true });
  // Reset view preferences so Preferences-section tests are isolated.
  useUIStore.setState({ zenMode: false, showGrid: true, editingLocked: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders the document title text', () => {
  render(<MenuIsland />);
  // The store initialises with 'Untitled Pedigree'
  expect(screen.getByText('Untitled Pedigree')).toBeInTheDocument();
});

test('clicking the title reveals an input for editing', () => {
  render(<MenuIsland />);

  const titleBtn = screen.getByRole('button', { name: /untitled pedigree/i });
  fireEvent.click(titleBtn);

  const input = screen.getByRole('textbox', { name: /document title/i });
  expect(input).toBeInTheDocument();
});

test('pressing Enter in the title input commits the new title', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /untitled pedigree/i }));

  const input = screen.getByRole('textbox', { name: /document title/i });
  fireEvent.change(input, { target: { value: 'My Family' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(usePedigreeStore.getState().document.metadata.title).toBe('My Family');
  // After commit, input is gone and the button shows the new title.
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /my family/i })).toBeInTheDocument();
});

test('pressing Escape in the title input cancels the edit', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /untitled pedigree/i }));

  const input = screen.getByRole('textbox', { name: /document title/i });
  fireEvent.change(input, { target: { value: 'Should Not Save' } });
  fireEvent.keyDown(input, { key: 'Escape' });

  expect(usePedigreeStore.getState().document.metadata.title).toBe('Untitled Pedigree');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('pressing Escape while editing the title does not write the draft to the store', () => {
  // Spy on the store action the component captures at render. This catches any
  // commit regardless of blur/unmount ordering: the Escape path must never call
  // updateMetadata. (jsdom does not fire React's unmount-driven blur, so a plain
  // store-value assertion alone would pass even against the buggy onBlur=commit
  // wiring — the spy makes the contract explicit and discriminating.)
  const updateSpy = vi.spyOn(usePedigreeStore.getState(), 'updateMetadata');

  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /untitled pedigree/i }));

  const input = screen.getByRole('textbox', { name: /document title/i });
  fireEvent.change(input, { target: { value: 'Should Not Save' } });
  // Real browsers fire `blur` when Escape unmounts the focused input; fire it
  // explicitly so this regression exercises the onBlur path too.
  fireEvent.keyDown(input, { key: 'Escape' });
  fireEvent.blur(input);

  expect(updateSpy).not.toHaveBeenCalled();
  expect(usePedigreeStore.getState().document.metadata.title).toBe(
    'Untitled Pedigree'
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /untitled pedigree/i })
  ).toBeInTheDocument();
});

test('blurring the title input commits a changed value to the store', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /untitled pedigree/i }));

  const input = screen.getByRole('textbox', { name: /document title/i });
  fireEvent.change(input, { target: { value: 'Blur Commit' } });
  fireEvent.blur(input);

  expect(usePedigreeStore.getState().document.metadata.title).toBe('Blur Commit');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /blur commit/i })
  ).toBeInTheDocument();
});

test('☰ button opens a menu containing "Export"', () => {
  render(<MenuIsland />);

  const menuBtn = screen.getByRole('button', { name: /open document menu/i });
  fireEvent.click(menuBtn);

  expect(screen.getByRole('menuitem', { name: /export/i })).toBeInTheDocument();
});

test('clicking Export opens the export modal via the store', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /export/i }));

  expect(useUIStore.getState().activeModal).toBe('export');
});

test('☰ menu contains New, Open, Import, Export, Legend, Document details items', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  expect(screen.getByRole('menuitem', { name: /^new$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^open$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^import$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^export$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^legend$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /document details/i })).toBeInTheDocument();
});

test('menu closes when Escape is pressed while the dropdown is open', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  expect(screen.getByRole('menu')).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('clicking Document details in the menu opens the details popover', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /document details/i }));

  expect(screen.getByRole('dialog', { name: /document details/i })).toBeInTheDocument();
});

// ── New tests for Task 4.1 ────────────────────────────────────────────────────

test('menu contains a "Command palette" item that opens the command palette', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  const cmdItem = screen.getByRole('menuitem', { name: /command palette/i });
  expect(cmdItem).toBeInTheDocument();

  fireEvent.click(cmdItem);

  expect(useUIStore.getState().commandPaletteOpen).toBe(true);
});

test('menu contains a "Keyboard shortcuts" item that opens the shortcuts overlay', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  const helpItem = screen.getByRole('menuitem', { name: /keyboard shortcuts/i });
  expect(helpItem).toBeInTheDocument();

  fireEvent.click(helpItem);

  expect(useUIStore.getState().activeModal).toBe('shortcuts');
  // Clicking a menu item closes the dropdown.
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('menu items expose their keyboard shortcut without polluting the accessible name', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  // Accessible name stays the bare label (name-anchored queries still match)…
  const openItem = screen.getByRole('menuitem', { name: /^open$/i });
  // …while the shortcut is surfaced via aria-keyshortcuts for assistive tech.
  expect(openItem).toHaveAttribute('aria-keyshortcuts', '⌘O');

  const exportItem = screen.getByRole('menuitem', { name: /^export$/i });
  expect(exportItem).toHaveAttribute('aria-keyshortcuts', '⌘E');
});

test('menu closes after clicking the "Command palette" item', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /command palette/i }));

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('ArrowDown after opening the menu moves focus to the first menu item', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

  const items = screen.getAllByRole('menuitem');
  expect(document.activeElement).toBe(items[0]);
});

test('ArrowDown moves focus from first to second menu item (wrapping off the end)', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  const menu = screen.getByRole('menu');
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  fireEvent.keyDown(menu, { key: 'ArrowDown' });

  const items = screen.getAllByRole('menuitem');
  expect(document.activeElement).toBe(items[1]);
});

test('ArrowUp from the first item wraps to the last item', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  const menu = screen.getByRole('menu');
  // Move to first item first.
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  // ArrowUp from first should wrap to last.
  fireEvent.keyDown(menu, { key: 'ArrowUp' });

  const items = screen.getAllByRole('menuitem');
  expect(document.activeElement).toBe(items[items.length - 1]);
});

// ── Preferences submenu ──────────────────────────────────────────────────────

test('menu contains a Preferences section with Zen mode, View mode, and Toggle grid toggles', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  expect(
    screen.getByRole('menuitemcheckbox', { name: /zen mode/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitemcheckbox', { name: /view mode/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitemcheckbox', { name: /toggle grid/i })
  ).toBeInTheDocument();
});

test('the grid toggle reflects showGrid via aria-checked and flips the store', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  const gridItem = screen.getByRole('menuitemcheckbox', { name: /toggle grid/i });
  // Grid is on by default.
  expect(gridItem).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(gridItem);

  expect(useUIStore.getState().showGrid).toBe(false);
  // Dropdown stays open so the user can flip several preferences in a row.
  expect(gridItem).toHaveAttribute('aria-checked', 'false');
});

test('the View mode toggle mirrors editingLocked and flips it on click', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  const viewItem = screen.getByRole('menuitemcheckbox', { name: /view mode/i });
  expect(viewItem).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(viewItem);

  expect(useUIStore.getState().editingLocked).toBe(true);
  expect(viewItem).toHaveAttribute('aria-checked', 'true');
});

test('clicking Zen mode turns zen mode on but keeps the ☰ button discoverable', () => {
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /zen mode/i }));

  expect(useUIStore.getState().zenMode).toBe(true);
  // The ☰ button stays so the menu (and Preferences → Zen mode to exit) is
  // still reachable, but the title/save-status column collapses away.
  expect(
    screen.getByRole('button', { name: /open document menu/i })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /untitled pedigree/i })
  ).not.toBeInTheDocument();
});

test('zen mode collapses to just the ☰ button (no title/status column)', () => {
  useUIStore.setState({ zenMode: true });
  render(<MenuIsland />);

  expect(
    screen.getByRole('button', { name: /open document menu/i })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /untitled pedigree/i })
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/saved locally/i)).not.toBeInTheDocument();
});

test('the ☰ menu still opens in zen mode, exposing Preferences to exit', () => {
  useUIStore.setState({ zenMode: true });
  render(<MenuIsland />);

  fireEvent.click(screen.getByRole('button', { name: /open document menu/i }));

  const zenToggle = screen.getByRole('menuitemcheckbox', { name: /zen mode/i });
  expect(zenToggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(zenToggle);
  expect(useUIStore.getState().zenMode).toBe(false);
});

test('local-data notice is never rendered (notice removed)', () => {
  // The one-time local-data notice has been removed from MenuIsland.
  render(<MenuIsland />);
  expect(
    screen.queryByText(/saved only in this browser/i)
  ).not.toBeInTheDocument();
});

// ── Storage-blocked persistence warning ──────────────────────────────────────

test('shows the "Saved locally" status when storage is persistent', () => {
  useUIStore.setState({ storagePersistent: true });
  render(<MenuIsland />);

  expect(screen.getByText(/saved locally/i)).toBeInTheDocument();
  expect(screen.queryByText(/not saved/i)).not.toBeInTheDocument();
});

test('shows a "Not saved" warning instead of "Saved locally" when storage is blocked', () => {
  useUIStore.setState({ storagePersistent: false });
  render(<MenuIsland />);

  expect(screen.getByText(/not saved/i)).toBeInTheDocument();
  expect(screen.queryByText(/saved locally/i)).not.toBeInTheDocument();
});
