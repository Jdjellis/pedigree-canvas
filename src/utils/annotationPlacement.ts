import type { Individual, Position, TextAnnotation } from '../types/pedigree';
import { ANNOTATION_DROP_GAP, SYMBOL_SIZE } from './constants';

/**
 * Vertical room reserved below an individual symbol's centre for its name/age
 * label lines, so a dropped annotation clears them. Sized generously (1.5×
 * the symbol) to cover the usual two-to-three label lines.
 */
const INDIVIDUAL_LABEL_CLEARANCE = SYMBOL_SIZE * 1.5;

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
 * @returns The rounded canvas position for the new annotation (its top-left).
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
