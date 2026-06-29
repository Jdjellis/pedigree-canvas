import type {
  Individual,
  PedigreeDocument,
} from '../types/pedigree';
import { SIBLING_SPACING, PARTNER_SPACING, GENERATION_SPACING } from './constants';

/** Horizontal/vertical spacing knobs for the tidy layout. */
export interface LayoutSpacing {
  siblingSpacing: number;
  partnerSpacing: number;
  generationSpacing: number;
}

/** Default spacing, sourced from the shared layout constants. */
export const DEFAULT_LAYOUT_SPACING: LayoutSpacing = {
  siblingSpacing: SIBLING_SPACING,
  partnerSpacing: PARTNER_SPACING,
  generationSpacing: GENERATION_SPACING,
};

/** The slice of a document the layout reads. */
export type LayoutDoc = Pick<
  PedigreeDocument,
  'individuals' | 'partnerships' | 'parentChildLinks'
>;

/** A laid-out subtree's horizontal footprint: its blood anchor and its extent. */
export interface Block {
  anchorX: number;
  minX: number;
  maxX: number;
}

/**
 * Order children by their current x (ascending), so a manual left-to-right
 * arrangement survives a relayout. Missing ids are dropped; x ties break by id
 * for determinism.
 */
export function orderChildrenByX(
  childIds: readonly string[],
  individuals: Record<string, Individual>,
): string[] {
  return [...childIds]
    .filter((id) => individuals[id])
    .sort((a, b) => {
      const ax = individuals[a].position.x;
      const bx = individuals[b].position.x;
      if (ax !== bx) return ax - bx;
      return a < b ? -1 : a > b ? 1 : 0;
    });
}

/**
 * True when `individualId` has its own parents present in the document, i.e. it
 * is "load-bearing" for its own blood family and must not be dragged across to
 * sit beside a spouse during another family's relayout.
 */
export function isLoadBearingInLaw(doc: LayoutDoc, individualId: string): boolean {
  return Object.values(doc.parentChildLinks).some(
    (l) => l.childId === individualId,
  );
}

/**
 * Climb parent links from `nodeId` to the topmost ancestor union of its
 * connected blood family. When the node is itself a founder (no parents), return
 * its own child-bearing union if it has one. Returns null when the node heads no
 * union. Guards against consanguinity cycles.
 */
export function findRootUnion(doc: LayoutDoc, nodeId: string): string | null {
  let childId = nodeId;
  let rootUnion: string | null = null;
  const seen = new Set<string>();
  while (true) {
    const parentLink = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === childId,
    );
    if (!parentLink) break;
    rootUnion = parentLink.parentPartnershipId;
    if (seen.has(rootUnion)) break;
    seen.add(rootUnion);
    const u = doc.partnerships[rootUnion];
    if (!u) break;
    const next = u.partner1Id ?? u.partner2Id;
    if (!next) break;
    childId = next;
  }
  if (rootUnion) return rootUnion;
  const own = Object.values(doc.partnerships).find(
    (p) =>
      (p.partner1Id === nodeId || p.partner2Id === nodeId) &&
      p.childrenIds.length > 0,
  );
  return own ? own.id : null;
}

/**
 * Position a blood individual (and its married-in partner, if any) centred on
 * `center`. A sole parent sits exactly on the centre; a couple splits by
 * `partnerSpacing`, preserving whichever side the in-law currently occupies.
 */
export function coupleAround(
  center: number,
  bloodId: string,
  inLawId: string | null,
  individuals: Record<string, Individual>,
  partnerSpacing: number,
): Record<string, number> {
  if (!inLawId || !individuals[inLawId]) return { [bloodId]: center };
  const bloodX = individuals[bloodId]?.position.x ?? 0;
  const inLawX = individuals[inLawId].position.x;
  const half = partnerSpacing / 2;
  return inLawX < bloodX
    ? { [inLawId]: center - half, [bloodId]: center + half }
    : { [bloodId]: center - half, [inLawId]: center + half };
}

