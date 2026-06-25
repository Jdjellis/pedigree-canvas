/**
 * Pure geometry for the parent -> child connector ("sibship") routing.
 *
 * A parent-child connector is drawn as three kinds of segment:
 *   1. a vertical drop from the partnership midpoint down to the sibship line;
 *   2. a horizontal sibship line at that depth; and
 *   3. a vertical drop from the sibship line down to each child.
 *
 * The horizontal sibship line must span far enough to join the parents' drop
 * to every child's drop. Earlier this line was only drawn for two-or-more
 * children, so a single child whose x differed from the parents' midpoint (from
 * auto-spacing or a horizontal drag) left two disconnected vertical stubs with
 * a gap between them (issue #13 follow-up). Spanning from
 * `min(partnershipMidX, ...childXs)` to `max(partnershipMidX, ...childXs)` and
 * drawing it whenever there is any horizontal offset fixes that.
 *
 * Kept free of react-konva so it can be unit-tested without a canvas.
 */

export type LineSegment = [number, number, number, number];

export interface ChildAnchor {
  /** x of the child's symbol (where its drop lands). */
  x: number;
  /** y of the child's symbol. */
  y: number;
}

export interface ParentChildSegments {
  /** Depth of the horizontal sibship line. */
  sibshipY: number;
  /** Vertical drop from the partnership midpoint to the sibship line. */
  parentDrop: LineSegment;
  /**
   * Horizontal sibship line joining the parents' drop to every child drop.
   * `null` only when nothing is horizontally offset (a single child sitting
   * directly under the partnership midpoint), where the parent drop already
   * reaches the child.
   */
  sibship: LineSegment | null;
  /** Vertical drop from the sibship line down to each child, in input order. */
  childDrops: LineSegment[];
}

/**
 * Compute the segments for a parent-child connector.
 *
 * @param partnershipMidX x midpoint between the two partners.
 * @param partnershipY    y of the partnership line.
 * @param children        anchor points of the children (must be non-empty).
 */
export function computeParentChildSegments(
  partnershipMidX: number,
  partnershipY: number,
  children: ChildAnchor[],
): ParentChildSegments {
  // Sibship line sits halfway between the partnership and the topmost child.
  const childTopY = Math.min(...children.map((c) => c.y));
  const sibshipY = partnershipY + (childTopY - partnershipY) / 2;

  const childXs = children.map((c) => c.x);
  const spanMinX = Math.min(partnershipMidX, ...childXs);
  const spanMaxX = Math.max(partnershipMidX, ...childXs);

  return {
    sibshipY,
    parentDrop: [partnershipMidX, partnershipY, partnershipMidX, sibshipY],
    sibship:
      spanMinX === spanMaxX
        ? null
        : [spanMinX, sibshipY, spanMaxX, sibshipY],
    childDrops: children.map((c) => [c.x, sibshipY, c.x, c.y]),
  };
}
