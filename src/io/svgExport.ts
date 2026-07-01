import type {
  PedigreeDocument,
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
  TextAnnotation,
  LegendEntry,
  Investigation,
  QuarterPosition,
  FillPatternType,
} from '../types/pedigree';
import { GenderIdentity, RelationshipType, TwinType, VitalStatus } from '../types/enums';
import { computeBounds, computeGenerationNumerals } from '../utils/boundsCalculation';
import { collectInvestigations, formatInvestigation } from '../utils/investigations';
import {
  SYMBOL_SIZE,
  SYMBOL_STROKE_WIDTH,
  SYMBOL_COLOR,
  SYMBOL_FILL,
  LINE_COLOR,
  LINE_WIDTH,
  CONSANGUINITY_GAP,
  CHILDLESS_STUB,
  CHILDLESS_BAR_HALF,
  CHILDLESS_BAR_GAP,
  DASH_PATTERN,
  LABEL_FONT_SIZE,
  LABEL_FONT_FAMILY,
  LABEL_COLOR,
  LABEL_OFFSET_Y,
  DECEASED_SLASH_OVERSHOOT,
  TWIN_UNKNOWN_FONT_SIZE,
  RELATIONSHIP_LABEL_OFFSET,
} from '../utils/constants';
import { adoptionBracketPolylines } from '../components/canvas/symbols/adoptionBracketGeometry';
import { getPresentPartners } from '../utils/graphTraversal';
import { twinApexXByMember } from '../utils/twinOperations';
import {
  computeParentChildSegments,
  computeParentlessSibshipSegments,
  computeSibshipY,
} from '../components/connections/parentChildGeometry';
import {
  childlessMarks,
  consanguinityLines,
  partnershipMidpoint,
} from '../utils/partnershipGeometry';
import {
  PADDING as LEGEND_PADDING,
  SWATCH_SIZE as LEGEND_SWATCH_SIZE,
  legendSwatchWidth,
  legendContentWidth,
  legendContentHeight,
  legendEntryRowY,
  legendInvestigationRowY,
} from '../utils/legendLayout';

// ---------------------------------------------------------------------------
// Constants mirroring the canvas components (kept self-contained on purpose so
// this exporter does not depend on react-konva component internals).
// ---------------------------------------------------------------------------

/** Tile size used by `createPatternCanvas` in `src/utils/fillPatterns.ts`. */
const PATTERN_TILE_SIZE = 8;
/** Stroke width used by `createPatternCanvas` for line-based patterns. */
const PATTERN_STROKE_WIDTH = 1.5;
/** Vertical spacing between successive label lines (see `SymbolLabel`). */
const LABEL_LINE_HEIGHT = LABEL_FONT_SIZE + 4;
/**
 * Horizontal gap between the symbol's right edge and the start of the
 * bottom-right individual number (see `SymbolLabel`).
 */
const NUMBER_CORNER_GAP = 3;
/** Padding added around the content bounding box for the export viewBox. */
const VIEWBOX_PADDING = 40;

// ---------------------------------------------------------------------------
// String / numeric helpers
// ---------------------------------------------------------------------------

/** Escape text so it is safe to embed inside SVG text/attribute content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Round to 2 decimal places and drop trailing zeros for compact, stable output. */
function num(value: number): string {
  return Number.parseFloat(value.toFixed(2)).toString();
}

// ---------------------------------------------------------------------------
// Fill pattern definitions (SVG <pattern>) — vector equivalents of the raster
// tiles produced by `createPatternCanvas`.
// ---------------------------------------------------------------------------

/** A pattern id is unique per (patternType, color) pair so defs are deduplicated. */
function patternId(patternType: FillPatternType, color: string): string {
  const safeColor = color.replace(/[^a-zA-Z0-9]/g, '');
  return `pat-${patternType}-${safeColor}`;
}

/** A clipPath id is unique per individual id. */
function clipId(individualId: string): string {
  return `clip-${individualId}`;
}

/**
 * Build the inner geometry of a fill `<pattern>` tile for a given pattern type.
 * Mirrors the tile drawing in `src/utils/fillPatterns.ts` (tile size 8).
 */
