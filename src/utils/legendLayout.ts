/** Shared legend layout constants and row-position helpers.
 *
 * Both `LegendLayer.tsx` (Konva canvas) and `svgExport.ts` (SVG export)
 * consume these so their renderers stay visually aligned. Change values here
 * and both renderers update automatically.
 */

export const PADDING = 12;
export const ROW_HEIGHT = 28;
export const TITLE_HEIGHT = 24;
export const SWATCH_SIZE = 20;
/** Label text area width. Bumped from 120 to accommodate longer investigation strings. */
export const LABEL_WIDTH = 160;

/** Width of the swatch column (one or two swatches with gap). */
export function legendSwatchWidth(hasBothGender: boolean): number {
  return hasBothGender ? SWATCH_SIZE * 2 + 4 : SWATCH_SIZE;
}

/** Total width of the legend box. */
export function legendContentWidth(hasBothGender: boolean): number {
  return PADDING * 2 + legendSwatchWidth(hasBothGender) + 8 + LABEL_WIDTH;
}

/** Total height of the legend box. */
export function legendContentHeight(
  entryCount: number,
  investigationCount: number,
): number {
  return PADDING * 2 + TITLE_HEIGHT + (entryCount + investigationCount) * ROW_HEIGHT;
}

/** Y of the top edge of a condition entry row (0-based index). */
export function legendEntryRowY(idx: number): number {
  return PADDING + TITLE_HEIGHT + idx * ROW_HEIGHT;
}

/**
 * Y of the top edge of an investigation row, continuing below all condition entries.
 * Apply a +4 inner offset at the call site for the text element itself.
 */
export function legendInvestigationRowY(entryCount: number, idx: number): number {
  return PADDING + TITLE_HEIGHT + (entryCount + idx) * ROW_HEIGHT;
}
