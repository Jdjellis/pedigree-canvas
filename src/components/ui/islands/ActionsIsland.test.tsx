import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../../stores/uiStore';
import {
  usePedigreeStore,
  createDefaultDocument,
} from '../../../stores/pedigreeStore';
import { wideMultiFounderChart } from '../../../utils/__fixtures__/pedigrees';
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

test('renders a Reformat pedigree button in edit mode', () => {
  render(<ActionsIsland />);

  expect(
    screen.getByRole('button', { name: 'Reformat pedigree' })
  ).toBeInTheDocument();
});

test('hides Reformat pedigree in view mode (read-only)', () => {
  useUIStore.setState({ editingLocked: true });
  render(<ActionsIsland />);

  expect(
    screen.queryByRole('button', { name: 'Reformat pedigree' })
  ).not.toBeInTheDocument();
});

test('hides Reformat pedigree in zen mode', () => {
  useUIStore.setState({ zenMode: true });
  render(<ActionsIsland />);

  expect(
    screen.queryByRole('button', { name: 'Reformat pedigree' })
  ).not.toBeInTheDocument();
});

test('clicking Reformat pedigree re-tidies the document', () => {
  // Seed a wide multi-founder chart so a reformat has something to move.
  const layout = wideMultiFounderChart().doc;
  usePedigreeStore.getState().setDocument({
    ...createDefaultDocument(),
    individuals: layout.individuals,
    partnerships: layout.partnerships,
    parentChildLinks: layout.parentChildLinks,
    twinGroups: layout.twinGroups ?? {},
  });
  const before = usePedigreeStore.getState().document.individuals;

  render(<ActionsIsland />);
  fireEvent.click(screen.getByRole('button', { name: 'Reformat pedigree' }));

  expect(usePedigreeStore.getState().document.individuals).not.toEqual(before);
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
