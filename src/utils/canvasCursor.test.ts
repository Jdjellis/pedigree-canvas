import { describe, it, expect, afterEach } from 'vitest';
import { clearCanvasCursor } from './canvasCursor';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('clearCanvasCursor', () => {
  it('clears an inline cursor from every canvas element', () => {
    const a = document.createElement('canvas');
    const b = document.createElement('canvas');
    a.style.cursor = 'pointer';
    b.style.cursor = 'grab';
    document.body.append(a, b);

    clearCanvasCursor();

    expect(a.style.cursor).toBe('');
    expect(b.style.cursor).toBe('');
  });

  it('leaves non-canvas elements untouched', () => {
    const div = document.createElement('div');
    div.style.cursor = 'pointer';
    document.body.append(div);

    clearCanvasCursor();

    expect(div.style.cursor).toBe('pointer');
  });
});
