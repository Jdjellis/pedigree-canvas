import { render, screen } from '@testing-library/react';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { HistoryIsland } from './HistoryIsland';

beforeEach(() => {
  // Reset pedigree store to a clean document state before each test.
  usePedigreeStore.getState().resetDocument();
  usePedigreeStore.temporal.getState().clear();
  useUIStore.setState({ editingLocked: false });
});

test('renders Undo and Redo buttons by accessible name', () => {
  render(<HistoryIsland />);

  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
});

test('Undo button has the correct title attribute', () => {
  render(<HistoryIsland />);
  const undoBtn = screen.getByRole('button', { name: 'Undo' });
  expect(undoBtn).toHaveAttribute('title', expect.stringContaining('Undo'));
});

test('Redo button has the correct title attribute', () => {
  render(<HistoryIsland />);
  const redoBtn = screen.getByRole('button', { name: 'Redo' });
  expect(redoBtn).toHaveAttribute('title', expect.stringContaining('Redo'));
});

test('renders nothing in view mode (nothing to undo/redo when read-only)', () => {
  useUIStore.setState({ editingLocked: true });
  const { container } = render(<HistoryIsland />);

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
});
