import { render, screen, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { LinkTypePopup } from './LinkTypePopup';

/** Add a stage-like <canvas> carrying a stale hover cursor, as the live app has. */
function mountCanvasWithCursor(cursor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.cursor = cursor;
  document.body.appendChild(canvas);
  return canvas;
}

beforeEach(() => {
  useUIStore.setState({
    linkPopup: { visible: true, sourceId: 'a', targetId: 'b', screenPosition: { x: 0, y: 0 } },
    activeTool: 'connect',
    hoveredId: 'b',
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  useUIStore.getState().hideLinkPopup();
});

describe('LinkTypePopup — cursor cleanup', () => {
  it('resets the stuck canvas cursor after a connection is created', () => {
    const canvas = mountCanvasWithCursor('pointer');
    render(<LinkTypePopup />);

    act(() => {
      screen.getByRole('button', { name: 'Partnership' }).click();
    });

    // The relationship was created (popup closed) AND the stale hover cursor
    // that the popup swallowed the pointer-leave for is cleared.
    expect(usePedigreeStore.getState().document.partnerships).not.toEqual({});
    expect(canvas.style.cursor).toBe('');
    expect(useUIStore.getState().hoveredId).toBeNull();
  });

  it('also resets the cursor when the popup is cancelled', () => {
    const canvas = mountCanvasWithCursor('pointer');
    render(<LinkTypePopup />);

    act(() => {
      screen.getByRole('button', { name: 'Cancel' }).click();
    });

    expect(canvas.style.cursor).toBe('');
  });
});