/**
 * Pack laid-out sibling blocks left-to-right. Returns the x-offset to add to
 * each block so adjacent blocks clear each other by at least `spacing`
 * (measured between their extents). The first block keeps its own coordinates;
 * a block already clear of its predecessor is never pulled left.
 */
export function packBlocks(blocks: readonly Block[], spacing: number): number[] {
  const offsets: number[] = [];
  let prevMaxPlaced: number | null = null;
  for (const b of blocks) {
    let offset: number;
    if (prevMaxPlaced === null) {
      offset = 0;
    } else {
      offset = prevMaxPlaced + spacing - b.minX;
      if (offset < 0) offset = 0;
    }
    offsets.push(offset);
    prevMaxPlaced = b.maxX + offset;
  }
  return offsets;
}

/** A laid-out subtree in local frame coordinates. */
interface Frame {
  positions: Record<string, number>;
  anchorX: number;
  minX: number;
  maxX: number;
}

/**
 * Lay out the subtree headed by `childId` (a blood node): the child, its
 * married-in partner(s), and everything below. `anchorX` is the blood child's
 * own x, used by the parent union to centre over its children.
 */
function layoutChildBlock(
  childId: string,
  doc: LayoutDoc,
  spacing: LayoutSpacing,
  visited: Set<string>,
): Frame {
  const childUnions = Object.values(doc.partnerships).filter(
    (p) =>
      (p.partner1Id === childId || p.partner2Id === childId) &&
      p.childrenIds.length > 0,
  );
  if (childUnions.length === 0) {
    // Leaf — but the child may have a childless partner forming a couple block.
    const childless = Object.values(doc.partnerships).find(
      (p) => p.partner1Id === childId || p.partner2Id === childId,
    );
    const inLaw = childless
      ? childless.partner1Id === childId
        ? childless.partner2Id
        : childless.partner1Id
      : undefined;
    const placeInLaw =
      inLaw && doc.individuals[inLaw] && !isLoadBearingInLaw(doc, inLaw)
        ? inLaw
        : null;
    const positions = coupleAround(0, childId, placeInLaw, doc.individuals, spacing.partnerSpacing);
    const xs = Object.values(positions);
    return { positions, anchorX: positions[childId], minX: Math.min(...xs), maxX: Math.max(...xs) };
  }
  // Use the child's first child-bearing union as the primary line.
  const frame = layoutUnionFrame(childUnions[0].id, childId, doc, spacing, visited);
  return { ...frame, anchorX: frame.positions[childId] ?? frame.anchorX };
}

/**
 * Lay out the union `unionId`: its children (ordered by x, packed with sibling
 * spacing), then its partners centred over the children. `bloodPartnerId` is the
 * partner that descends from above (null at the root, where both partners are
 * founders). A load-bearing in-law is left in place rather than relocated.
 */
