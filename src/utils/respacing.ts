import type { Individual } from '../types/pedigree';

/** A node participating in horizontal respacing: an id and its x position. */
export interface RespaceNode {
  id: string;
  x: number;
}

/**
 * Bounded "push-right to remove overlap" respacing for a single horizontal row.
 *
 * Sorts the nodes by ascending x, then sweeps left to right. Whenever a node is
 * closer than `minSpacing` to its (already-resolved) left neighbour, it is
 * pushed right to exactly `prevX + minSpacing`. Nodes that are already at least
 * `minSpacing` apart are left untouched, so this never collapses or widens gaps
 * that are already acceptable (e.g. partners spaced wider than `minSpacing`).
 *
 * The transformation is deterministic and order-preserving: the returned array
 * is ordered by ascending resolved x, and every input node appears exactly once.
 *
 * @param nodes - The nodes to respace; not mutated.
 * @param minSpacing - The minimum allowed horizontal gap between adjacent nodes.
 * @returns A new array of nodes with adjusted x values, ordered left to right.
 */
export function respaceRow(
  nodes: readonly RespaceNode[],
  minSpacing: number,
): RespaceNode[] {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);

  const result: RespaceNode[] = [];
  let prevX: number | null = null;

  for (const node of sorted) {
    let x = node.x;
    if (prevX !== null && x - prevX < minSpacing) {
      x = prevX + minSpacing;
    }
    result.push({ id: node.id, x });
    prevX = x;
  }

  return result;
}

/**
 * Apply {@link respaceRow} to every individual in a single generation and report
 * which ones need to move.
 *
 * Filters the document's individuals down to those whose `generation` equals the
 * target generation, respaces that row, and returns a map of id -> new x for
 * ONLY the nodes whose x actually changed. Individuals in other generations (or
 * with an undefined generation) are ignored entirely, keeping the operation
 * bounded to the affected generation.
 *
 * @param individuals - All individuals in the document, keyed by id.
 * @param generation - The generation to respace.
 * @param minSpacing - The minimum allowed horizontal gap between adjacent nodes.
 * @returns A map of individual id to new x, containing only moved individuals.
 */
export function respaceGeneration(
  individuals: Record<string, Individual>,
  generation: number,
  minSpacing: number,
): Record<string, number> {
  const row: RespaceNode[] = [];
  for (const individual of Object.values(individuals)) {
    if (individual.generation === generation) {
      row.push({ id: individual.id, x: individual.position.x });
    }
  }

  const respaced = respaceRow(row, minSpacing);

  // Index original x by id so we can report only the nodes that actually moved.
  const originalX = new Map(row.map((node) => [node.id, node.x]));

  const moved: Record<string, number> = {};
  for (const node of respaced) {
    if (originalX.get(node.id) !== node.x) {
      moved[node.id] = node.x;
    }
  }

  return moved;
}
