import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../stores/uiStore';
import { HelpOverlay } from './HelpOverlay';

beforeEach(() => {
  useUIStore.setState({ activeModal: 'help' });
});

afterEach(() => {
  useUIStore.getState().closeModal();
});

test('renders the quick-start heading when the help modal is open', () => {
  render(<HelpOverlay />);
  expect(
    screen.getByRole('heading', { name: /how to build your first pedigree/i }),
  ).toBeInTheDocument();
});

test('shows the clinical disclaimer verbatim', () => {
  render(<HelpOverlay />);
  expect(
    screen.getByText(/does not provide medical advice, diagnosis, or risk assessment/i),
  ).toBeInTheDocument();
});

test('feedback link points to the clintech mailto', () => {
  render(<HelpOverlay />);
  const link = screen.getByRole('link', { name: /send feedback/i });
  expect(link).toHaveAttribute(
    'href',
    'mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback',
  );
});

test('shows the app name and version in the About footer', () => {
  render(<HelpOverlay />);
  expect(screen.getByText(new RegExp(`Pedigree Canvas v${__APP_VERSION__}`))).toBeInTheDocument();
});

test('"view all keyboard shortcuts" switches the active modal to shortcuts', () => {
  render(<HelpOverlay />);
  fireEvent.click(screen.getByRole('button', { name: /view all keyboard shortcuts/i }));
  expect(useUIStore.getState().activeModal).toBe('shortcuts');
});

test('renders nothing interactive when the help modal is closed', () => {
  useUIStore.setState({ activeModal: null });
  render(<HelpOverlay />);
  expect(
    screen.queryByRole('heading', { name: /how to build your first pedigree/i }),
  ).not.toBeInTheDocument();
});