function patternTileBody(patternType: FillPatternType, color: string): string {
  const t = PATTERN_TILE_SIZE;
  const sw = PATTERN_STROKE_WIDTH;
  const stroke = `stroke="${color}" stroke-width="${sw}"`;

  switch (patternType) {
    case 'solid':
      return `<rect x="0" y="0" width="${t}" height="${t}" fill="${color}" />`;

    case 'diagonalLines':
      // 45-degree lines repeating across the tile.
      return [
        `<path d="M0 ${t} L${t} 0" ${stroke} />`,
        `<path d="M${-t / 2} ${t / 2} L${t / 2} ${-t / 2}" ${stroke} />`,
        `<path d="M${t / 2} ${t + t / 2} L${t + t / 2} ${t / 2}" ${stroke} />`,
      ].join('');

    case 'dots': {
      const r = t / 5;
      return `<circle cx="${t / 2}" cy="${t / 2}" r="${r}" fill="${color}" />`;
    }

    case 'crosshatch':
      return [
        // Forward diagonal
        `<path d="M0 ${t} L${t} 0" ${stroke} />`,
        `<path d="M${-t / 2} ${t / 2} L${t / 2} ${-t / 2}" ${stroke} />`,
        `<path d="M${t / 2} ${t + t / 2} L${t + t / 2} ${t / 2}" ${stroke} />`,
        // Back diagonal
        `<path d="M0 0 L${t} ${t}" ${stroke} />`,
        `<path d="M${-t / 2} ${t / 2} L${t / 2} ${t + t / 2}" ${stroke} />`,
        `<path d="M${t / 2} ${-t / 2} L${t + t / 2} ${t / 2}" ${stroke} />`,
      ].join('');

    case 'horizontalStripes':
      return `<path d="M0 ${t / 2} L${t} ${t / 2}" ${stroke} />`;

    case 'verticalStripes':
      return `<path d="M${t / 2} 0 L${t / 2} ${t}" ${stroke} />`;
  }
}

// ---------------------------------------------------------------------------
// Symbol-shape path geometry. All shapes are centred on (0,0); callers wrap
// them in a translate group to position them at the individual.
// ---------------------------------------------------------------------------

type SymbolShape = 'circle' | 'square' | 'diamond' | 'triangle';

/** Determine the base symbol shape, matching `BaseShape` in `PedigreeSymbol.tsx`. */
function resolveSymbolShape(individual: Individual): SymbolShape {
  if (individual.isPregnancy && individual.pregnancyOutcome) {
    return 'triangle';
  }
  switch (individual.genderIdentity) {
    case GenderIdentity.Man:
      return 'square';
    case GenderIdentity.Woman:
      return 'circle';
    case GenderIdentity.NonBinary:
    case GenderIdentity.Unknown:
    default:
      return 'diamond';
  }
}

/**
 * SVG markup for the base symbol outline, centred on (0,0).
 * Used both as the visible stroked shape and (without fill/stroke) as a clip path.
 */
function symbolShapeElement(
  shape: SymbolShape,
  size: number,
  attrs: string,
): string {
  const half = size / 2;
  switch (shape) {
    case 'circle':
      return `<circle cx="0" cy="0" r="${half}" ${attrs} />`;
    case 'square':
      return `<rect x="${-half}" y="${-half}" width="${size}" height="${size}" ${attrs} />`;
    case 'diamond':
      return `<polygon points="0,${-half} ${half},0 0,${half} ${-half},0" ${attrs} />`;
    case 'triangle':
      return `<polygon points="0,${-half} ${half},${half} ${-half},${half}" ${attrs} />`;
  }
}

/**
 * The clip shape for condition quarter-shading. Triangles and pregnancies use
 * their own outline, but the canvas `clipSymbolPath` only knows circle / square
 * / diamond — so non-pregnancy shapes clip with the gender shape and pregnancy
 * triangles clip with the triangle outline.
 */
function clipShapeElement(individual: Individual, size: number): string {
  const shape = resolveSymbolShape(individual);
  // `clipSymbolPath` maps man->square, woman->circle, everything else->diamond.
  // Triangles (pregnancies) are not handled there, so fall back to the triangle
  // outline to keep shading inside the visible symbol.
  const clipShape: SymbolShape =
    shape === 'triangle' ? 'triangle' : shape;
  return symbolShapeElement(clipShape, size, '');
}

/** Quarter rectangle geometry, matching `getQuarterRect` in `ConditionOverlay`. */
function quarterRect(quarter: QuarterPosition, half: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  switch (quarter) {
    case 'topLeft':
      return { x: -half, y: -half, w: half, h: half };
    case 'topRight':
      return { x: 0, y: -half, w: half, h: half };
    case 'bottomLeft':
      return { x: -half, y: 0, w: half, h: half };
    case 'bottomRight':
      return { x: 0, y: 0, w: half, h: half };
  }
}

// ---------------------------------------------------------------------------
// Derived data: active quarters, individual numbers, generation labels.
// These mirror the derivations in `CanvasContainer.tsx`.
// ---------------------------------------------------------------------------

interface ActiveQuarter {
  quarter: QuarterPosition;
  fillColor: string;
  fillPattern: FillPatternType;
}

/**
 * Resolve which condition quarters apply to an individual. Matches the
 * `getActiveQuarters` callback in `CanvasContainer.tsx`: a legend entry applies
 * when its id appears in the individual's `conditionIds`.
 */
function getActiveQuarters(
  individual: Individual,
  entries: LegendEntry[],
): ActiveQuarter[] {
  if (!individual.conditionIds || individual.conditionIds.length === 0) return [];
  return entries
    .filter((entry) => individual.conditionIds.includes(entry.id))
    .map((entry) => ({
      quarter: entry.quarter,
      fillColor: entry.fillColor,
      fillPattern: entry.fillPattern,
    }));
}

