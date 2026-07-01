import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import { HelpIsland } from './HelpIsland';

beforeEach(() => {
  useUIStore.getState().closeModal();
});

test('renders the help button by accessible name', () => {
  render(<HelpIsland />);
  expect(screen.getByRole('button', { name: 'Help & About' })).toBeInTheDocument();
});

test('clicking the button opens the help modal', () => {
  render(<HelpIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Help & About' }));
  expect(useUIStore.getState().activeModal).toBe('help');
});

test('button has correct title attribute', () => {
  render(<HelpIsland />);
  expect(screen.getByRole('button', { name: 'Help & About' })).toHaveAttribute(
    'title',
    'Help & About',
  );
});
