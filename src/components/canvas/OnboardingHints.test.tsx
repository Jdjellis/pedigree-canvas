import { render, screen, fireEvent } from '@testing-library/react';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { ONBOARDED_STORAGE_KEY } from './onboarding';
import { OnboardingHints } from './OnboardingHints';

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.setState({ activeModal: null, onboarded: false });
  localStorage.removeItem(ONBOARDED_STORAGE_KEY);
});

describe('OnboardingHints with 0 individuals', () => {
  test('renders the Pedigree Canvas wordmark', () => {
    render(<OnboardingHints />);
    expect(screen.getByText('Pedigree Canvas')).toBeInTheDocument();
  });

  test('renders the browser-local save reassurance', () => {
    render(<OnboardingHints />);
    expect(screen.getByText(/saved only in this browser/i)).toBeInTheDocument();
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

  test('renders the ⌘K shortcut hint', () => {
    render(<OnboardingHints />);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });
});

describe('OnboardingHints with 1 individual (seed)', () => {
  test('still renders onboarding when exactly one (seed) individual exists', () => {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);

    render(<OnboardingHints />);
    expect(screen.getByText('Pedigree Canvas')).toBeInTheDocument();
  });

  test('renders the hover-to-add-relatives cue', () => {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);

    render(<OnboardingHints />);
    expect(
      screen.getByText(/hover to add relatives/i)
    ).toBeInTheDocument();
  });

  test('renders the default-sex tip referencing the ▢ ● ◇ control', () => {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);

    render(<OnboardingHints />);
    expect(screen.getByText(/▢ ● ◇/)).toBeInTheDocument();
  });
});

describe('OnboardingHints with ≥2 individuals', () => {
  test('renders nothing when two or more individuals exist', () => {
    const a = createDefaultIndividual({ position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ position: { x: 100, y: 0 } });
    usePedigreeStore.getState().addIndividual(a);
    usePedigreeStore.getState().addIndividual(b);

    const { container } = render(<OnboardingHints />);
    expect(container.firstChild).toBeNull();
  });
});

describe('OnboardingHints with onboarded flag set', () => {
  test('renders nothing when onboarded flag is set', () => {
    useUIStore.getState().setOnboarded();

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

  test('clicking Help opens the help modal', () => {
    render(<OnboardingHints />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useUIStore.getState().activeModal).toBe('help');
  });
});
