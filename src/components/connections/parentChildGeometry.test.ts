import { describe, it, expect } from 'vitest';
import { computeParentChildSegments } from './parentChildGeometry';

/**
 * Regression coverage for the broken parent-child connector (issue #13
 * follow-up): a single child offset horizontally from the parents' midpoint
 * left two disconnected vertical stubs because the horizontal sibship line was
 * only drawn for two-or-more children.
 */
describe('computeParentChildSegments', () => {
  it('draws a horizontal elbow when a single child is offset from the midpoint', () => {
    // Parents centred at x=775; their only child sits at x=937 (offset right).
    const { parentDrop, sibship, childDrops } = computeParentChildSegments(
      775,
      300,
      [{ x: 937, y: 600 }],
    );
    const sibshipY = 450; // 300 + (600 - 300) / 2

    expect(parentDrop).toEqual([775, 300, 775, sibshipY]);
    // The elbow must exist and bridge the parents' drop x to the child's drop x,
    // so the connector is continuous rather than two dangling stubs.
    expect(sibship).toEqual([775, sibshipY, 937, sibshipY]);
    expect(childDrops).toEqual([[937, sibshipY, 937, 600]]);
  });

  it('omits the elbow only when a single child sits directly under the midpoint', () => {
    const { sibship, parentDrop, childDrops } = computeParentChildSegments(
      500,
      100,
      [{ x: 500, y: 300 }],
    );

    expect(sibship).toBeNull();
    // Parent drop and child drop share the same x, forming one continuous line.
    expect(parentDrop).toEqual([500, 100, 500, 200]);
    expect(childDrops).toEqual([[500, 200, 500, 300]]);
  });

  it('spans the elbow across the parents and all children for multiple children', () => {
    // Midpoint (300) lies left of both children; the elbow must reach it.
    const { sibship } = computeParentChildSegments(
      300,
      100,
      [
        { x: 400, y: 300 },
        { x: 600, y: 300 },
      ],
    );

    expect(sibship).toEqual([300, 200, 600, 200]);
  });
});
