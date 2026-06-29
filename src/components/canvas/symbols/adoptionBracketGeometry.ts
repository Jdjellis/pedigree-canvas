import {
  ADOPTION_BRACKET_GAP,
  ADOPTION_BRACKET_HALF_HEIGHT,
  ADOPTION_BRACKET_ARM,
} from '../../../utils/constants';

/**
 * The two square-bracket polylines that enclose an adopted individual's symbol,
 * centred on the symbol origin (0,0). Each polyline is a flat `[x0,y0,x1,y1,…]`
 * array of four points forming a `[` (left) or `]` (right) bracket:
 *
 *   arm → corner → corner → arm
 *
 * Shared by the Konva renderer ({@link AdoptionBrackets}) and the SVG exporter
 * so both draw identical brackets. See NSGC/Bennett adoption notation.
 */
export function adoptionBracketPolylines(): { left: number[]; right: number[] } {
  const x = ADOPTION_BRACKET_GAP;
  const h = ADOPTION_BRACKET_HALF_HEIGHT;
  const a = ADOPTION_BRACKET_ARM;

  // Left bracket "[" — vertical stroke at x = -x, arms pointing inward (+x).
  const left = [-x + a, -h, -x, -h, -x, h, -x + a, h];
  // Right bracket "]" — vertical stroke at x = +x, arms pointing inward (-x).
  const right = [x - a, -h, x, -h, x, h, x - a, h];

  return { left, right };
}