/**
 * Compute the within-generation individual number for each individual, matching
 * the `individualNumbers` memo in `CanvasContainer.tsx`: within each generation,
 * individuals are sorted left-to-right by x and numbered from 1.
 */
function computeIndividualNumbers(individuals: Individual[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const genGroups = new Map<number, Individual[]>();
  for (const ind of individuals) {
    const gen = ind.generation ?? 0;
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen)!.push(ind);
  }
  for (const [, group] of genGroups) {
    group.sort((a, b) => a.position.x - b.position.x);
    group.forEach((ind, idx) => {
      numbers.set(ind.id, idx + 1);
    });
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// Per-symbol rendering
// ---------------------------------------------------------------------------

/**
 * Build the centred name/age/condition label lines for an individual, matching
 * `SymbolLabel.tsx`. The individual number is rendered separately at the
 * symbol's bottom-right corner and is therefore not included here.
 */
function buildLabelLines(individual: Individual): string[] {
  const lines: string[] = [];

  if (individual.displayName) {
    lines.push(individual.displayName);
  }
  if (individual.age != null) {
    if (
      individual.vitalStatus === VitalStatus.Deceased ||
      individual.vitalStatus === VitalStatus.Stillborn
    ) {
      lines.push(`d. ${individual.age}`);
    } else {
      lines.push(`${individual.age}`);
    }
  }
  // Stillbirth: "SB" + gestational age (mirrors SymbolLabel.tsx). GA is gated on
  // a stillbirth or ongoing pregnancy so a stale value never shows otherwise.
  if (individual.vitalStatus === VitalStatus.Stillborn) {
    lines.push('SB');
  }
  if (
    (individual.vitalStatus === VitalStatus.Stillborn || individual.isPregnancy) &&
    individual.gestationalAge?.trim()
  ) {
    lines.push(`GA: ${individual.gestationalAge.trim()}`);
  }
  if (individual.sexAssignedAtBirth) {
    lines.push(individual.sexAssignedAtBirth);
  }
  for (const condition of individual.conditions) {
    if (condition.ageOfOnset != null) {
      lines.push(`${condition.name} (dx ${condition.ageOfOnset})`);
    } else {
      lines.push(condition.name);
    }
  }

  for (const investigation of individual.investigations) {
    const value = investigation.label.trim();
    if (value) lines.push(value);
  }

  return lines;
}

/**
 * Render a single individual (symbol + shading + slash + arrow + labels) as a
 * positioned SVG group.
 */
function renderIndividual(
  individual: Individual,
  individualNumber: number | undefined,
  entries: LegendEntry[],
): string {
  const half = SYMBOL_SIZE / 2;
  const parts: string[] = [];

  const shape = resolveSymbolShape(individual);

  // Base outline.
  parts.push(
    symbolShapeElement(
      shape,
      SYMBOL_SIZE,
      `fill="${SYMBOL_FILL}" stroke="${SYMBOL_COLOR}" stroke-width="${SYMBOL_STROKE_WIDTH}"`,
    ),
  );

  // Adoption brackets enclosing the symbol (mirrors AdoptionBrackets.tsx).
  if (individual.adopted) {
    const { left, right } = adoptionBracketPolylines();
    const toPolyline = (pts: number[]): string => {
      const points: string[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        points.push(`${num(pts[i])},${num(pts[i + 1])}`);
      }
      return `<polyline points="${points.join(' ')}" fill="none" stroke="${SYMBOL_COLOR}" stroke-width="${LINE_WIDTH}" />`;
    };
    parts.push(toPolyline(left), toPolyline(right));
  }

  // Condition quarter shading, clipped to the symbol outline.
  const activeQuarters = getActiveQuarters(individual, entries);
  if (activeQuarters.length > 0) {
    const quarterRects = activeQuarters
      .map((aq) => {
        const r = quarterRect(aq.quarter, half);
        const fill =
          aq.fillPattern === 'solid'
            ? aq.fillColor
            : `url(#${patternId(aq.fillPattern, aq.fillColor)})`;
        return `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(
          r.h,
        )}" fill="${fill}" />`;
      })
      .join('');
    parts.push(
      `<g clip-path="url(#${clipId(individual.id)})">${quarterRects}</g>`,
    );
  }

  // Deceased slash (bottom-left to top-right with overshoot).
  const isDeceased =
    individual.vitalStatus === VitalStatus.Deceased ||
    individual.vitalStatus === VitalStatus.Stillborn;
  if (isDeceased) {
    const o = DECEASED_SLASH_OVERSHOOT;
    parts.push(
      `<line x1="${num(-(half + o))}" y1="${num(half + o)}" x2="${num(
        half + o,
      )}" y2="${num(-(half + o))}" stroke="${SYMBOL_COLOR}" stroke-width="${SYMBOL_STROKE_WIDTH}" />`,
    );
  }

  // Proband / consultand arrow.
  if (individual.isProband || (individual.isConsultand ?? false)) {
    const offset = 8;
    const arrowLen = 14;
    const startX = -(half + offset + arrowLen);
    const startY = half + offset + arrowLen;
    const endX = -(half + offset);
    const endY = half + offset;
    parts.push(renderArrow(startX, startY, endX, endY, SYMBOL_COLOR));
    if (individual.isProband) {
      parts.push(
        `<text x="${num(startX - 12)}" y="${num(
          startY - 6 + 11,
        )}" font-size="11" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" font-weight="bold" fill="${SYMBOL_COLOR}">P</text>`,
      );
    }
  }

  // Individual number at the symbol's bottom-right corner (pedigree
  // convention). Left-anchored just outside the shape's bounding box. Konva
  // places its Text top at y = half - FONT/2; the SVG baseline sits FONT below
  // the top, so the baseline lands at y = half + FONT/2.
  if (individualNumber != null) {
    const numberX = half + NUMBER_CORNER_GAP;
    const numberBaselineY = half + LABEL_FONT_SIZE / 2;
    parts.push(
      `<text x="${num(numberX)}" y="${num(
        numberBaselineY,
      )}" font-size="${LABEL_FONT_SIZE}" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${LABEL_COLOR}">${individualNumber}</text>`,
    );
  }

  // Text labels (centred under the symbol).
  const lines = buildLabelLines(individual);
  if (lines.length > 0) {
    const startY = SYMBOL_SIZE / 2 + LABEL_OFFSET_Y;
    const textParts = lines
      .map((line, index) => {
        // Konva Text positions y at the top of the line; SVG baseline sits at
        // ~font-size below the top, so add LABEL_FONT_SIZE to align baselines.
        const y = startY + index * LABEL_LINE_HEIGHT + LABEL_FONT_SIZE;
        return `<text x="0" y="${num(y)}" font-size="${LABEL_FONT_SIZE}" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" fill="${LABEL_COLOR}" text-anchor="middle">${escapeXml(line)}</text>`;
      })
      .join('');
    parts.push(textParts);
  }

  return `<g transform="translate(${num(individual.position.x)}, ${num(
    individual.position.y,
  )})">${parts.join('')}</g>`;
}

/**
 * Render an arrowhead line (Konva `Arrow` equivalent): a shaft plus a filled
 * triangular head at the end point.
 */
function renderArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): string {
  const pointerLength = 7;
  const pointerWidth = 7;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // Two base corners of the arrowhead, behind the tip.
  const backX = x2 - pointerLength * Math.cos(angle);
  const backY = y2 - pointerLength * Math.sin(angle);
  const perpX = (pointerWidth / 2) * Math.cos(angle + Math.PI / 2);
  const perpY = (pointerWidth / 2) * Math.sin(angle + Math.PI / 2);
  const c1x = backX + perpX;
  const c1y = backY + perpY;
  const c2x = backX - perpX;
  const c2y = backY - perpY;

  return [
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(
      y2,
    )}" stroke="${color}" stroke-width="1.5" />`,
    `<polygon points="${num(x2)},${num(y2)} ${num(c1x)},${num(c1y)} ${num(c2x)},${num(
      c2y,
    )}" fill="${color}" stroke="${color}" stroke-width="1.5" />`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Connection lines
// ---------------------------------------------------------------------------

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dashed = false,
): string {
  const dash = dashed ? ` stroke-dasharray="${DASH_PATTERN.join(' ')}"` : '';
  return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(
    y2,
  )}" stroke="${LINE_COLOR}" stroke-width="${LINE_WIDTH}"${dash} />`;
}

