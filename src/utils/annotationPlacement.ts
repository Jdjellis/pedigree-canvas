import type {
  Individual,
  PartnershipRelationship,
  Position,
  TextAnnotation,
} from '../types/pedigree';
import {
  ANNOTATION_DROP_GAP,
  ANNOTATION_GLYPH_WIDTH_RATIO,
  SYMBOL_SIZE,
} from './constants';

/**
 * Vertical room reserved below an individual symbol's centre for its name/age
 * label lines, so a dropped annotation clears them. Sized generously (1.5×
 * the symbol) to cover the usual two-to-three label lines.
 */
const INDIVIDUAL_LABEL_CLEARANCE = SYMBOL_SIZE * 1.5;

/** Click-to-symbol distance (canvas units) within which text snaps under a node. */
const NODE_SNAP_RADIUS = SYMBOL_SIZE * 1.5;
/** Click-to-line distance within which text snaps onto a partnership line. */
const LINE_SNAP_RADIUS = SYMBOL_SIZE * 0.75;
/** Gap left above a partnership line when a caption is centred on it. */
const LINE_ABOVE_GAP = 4;
/** Gap left between stacked annotations sharing a column under a symbol. */
const STACK_GAP = 8;
/** Horizontal tolerance for treating two annotations as in the same column. */
const COLUMN_HALF_WIDTH = SYMBOL_SIZE;

/** A text block's estimated rendered size in canvas units. */
export interface AnnotationBlockSize {
  width: number;
  height: number;
}

/**
 * Estimate a text block's rendered width and height without measuring it on a
 * canvas. The width uses {@link ANNOTATION_GLYPH_WIDTH_RATIO}; the height is one
 * font-size per line. Shared so the on-canvas box, viewport fit, and smart
 * placement all agree on a block's footprint.
 *
 * @param text The annotation text (may contain newlines).
 * @param fontSize Font size in canvas units.
 */
export function estimateAnnotationBlock(
  text: string,
  fontSize: number,
): AnnotationBlockSize {
  const lines = text.split('\n');
  const longest = lines.reduce((max, l) => Math.max(max, l.length), 0);
  return {
    width: Math.max(fontSize, longest * fontSize * ANNOTATION_GLYPH_WIDTH_RATIO),
    height: lines.length * fontSize,
  };
}

