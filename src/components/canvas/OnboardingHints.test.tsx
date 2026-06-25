import { render, screen, fireEvent } from '@testing-library/react';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { OnboardingHints } from './OnboardingHints';

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.setState({ activeModal: null });
});

describe('OnboardingHints with 0 individuals', () => {
  test('renders the Pedigree wordmark', () => {
    render(<OnboardingHints />);
    expect(screen.getByText('Pedigree')).toBeInTheDocument();
  });

  test('renders an Open button by accessible name', () => {
    render(<OnboardingHints />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  test('renders an Import button by accessible name', () => {
    render(<OnboardingHints />);
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  test('renders a Help button by accessible name', () => {
    render(<OnboardingHints />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  test('renders browser-local save reassurance text', () => {
    render(<OnboardingHints />);
    expect(
      screen.getByText(/saved only in this browser/i)
    ).toBeInTheDocument();
  });
});

describe('OnboardingHints with ≥1 individual', () => {
  test('renders nothing when one individual exists', () => {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);

    const { container } = render(<OnboardingHints />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when multiple individuals exist', () => {
    const a = createDefaultIndividual({ position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ position: { x: 100, y: 0 } });
    usePedigreeStore.getState().addIndividual(a);
    usePedigreeStore.getState().addIndividual(b);

    const { container } = render(<OnboardingHints />);
    expect(container.firstChild).toBeNull();
  });
});

describe('OnboardingHints button actions', () => {
  test('clicking Import opens the import modal', () => {
    render(<OnboardingHints />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(useUIStore.getState().activeModal).toBe('import');
  });

  test('clicking Help opens the shortcuts modal', () => {
    render(<OnboardingHints />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useUIStore.getState().activeModal).toBe('shortcuts');
  });
});
