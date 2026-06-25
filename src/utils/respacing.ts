import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../types/pedigree';

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

/**
 * Collect the ids of every blood descendant of `rootId` — its children, their
 * children, and so on — by walking the partnerships the node (and each
 * descendant) participates in and gathering their `childrenIds`.
 *
 * The root itself is excluded. Partners married *into* the line are excluded
 * too: only the children flowing down from `rootId` are returned. This is what
 * lets a "rigid subtree" shift move a node together with everything hanging
 * below it, without dragging unrelated in-laws sideways.
 *
 * @param rootId - The individual whose descendants to collect.
 * @param partnerships - All partnerships in the document, keyed by id.
 * @returns A set of descendant individual ids (never containing `rootId`).
 */
export function collectDescendants(
  rootId: string,
  partnerships: Record<string, PartnershipRelationship>,
): Set<string> {
  const descendants = new Set<string>();
  const stack: string[] = [rootId];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const partnership of Object.values(partnerships)) {
      if (
        partnership.partner1Id !== current &&
        partnership.partner2Id !== current
      ) {
        continue;
      }
      for (const childId of partnership.childrenIds) {
        if (childId === rootId || descendants.has(childId)) continue;
        descendants.add(childId);
        stack.push(childId);
      }
    }
  }

  return descendants;
}

/**
 * Subtree-aware variant of {@link respaceGeneration}. Respaces the target
 * generation to remove overlaps, then propagates each node's horizontal shift
 * down through its whole subtree so descendants travel rigidly with the node
 * that moved (a sibling and its children stay vertically aligned instead of
 * tearing apart).
 *
 * Only the generation row itself is collision-resolved; descendant rows are
 * translated, never re-packed, keeping the operation bounded to the affected
 * sub-tree.
 *
 * @param individuals - All individuals in the document, keyed by id.
 * @param partnerships - All partnerships, used to walk descendants.
 * @param generation - The generation to respace.
 * @param minSpacing - The minimum allowed horizontal gap between adjacent nodes.
 * @returns A map of individual id to new x, for the moved generation nodes AND
 *   every descendant carried along, containing only individuals that moved.
 */
export function respaceGenerationWithSubtrees(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  generation: number,
  minSpacing: number,
): Record<string, number> {
  const moved = respaceGeneration(individuals, generation, minSpacing);

  const result: Record<string, number> = { ...moved };
  for (const [id, newX] of Object.entries(moved)) {
    const delta = newX - individuals[id].position.x;
    if (delta === 0) continue;
    for (const descId of collectDescendants(id, partnerships)) {
      const descendant = individuals[descId];
      if (!descendant) continue;
      result[descId] = descendant.position.x + delta;
    }
  }

  return result;
}

/**
 * Make lateral room for a partner just added beside `targetId`. The target and
 * the new partner stay put — the union is anchored — while every
 * same-generation node on the partner's side of the target is swept outward,
 * carrying its subtree, until it clears the partner by at least `minSpacing`.
 * Left-to-right order and existing gaps are preserved, and nodes that already
 * clear the partner are left untouched.
 *
 * This is what lets "add a partner to someone who has siblings" push the
 * siblings (and their descendants) aside to fit the new union, instead of the
 * partner itself being shoved away from its mate.
 *
 * @param individuals - All individuals in the document, keyed by id.
 * @param partnerships - All partnerships, used to walk subtrees.
 * @param targetId - The existing individual the partner was added to.
 * @param partnerId - The newly added partner.
 * @param minSpacing - The minimum allowed horizontal gap between adjacent nodes.
 * @returns A map of individual id to new x for every node pushed aside and every
 *   descendant carried with it; empty when nothing needs to move.
 */
