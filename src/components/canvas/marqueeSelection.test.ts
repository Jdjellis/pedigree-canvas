import { describe, it, expect } from 'vitest';
import { marqueeRect, idsIntersectingMarquee } from './marqueeSelection';

describe('marqueeRect', () => {
  it('normalizes a bottom-right drag', () => {
    expect(marqueeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    });
  });

  it('normalizes a top-left drag into a positive-size rect', () => {
    expect(marqueeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    });
  });
});

describe('idsIntersectingMarquee', () => {
  const boxes = [
    { id: 'a', x: 0, y: 0, width: 40, height: 40 },
    { id: 'b', x: 100, y: 100, width: 40, height: 40 },
    { id: 'c', x: 200, y: 0, width: 40, height: 40 },
  ];

  it('returns ids whose box overlaps the rect', () => {
    const rect = { x: -10, y: -10, width: 130, height: 130 };
    expect(idsIntersectingMarquee(rect, boxes).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when nothing overlaps', () => {
    expect(idsIntersectingMarquee({ x: 500, y: 500, width: 10, height: 10 }, boxes)).toEqual([]);
  });

  it('counts edge-touching as overlap', () => {
    // rect right edge at x=0 touches box 'a' left edge at x=0
    expect(idsIntersectingMarquee({ x: -10, y: 0, width: 10, height: 40 }, boxes)).toEqual(['a']);
  });
});
