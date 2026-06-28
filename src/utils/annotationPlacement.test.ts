import { describe, it, expect } from 'vitest';
import {
  computeAnnotationDropPosition,
  computeSmartTextPosition,
  estimateAnnotationBlock,
} from './annotationPlacement';
import { ANNOTATION_DROP_GAP, SYMBOL_SIZE } from './constants';
import type {
  Individual,
  PartnershipRelationship,
  TextAnnotation,
} from '../types/pedigree';

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

describe('estimateAnnotationBlock', () => {
  it('uses the glyph-width ratio for the longest line and a font-size per line', () => {
    // 'AB' → max(10, 2 * 10 * 0.6 = 12) = 12; one line tall.
    expect(estimateAnnotationBlock('AB', 10)).toEqual({ width: 12, height: 10 });
  });

  it('measures multi-line text by its longest line and line count', () => {
    expect(estimateAnnotationBlock('a\nbbbb', 10)).toEqual({
      width: 24,
      height: 20,
    });
  });
});

describe('computeSmartTextPosition', () => {
  /** Individual with an id (needed for partnership-line lookup). */
  function indWithId(id: string, x: number, y: number): Individual {
    return { id, position: { x, y } } as Individual;
  }

  const FONT = 10;
  const LABEL_CLEARANCE = SYMBOL_SIZE * 1.5; // 60

  it('falls back to the exact (rounded) click when nothing is nearby', () => {
    expect(
      computeSmartTextPosition({ x: 500.6, y: 500.4 }, FONT, [], [], []),
    ).toEqual({ x: 501, y: 500 });
  });

  it('snaps a caption centred under the nearest symbol', () => {
    const pos = computeSmartTextPosition(
      { x: 108, y: 205 },
      FONT,
      [indWithId('a', 100, 200)],
      [],
      [],
    );
    // x = symbol x; centre y = symbol y + label clearance + half a line.
    expect(pos).toEqual({ x: 100, y: 200 + LABEL_CLEARANCE + FONT / 2 });
  });

  it('stacks below an existing caption already sitting under the symbol', () => {
    const existing: TextAnnotation = {
      id: 'n1',
      text: 'Note',
      position: { x: 100, y: 270 },
      fontSize: FONT,
    };
    const pos = computeSmartTextPosition(
      { x: 100, y: 205 },
      FONT,
      [indWithId('a', 100, 200)],
      [existing],
      [],
    );
    // existing block (height 10) spans 265..275; new caption stacks below with
    // an 8px gap → top 283, centre 288.
    expect(pos).toEqual({ x: 100, y: 288 });
  });

  it('centres a caption above a nearby partnership line', () => {
    const partners = [indWithId('p1', 0, 100), indWithId('p2', 200, 100)];
    const partnership = {
      partner1Id: 'p1',
      partner2Id: 'p2',
    } as PartnershipRelationship;
    const pos = computeSmartTextPosition(
      { x: 100, y: 112 },
      FONT,
      partners,
      [],
      [partnership],
    );
    // Midpoint x = 100; line y = 100; caption sits just above: 100 - 5 - 4 = 91.
    expect(pos).toEqual({ x: 100, y: 91 });
  });
});