/** Render a partnership line, matching `PartnershipLine.tsx`. */
function renderPartnershipLine(
  partnership: PartnershipRelationship,
  individuals: Record<string, Individual>,
): string {
  const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
  const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;
  if (!p1 || !p2) return '';

  const mid = partnershipMidpoint(p1.position, p2.position);

  // Childless-union marks (infertility / no children), appended for any type.
  // Suppressed once the union has children on the canvas: a childless marker
  // would contradict the sibship it hangs over (mirrors PartnershipLine.tsx).
  const childless = ((): string => {
    if (!partnership.childlessStatus || partnership.childrenIds.length > 0) return '';
    const { stub, bars } = childlessMarks(mid, partnership.childlessStatus, {
      stub: CHILDLESS_STUB,
      barHalf: CHILDLESS_BAR_HALF,
      barGap: CHILDLESS_BAR_GAP,
    });
    const parts = [
      line(stub[0], stub[1], stub[2], stub[3]),
      ...bars.map((b) => line(b[0], b[1], b[2], b[3])),
    ];
    const reason = partnership.childlessReason?.trim();
    if (partnership.childlessStatus === 'infertility' && reason) {
      const baselineY = mid.y + CHILDLESS_STUB + RELATIONSHIP_LABEL_OFFSET + LABEL_FONT_SIZE;
      parts.push(
        `<text x="${num(mid.x)}" y="${num(
          baselineY,
        )}" text-anchor="middle" font-size="${LABEL_FONT_SIZE}" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" fill="${LABEL_COLOR}">${escapeXml(reason)}</text>`,
      );
    }
    return parts.join('');
  })();

  if (partnership.type === RelationshipType.Consanguinity) {
    const { a, b } = consanguinityLines(p1.position, p2.position, CONSANGUINITY_GAP);
    const parts = [line(a[0], a[1], a[2], a[3]), line(b[0], b[1], b[2], b[3])];
    const degree = partnership.consanguinityDegree?.trim();
    if (degree) {
      const baselineY = mid.y - CONSANGUINITY_GAP / 2 - RELATIONSHIP_LABEL_OFFSET;
      parts.push(
        `<text x="${num(mid.x)}" y="${num(
          baselineY,
        )}" text-anchor="middle" font-size="${LABEL_FONT_SIZE}" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" fill="${LABEL_COLOR}">${escapeXml(degree)}</text>`,
      );
    }
    return parts.join('') + childless;
  }

  if (partnership.type === RelationshipType.Separation) {
    const hashSize = 6;
    return [
      line(p1.position.x, p1.position.y, p2.position.x, p2.position.y),
      line(mid.x - 4, mid.y - hashSize, mid.x + 4, mid.y + hashSize),
      line(mid.x + 2, mid.y - hashSize, mid.x + 10, mid.y + hashSize),
    ].join('') + childless;
  }

  return line(p1.position.x, p1.position.y, p2.position.x, p2.position.y) + childless;
}