/** Squared distance from point `p` to the segment `a`–`b`. */
function distanceToSegment(p: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Smart placement for a text annotation created by clicking with the text tool.
 *
 * All positions are annotation **centres**. Resolution order:
 * 1. **Under a symbol** — if the click lands within {@link NODE_SNAP_RADIUS} of
 *    an individual, the caption is centred under that symbol, below its labels,
 *    and stacked below any caption already sharing that column so it never
 *    clashes with existing text.
 * 2. **On a partnership line** — otherwise, if the click is within
 *    {@link LINE_SNAP_RADIUS} of a union line, the caption is centred
 *    horizontally on the line, just above it.
 * 3. **At the cursor** — otherwise the caption is centred on the exact click.
 *
 * (Parent-child and sibship line snapping are intentionally left for a later
 * pass; partnership lines are the common case for a labelled relationship.)
 *
 * @param click Canvas-space click point (the desired centre).
 * @param fontSize Font size of the annotation being created.
 * @param individuals All individuals in the document.
 * @param annotations Existing annotations (centres) to avoid clashing with.
 * @param partnerships Partnership relationships, for union-line snapping.
 * @returns The rounded canvas centre for the new annotation.
 */
export function computeSmartTextPosition(
  click: Position,
  fontSize: number,
  individuals: Individual[],
  annotations: TextAnnotation[],
  partnerships: PartnershipRelationship[],
): Position {
  // --- 1. Snap under the nearest symbol within range -----------------------
  let nearest: Individual | null = null;
  let nearestDist = NODE_SNAP_RADIUS;
  for (const ind of individuals) {
    const d = Math.hypot(click.x - ind.position.x, click.y - ind.position.y);
    if (d <= nearestDist) {
      nearest = ind;
      nearestDist = d;
    }
  }

  if (nearest) {
    const cx = nearest.position.x;
    let top = nearest.position.y + INDIVIDUAL_LABEL_CLEARANCE;
    // Stack below any existing caption already sitting in this column.
    const column = annotations
      .map((a) => {
        const { height } = estimateAnnotationBlock(a.text, a.fontSize);
        return {
          cx: a.position.x,
          top: a.position.y - height / 2,
          bottom: a.position.y + height / 2,
        };
      })
      .filter((b) => Math.abs(b.cx - cx) <= COLUMN_HALF_WIDTH)
      .sort((p, q) => p.top - q.top);
    for (const box of column) {
      const candidateBottom = top + fontSize;
      if (candidateBottom > box.top && top < box.bottom) {
        top = box.bottom + STACK_GAP;
      }
    }
    return { x: Math.round(cx), y: Math.round(top + fontSize / 2) };
  }

  // --- 2. Snap onto the nearest partnership line within range --------------
  const byId = new Map(individuals.map((ind) => [ind.id, ind]));
  let bestLine: { x: number; y: number } | null = null;
  let bestLineDist = LINE_SNAP_RADIUS;
  for (const p of partnerships) {
    const a = p.partner1Id ? byId.get(p.partner1Id) : undefined;
    const b = p.partner2Id ? byId.get(p.partner2Id) : undefined;
    if (!a || !b) continue;
    const d = distanceToSegment(click, a.position, b.position);
    if (d <= bestLineDist) {
      bestLineDist = d;
      bestLine = {
        x: (a.position.x + b.position.x) / 2,
        y: (a.position.y + b.position.y) / 2,
      };
    }
  }
  if (bestLine) {
    return {
      x: Math.round(bestLine.x),
      y: Math.round(bestLine.y - fontSize / 2 - LINE_ABOVE_GAP),
    };
  }

  // --- 3. Fall back to the exact click point -------------------------------
  return { x: Math.round(click.x), y: Math.round(click.y) };
}

/**
 * Compute where a newly created free-text annotation should be placed so it
 * appears in clear space below the existing pedigree rather than on top of a
 * symbol or another annotation.
 *
 * The annotation is dropped {@link ANNOTATION_DROP_GAP} below the lowest piece
 * of content (any individual symbol incl. its labels, or any existing
 * annotation incl. its line count) and centred horizontally between the
 * leftmost and rightmost content. When there is no content yet, the supplied
 * `fallback` (e.g. the visible canvas centre) is used.
 *
 * @param individuals All individuals in the document.
 * @param annotations All existing text annotations in the document.
 * @param fallback Position to use when the document has no content.
 * @returns The rounded canvas centre for the new annotation. The drop gap is
 *   large relative to a single placeholder line, so the new annotation clears
 *   existing content even though `position` is now its centre.
 */
export function computeAnnotationDropPosition(
  individuals: Individual[],
  annotations: TextAnnotation[],
  fallback: Position,
): Position {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxBottom = -Infinity;

  for (const ind of individuals) {
    minX = Math.min(minX, ind.position.x);
    maxX = Math.max(maxX, ind.position.x);
    maxBottom = Math.max(maxBottom, ind.position.y + INDIVIDUAL_LABEL_CLEARANCE);
  }

  for (const annotation of annotations) {
    minX = Math.min(minX, annotation.position.x);
    maxX = Math.max(maxX, annotation.position.x);
    const lineCount = annotation.text.split('\n').length;
    maxBottom = Math.max(
      maxBottom,
      annotation.position.y + lineCount * annotation.fontSize,
    );
  }

  if (!Number.isFinite(maxBottom)) {
    return { x: Math.round(fallback.x), y: Math.round(fallback.y) };
  }

  return {
    x: Math.round((minX + maxX) / 2),
    y: Math.round(maxBottom + ANNOTATION_DROP_GAP),
  };
}
