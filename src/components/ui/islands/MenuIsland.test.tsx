import { render, screen, fireEvent } from '@testing-library/react';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { MenuIsland } from './MenuIsland';

beforeEach(() => {
  // Reset stores to clean state before each test.
  usePedigreeStore.getState().resetDocument();
  usePedigreeStore.temporal.getState().clear();
  useUIStore.getState().closeModal();
  useUIStore.getState().clearSelection();
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
