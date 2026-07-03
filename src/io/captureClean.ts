import type Konva from 'konva';
import { SYMBOL_COLOR } from '../utils/constants';

/**
 * Konva node name applied to "chrome" nodes that must NOT appear in exports:
 * the background grid, the dashed bounds rectangle + generation labels, and the
 * selection / hover highlights around symbols. Nodes carrying this name are
 * temporarily hidden during a clean capture and restored afterwards.
 */
export const EXPORT_EXCLUDE_NAME = 'export-exclude';

/**
 * Stroke colour applied to a symbol's outline while it is selected. Must match
 * `SELECTION_COLOR` in `PedigreeSymbol.tsx`. A selected symbol's outline (not a
 * separate halo node, so it cannot be hidden via {@link EXPORT_EXCLUDE_NAME}) is
 * temporarily recoloured to {@link SYMBOL_COLOR} during a clean capture so the
 * exported document never shows the editing selection colour.
 */
const SELECTION_STROKE_COLOR = '#4f46c9';

/** Padding (in content-space px) added around the pedigree content in exports. */
const EXPORT_PADDING = 40;

export interface CaptureCleanOptions {
  /**
   * Output resolution multiplier passed to `toDataURL`. Higher values produce
   * sharper images at the cost of size. Defaults to 3.
   */
  pixelRatio?: number;
  /** MIME type of the produced data URL. Defaults to `'image/png'`. */
  mimeType?: string;
}

/**
 * Captures the entire pedigree as a clean PNG data URL, independent of the
 * current pan/zoom.
 *
 * The on-screen `stage.toDataURL()` bakes in the current viewport (clipping any
 * content outside it) along with the grid, bounds rectangle, and selection /
 * hover highlights. This helper instead:
 *
 * 1. Resets the stage transform to scale 1 / position (0,0) so node coordinates
 *    are expressed in content space.
 * 2. Hides every node tagged with {@link EXPORT_EXCLUDE_NAME} (grid, bounds,
 *    selection/hover halos) so they are excluded both visually and from the
 *    content bounding-box computation.
 * 3. Measures the union bounding box of the remaining visible content (symbols,
 *    connections, on-canvas legend) and adds uniform padding.
 * 4. Rasterises exactly that padded rectangle.
 *
 * The stage transform and node visibility are always restored in a `finally`
 * block, so the on-screen canvas is left untouched.
 *
 * @param stage - The Konva stage to capture.
 * @param options - Optional rendering options (`pixelRatio`, `mimeType`).
 * @returns A PNG (or `options.mimeType`) data URL of the full, clean pedigree.
 *          Returns an empty-string-safe 1x1 transparent capture only if the
 *          stage has no visible content (e.g. an empty pedigree).
 */
export function captureCleanDataUrl(
  stage: Konva.Stage,
  options: CaptureCleanOptions = {}
): string {
  const { pixelRatio = 3, mimeType = 'image/png' } = options;

  // Save current viewport transform so it can be restored.
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() };
  const prevPosition = { x: stage.x(), y: stage.y() };

  // Collect chrome nodes once so we restore exactly what we hid.
  const excludedNodes = stage.find(`.${EXPORT_EXCLUDE_NAME}`);
  const wasVisible = excludedNodes.map((node) => node.visible());

  // Visible symbol outlines currently drawn in the selection colour. These are
  // recoloured to the normal symbol colour for the capture and restored after.
  const selectedOutlines = stage
    .find('Shape')
    .filter(
      (node) =>
        node.visible() &&
        typeof (node as Konva.Shape).stroke === 'function' &&
        (node as Konva.Shape).stroke() === SELECTION_STROKE_COLOR
    ) as Konva.Shape[];

  try {
    // Work in content space: identity-ish transform (scale 1, no offset).
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });

    // Hide chrome so it is excluded from both the render and the bbox.
    excludedNodes.forEach((node) => node.hide());

    // Neutralise the selection-colour outline on any selected symbol.
    selectedOutlines.forEach((node) => node.stroke(SYMBOL_COLOR));

    stage.draw();

    // Content bounding box in content-space coordinates. getClientRect skips
    // invisible nodes recursively, so the hidden chrome does not contribute.
    const contentRect = stage.getClientRect({ relativeTo: stage });

    const hasContent = contentRect.width > 0 && contentRect.height > 0;

    const x = hasContent ? contentRect.x - EXPORT_PADDING : 0;
    const y = hasContent ? contentRect.y - EXPORT_PADDING : 0;
    const width = hasContent
      ? contentRect.width + EXPORT_PADDING * 2
      : stage.width();
    const height = hasContent
      ? contentRect.height + EXPORT_PADDING * 2
      : stage.height();

    return stage.toDataURL({ x, y, width, height, pixelRatio, mimeType });
  } finally {
    // Restore chrome visibility, selection-outline colour, and the viewport.
    excludedNodes.forEach((node, i) => {
      if (wasVisible[i]) {
        node.show();
      }
    });
    selectedOutlines.forEach((node) => node.stroke(SELECTION_STROKE_COLOR));
    stage.scale(prevScale);
    stage.position(prevPosition);
    stage.draw();
  }
}