function layoutUnionFrame(
  unionId: string,
  bloodPartnerId: string | null,
  doc: LayoutDoc,
  spacing: LayoutSpacing,
  visited: Set<string>,
): Frame {
  if (visited.has(unionId)) return { positions: {}, anchorX: 0, minX: 0, maxX: 0 };
  visited.add(unionId);

  const union = doc.partnerships[unionId];
  const orderedChildren = orderChildrenByX(union.childrenIds, doc.individuals);
  const childFrames = orderedChildren.map((cid) =>
    layoutChildBlock(cid, doc, spacing, visited),
  );
  const offsets = packBlocks(
    childFrames.map((f) => ({ anchorX: f.anchorX, minX: f.minX, maxX: f.maxX })),
    spacing.siblingSpacing,
  );

  const positions: Record<string, number> = {};
  const childAnchors: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  childFrames.forEach((f, i) => {
    const off = offsets[i];
    for (const [id, x] of Object.entries(f.positions)) positions[id] = x + off;
    childAnchors.push(f.anchorX + off);
    minX = Math.min(minX, f.minX + off);
    maxX = Math.max(maxX, f.maxX + off);
  });

  const sibshipCenter =
    childAnchors.length > 0
      ? (childAnchors[0] + childAnchors[childAnchors.length - 1]) / 2
      : 0;

  // Place the union's partners over the sibship. A partner is "pinned" (left
  // where it is, omitted from this frame so it never moves) when it is a
  // load-bearing in-law — it belongs to another blood family and must not be
  // dragged across. The incoming blood partner (`bloodPartnerId`) always has
  // parents above and so would trip the load-bearing check, so it is exempt.
  const present = [union.partner1Id, union.partner2Id].filter(
    (id): id is string => !!id && !!doc.individuals[id],
  );
  const placeable = present.filter(
    (id) => id === bloodPartnerId || !isLoadBearingInLaw(doc, id),
  );
  let couple: Record<string, number> = {};
  if (placeable.length === 1) {
    couple = { [placeable[0]]: sibshipCenter };
  } else if (placeable.length === 2) {
    couple = coupleAround(
      sibshipCenter,
      placeable[0],
      placeable[1],
      doc.individuals,
      spacing.partnerSpacing,
    );
  }
  // placeable.length === 0 → parentless sibship (or both partners pinned).
  for (const [id, x] of Object.entries(couple)) {
    positions[id] = x;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  if (!isFinite(minX)) {
    minX = sibshipCenter;
    maxX = sibshipCenter;
  }
  const anchorX = bloodPartnerId
    ? positions[bloodPartnerId] ?? sibshipCenter
    : sibshipCenter;
  return { positions, anchorX, minX, maxX };
}

/**
 * Compute tidy x and per-generation-row y for every node in the blood family
 * rooted at `rootUnionId`, plus its married-in partners. Anchored so the root
 * union's centre keeps its current x (the canvas does not jump). Returns only
 * the nodes whose position changes, so a tidy family yields an empty map.
 */
export function computeTreeLayout(
  doc: LayoutDoc,
  rootUnionId: string,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): Record<string, { x: number; y: number }> {
  const rootUnion = doc.partnerships[rootUnionId];
  if (!rootUnion) return {};

  const frame = layoutUnionFrame(rootUnionId, null, doc, spacing, new Set());

  // Horizontal anchor: keep the root's current centre fixed. Anchor only on
  // partners actually placed in the frame (a pinned load-bearing partner is
  // absent), falling back to the placed children for a parentless sibship.
  const rootPartners = [rootUnion.partner1Id, rootUnion.partner2Id].filter(
    (id): id is string => !!id && !!doc.individuals[id],
  );
  const placedRootPartners = rootPartners.filter((id) => id in frame.positions);
  const anchorIds =
    placedRootPartners.length > 0
      ? placedRootPartners
      : rootUnion.childrenIds.filter(
          (id) => doc.individuals[id] && id in frame.positions,
        );
  const avg = (ids: string[], pick: (id: string) => number): number =>
    ids.length ? ids.reduce((s, id) => s + pick(id), 0) / ids.length : 0;
  const currentAnchor = avg(anchorIds, (id) => doc.individuals[id].position.x);
  const frameAnchor = avg(anchorIds, (id) => frame.positions[id] ?? 0);
  const dx = currentAnchor - frameAnchor;

  // Vertical anchor: generation rows relative to the root reference node.
  const refId = placedRootPartners[0] ?? anchorIds[0];
  const ref = refId ? doc.individuals[refId] : undefined;
  const rootGen = ref?.generation ?? 0;
  const rootY = ref?.position.y ?? 0;

  const result: Record<string, { x: number; y: number }> = {};
  for (const [id, fx] of Object.entries(frame.positions)) {
    const node = doc.individuals[id];
    if (!node) continue;
    const x = fx + dx;
    const gen = node.generation ?? rootGen;
    const y = rootY + (gen - rootGen) * spacing.generationSpacing;
    if (node.position.x !== x || node.position.y !== y) result[id] = { x, y };
  }
  return result;
}