export function makeRoomForPartner(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  targetId: string,
  partnerId: string,
  minSpacing: number,
): Record<string, number> {
  const target = individuals[targetId];
  const partner = individuals[partnerId];
  if (!target || !partner) return {};
  const generation = target.generation;
  if (generation === undefined) return {};

  // Collect this generation's ids and group them into rigid blocks: a couple
  // sharing a partnership in this generation moves as one unit, so re-spacing
  // never compresses an existing union. Union-find over same-generation
  // partnerships, plus the new target+partner pairing, builds the blocks.
  const genIds: string[] = [];
  for (const node of Object.values(individuals)) {
    if (node.generation === generation) genIds.push(node.id);
  }
  const inGen = new Set(genIds);

  const parent = new Map<string, string>(genIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  const unite = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const partnership of Object.values(partnerships)) {
    if (inGen.has(partnership.partner1Id) && inGen.has(partnership.partner2Id)) {
      unite(partnership.partner1Id, partnership.partner2Id);
    }
  }
  // The new union is not in `partnerships` yet; anchor the partner to the target.
  unite(targetId, partnerId);

  interface Block {
    ids: string[];
    minX: number;
    maxX: number;
  }
  const blocks = new Map<string, Block>();
  for (const id of genIds) {
    const root = find(id);
    const x = individuals[id].position.x;
    const block = blocks.get(root);
    if (block) {
      block.ids.push(id);
      block.minX = Math.min(block.minX, x);
      block.maxX = Math.max(block.maxX, x);
    } else {
      blocks.set(root, { ids: [id], minX: x, maxX: x });
    }
  }

  const targetRoot = find(targetId);
  const targetBlock = blocks.get(targetRoot) as Block;
  const partnerOnRight = partner.position.x >= target.position.x;

  // Blocks on the partner's side of the target, swept outward in order.
  const sideBlocks = [...blocks.entries()]
    .filter(([root]) => root !== targetRoot)
    .map(([, block]) => block)
    .filter((block) =>
      partnerOnRight
        ? block.minX > target.position.x
        : block.maxX < target.position.x,
    )
    .sort((a, b) =>
      partnerOnRight ? a.minX - b.minX : b.maxX - a.maxX,
    );

  const moved: Record<string, number> = {};
  let prevEdge = partnerOnRight ? targetBlock.maxX : targetBlock.minX;
  for (const block of sideBlocks) {
    let delta = 0;
    if (partnerOnRight) {
      const gap = block.minX - prevEdge;
      if (gap < minSpacing) delta = minSpacing - gap;
    } else {
      const gap = prevEdge - block.maxX;
      if (gap < minSpacing) delta = -(minSpacing - gap);
    }
    if (delta !== 0) {
      for (const id of block.ids) {
        moved[id] = individuals[id].position.x + delta;
        for (const descId of collectDescendants(id, partnerships)) {
          const descendant = individuals[descId];
          if (descendant) moved[descId] = descendant.position.x + delta;
        }
      }
    }
    prevEdge = (partnerOnRight ? block.maxX : block.minX) + delta;
  }
  return moved;
}

/**
 * Compute new x positions for the two partners of `partnership` so that their
 * midpoint sits over the horizontal centre of their children, while preserving
 * the gap between the partners. This re-centres a couple over a sibling row that
 * has grown (or shifted) beneath them.
 *
 * @param individuals - All individuals in the document, keyed by id.
 * @param partnership - The parents' partnership whose children to centre over.
 * @returns A map of parent id to new x for the (up to two) parents that actually
 *   move; empty when there are no children, a parent is missing, or the couple
 *   is already centred.
 */
export function centerParentsOverChildren(
  individuals: Record<string, Individual>,
  partnership: PartnershipRelationship,
): Record<string, number> {
  const parent1 = individuals[partnership.partner1Id];
  const parent2 = individuals[partnership.partner2Id];
  if (!parent1 || !parent2) return {};

  const childXs: number[] = [];
  for (const childId of partnership.childrenIds) {
    const child = individuals[childId];
    if (child) childXs.push(child.position.x);
  }
  if (childXs.length === 0) return {};

  const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
  const parentCenter = (parent1.position.x + parent2.position.x) / 2;
  const shift = childCenter - parentCenter;
  if (shift === 0) return {};

  return {
    [parent1.id]: parent1.position.x + shift,
    [parent2.id]: parent2.position.x + shift,
  };
}

