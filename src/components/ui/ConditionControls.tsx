import { useEffect, useRef } from 'react';
import type { FillPatternType, QuarterPosition } from '../../types/pedigree';
import { createPatternCanvas } from '../../utils/fillPatterns';
import {
  COLOR_OPTIONS,
  PATTERN_OPTIONS,
  QUARTER_OPTIONS,
  QUARTER_GRID_ORDER,
} from './legendOptions';
import styles from './ConditionControls.module.css';

/**
 * Shared, direct-manipulation pickers for the three visual attributes of a
 * condition — colour, symbol quarter, and fill pattern. Used by both the Legend
 * editor and the properties-panel add-condition form so the two speak one
 * vocabulary (no native `<select>`s). The accent (Clinical Indigo) marks the
 * selected option only, per the One Accent Rule.
 */

interface ColorPickerProps {
  /** The currently selected condition colour (a hex from {@link COLOR_OPTIONS}). */
  value: string;
  /** Called with the chosen colour when a swatch is clicked. */
  onChange: (color: string) => void;
}

/** A row of round colour swatches for choosing a condition's shading colour. */
export function ConditionColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className={styles.swatchRow} role="group" aria-label="Condition colour">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`${styles.swatch} ${value === c.value ? styles.swatchActive : ''}`}
          style={{ backgroundColor: c.value }}
          aria-label={c.label}
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
        />
      ))}
    </div>
  );
}

interface QuarterGridProps {
  /** The currently selected symbol quarter. */
  value: QuarterPosition;
  /** Called with the chosen quarter when a cell is clicked. */
  onChange: (quarter: QuarterPosition) => void;
}

/**
 * A clickable 2×2 grid mirroring the symbol's quarters, with the selected
 * quarter's name beside it. Replaces a quarter `<select>` with direct
 * manipulation of the thing being chosen.
 */
export function ConditionQuarterGrid({ value, onChange }: QuarterGridProps) {
  const label = QUARTER_OPTIONS.find((o) => o.value === value)?.label;
  return (
    <div className={styles.quarterField}>
      <div className={styles.quarterGrid} role="group" aria-label="Symbol quarter">
        {QUARTER_GRID_ORDER.map((q) => {
          const option = QUARTER_OPTIONS.find((o) => o.value === q)!;
          return (
            <button
              key={q}
              type="button"
              className={`${styles.quarterCell} ${value === q ? styles.quarterCellActive : ''}`}
              aria-label={option.label}
              aria-pressed={value === q}
              onClick={() => onChange(q)}
            />
          );
        })}
      </div>
      <span className={styles.quarterLabel}>{label}</span>
    </div>
  );
}

interface PatternThumbnailProps {
  pattern: FillPatternType;
  /** The condition colour to preview the pattern in. */
  color: string;
  size?: number;
}

/**
 * Draws a live preview of a fill pattern in the chosen colour, reusing the same
 * {@link createPatternCanvas} the canvas symbols render with, so the thumbnail
 * matches the on-symbol result exactly. Decorative: under jsdom / no-canvas the
 * effect no-ops and the swatch stays blank.
 */
function PatternThumbnail({ pattern, color, size = 24 }: PatternThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, size, size);
    if (pattern === 'solid') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);
      return;
    }
    const tile = createPatternCanvas(pattern, color, 8);
    const fill = ctx.createPattern(tile, 'repeat');
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, size, size);
    }
  }, [pattern, color, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={styles.patternCanvas}
      aria-hidden="true"
    />
  );
}

interface PatternPickerProps {
  /** The currently selected fill pattern. */
  value: FillPatternType;
  /** The condition colour, so each thumbnail previews the real colour + pattern. */
  color: string;
  /** Called with the chosen pattern when a thumbnail is clicked. */
  onChange: (pattern: FillPatternType) => void;
}

/**
 * Selectable pattern thumbnails, each previewing the pattern in the current
 * condition colour. Replaces a pattern `<select>` and reinforces the
 * Redundant-Colour Rule by showing colour and pattern together.
 */
export function ConditionPatternPicker({ value, color, onChange }: PatternPickerProps) {
  return (
    <div className={styles.patternRow} role="group" aria-label="Fill pattern">
      {PATTERN_OPTIONS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`${styles.patternSwatch} ${value === p.value ? styles.patternActive : ''}`}
          title={p.label}
          aria-label={p.label}
          aria-pressed={value === p.value}
          onClick={() => onChange(p.value)}
        >
          <PatternThumbnail pattern={p.value} color={color} />
        </button>
      ))}
    </div>
  );
}