/** Render parent-child / sibship lines, matching `ParentChildLine.tsx`. */
function renderParentChildLines(
  partnership: PartnershipRelationship,
  individuals: Record<string, Individual>,
  parentChildLinks: Record<string, ParentChildRelationship>,
  twinGroups: Record<string, TwinGroup>,
): string {
  if (partnership.childrenIds.length === 0) return '';

  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c));
  if (children.length === 0) return '';

  const partners = getPresentPartners(individuals, partnership);
  // Twin members anchor the sibship bar at their group's apex (see
  // ParentChildLine) so a centred twins-only sibship collapses to no bar.
  const twinApexX = twinApexXByMember(twinGroups, individuals);
  const anchors = children.map((c) => ({
    x: twinApexX.get(c.id) ?? c.position.x,
    y: c.position.y,
  }));

  let parentDrop: [number, number, number, number] | null = null;
  let sibship: [number, number, number, number] | null = null;
  let childDrops: [number, number, number, number][] = [];

  if (partners.length === 0) {
    ({ sibship, childDrops } = computeParentlessSibshipSegments(anchors));
  } else {
    const anchorX = partners.reduce((s, p) => s + p.position.x, 0) / partners.length;
    const anchorY = partners.reduce((s, p) => s + p.position.y, 0) / partners.length;
    ({ parentDrop, sibship, childDrops } = computeParentChildSegments(anchorX, anchorY, anchors));
  }

  const parts: string[] = [];
  if (parentDrop) parts.push(line(...parentDrop));
  if (sibship) parts.push(line(...sibship));

  // Twin members are connected by renderTwinConnector — skip their individual
  // drops to avoid overlaying a plain bracket on top of the converging twin lines.
  const twinMemberIds = new Set(
    Object.values(twinGroups).flatMap((tg) => tg.individualIds),
  );

  children.forEach((child, i) => {
    if (twinMemberIds.has(child.id)) return;
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    // Mirror ParentChildLine.tsx: dash only an adoptive (non-biological) edge.
    parts.push(line(...childDrops[i], link?.isAdoptive ?? false));
  });

  return parts.join('');
}

/** Render a twin connector, matching `TwinConnector.tsx`. */
function renderTwinConnector(
  twinGroup: TwinGroup,
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
): string {
  const twins = twinGroup.individualIds
    .map((id) => individuals[id])
    .filter((t): t is Individual => Boolean(t));
  if (twins.length < 2) return '';

  const partnership = partnerships[twinGroup.parentPartnershipId];
  if (!partnership) return '';

  // Share the sibship-bar depth with renderParentChildLines so the V apex lands
  // on it for any number of present parents (0, 1, or 2). Earlier this required
  // BOTH partners and rendered nothing otherwise, leaving single-parent and
  // parentless twins unconnected.
  const childAnchors = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c))
    .map((c) => ({ x: c.position.x, y: c.position.y }));
  if (childAnchors.length === 0) return '';

  const partnerAnchors = getPresentPartners(individuals, partnership).map((p) => ({
    x: p.position.x,
    y: p.position.y,
  }));

  const sibshipY = computeSibshipY(partnerAnchors, childAnchors);
  const childrenY = Math.min(...twins.map((t) => t.position.y));
  const twinMidX = twins.reduce((sum, t) => sum + t.position.x, 0) / twins.length;

  const parts: string[] = [];

  // V-shaped lines from branch point to each twin.
  for (const twin of twins) {
    parts.push(line(twinMidX, sibshipY, twin.position.x, twin.position.y));
  }

  // Horizontal bar for monozygotic twins.
  if (twinGroup.twinType === TwinType.Monozygotic) {
    const barY = sibshipY + (childrenY - sibshipY) / 2;
    const projected = twins.map((t) => {
      const dx = t.position.x - twinMidX;
      const dy = t.position.y - sibshipY;
      const ratio = (barY - sibshipY) / dy;
      return twinMidX + dx * ratio;
    });
    const leftX = Math.min(...projected);
    const rightX = Math.max(...projected);
    parts.push(line(leftX, barY, rightX, barY));
  }

  // "?" at the convergence point for unknown zygosity.
  if (twinGroup.twinType === TwinType.Unknown) {
    const labelY = sibshipY - RELATIONSHIP_LABEL_OFFSET;
    parts.push(
      `<text x="${num(twinMidX)}" y="${num(
        labelY,
      )}" text-anchor="middle" font-size="${TWIN_UNKNOWN_FONT_SIZE}" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" font-weight="bold" fill="${LINE_COLOR}">?</text>`,
    );
  }

  return parts.join('');
}

