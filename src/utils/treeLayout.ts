import type {
  Individual,
  PartnershipRelationship,
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
 *
 * @remarks
 * At each union the climb prefers whichever partner has their own parent link in
 * the document (i.e. continues a blood line upward) over a founder/in-law with no
 * parents. This prevents the traversal from jumping to a married-in family tree
 * when `partner1Id` happens to be an in-law founder placed first in the slot.
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
    // Prefer the partner who has their own parents in the document so the
    // climb follows the blood line rather than jumping into an in-law's tree.
    const candidates = [u.partner1Id, u.partner2Id].filter(
      (id): id is string => !!id,
    );
    const next =
      candidates.find((id) =>
        Object.values(doc.parentChildLinks).some((l) => l.childId === id),
      ) ?? candidates[0];
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
 * Position two individuals (or one) centred on `center`. A sole individual sits
 * exactly on `center`; a pair splits by `partnerSpacing`, preserving whichever
 * side `secondaryId` currently occupies relative to `primaryId`.
 *
 * @param primaryId - The individual that is always placed (never null).
 * @param secondaryId - The optional partner; when null only `primaryId` is placed.
 *
 * @remarks
 * The parameter names are intentionally neutral. At the `placeable.length === 2`
 * call site in `layoutUnionFrame` neither argument is guaranteed to be a blood
 * parent — `coupleAround` decides left/right purely from the current x positions.
 */
export function coupleAround(
  center: number,
  primaryId: string,
  secondaryId: string | null,
  individuals: Record<string, Individual>,
  partnerSpacing: number,
): Record<string, number> {
  if (!secondaryId || !individuals[secondaryId]) return { [primaryId]: center };
  const primaryX = individuals[primaryId]?.position.x ?? 0;
  const secondaryX = individuals[secondaryId].position.x;
  const half = partnerSpacing / 2;
  return secondaryX < primaryX
    ? { [secondaryId]: center - half, [primaryId]: center + half }
    : { [primaryId]: center - half, [secondaryId]: center + half };
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
 *
 * @remarks
 * Only the **first** child-bearing union for this individual (by insertion order
 * in `doc.partnerships`) is tidy-laid-out. Children from later unions (e.g. a
 * remarriage) are left at their current canvas positions — a known best-effort
 * limitation. All unions are still traversed for leaf-partner placement when
 * checking for a childless partner block.
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
 * Collect a married-in partner's own family: everyone reachable from an "in-law"
 * (a partner of a frame node that is not itself in the frame) by walking
 * partnerships and parent-child links while staying outside the frame.
 *
 * @remarks
 * These nodes are pinned during this relayout — the packer never sees them — so
 * when both members of a couple carry their own parents, the parents this layout
 * places can land on top of the in-law's parents. {@link inLawClearanceShift}
 * uses the returned positions to translate the laid-out family clear of them.
 */
function collectInLawFamilies(doc: LayoutDoc, frameIds: Set<string>): Set<string> {
  const external = new Set<string>();
  const queue: string[] = [];
  const enqueue = (id: string | undefined | null): void => {
    if (id && !frameIds.has(id) && doc.individuals[id] && !external.has(id)) {
      external.add(id);
      queue.push(id);
    }
  };
  // Seed from in-laws: the non-frame partner of any union with a frame member.
  for (const p of Object.values(doc.partnerships)) {
    const partners = [p.partner1Id, p.partner2Id].filter((id): id is string => !!id);
    if (partners.some((id) => frameIds.has(id))) {
      for (const id of partners) if (!frameIds.has(id)) enqueue(id);
    }
  }
  // Walk outward over partnerships (partners + children) and parent links
  // (parents), so the in-law's whole blood family is gathered.
  while (queue.length) {
    const cur = queue.pop() as string;
    for (const p of Object.values(doc.partnerships)) {
      const partners = [p.partner1Id, p.partner2Id].filter((id): id is string => !!id);
      if (partners.includes(cur)) {
        partners.forEach(enqueue);
        p.childrenIds.forEach(enqueue);
      }
    }
    for (const l of Object.values(doc.parentChildLinks)) {
      if (l.childId === cur) {
        const u = doc.partnerships[l.parentPartnershipId];
        if (u) [u.partner1Id, u.partner2Id].forEach(enqueue);
      }
    }
  }
  return external;
}

/**
 * Horizontal translation (added to the anchor `dx`) that slides the whole
 * laid-out family clear of every connected in-law family it was pinned beside.
 * For each generation row both families occupy, the laid-out nodes must clear the
 * pinned nodes by at least `minGap`; the family shifts away from the side the
 * in-laws sit on. A uniform translation keeps every descent line vertical.
 *
 * @remarks
 * Handles the common single-sided case (the reported couple-both-have-parents
 * overlap). In-laws on opposite sides of the same family can't both be cleared by
 * one translation — that would need the family to widen internally — so only the
 * dominant side is resolved.
 */
function inLawClearanceShift(
  doc: LayoutDoc,
  framePositions: Record<string, number>,
  dx: number,
  genOf: (id: string) => number,
  minGap: number,
): number {
  const frameIds = new Set(Object.keys(framePositions));
  const external = collectInLawFamilies(doc, frameIds);
  if (external.size === 0) return 0;

  const bucket = (map: Map<number, number[]>, gen: number, x: number): void => {
    const arr = map.get(gen);
    if (arr) arr.push(x);
    else map.set(gen, [x]);
  };
  const frameByGen = new Map<number, number[]>();
  for (const [id, fx] of Object.entries(framePositions)) bucket(frameByGen, genOf(id), fx + dx);
  const extByGen = new Map<number, number[]>();
  for (const id of external) bucket(extByGen, genOf(id), doc.individuals[id].position.x);

  const flat = (m: Map<number, number[]>): number[] => [...m.values()].flat();
  const frameXs = flat(frameByGen);
  const extXs = flat(extByGen);
  if (!frameXs.length || !extXs.length) return 0;
  const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const frameIsRight = mean(frameXs) >= mean(extXs);

  let shift = 0;
  for (const [gen, fxs] of frameByGen) {
    const exs = extByGen.get(gen);
    if (!exs) continue;
    if (frameIsRight) {
      const need = Math.max(...exs) + minGap - Math.min(...fxs);
      if (need > shift) shift = need;
    } else {
      const need = Math.min(...exs) - minGap - Math.max(...fxs);
      if (need < shift) shift = need;
    }
  }
  return shift;
}

/**
 * Collect the laid-out descendants of `union` that live in the frame: its
 * children, each child's in-frame partner, and everything below, walking down
 * partnerships and stopping at the frame boundary. The union's own partners are
 * excluded — only the descent hanging below the couple is returned.
 *
 * @remarks
 * Used by {@link centerChildrenUnderWideCouples} to slide a whole sibship (and
 * its subtrees) sideways as one block, keeping every descent line below the
 * couple vertical.
 */
function collectUnionDescendants(
  doc: LayoutDoc,
  union: PartnershipRelationship,
  inFrame: (id: string) => boolean,
): Set<string> {
  const descendants = new Set<string>();
  const queue: string[] = [];
  const visit = (id: string): void => {
    if (inFrame(id) && !descendants.has(id)) {
      descendants.add(id);
      queue.push(id);
    }
  };
  union.childrenIds.forEach(visit);
  while (queue.length) {
    const cur = queue.pop() as string;
    for (const p of Object.values(doc.partnerships)) {
      if (p.partner1Id !== cur && p.partner2Id !== cur) continue;
      // Pull the partner along (it moves with the couple block) but don't walk
      // up into the partner's own family; then descend into this union's kids.
      for (const pid of [p.partner1Id, p.partner2Id]) {
        if (pid && pid !== cur && inFrame(pid)) descendants.add(pid);
      }
      p.childrenIds.forEach(visit);
    }
  }
  return descendants;
}

/**
 * Re-centre the sibship of every "wide couple" so it sits under the couple's
 * midpoint. A wide couple is a union with a present partner that is pinned (a
 * load-bearing in-law on its own branch, absent from the frame): the tidy layout
 * centres only the placeable blood partner over the children, so the sibship ends
 * up under that one partner while the descent line — drawn from the couple
 * midpoint — skews across to the far-away in-law (issue #105). For each such
 * union this slides the whole sibship subtree so its centre lands on the midpoint
 * between the couple's final positions, keeping the descent vertical.
 *
 * @remarks
 * Mutates `finalX` in place. Unions are processed top-down (by generation) so a
 * shifted blood partner is already in its final spot before a lower wide couple
 * re-centres against it — this ordering is a correctness requirement, not a
 * heuristic: shifting a lower couple first and letting the higher shift translate
 * it would double-count half the upper shift. A no-op for ordinary couples (both
 * partners placed), where the sibship centre already equals the couple midpoint.
 *
 * KNOWN LIMITATION (tracked in #115): the sub-block is translated *after*
 * `packBlocks` and {@link inLawClearanceShift} have run, with no re-separation
 * and no collision check. When a wide couple sits next to an ordinary sibling
 * whose sibship stays put, the shift can drive the two cousin sibships on top of
 * each other — an exact node-on-node overlap in the coincident case, or crossed
 * descent lines in the general case. Resolving it needs a per-row separation pass
 * (or a constraint-based layout) after the recenter; see #115.
 */
function centerChildrenUnderWideCouples(
  doc: LayoutDoc,
  finalX: Record<string, number>,
): void {
  const inFrame = (id: string): boolean => id in finalX;
  const xOf = (id: string): number | null =>
    id in finalX ? finalX[id] : doc.individuals[id]?.position.x ?? null;

  const unions = Object.values(doc.partnerships)
    .map((u) => {
      const present = [u.partner1Id, u.partner2Id].filter(
        (id): id is string => !!id && !!doc.individuals[id],
      );
      const gen = Math.min(
        ...present.map((id) => doc.individuals[id].generation ?? 0),
        Infinity,
      );
      return { u, present, gen };
    })
    // Top-down: a higher couple settles before a lower one re-centres on it.
    .sort((a, b) => a.gen - b.gen);

  for (const { u, present } of unions) {
    if (present.length === 0) continue;
    // Only wide couples need re-centring: at least one present partner pinned
    // (load-bearing in-law, outside the frame).
    if (present.every(inFrame)) continue;
    const childrenInFrame = u.childrenIds.filter(inFrame);
    if (childrenInFrame.length === 0) continue;

    const coupleXs = present.map((id) => xOf(id));
    if (coupleXs.some((v) => v === null)) continue;
    const coupleMid =
      (coupleXs as number[]).reduce((s, v) => s + v, 0) / coupleXs.length;
    const childXs = childrenInFrame.map((id) => finalX[id]);
    const sibCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    const shift = coupleMid - sibCenter;
    if (Math.abs(shift) < 1e-6) continue;

    for (const id of collectUnionDescendants(doc, u, inFrame)) {
      finalX[id] += shift;
    }
  }
}

/**
 * Compute tidy x and per-generation-row y for every node in the blood family
 * rooted at `rootUnionId`, plus its married-in partners. Anchored so the root
 * union's centre keeps its current x (the canvas does not jump), then shifted if
 * needed to clear a married-in partner's own family (see
 * {@link inLawClearanceShift}). Returns only the nodes whose position changes, so
 * a tidy family yields an empty map.
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

  // A married-in partner that carries its own parents is pinned and invisible to
  // the packer, so the parents placed here can collide with it in a shared row.
  // Slide the whole laid-out family clear of those pinned in-law families.
  const genOf = (id: string): number => doc.individuals[id]?.generation ?? rootGen;
  const dxFinal =
    dx + inLawClearanceShift(doc, frame.positions, dx, genOf, spacing.siblingSpacing);

  // Absolute x for every laid-out node, then slide any wide couple's sibship
  // under the couple midpoint so its descent line stays vertical (issue #105).
  const finalX: Record<string, number> = {};
  for (const [id, fx] of Object.entries(frame.positions)) {
    if (doc.individuals[id]) finalX[id] = fx + dxFinal;
  }
  centerChildrenUnderWideCouples(doc, finalX);

  const result: Record<string, { x: number; y: number }> = {};
  for (const [id, x] of Object.entries(finalX)) {
    const node = doc.individuals[id];
    const gen = node.generation ?? rootGen;
    const y = rootY + (gen - rootGen) * spacing.generationSpacing;
    if (node.position.x !== x || node.position.y !== y) result[id] = { x, y };
  }
  return result;
}
