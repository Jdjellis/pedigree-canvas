/**
 * Tests for captureCleanDataUrl.
 *
 * We do NOT import konva (project rule + it cannot render under jsdom). Instead
 * we build a minimal fake Konva stage: plain objects exposing exactly the methods
 * captureCleanDataUrl calls — find(), visible()/hide()/show(), stroke(),
 * getClientRect(), scale()/position()/x()/y()/scaleX()/scaleY()/width()/height(),
 * draw(), and toDataURL().
 *
 * The focus is on side-effect restoration: chrome nodes tagged EXPORT_EXCLUDE_NAME
 * are hidden then restored, and selection-coloured outlines are swapped to the
 * symbol colour then restored.
 */
import { describe, it, expect, vi } from 'vitest';
import { captureCleanDataUrl, EXPORT_EXCLUDE_NAME } from './captureClean';
import { SYMBOL_COLOR } from '../utils/constants';

const SELECTION_STROKE_COLOR = '#4f46c9';

/** A fake shape node with visibility + stroke behaviour. */
function makeShape(opts: { visible?: boolean; stroke?: string | null } = {}) {
  let visible = opts.visible ?? true;
  let strokeColor = opts.stroke ?? null;
  const hide = vi.fn(() => {
    visible = false;
  });
  const show = vi.fn(() => {
    visible = true;
  });
  return {
    visible: (v?: boolean) => {
      if (v !== undefined) visible = v;
      return visible;
    },
    hide,
    show,
    stroke: (c?: string) => {
      if (c !== undefined) {
        strokeColor = c;
        return strokeColor;
      }
      return strokeColor;
    },
  };
}

/**
 * Build a fake stage. `chrome` = nodes returned for `.export-exclude`.
 * `shapes` = nodes returned for the `'Shape'` selector.
 */
function makeStage(chrome: ReturnType<typeof makeShape>[], shapes: ReturnType<typeof makeShape>[]) {
  const state = { scaleX: 2, scaleY: 2, x: 33, y: 44 };
  const toDataURL = vi.fn(() => 'data:image/png;base64,FAKE');
  const draw = vi.fn();
  const scale = vi.fn((s?: { x: number; y: number }) => {
    if (s) {
      state.scaleX = s.x;
      state.scaleY = s.y;
    }
    return { x: state.scaleX, y: state.scaleY };
  });
  const position = vi.fn((p?: { x: number; y: number }) => {
    if (p) {
      state.x = p.x;
      state.y = p.y;
    }
    return { x: state.x, y: state.y };
  });
  const stage = {
    scaleX: () => state.scaleX,
    scaleY: () => state.scaleY,
    x: () => state.x,
    y: () => state.y,
    scale,
    position,
    width: () => 600,
    height: () => 400,
    find: (selector: string) => {
      if (selector === `.${EXPORT_EXCLUDE_NAME}`) return chrome;
      if (selector === 'Shape') return shapes;
      return [];
    },
    getClientRect: () => ({ x: 10, y: 20, width: 100, height: 80 }),
    draw,
    toDataURL,
    _state: state,
    _toDataURL: toDataURL,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake konva stage for testing
  return stage as any;
}

describe('captureCleanDataUrl', () => {
  it('hides chrome nodes during capture and restores their visibility afterwards', () => {
    const chrome = [makeShape({ visible: true }), makeShape({ visible: true })];
    const stage = makeStage(chrome, []);

    captureCleanDataUrl(stage);

    // Restored to visible after the finally block.
    chrome.forEach((node) => {
      expect(node.hide).toHaveBeenCalled();
      expect(node.show).toHaveBeenCalled();
      expect(node.visible()).toBe(true);
    });
  });

  it('does not re-show a chrome node that was already hidden before capture', () => {
    const hiddenChrome = makeShape({ visible: false });
    const stage = makeStage([hiddenChrome], []);

    captureCleanDataUrl(stage);

    // It was not visible originally, so show() must not be called on it.
    expect(hiddenChrome.show).not.toHaveBeenCalled();
    expect(hiddenChrome.visible()).toBe(false);
  });

  it('swaps a selected symbol outline to SYMBOL_COLOR during capture and restores it', () => {
    // A visible shape currently drawn in the selection colour.
    const selected = makeShape({ visible: true, stroke: SELECTION_STROKE_COLOR });
    // toDataURL is where we can observe the mid-capture stroke colour.
    const stage = makeStage([], [selected]);
    stage._toDataURL.mockImplementation(() => {
      // During capture the outline must be neutralised to the symbol colour.
      expect(selected.stroke()).toBe(SYMBOL_COLOR);
      return 'data:image/png;base64,FAKE';
    });

    captureCleanDataUrl(stage);

    // Restored to the selection colour afterwards.
    expect(selected.stroke()).toBe(SELECTION_STROKE_COLOR);
  });

  it('leaves non-selected shapes untouched', () => {
    const other = makeShape({ visible: true, stroke: '#000000' });
    const stage = makeStage([], [other]);

    captureCleanDataUrl(stage);

    expect(other.stroke()).toBe('#000000');
  });

  it('restores the stage transform (scale + position) after capture', () => {
    const stage = makeStage([], []);
    const prevScale = { x: stage.scaleX(), y: stage.scaleY() };
    const prevPos = { x: stage.x(), y: stage.y() };

    captureCleanDataUrl(stage);

    expect(stage.scaleX()).toBe(prevScale.x);
    expect(stage.scaleY()).toBe(prevScale.y);
    expect(stage.x()).toBe(prevPos.x);
    expect(stage.y()).toBe(prevPos.y);
  });

  it('defaults pixelRatio to 3 and mimeType to image/png', () => {
    const stage = makeStage([], []);

    captureCleanDataUrl(stage);

    expect(stage._toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ pixelRatio: 3, mimeType: 'image/png' }),
    );
  });

  it('passes through explicit pixelRatio and mimeType options', () => {
    const stage = makeStage([], []);

    captureCleanDataUrl(stage, { pixelRatio: 1, mimeType: 'image/jpeg' });

    expect(stage._toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({ pixelRatio: 1, mimeType: 'image/jpeg' }),
    );
  });

  it('adds EXPORT_PADDING (40) around the measured content rect', () => {
    const stage = makeStage([], []);

    captureCleanDataUrl(stage);

    // contentRect is {x:10,y:20,width:100,height:80}; padding 40 each side.
    expect(stage._toDataURL).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 10 - 40,
        y: 20 - 40,
        width: 100 + 80,
        height: 80 + 80,
      }),
    );
  });
});
