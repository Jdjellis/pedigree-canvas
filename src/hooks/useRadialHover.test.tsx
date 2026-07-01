/**
 * Tests for the useRadialHover proximity controller.
 *
 * The hook registers a `mousemove` listener on `window` and maps the pointer
 * into stage-local space by reading `.konvajs-content`'s bounding rect. Under
 * jsdom that rect is all-zeros, so stage-local coordinates equal clientX/Y and
 * — with the viewport at scale 1, origin (0,0) — equal canvas coordinates too.
 * That lets us place people at known canvas positions and drive the pointer to
 * exact distances.
 *
 * Regression focus (sibling-radial-menu-overlap): once the menu opens for a
 * person it must LOCK onto them. Proximity may no longer retarget it to a
 * nearer neighbour, because an orbiting option (e.g. "Sibling", 56px west) can
 * land inside an adjacent sibling's enter radius — retargeting there stole the
 * menu mid-gesture and dead-ended the user.
 */
import { render, act, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, describe, test, expect } from 'vitest';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useRadialHover } from './useRadialHover';
import { RADIAL_HOVER_EXIT_RADIUS, SIBLING_SPACING } from '../utils/constants';

const SIB_A = 'sib-a';
const SIB_B = 'sib-b';
const A_POS = { x: 100, y: 100 };
// An adjacent sibling one SIBLING_SPACING (80px) to the east.
const B_POS = { x: 100 + SIBLING_SPACING, y: 100 };

function TestHarness(): null {
  useRadialHover(false);
  return null;
}

let content: HTMLDivElement;

beforeEach(() => {
  // The hook bails without a `.konvajs-content` element to measure against.
  content = document.createElement('div');
  content.className = 'konvajs-content';
  document.body.appendChild(content);

  act(() => {
    useViewportStore.setState({ scale: 1, position: { x: 0, y: 0 } });
    const store = usePedigreeStore.getState();
    store.resetDocument();
    store.addIndividual(createDefaultIndividual({ id: SIB_A, position: A_POS }));
    store.addIndividual(createDefaultIndividual({ id: SIB_B, position: B_POS }));
    useUIStore.setState({ activeTool: 'select', editingLocked: false });
    useUIStore.getState().hideRadialMenu();
  });
});

afterEach(() => {
  content.remove();
});

function moveTo(x: number, y: number): void {
  // Fire on document; the event bubbles to the window listener.
  act(() => {
    fireEvent.mouseMove(document, { clientX: x, clientY: y });
  });
}

describe('useRadialHover — lock on open', () => {
  test('opens the menu on the nearest person within the enter radius', () => {
    render(<TestHarness />);

    moveTo(A_POS.x, A_POS.y);

    const menu = useUIStore.getState().radialMenu;
    expect(menu.visible).toBe(true);
    expect(menu.targetId).toBe(SIB_A);
  });

  test('does NOT retarget to an adjacent sibling once open', () => {
    render(<TestHarness />);

    // Open on A.
    moveTo(A_POS.x, A_POS.y);
    expect(useUIStore.getState().radialMenu.targetId).toBe(SIB_A);

    // Travel east toward B — a point that is nearer to B (20px) than to A
    // (60px) and well inside B's enter radius. Pre-fix this stole the menu;
    // now it stays locked on A because we're still inside A's exit radius.
    moveTo(B_POS.x - 20, B_POS.y);

    const menu = useUIStore.getState().radialMenu;
    expect(menu.visible).toBe(true);
    expect(menu.targetId).toBe(SIB_A);
  });

  test('closes once the pointer clears the exit radius, then can reopen on a neighbour', () => {
    render(<TestHarness />);

    moveTo(A_POS.x, A_POS.y);
    expect(useUIStore.getState().radialMenu.targetId).toBe(SIB_A);

    // Move far past A's exit radius (and away from B) — the menu closes.
    moveTo(A_POS.x - RADIAL_HOVER_EXIT_RADIUS - 10, A_POS.y);
    expect(useUIStore.getState().radialMenu.visible).toBe(false);

    // A fresh approach to B opens B's own menu.
    moveTo(B_POS.x, B_POS.y);
    const menu = useUIStore.getState().radialMenu;
    expect(menu.visible).toBe(true);
    expect(menu.targetId).toBe(SIB_B);
  });
});
