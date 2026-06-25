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
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Test harness — a minimal component that calls the hook once.
// ---------------------------------------------------------------------------

function TestHarness(): null {
  useKeyboardShortcuts();
  return null;
}

/** Reset UI store to defaults before each test. */
beforeEach(() => {
  act(() => {
    useUIStore.setState({
      activeTool: 'select',
      activeModal: null,
      commandPaletteOpen: false,
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

  test('pressing h sets activeTool to pan', () => {
    render(<TestHarness />);

    fireEvent.keyDown(document.body, { key: 'h' });

    expect(useUIStore.getState().activeTool).toBe('pan');
  });

  test('pressing p sets activeTool to addIndividual', () => {
    render(<TestHarness />);

    fireEvent.keyDown(document.body, { key: 'p' });

    expect(useUIStore.getState().activeTool).toBe('addIndividual');
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
  test('pressing v inside an INPUT does not change the active tool away from pan', () => {
    render(<TestHarness />);

    // Pre-condition: start on a different tool
    act(() => {
      useUIStore.setState({ activeTool: 'pan' });
    });

    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'v' });

    // Still 'pan' — the guard prevented the switch
    expect(useUIStore.getState().activeTool).toBe('pan');

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

  test('pressing p inside a SELECT does not change the active tool', () => {
    render(<TestHarness />);

    act(() => {
      useUIStore.setState({ activeTool: 'select' });
    });

    const select = document.createElement('select');
    document.body.appendChild(select);

    fireEvent.keyDown(select, { key: 'p' });

    expect(useUIStore.getState().activeTool).toBe('select');

    document.body.removeChild(select);
  });
});
