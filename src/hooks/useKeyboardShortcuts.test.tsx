/**
 * Tests for the useKeyboardShortcuts hook.
 *
 * The hook registers a `keydown` listener on `window`. We drive it by
 * dispatching `fireEvent.keyDown` on `document` (which bubbles to window).
 *
 * Store state is reset in `beforeEach` for test isolation.
 */
import { render, act, fireEvent } from '@testing-library/react';
import { beforeEach, describe, test, expect } from 'vitest';
import { useUIStore } from '../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Test harness — a minimal component that calls the hook once.
// ---------------------------------------------------------------------------

function TestHarness(): null {
  useKeyboardShortcuts();
  return null;
}

/** Reset stores to defaults before each test. */
beforeEach(() => {
  act(() => {
    usePedigreeStore.getState().resetDocument();
    useUIStore.setState({
      activeTool: 'select',
      activeModal: null,
      commandPaletteOpen: false,
      selectedIds: new Set<string>(),
      editingLocked: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Tool hotkeys — plain key presses when focus is on document.body
// ---------------------------------------------------------------------------

describe('tool hotkeys (not in an input)', () => {
  test('pressing v sets activeTool to select', () => {
    render(<TestHarness />);

    fireEvent.keyDown(document.body, { key: 'v' });

    expect(useUIStore.getState().activeTool).toBe('select');
  });

  test('pressing h sets activeTool to hand', () => {
    render(<TestHarness />);

    fireEvent.keyDown(document.body, { key: 'h' });

    expect(useUIStore.getState().activeTool).toBe('hand');
  });

  test('pressing ? opens the shortcuts modal', () => {
    render(<TestHarness />);

    fireEvent.keyDown(document.body, { key: '?' });

    expect(useUIStore.getState().activeModal).toBe('shortcuts');
  });
});

// ---------------------------------------------------------------------------
// Input-guard — hotkeys must NOT fire when an input element is focused
// ---------------------------------------------------------------------------

describe('input-guard (hotkeys silenced when typing)', () => {
  test('pressing v inside an INPUT does not change the active tool away from hand', () => {
    render(<TestHarness />);

    // Pre-condition: start on a different tool
    act(() => {
      useUIStore.setState({ activeTool: 'hand' });
    });

    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'v' });

    // Still 'hand' — the guard prevented the switch
    expect(useUIStore.getState().activeTool).toBe('hand');

    document.body.removeChild(input);
  });

  test('pressing h inside a TEXTAREA does not change the active tool', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select' });
    });

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    fireEvent.keyDown(textarea, { key: 'h' });

    expect(useUIStore.getState().activeTool).toBe('select');

    document.body.removeChild(textarea);
  });

  test('pressing t inside a SELECT does not change the active tool', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select' });
    });

    const select = document.createElement('select');
    document.body.appendChild(select);

    fireEvent.keyDown(select, { key: 't' });

    expect(useUIStore.getState().activeTool).toBe('select');

    document.body.removeChild(select);
  });
});

// ---------------------------------------------------------------------------
// Number + letter tool shortcuts — all tool mappings and lock toggle
// ---------------------------------------------------------------------------

describe('number + letter tool shortcuts', () => {
  test.each([
    ['1', 'select'],
    ['2', 'text'],
    ['3', 'eraser'],
    ['t', 'text'],
    ['e', 'eraser'],
    ['h', 'hand'],
    ['v', 'select'],
  ] as const)('pressing %s sets activeTool to %s', (key, tool) => {
    render(<TestHarness />);

    // Seed a different tool so each press is a real change
    act(() => {
      useUIStore.setState({ activeTool: 'hand' });
    });

    fireEvent.keyDown(document.body, { key });

    expect(useUIStore.getState().activeTool).toBe(tool);
  });

  test('pressing l toggles editingLocked to true', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ editingLocked: false });
    });

    fireEvent.keyDown(document.body, { key: 'l' });

    expect(useUIStore.getState().editingLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edit-lock gate — t/2 and e/3 must NOT switch tools when editingLocked
// ---------------------------------------------------------------------------

describe('edit-lock gate on text and eraser shortcuts', () => {
  test('pressing t while editingLocked leaves activeTool unchanged', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: true });
    });

    fireEvent.keyDown(document.body, { key: 't' });

    expect(useUIStore.getState().activeTool).toBe('select');
  });

  test('pressing 2 while editingLocked leaves activeTool unchanged', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: true });
    });

    fireEvent.keyDown(document.body, { key: '2' });

    expect(useUIStore.getState().activeTool).toBe('select');
  });

  test('pressing e while editingLocked leaves activeTool unchanged', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: true });
    });

    fireEvent.keyDown(document.body, { key: 'e' });

    expect(useUIStore.getState().activeTool).toBe('select');
  });

  test('pressing 3 while editingLocked leaves activeTool unchanged', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: true });
    });

    fireEvent.keyDown(document.body, { key: '3' });

    expect(useUIStore.getState().activeTool).toBe('select');
  });

  test('pressing t while NOT locked switches to text', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: false });
    });

    fireEvent.keyDown(document.body, { key: 't' });

    expect(useUIStore.getState().activeTool).toBe('text');
  });

  test('pressing e while NOT locked switches to eraser', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select', editingLocked: false });
    });

    fireEvent.keyDown(document.body, { key: 'e' });

    expect(useUIStore.getState().activeTool).toBe('eraser');
  });
});

// ---------------------------------------------------------------------------
// Delete / Backspace — removes selected individuals via deleteSelectedAction
// ---------------------------------------------------------------------------

describe('Delete / Backspace key removes selected individuals', () => {
  function addUnselectedIndividual(): void {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);
  }

  function addAndSelectIndividual(): string {
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);
    useUIStore.getState().select(individual.id);
    return individual.id;
  }

  test('pressing Delete removes selected individuals from the document', () => {
    render(<TestHarness />);
    addUnselectedIndividual(); // ensures at least one remains after delete
    addAndSelectIndividual();

    fireEvent.keyDown(document.body, { key: 'Delete' });

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
  });

  test('pressing Delete clears the selection', () => {
    render(<TestHarness />);
    addUnselectedIndividual(); // ensures at least one remains after delete
    addAndSelectIndividual();

    fireEvent.keyDown(document.body, { key: 'Delete' });

    expect(useUIStore.getState().selectedIds.size).toBe(0);
  });

  test('pressing Backspace removes selected individuals', () => {
    render(<TestHarness />);
    addUnselectedIndividual(); // ensures at least one remains after delete
    addAndSelectIndividual();

    fireEvent.keyDown(document.body, { key: 'Backspace' });

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
  });

  test('pressing Delete with no selection does not remove anything', () => {
    render(<TestHarness />);
    const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
    usePedigreeStore.getState().addIndividual(individual);
    // Do NOT select the individual

    fireEvent.keyDown(document.body, { key: 'Delete' });

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
  });
});

