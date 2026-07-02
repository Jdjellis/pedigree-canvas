import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import { ActionsIsland } from './ActionsIsland';

beforeEach(() => {
  // Reset UI store to clean state before each test.
  useUIStore.setState({
    activeModal: null,
    propertiesPanelOpen: false,
    zenMode: false,
    editingLocked: false,
  });
});

test('renders nothing while zen mode is active', () => {
  useUIStore.setState({ zenMode: true });
  const { container } = render(<ActionsIsland />);

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
});

test('keeps Export in view mode but hides the properties-panel toggle', () => {
  useUIStore.setState({ editingLocked: true });
  render(<ActionsIsland />);

  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Toggle properties panel' })
  ).not.toBeInTheDocument();
});

test('renders Export and Toggle properties panel buttons', () => {
  render(<ActionsIsland />);

  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Toggle properties panel' })
  ).toBeInTheDocument();
});

test('clicking Export opens the export modal via exportDocument', () => {
  render(<ActionsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));

  expect(useUIStore.getState().activeModal).toBe('export');
});

test('clicking toggle flips propertiesPanelOpen from false to true', () => {
  render(<ActionsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle properties panel' }));

  expect(useUIStore.getState().propertiesPanelOpen).toBe(true);
});

test('clicking toggle flips propertiesPanelOpen from true to false', () => {
  useUIStore.setState({ propertiesPanelOpen: true });
  render(<ActionsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle properties panel' }));

  expect(useUIStore.getState().propertiesPanelOpen).toBe(false);
});

test('toggle button reflects aria-pressed from propertiesPanelOpen (false)', () => {
  render(<ActionsIsland />);
  const toggleBtn = screen.getByRole('button', { name: 'Toggle properties panel' });

  expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
});

test('toggle button reflects aria-pressed from propertiesPanelOpen (true)', () => {
  useUIStore.setState({ propertiesPanelOpen: true });
  render(<ActionsIsland />);
  const toggleBtn = screen.getByRole('button', { name: 'Toggle properties panel' });

  expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
});
