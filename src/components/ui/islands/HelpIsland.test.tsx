import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import { HelpIsland } from './HelpIsland';

beforeEach(() => {
  useUIStore.getState().closeModal();
  useUIStore.setState({ zenMode: false });
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

test('renders nothing in zen mode (peripheral chrome the focus mode strips)', () => {
  useUIStore.setState({ zenMode: true });
  const { container } = render(<HelpIsland />);

  expect(container).toBeEmptyDOMElement();
  expect(
    screen.queryByRole('button', { name: 'Help & About' })
  ).not.toBeInTheDocument();
});
