import { useViewportStore } from '../stores/viewportStore';

/**
 * Canvas-space position at the centre of the visible canvas area. Mirrors the
 * stage-local convention used across the app (0,0 = top-left of `.konvajs-content`).
 * Falls back to a 600x600 stage centre when the element is not yet measured.
 *
 * @returns The canvas-space {x, y} at the visible centre.
 */
export function getVisibleCanvasCenter(): { x: number; y: number } {
  const canvasEl = document.querySelector('.konvajs-content');
  let stageCenter = { x: 300, y: 300 };
  if (canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    stageCenter = { x: rect.width / 2, y: rect.height / 2 };
  }
  return useViewportStore.getState().screenToCanvas(stageCenter);
}
