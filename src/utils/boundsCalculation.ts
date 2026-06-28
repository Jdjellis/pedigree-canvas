import type { Individual, TextAnnotation } from '../types/pedigree';
import { SYMBOL_SIZE } from './constants';
import { estimateAnnotationBlock } from './annotationPlacement';

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A tight axis-aligned bounding box around the visible content. */
export interface ContentExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Half a symbol — symbol `position` is its centre, so it spans ±this. */
const SYMBOL_HALF = SYMBOL_SIZE / 2;
/**
 * Extra room reserved below a symbol's centre for its name/age label lines so
 * "fit to content" does not clip them. Generous on purpose; the viewport fit
 * adds its own margin on top.
 */
const SYMBOL_LABEL_EXTENT = SYMBOL_SIZE;

/**
 * Compute a tight bounding box around every visible element — individual symbols
 * (including their label room) and free-text annotations — for "fit to content".
 *
 * Unlike {@link computeBounds}, this does **not** force a paper aspect ratio or a
 * minimum size; it returns the raw extent so the viewport can be centred and
 * scaled to show exactly what is on the canvas. Connection lines are spanned by
 * the individuals they join, so they need no separate accounting.
 *
 * @param individuals All individuals in the document.
 * @param annotations All free-text annotations (their `position` is the centre).
 * @returns The content extent, or `null` when there is nothing to fit.
 */
export function computeContentExtent(
  individuals: Individual[],
  annotations: TextAnnotation[] = [],
): ContentExtent | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ind of individuals) {
    minX = Math.min(minX, ind.position.x - SYMBOL_HALF);
    maxX = Math.max(maxX, ind.position.x + SYMBOL_HALF);
    minY = Math.min(minY, ind.position.y - SYMBOL_HALF);
    maxY = Math.max(maxY, ind.position.y + SYMBOL_HALF + SYMBOL_LABEL_EXTENT);
  }

  for (const annotation of annotations) {
    const { width, height } = estimateAnnotationBlock(
      annotation.text,
      annotation.fontSize,
    );
    const halfW = width / 2;
    const halfH = height / 2;
    minX = Math.min(minX, annotation.position.x - halfW);
    maxX = Math.max(maxX, annotation.position.x + halfW);
    minY = Math.min(minY, annotation.position.y - halfH);
    maxY = Math.max(maxY, annotation.position.y + halfH);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

const PADDING = 80;
const A4_LANDSCAPE_RATIO = 297 / 210;
const LETTER_LANDSCAPE_RATIO = 11 / 8.5;

export function computeBounds(individuals: Individual[]): CanvasBounds | null {
  if (individuals.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const ind of individuals) {
    minX = Math.min(minX, ind.position.x);
    minY = Math.min(minY, ind.position.y);
    maxX = Math.max(maxX, ind.position.x);
    maxY = Math.max(maxY, ind.position.y);
  }

  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;

  let width = maxX - minX;
  let height = maxY - minY;

  width = Math.max(width, 400);
  height = Math.max(height, 300);

  const currentRatio = width / height;
  const a4Diff = Math.abs(currentRatio - A4_LANDSCAPE_RATIO);
  const letterDiff = Math.abs(currentRatio - LETTER_LANDSCAPE_RATIO);
  const targetRatio = a4Diff < letterDiff ? A4_LANDSCAPE_RATIO : LETTER_LANDSCAPE_RATIO;

  if (currentRatio < targetRatio) {
    width = height * targetRatio;
  } else {
    height = width / targetRatio;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

export function toRomanNumeral(num: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  let n = num + 1; // generations are 0-indexed, display as 1-indexed
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      result += syms[i];
      n -= vals[i];
    }
  }
  return result;
}

/** A generation's display label: its stored value, Roman numeral, and y. */
export interface GenerationNumeral {
  /** The raw, stored generation integer (may be negative or > 0). */
  generation: number;
  /** Roman numeral with the topmost (minimum) generation always ranked "I". */
  roman: string;
  /** Average y position of the individuals in this generation. */
  y: number;
}

/**
 * Derive the left-margin generation numerals for a set of individuals.
 *
 * Roman numerals are ranked *relative* to the topmost generation: the minimum
 * generation present is always "I", the next is "II", and so on. This keeps the
 * ranking correct when a parent generation is inserted above existing founders
 * (which assigns the new parents a negative generation) without mutating any
 * stored generation integers.
 *
 * Generations are 0-indexed in the data model; individuals missing an explicit
 * generation are treated as generation 0. Results are ordered top-to-bottom by
 * generation, and each numeral is positioned at the average y of that
 * generation's individuals.
 *
 * @param individuals - The individuals to derive numerals for.
 * @returns One {@link GenerationNumeral} per distinct generation, ordered
 *   top-to-bottom; an empty array when there are no individuals.
 */
export function computeGenerationNumerals(
  individuals: Individual[],
): GenerationNumeral[] {
  const genYMap = new Map<number, number[]>();
  for (const ind of individuals) {
    const gen = ind.generation ?? 0;
    if (!genYMap.has(gen)) genYMap.set(gen, []);
    genYMap.get(gen)!.push(ind.position.y);
  }

  if (genYMap.size === 0) return [];

  const minGen = Math.min(...genYMap.keys());

  const numerals: GenerationNumeral[] = [];
  for (const [generation, ys] of genYMap) {
    const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
    numerals.push({
      generation,
      roman: toRomanNumeral(generation - minGen),
      y: avgY,
    });
  }
  numerals.sort((a, b) => a.generation - b.generation);
  return numerals;
}
