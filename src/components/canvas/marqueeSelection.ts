/** An axis-aligned rectangle in canvas space (top-left origin). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A selectable node's bounding box in canvas space (top-left origin). */
export interface NodeBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize two drag-corner points into a positive-size rectangle, regardless
 * of drag direction.
 */
export function marqueeRect(
  start: { x: number; y: number },
  current: { x: number; y: number },
): Rect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

/**
 * Return the ids of every box that overlaps `rect`. Edge-touching counts as
 * overlap (inclusive bounds), matching Excalidraw's marquee behavior.
 */
export function idsIntersectingMarquee(rect: Rect, boxes: NodeBox[]): string[] {
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  return boxes
    .filter((box) => {
      const boxRight = box.x + box.width;
      const boxBottom = box.y + box.height;
      return (
        box.x <= rectRight &&
        boxRight >= rect.x &&
        box.y <= rectBottom &&
        boxBottom >= rect.y
      );
    })
    .map((box) => box.id);
}