/**
 * Work out how far a freshly added pair of parents must slide sideways so they
 * clear the parents of `childId`'s partner(s) — the "in-laws" already sitting in
 * the same generation — leaving at least `minSpacing` between the two couples.
 *
 * The pair is moved as a rigid unit, away from the spouse's side, so the parents
 * stay centred relative to each other. Because the new parents start centred
 * over the child, applying the same shift to the child (and its subtree) keeps
 * the child centred under its new parents — see the caller in the store.
 *
 * @param individuals - All individuals in the document, keyed by id.
 * @param partnerships - All partnerships, used to find the child's spouse.
 * @param parentChildLinks - All parent-child links, used to find the spouse's
 *   parents.
 * @param newParent1Id - One of the newly added parents.
 * @param newParent2Id - The other newly added parent.
 * @param childId - The individual the parents were just added above.
 * @param minSpacing - The minimum allowed horizontal gap between the couples.
 * @returns The signed horizontal shift to apply to the new parents (and the
 *   child's subtree); `0` when no in-laws exist or the pair already clears them.
 */
export function computeParentClearanceShift(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  parentChildLinks: Record<string, ParentChildRelationship>,
  newParent1Id: string,
  newParent2Id: string,
  childId: string,
  minSpacing: number,
): number {
  const child = individuals[childId];
  const newParent1 = individuals[newParent1Id];
  const newParent2 = individuals[newParent2Id];
  if (!child || !newParent1 || !newParent2) return 0;

  // Find the child's spouse(s): partnerships where the child is a partner.
  const spouseIds: string[] = [];
  for (const partnership of Object.values(partnerships)) {
    if (partnership.partner1Id === childId) spouseIds.push(partnership.partner2Id);
    else if (partnership.partner2Id === childId) spouseIds.push(partnership.partner1Id);
  }
  if (spouseIds.length === 0) return 0;

  // Collect the x positions of every spouse's parents (the in-laws) plus the
  // average spouse x, so we know which side to retreat to.
  const inLawXs: number[] = [];
  let spouseXSum = 0;
  let spouseCount = 0;
  for (const spouseId of spouseIds) {
    const spouse = individuals[spouseId];
    if (spouse) {
      spouseXSum += spouse.position.x;
      spouseCount += 1;
    }
    for (const link of Object.values(parentChildLinks)) {
      if (link.childId !== spouseId) continue;
      const partnership = partnerships[link.parentPartnershipId];
      if (!partnership) continue;
      const p1 = individuals[partnership.partner1Id];
      const p2 = individuals[partnership.partner2Id];
      if (p1) inLawXs.push(p1.position.x);
      if (p2) inLawXs.push(p2.position.x);
    }
  }
  if (inLawXs.length === 0 || spouseCount === 0) return 0;

  const pairLeft = Math.min(newParent1.position.x, newParent2.position.x);
  const pairRight = Math.max(newParent1.position.x, newParent2.position.x);
  const spouseCenter = spouseXSum / spouseCount;

  if (child.position.x <= spouseCenter) {
    // Child is on the left of the union: keep its parents to the left, clearing
    // the leftmost in-law. A negative shift moves the pair further left.
    const inLawMin = Math.min(...inLawXs);
    const allowedRight = inLawMin - minSpacing;
    return pairRight > allowedRight ? allowedRight - pairRight : 0;
  }

  // Child is on the right: keep its parents to the right, clearing the rightmost
  // in-law. A positive shift moves the pair further right.
  const inLawMax = Math.max(...inLawXs);
  const allowedLeft = inLawMax + minSpacing;
  return pairLeft < allowedLeft ? allowedLeft - pairLeft : 0;
}