// ---------------------------------------------------------------------------
// Free-text annotations
// ---------------------------------------------------------------------------

/**
 * Render a single free-text annotation as a positioned SVG `<text>`.
 *
 * Matches the on-canvas Konva `Text`: `position` is the CENTRE of the text
 * block, so the block is centred horizontally (`text-anchor="middle"`) and
 * vertically (its top sits half the block height above the centre). Multi-line
 * text is split into `<tspan>` rows spaced by the font size.
 */
function renderTextAnnotation(annotation: TextAnnotation): string {
  const lines = annotation.text.split('\n');
  const x = num(annotation.position.x);
  const blockHeight = lines.length * annotation.fontSize;
  const top = annotation.position.y - blockHeight / 2;
  const firstBaselineY = num(top + annotation.fontSize);

  const tspans = lines
    .map((lineText, index) => {
      const dy = index === 0 ? 0 : annotation.fontSize;
      return `<tspan x="${x}" dy="${num(dy)}">${escapeXml(lineText)}</tspan>`;
    })
    .join('');

  return `<text x="${x}" y="${firstBaselineY}" text-anchor="middle" font-size="${num(
    annotation.fontSize,
  )}" font-family="${escapeXml(
    LABEL_FONT_FAMILY,
  )}" fill="${LABEL_COLOR}">${tspans}</text>`;
}

// ---------------------------------------------------------------------------
// Legend / key box
// ---------------------------------------------------------------------------

/** Render the legend "Key" box, matching `LegendLayer.tsx`. */
function renderLegend(
  entries: LegendEntry[],
  investigations: Investigation[],
  legendX: number,
  legendY: number,
): { markup: string; right: number; bottom: number } {
  if (entries.length === 0 && investigations.length === 0) {
    return { markup: '', right: legendX, bottom: legendY };
  }

  const hasBothGender = entries.some((e) => !e.applicableTo);
  const swatchWidth = legendSwatchWidth(hasBothGender);
  const contentWidth = legendContentWidth(hasBothGender);

  // Investigations add one self-describing "label = description" row each.
  const contentHeight = legendContentHeight(entries.length, investigations.length);

  const parts: string[] = [];

  // Background.
  parts.push(
    `<rect x="0" y="0" width="${num(contentWidth)}" height="${num(
      contentHeight,
    )}" fill="#ffffff" stroke="${SYMBOL_COLOR}" stroke-width="1" rx="4" ry="4" />`,
  );

  // Title.
  parts.push(
    `<text x="${LEGEND_PADDING}" y="${LEGEND_PADDING + 14}" font-size="14" font-family="${escapeXml(
      LABEL_FONT_FAMILY,
    )}" font-weight="bold" fill="${SYMBOL_COLOR}">Key</text>`,
  );

  // Condition entries.
  entries.forEach((entry, idx) => {
    const rowY = legendEntryRowY(idx);
    const showBoth = !entry.applicableTo;
    const showSquare = entry.applicableTo === 'man' || showBoth;
    const showCircle = entry.applicableTo === 'woman' || showBoth;

    if (showSquare) {
      parts.push(renderLegendSwatch(LEGEND_PADDING, rowY, GenderIdentity.Man, entry));
    }
    if (showCircle) {
      const sx = showBoth ? LEGEND_PADDING + LEGEND_SWATCH_SIZE + 4 : LEGEND_PADDING;
      parts.push(renderLegendSwatch(sx, rowY, GenderIdentity.Woman, entry));
    }

    parts.push(
      `<text x="${LEGEND_PADDING + swatchWidth + 8}" y="${num(
        rowY + 4 + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${SYMBOL_COLOR}">${escapeXml(`= ${entry.name}`)}</text>`,
    );
  });

  // Investigation rows ("label = description"), continuing straight on from the
  // condition entries with no separate subheading.
  investigations.forEach((investigation, idx) => {
    const rowY = legendInvestigationRowY(entries.length, idx);
    parts.push(
      `<text x="${LEGEND_PADDING}" y="${num(
        rowY + 4 + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${SYMBOL_COLOR}">${escapeXml(formatInvestigation(investigation))}</text>`,
    );
  });

  const markup = `<g transform="translate(${num(legendX)}, ${num(legendY)})">${parts.join(
    '',
  )}</g>`;

  return {
    markup,
    right: legendX + contentWidth,
    bottom: legendY + contentHeight,
  };
}

