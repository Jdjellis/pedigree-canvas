import { describe, it, expect } from 'vitest';
import { computeAnnotationDropPosition } from './annotationPlacement';
import { ANNOTATION_DROP_GAP, SYMBOL_SIZE } from './constants';
import type { Individual, TextAnnotation } from '../types/pedigree';

/** Minimal individual at a position; other fields are irrelevant to placement. */
function individualAt(x: number, y: number): Individual {
  return { position: { x, y } } as Individual;
}

function annotationAt(
  id: string,
  x: number,
  y: number,
  text = 'Note',
  fontSize = 18,
): TextAnnotation {
  return { id, x, y, text, fontSize, position: { x, y } } as unknown as TextAnnotation;
}

const FALLBACK = { x: 500, y: 300 };
const LABEL_CLEARANCE = SYMBOL_SIZE * 1.5;

describe('computeAnnotationDropPosition', () => {
  it('returns the fallback (rounded) when there is no content', () => {
    expect(
      computeAnnotationDropPosition([], [], { x: 500.4, y: 299.6 }),
    ).toEqual({ x: 500, y: 300 });
  });

  it('drops the annotation below a single individual, aligned to its x', () => {
    const pos = computeAnnotationDropPosition(
      [individualAt(100, 200)],
      [],
      FALLBACK,
    );
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200 + LABEL_CLEARANCE + ANNOTATION_DROP_GAP);
  });

  it('centres horizontally between the leftmost and rightmost individuals', () => {
    const pos = computeAnnotationDropPosition(
      [individualAt(0, 200), individualAt(200, 200)],
      [],
      FALLBACK,
    );
    expect(pos.x).toBe(100);
  });

  it('drops below the lowest individual, not the average', () => {
    const pos = computeAnnotationDropPosition(
      [individualAt(0, 100), individualAt(0, 400)],
      [],
      FALLBACK,
    );
    expect(pos.y).toBe(400 + LABEL_CLEARANCE + ANNOTATION_DROP_GAP);
  });

  it('stacks a new annotation below an existing one (accounting for line count)', () => {
    const existing = annotationAt('n1', 50, 600, 'line one\nline two', 20);
    const pos = computeAnnotationDropPosition([], [existing], FALLBACK);
    // existing bottom = 600 + 2 lines * 20 = 640
    expect(pos.y).toBe(640 + ANNOTATION_DROP_GAP);
    expect(pos.x).toBe(50);
  });

  it('drops below whichever of individuals or annotations sits lowest', () => {
    const lowIndividual = individualAt(0, 1000);
    const annotation = annotationAt('n1', 0, 100, 'x', 18);
    const pos = computeAnnotationDropPosition([lowIndividual], [annotation], FALLBACK);
    expect(pos.y).toBe(1000 + LABEL_CLEARANCE + ANNOTATION_DROP_GAP);
  });
});
