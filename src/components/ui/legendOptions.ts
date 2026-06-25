import type {
  FillPatternType,
  LegendEntry,
  QuarterPosition,
} from '../../types/pedigree';

/**
 * Colour choices offered when defining a condition. Shared by the Legend editor
 * and the inline "add condition" form in the properties panel so the two stay in
 * sync.
 */
export const COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: '#1a1a1a', label: 'Black' },
  { value: '#dc2626', label: 'Red' },
  { value: '#16a34a', label: 'Green' },
  { value: '#2563eb', label: 'Blue' },
];

/**
 * Symbol-quarter choices for a condition, in a stable display order. Multiple
 * conditions may share a quarter; they are distinguished by colour and pattern.
 */
export const QUARTER_OPTIONS: { value: QuarterPosition; label: string }[] = [
  { value: 'topRight', label: 'Top-Right' },
  { value: 'topLeft', label: 'Top-Left' },
  { value: 'bottomLeft', label: 'Bottom-Left' },
  { value: 'bottomRight', label: 'Bottom-Right' },
];

/**
 * Fill-pattern choices for a condition's quarter shading.
 */
export const PATTERN_OPTIONS: { value: FillPatternType; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'diagonalLines', label: 'Diagonal Lines' },
  { value: 'dots', label: 'Dots' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'horizontalStripes', label: 'Horizontal Stripes' },
  { value: 'verticalStripes', label: 'Vertical Stripes' },
];

/**
 * Build a {@link LegendEntry} from user-supplied condition fields.
 *
 * Pure builder so the inline-create flow can be unit-tested without React. The
 * name is trimmed; `applicableTo` is intentionally left unset (defaults to "both
 * genders" elsewhere).
 *
 * @param id - A pre-generated unique id for the entry.
 * @param name - The condition's display name. Surrounding whitespace is trimmed.
 * @param fillColor - The swatch / quarter-shading colour.
 * @param quarter - The symbol quarter the condition shades.
 * @param fillPattern - The fill pattern used within the quarter.
 * @returns A new legend entry ready to pass to `addLegendEntry`.
 */
export function createConditionEntry(
  id: string,
  name: string,
  fillColor: string,
  quarter: QuarterPosition,
  fillPattern: FillPatternType,
): LegendEntry {
  return {
    id,
    name: name.trim(),
    fillColor,
    quarter,
    fillPattern,
  };
}