/** Render a single legend swatch (shape outline + quarter fill). */
function renderLegendSwatch(
  x: number,
  y: number,
  gender: GenderIdentity,
  entry: LegendEntry,
): string {
  const size = LEGEND_SWATCH_SIZE;
  const half = size / 2;
  const cx = x + half;
  const cy = y + half;

  const parts: string[] = [];

  // Background shape (matches LegendLayer: square for man, circle otherwise).
  if (gender === GenderIdentity.Man) {
    parts.push(
      `<rect x="${-half}" y="${-half}" width="${size}" height="${size}" fill="#ffffff" stroke="${SYMBOL_COLOR}" stroke-width="1" />`,
    );
  } else {
    parts.push(
      `<circle cx="0" cy="0" r="${half - 0.5}" fill="#ffffff" stroke="${SYMBOL_COLOR}" stroke-width="1" />`,
    );
  }

  // Quarter fill, clipped to the swatch shape.
  const qx = entry.quarter === 'topLeft' || entry.quarter === 'bottomLeft' ? -half : 0;
  const qy = entry.quarter === 'topLeft' || entry.quarter === 'topRight' ? -half : 0;
  const fill =
    entry.fillPattern === 'solid'
      ? entry.fillColor
      : `url(#${patternId(entry.fillPattern, entry.fillColor)})`;
  const clip =
    gender === GenderIdentity.Man
      ? `<rect x="${-half}" y="${-half}" width="${size}" height="${size}" />`
      : `<circle cx="0" cy="0" r="${half}" />`;
  const swatchClipId = `legendclip-${gender}-${entry.id}`;
  parts.push(
    `<clipPath id="${swatchClipId}">${clip}</clipPath>`,
    `<g clip-path="url(#${swatchClipId})"><rect x="${qx}" y="${qy}" width="${half}" height="${half}" fill="${fill}" /></g>`,
  );

  return `<g transform="translate(${num(cx)}, ${num(cy)})">${parts.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Bounds / viewBox calculation
// ---------------------------------------------------------------------------

interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyExtent(): Extent {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function expand(extent: Extent, x: number, y: number): void {
  extent.minX = Math.min(extent.minX, x);
  extent.minY = Math.min(extent.minY, y);
  extent.maxX = Math.max(extent.maxX, x);
  extent.maxY = Math.max(extent.maxY, y);
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build a true vector SVG document string from a pedigree document.
 *
 * The pedigree is rendered directly from the data model as native SVG
 * primitives (shapes, lines, paths, patterns, text) so the output stays crisp
 * at any scale — no rasterization. Output is deterministic for a given input,
 * which makes it suitable for snapshot testing.
 *
 * Grid, bounds rectangle, and selection/hover chrome are intentionally omitted.
 *
 * @param doc - The pedigree document to render.
 * @param title - Title used for the `<title>` element / accessibility.
 * @returns A well-formed standalone SVG document string.
 */
export function buildPedigreeSvg(doc: PedigreeDocument, title = ''): string {
  const individuals = Object.values(doc.individuals);
  const entries = doc.legendConfig.entries;

  const individualNumbers = computeIndividualNumbers(individuals);
  const generationLabels = computeGenerationNumerals(individuals);

  // ---- Collect pattern + clip defs --------------------------------------
  const patternDefs = new Map<string, string>();
  const clipDefs: string[] = [];

  for (const ind of individuals) {
    const activeQuarters = getActiveQuarters(ind, entries);
    if (activeQuarters.length > 0) {
      clipDefs.push(
        `<clipPath id="${clipId(ind.id)}">${clipShapeElement(ind, SYMBOL_SIZE)}</clipPath>`,
      );
    }
  }

  // Patterns used by both symbols and legend swatches.
  for (const entry of entries) {
    if (entry.fillPattern !== 'solid') {
      const id = patternId(entry.fillPattern, entry.fillColor);
      if (!patternDefs.has(id)) {
        patternDefs.set(
          id,
          `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${PATTERN_TILE_SIZE}" height="${PATTERN_TILE_SIZE}">${patternTileBody(
            entry.fillPattern,
            entry.fillColor,
          )}</pattern>`,
        );
      }
    }
  }

  // ---- Render content groups --------------------------------------------
  const connectionMarkup: string[] = [];
  for (const partnership of Object.values(doc.partnerships)) {
    connectionMarkup.push(renderPartnershipLine(partnership, doc.individuals));
  }
  for (const partnership of Object.values(doc.partnerships)) {
    connectionMarkup.push(
      renderParentChildLines(partnership, doc.individuals, doc.parentChildLinks, doc.twinGroups),
    );
  }
  for (const twinGroup of Object.values(doc.twinGroups)) {
    connectionMarkup.push(
      renderTwinConnector(twinGroup, doc.individuals, doc.partnerships),
    );
  }

  const symbolMarkup: string[] = [];
  for (const ind of individuals) {
    symbolMarkup.push(renderIndividual(ind, individualNumbers.get(ind.id), entries));
  }

  // ---- Free-text annotations --------------------------------------------
  const annotations = Object.values(doc.textAnnotations);
  const annotationMarkup: string[] = [];
  for (const annotation of annotations) {
    annotationMarkup.push(renderTextAnnotation(annotation));
  }

  // ---- Generation numerals ----------------------------------------------
  // Canvas places these at `bounds.x + 10`; reuse computeBounds for parity.
  const bounds = computeBounds(individuals);
  const generationMarkup: string[] = [];
  if (bounds) {
    for (const label of generationLabels) {
      generationMarkup.push(
        `<text x="${num(bounds.x + 10)}" y="${num(
          label.y - 7 + 14,
        )}" font-size="14" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" font-weight="bold" fill="${LABEL_COLOR}">${escapeXml(label.roman)}</text>`,
      );
    }
  }

  // ---- Legend ------------------------------------------------------------
  // Canvas positions the legend below the bounds rect (bounds.x+10, bottom+16).
  const legendX = bounds ? bounds.x + 10 : doc.legendConfig.position.x;
  const legendY = bounds
    ? bounds.y + bounds.height + 16
    : doc.legendConfig.position.y;
  const legend = renderLegend(entries, collectInvestigations(individuals), legendX, legendY);

  // ---- Compute tight viewBox over all rendered content -------------------
  const extent = emptyExtent();

  for (const ind of individuals) {
    const half = SYMBOL_SIZE / 2;
    // Symbol box plus deceased-slash overshoot / arrow reach.
    const reach = half + DECEASED_SLASH_OVERSHOOT + 22;
    expand(extent, ind.position.x - reach, ind.position.y - half);
    expand(extent, ind.position.x + reach, ind.position.y + half);
    // Label lines extend below the symbol.
    const lines = buildLabelLines(ind);
    if (lines.length > 0) {
      const labelBottom =
        ind.position.y +
        SYMBOL_SIZE / 2 +
        LABEL_OFFSET_Y +
        lines.length * LABEL_LINE_HEIGHT +
        LABEL_FONT_SIZE;
      expand(extent, ind.position.x - 60, labelBottom);
      expand(extent, ind.position.x + 60, labelBottom);
    }
  }

  if (bounds) {
    // Generation numerals sit at bounds.x + 10.
    expand(extent, bounds.x + 6, bounds.y);
  }

  for (const annotation of annotations) {
    const lines = annotation.text.split('\n');
    // Rough monospace-ish glyph width estimate; only used for viewBox padding.
    const longest = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const estWidth = longest * annotation.fontSize * 0.6;
    const estHeight = lines.length * annotation.fontSize;
    expand(extent, annotation.position.x, annotation.position.y);
    expand(
      extent,
      annotation.position.x + estWidth,
      annotation.position.y + estHeight,
    );
  }

  if (legend.markup) {
    expand(extent, legendX, legendY);
    expand(extent, legend.right, legend.bottom);
  }

  // Fall back to a small default canvas when there is no content.
  if (!Number.isFinite(extent.minX)) {
    extent.minX = 0;
    extent.minY = 0;
    extent.maxX = 400;
    extent.maxY = 300;
  }

  const vbX = extent.minX - VIEWBOX_PADDING;
  const vbY = extent.minY - VIEWBOX_PADDING;
  const vbWidth = extent.maxX - extent.minX + VIEWBOX_PADDING * 2;
  const vbHeight = extent.maxY - extent.minY + VIEWBOX_PADDING * 2;

  // ---- Assemble document -------------------------------------------------
  const defs = [...patternDefs.values(), ...clipDefs].join('');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(vbWidth)}" height="${num(
      vbHeight,
    )}" viewBox="${num(vbX)} ${num(vbY)} ${num(vbWidth)} ${num(vbHeight)}">`,
    `<title>${escapeXml(title)}</title>`,
    defs ? `<defs>${defs}</defs>` : '',
    `<rect x="${num(vbX)}" y="${num(vbY)}" width="${num(vbWidth)}" height="${num(
      vbHeight,
    )}" fill="#ffffff" />`,
    `<g class="connections">${connectionMarkup.join('')}</g>`,
    `<g class="symbols">${symbolMarkup.join('')}</g>`,
    `<g class="annotations">${annotationMarkup.join('')}</g>`,
    `<g class="generations">${generationMarkup.join('')}</g>`,
    `<g class="legend">${legend.markup}</g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');

  return svg;
}

/**
 * Build a true vector SVG of the pedigree document and trigger a browser
 * download. The SVG is rendered from the data model (not a Konva
 * rasterization), so it remains crisp at any scale.
 *
 * @param doc - The pedigree document to export.
 * @param title - The export title; also used as the download filename.
 */
export function exportToSvg(doc: PedigreeDocument, title: string): void {
  const svgString = buildPedigreeSvg(doc, title);

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
