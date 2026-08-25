/**
 * Geometry for partnership relationship lines, shared by the Konva renderer
 * (`PartnershipLine.tsx`) and the SVG exporter (`svgExport.ts`) so the two
 * parallel renderers cannot drift.
 *
 * Historically these lines were drawn as a single horizontal segment at the
 * average y of the two partners — which only looks right when both partners
 * sit in the same generation (equal y). A consanguineous or partnership union
 * that spans generations (created by alt-drag between two levels) then rendered
 * as a segment floating between the symbols, touching neither. Connecting the
 * actual symbol positions fixes that while staying pixel-identical for the
 * common same-generation case.
 */

export interface Point {
  x: number;
  y: number;
}

/** The two parallel segments of a consanguinity (double-line) union. */
export interface ConsanguinityLines {
  a: [number, number, number, number];
  b: [number, number, number, number];
}

/**
 * Return the two parallel segments for a consanguineous union between `p1` and
 * `p2`, offset by `gap` perpendicular to the line joining them. For a
 * same-generation union the perpendicular is vertical, so the pair sits
 * above/below the union exactly as before; for a cross-generation union the
 * offset stays perpendicular to the (now diagonal) connector.
 */
export function consanguinityLines(p1: Point, p2: Point, gap: number): ConsanguinityLines {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit vector perpendicular to the connector. Horizontal union -> (0, 1).
  const px = -dy / len;
  const py = dx / len;
  const ox = (px * gap) / 2;
  const oy = (py * gap) / 2;
  return {
    a: [p1.x + ox, p1.y + oy, p2.x + ox, p2.y + oy],
    b: [p1.x - ox, p1.y - oy, p2.x - ox, p2.y - oy],
  };
}

/** Midpoint of the segment joining two partners. */
export function partnershipMidpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/**
 * The two short parallel slashes marking a separated/divorced union, centred on
 * the relationship-line midpoint `mid`, per NSGC/Bennett. Shared by the Konva
 * renderer and the SVG exporter so the two cannot drift — and so the marks can
 * be composed onto a consanguineous (double) line for a separated *and*
 * consanguineous union (issue #153).
 */
export function separationHashMarks(mid: Point): [number, number, number, number][] {
  const hashSize = 6;
  return [
    [mid.x - 4, mid.y - hashSize, mid.x + 4, mid.y + hashSize],
    [mid.x + 2, mid.y - hashSize, mid.x + 10, mid.y + hashSize],
  ];
}

/** Spacing knobs for {@link childlessMarks}. */
export interface ChildlessMarkOptions {
  /** Length of the vertical stub dropping from the relationship line. */
  stub: number;
  /** Half-width of each horizontal cross-bar. */
  barHalf: number;
  /** Vertical gap between the two bars of the infertility marker. */
  barGap: number;
}

/** The segments of a childless-union marker: the stub plus its cross-bar(s). */
export interface ChildlessMarks {
  /** Vertical stub from the relationship line down to the bars. */
  stub: [number, number, number, number];
  /** One bar for `'noChildren'`, two for `'infertility'`. */
  bars: [number, number, number, number][];
}

/**
 * Geometry for a childless-union marker hung below the relationship-line
 * midpoint `mid`, per NSGC/Bennett: a short vertical stub terminated by a single
 * horizontal bar (`'noChildren'` — no children by choice) or two parallel bars
 * (`'infertility'`). Shared by the Konva renderer and the SVG exporter so the
 * two cannot drift.
 */
export function childlessMarks(
  mid: Point,
  kind: 'infertility' | 'noChildren',
  opts: ChildlessMarkOptions,
): ChildlessMarks {
  const bottomY = mid.y + opts.stub;
  const stub: [number, number, number, number] = [mid.x, mid.y, mid.x, bottomY];
  const bar = (y: number): [number, number, number, number] => [
    mid.x - opts.barHalf,
    y,
    mid.x + opts.barHalf,
    y,
  ];
  const bars =
    kind === 'infertility'
      ? [bar(bottomY - opts.barGap), bar(bottomY)]
      : [bar(bottomY)];
  return { stub, bars };
}
