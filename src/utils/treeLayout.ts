import type {
  Individual,
  PartnershipRelationship,
  PedigreeDocument,
  TwinGroup,
} from '../types/pedigree';
import {
  SIBLING_SPACING,
  PARTNER_SPACING,
  GENERATION_SPACING,
  MIN_GENERATION_NODE_SPACING,
} from './constants';

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

/**
 * The slice of a document the layout reads. `twinGroups` is optional so
 * existing callers that omit it continue to typecheck unchanged; the layout
 * reads `doc.twinGroups ?? {}` internally.
 */
export type LayoutDoc = Pick<
  PedigreeDocument,
  'individuals' | 'partnerships' | 'parentChildLinks'
> & {
  twinGroups?: Record<string, TwinGroup>;
};

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
 * Order siblings so twin-group members are contiguous, otherwise stable.
 *
 * Algorithm:
 * 1. Sort all child ids by their current x (ascending), with id as a
 *    deterministic tie-break — exactly like {@link orderChildrenByX}.
 * 2. For each twin group whose members appear in the sibship, anchor the run
 *    at the position of the group's leftmost member in the x-sorted list, then
 *    pull all other members of that group into a contiguous block at that
 *    position, preserving their relative x-order. Non-member siblings are
 *    left in their stable x-sorted positions outside the run.
 * 3. Groups are processed left-to-right (by anchor position) so runs never
 *    interleave with one another.
 *
 * Falls back to plain x-order for a sibship that contains no twin-group members.
 *
 * @param childIds   - The union's childrenIds (may include unknown ids, which
 *                     are filtered out).
 * @param individuals - Current individual map (provides x positions).
 * @param twinGroups  - All twin groups in the document.
 * @returns A new array of present child ids in the contiguity-corrected order.
 */
export function orderSiblingsWithTwins(
  childIds: readonly string[],
  individuals: Record<string, Individual>,
  twinGroups: Record<string, TwinGroup>,
): string[] {
  // Step 1: sort by x, id tie-break.
  const byX = orderChildrenByX(childIds, individuals);

  // Collect twin groups that have ≥2 members present in this sibship.
  const sibSet = new Set(byX);
  const relevantGroups = Object.values(twinGroups).filter(
    (g) => g.individualIds.filter((id) => sibSet.has(id)).length >= 2,
  );
  if (relevantGroups.length === 0) return byX;

  // For each relevant group, record which positions in `byX` are member slots.
  // Build a Set of all twin-member ids so we can distinguish them from singletons.
  const twinMemberIds = new Set(
    relevantGroups.flatMap((g) => g.individualIds.filter((id) => sibSet.has(id))),
  );

  // Determine anchor index for each group = leftmost member's index in byX.
  // Sort groups left-to-right by that anchor index so we process them in order.
  interface GroupEntry {
    memberIds: string[];
    anchorIdx: number;
  }
  const groupEntries: GroupEntry[] = relevantGroups.map((g) => {
    const memberIds = g.individualIds.filter((id) => sibSet.has(id));
    // Sort the group's members by x (id tie-break) so their relative order is stable.
    const sortedMembers = [...memberIds].sort((a, b) => {
      const ax = individuals[a].position.x;
      const bx = individuals[b].position.x;
      if (ax !== bx) return ax - bx;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const anchorIdx = byX.indexOf(sortedMembers[0]);
    return { memberIds: sortedMembers, anchorIdx };
  });
  groupEntries.sort((a, b) => a.anchorIdx - b.anchorIdx);

  // Reconstruct the order: walk byX left-to-right; when a non-twin singleton
  // is seen, emit it immediately. When a twin member is seen and it is the
  // leftmost of its group (anchor), emit the entire group's run in sorted order.
  // Other group members (non-anchor) are skipped at their original position
  // because they have already been emitted in the group's run.
  const emitted = new Set<string>();
  const result: string[] = [];

  // Build a map: member id → its GroupEntry, for O(1) lookup.
  const memberToGroup = new Map<string, GroupEntry>();
  for (const entry of groupEntries) {
    for (const id of entry.memberIds) memberToGroup.set(id, entry);
  }

  for (const id of byX) {
    if (emitted.has(id)) continue;
    if (twinMemberIds.has(id)) {
      const entry = memberToGroup.get(id)!;
      // Emit the full group run (in sorted member order) only on the anchor.
      if (id === entry.memberIds[0]) {
        for (const mid of entry.memberIds) {
          result.push(mid);
          emitted.add(mid);
        }
      }
      // Non-anchor twin members are skipped here; they were already emitted above.
    } else {
      result.push(id);
      emitted.add(id);
    }
  }

  return result;
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

/** A rigid group of nodes in one generation row that translate together. */
export interface RowBlock {
  ids: string[];
  minX: number;
  maxX: number;
}

/**
 * Resolve minimum separation across one generation row. `blocks` are given
 * left-to-right by current x (id tie-break already applied). Returns a per-block
 * right-shift (>= 0) so adjacent blocks clear each other by `minGap`, measured
 * between extents. Monotone — never shifts a block left — so an already-separated
 * row yields all-zero shifts (idempotent). Mirrors {@link packBlocks} applied per
 * generation row rather than per sibling set.
 *
 * @remarks
 * This is a tested reference primitive exported for unit testing. The production
 * separation pass ({@link separateGenerations}) inlines an obstacle-aware variant
 * of the same monotone rule — fixed pinned in-law nodes short-circuit the sweep
 * with `continue` — rather than calling this function directly. A reader should
 * not expect to find `resolveRowSeparation` called from `separateGenerations`.
 */
export function resolveRowSeparation(
  blocks: readonly RowBlock[],
  minGap: number,
): number[] {
  const shifts: number[] = [];
  let prevMax = -Infinity;
  for (const b of blocks) {
    let shift = 0;
    if (prevMax !== -Infinity) {
      const need = prevMax + minGap - b.minX;
      if (need > 0) shift = need;
    }
    shifts.push(shift);
    prevMax = b.maxX + shift;
  }
  return shifts;
}

/** A laid-out subtree in local frame coordinates. */
interface Frame {
  positions: Record<string, number>;
  anchorX: number;
  minX: number;
  maxX: number;
}

/**
 * Compose a person's multiple child-bearing unions into one frame, sharing the
 * person (`hub`) across all of them. Each union is laid out on its own with the
 * hub as the incoming blood partner, then the frames are fanned out around the
 * single shared hub so the sibships sit clear of one another.
 *
 * @remarks
 * Multi-union support (issue #131) lifts the earlier limitation where only the
 * first child-bearing union was laid out. Each union frame is normalised so the
 * hub sits at 0, then re-anchored so the hub keeps a single x while each union's
 * spouse-and-sibship group is packed to a distinct side:
 *
 * - Unions are ordered by their spouse's current x (id tie-break) so a manual
 *   left/right arrangement of the two families survives the relayout.
 * - Each normalised frame already places its spouse at exactly `partnerSpacing`
 *   from the hub and its sibship centred under that couple, so re-anchoring by a
 *   whole-frame translation preserves partner spacing and vertical descent.
 * - Frames are packed left-to-right with {@link packBlocks} on the non-hub
 *   footprint, so a second sibship is slid clear of the first (no symbol overlap,
 *   no crossed descent lines) while the shared hub stays put.
 *
 * A single-union person is byte-identical to the previous behaviour: the sole
 * frame is returned unchanged (offset 0), with the hub as the anchor.
 *
 * @remarks Limitation
 * The bound is two child-bearing unions. A hub with three or more spouses in the
 * same generation cannot keep every couple at exactly `partnerSpacing` (a single
 * point is 120 from at most two others), so packing a third spouse-group clear of
 * the first two necessarily widens its couple past `partnerSpacing`. The sibships
 * are still laid out and separated (no overlap, no crossed descent lines); only
 * the exact partner-spacing aesthetic degrades for the 3rd+ union.
 *
 * @param hub - The person shared by every union in `unions`.
 * @param unions - The person's child-bearing unions (≥1), each with ≥1 child.
 */
function composeHubUnions(
  hub: string,
  unions: readonly PartnershipRelationship[],
  doc: LayoutDoc,
  spacing: LayoutSpacing,
  visited: Set<string>,
): Frame {
  // Deterministic left-to-right order: by the spouse's current x, id tie-break.
  // The hub itself is dropped from the sort key; a union with no other placeable
  // partner sorts by its own id.
  const spouseOf = (u: PartnershipRelationship): string | null => {
    const other = u.partner1Id === hub ? u.partner2Id : u.partner1Id;
    return other && doc.individuals[other] ? other : null;
  };
  const ordered = [...unions].sort((a, b) => {
    const sa = spouseOf(a);
    const sb = spouseOf(b);
    const xa = sa ? doc.individuals[sa].position.x : 0;
    const xb = sb ? doc.individuals[sb].position.x : 0;
    if (xa !== xb) return xa - xb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Lay out each union and normalise so the hub sits at local x = 0. Everything
  // else in the frame (spouse, sibship, descent) rides along, so partner spacing
  // and vertical descent lines are preserved by the whole-frame translation.
  interface HubFrame {
    frame: Frame;
    /** The frame's footprint EXCLUDING the hub node, used for packing. */
    minX: number;
    maxX: number;
  }
  const hubFrames: HubFrame[] = [];
  for (const u of ordered) {
    const raw = layoutUnionFrame(u.id, hub, doc, spacing, visited);
    const hubX = raw.positions[hub] ?? raw.anchorX;
    const positions: Record<string, number> = {};
    for (const [id, x] of Object.entries(raw.positions)) positions[id] = x - hubX;
    // Non-hub footprint: the spouse + sibship + descent that must clear siblings.
    const nonHubXs = Object.entries(positions)
      .filter(([id]) => id !== hub)
      .map(([, x]) => x);
    const minX = nonHubXs.length ? Math.min(...nonHubXs) : 0;
    const maxX = nonHubXs.length ? Math.max(...nonHubXs) : 0;
    hubFrames.push({
      frame: { positions, anchorX: 0, minX: raw.minX - hubX, maxX: raw.maxX - hubX },
      minX,
      maxX,
    });
  }

  // Single union → identical to the previous behaviour (offset 0, hub at 0).
  if (hubFrames.length === 1) {
    const only = hubFrames[0].frame;
    return { ...only, anchorX: only.positions[hub] ?? 0 };
  }

  // Pack the non-hub footprints left-to-right so later sibships clear earlier
  // ones by at least siblingSpacing. The hub stays at 0; each union's spouse and
  // sibship translate by the packing offset for their frame.
  const offsets = packBlocks(
    hubFrames.map((h) => ({ anchorX: 0, minX: h.minX, maxX: h.maxX })),
    spacing.siblingSpacing,
  );

  const positions: Record<string, number> = { [hub]: 0 };
  let minX = 0;
  let maxX = 0;
  hubFrames.forEach((h, i) => {
    const off = offsets[i];
    for (const [id, x] of Object.entries(h.frame.positions)) {
      if (id === hub) continue;
      positions[id] = x + off;
    }
    minX = Math.min(minX, h.frame.minX + off);
    maxX = Math.max(maxX, h.frame.maxX + off);
  });

  return { positions, anchorX: 0, minX, maxX };
}

/**
 * Lay out the subtree headed by `childId` (a blood node): the child, its
 * married-in partner(s), and everything below. `anchorX` is the blood child's
 * own x, used by the parent union to centre over its children.
 *
 * @remarks
 * All of the individual's child-bearing unions are laid out and composed around
 * the shared individual via {@link composeHubUnions} (issue #131 lifted the
 * earlier "first union only" limitation, so a remarriage's second sibship is now
 * placed clear of the first rather than left at its seed position). A load-bearing
 * in-law within any union is still left in place rather than relocated.
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
      p.childrenIds.some((cid) => doc.individuals[cid]),
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
  const frame = composeHubUnions(childId, childUnions, doc, spacing, visited);
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
  const twinGroups = doc.twinGroups ?? {};
  const orderedChildren = Object.keys(twinGroups).length > 0
    ? orderSiblingsWithTwins(union.childrenIds, doc.individuals, twinGroups)
    : orderChildrenByX(union.childrenIds, doc.individuals);
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
 * Collect the laid-out descendants of `union` that live in the frame: its
 * children, each child's in-frame partner, and everything below, walking down
 * partnerships and stopping at the frame boundary. The union's own partners are
 * excluded — only the descent hanging below the couple is returned.
 *
 * @remarks
 * Used by {@link computeRigidBlocks} to gather the sibship-and-below portion of a
 * union's rigid descent block, so the block can be slid sideways as one unit and
 * every descent line below the couple stays vertical.
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
 * A rigid descent block: a couple's movable partners together with its sibship
 * and everything below, all translating as one unit. A pinned load-bearing in-law
 * is NOT a member (it is a fixed obstacle placed by another family), so shifting a
 * block never drags an in-law across the canvas.
 */
interface DescentBlock {
  /** The union this block descends from (its stable key). */
  unionId: string;
  /** Every placed node that moves with this block, across all generation rows. */
  members: Set<string>;
}

/**
 * Partition every placed node into exactly one rigid {@link DescentBlock}, keyed
 * by its owning child-bearing union so that a shift moves a couple, its sibship,
 * and everything below as one unit (descent lines stay vertical) while leaving
 * cousin sub-families free to separate.
 *
 * A *child-bearing* union is one with at least one placed child. Ownership:
 * 1. A node that is a movable partner of a child-bearing union belongs to the
 *    **deepest** such union — so a wide couple's blood partner rides with its own
 *    sibship, not with its parents' block.
 * 2. Otherwise a node in a child-bearing union's descent (its sibship and
 *    everything below, via {@link collectUnionDescendants}) belongs to the
 *    **deepest** such union that reaches it — so cousin sub-families are distinct
 *    blocks and every child descends with its own siblings.
 * 3. A childless in-law partner joins its co-partner's block, so a married couple
 *    always travels together (never split by the separation sweep).
 * 4. Any remaining placed node (an orphan founder) becomes its own singleton
 *    block so it still participates in separation.
 *
 * A pinned load-bearing in-law is absent from `finalX`, so it is never a member —
 * it is a fixed obstacle handled by {@link separateGenerations}.
 *
 * @param doc - The pedigree slice being laid out.
 * @param finalX - Absolute x for every placed node; its keys define the frame.
 * @param genOf - Generation lookup for a node id.
 * @returns One block per owning union (plus singletons), keyed by union id.
 */
function computeRigidBlocks(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  genOf: (id: string) => number,
): DescentBlock[] {
  const placed = (id: string): boolean => id in finalX;

  // Child-bearing unions: at least one placed child. Only these root a block.
  const childBearing = Object.values(doc.partnerships).filter((u) =>
    u.childrenIds.some(placed),
  );
  const partnersOf = (u: PartnershipRelationship): string[] =>
    [u.partner1Id, u.partner2Id].filter((id): id is string => !!id && placed(id));

  const owner = new Map<string, string>(); // node id -> owning union id

  // Rule 1: a movable partner of a child-bearing union belongs to the DEEPEST
  // such union. Process deepest-first so the deeper union claims first.
  // Id tie-break makes equal-depth ownership deterministic regardless of key order.
  const byDepth = [...childBearing].sort((a, b) => {
    const ga = Math.min(...partnersOf(a).map(genOf), Infinity);
    const gb = Math.min(...partnersOf(b).map(genOf), Infinity);
    return gb - ga || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  for (const u of byDepth) {
    for (const p of partnersOf(u)) if (!owner.has(p)) owner.set(p, u.id);
  }

  // Rule 2: an as-yet-unowned node in a child-bearing union's descent belongs to
  // that union. Deepest-first so a cousin sub-family is claimed by its own couple
  // before a shallower ancestor's descent walk reaches it.
  for (const u of byDepth) {
    for (const d of collectUnionDescendants(doc, u, placed)) {
      if (!owner.has(d)) owner.set(d, u.id);
    }
  }

  // Rule 3: a childless in-law partner joins its co-partner's block, so a
  // married couple travels together and is never split by the separation sweep.
  for (const u of Object.values(doc.partnerships)) {
    const partners = partnersOf(u);
    if (partners.length !== 2) continue;
    const [a, b] = partners;
    if (owner.has(a) && !owner.has(b)) owner.set(b, owner.get(a)!);
    else if (owner.has(b) && !owner.has(a)) owner.set(a, owner.get(b)!);
  }

  // Rule 4: any remaining placed node is its own singleton block.
  for (const id of Object.keys(finalX)) if (!owner.has(id)) owner.set(id, id);

  // Group nodes by owner into blocks.
  const byOwner = new Map<string, Set<string>>();
  for (const [id, uid] of owner) {
    const set = byOwner.get(uid) ?? new Set<string>();
    set.add(id);
    byOwner.set(uid, set);
  }
  const blocks: DescentBlock[] = [];
  for (const [unionId, members] of byOwner) blocks.push({ unionId, members });
  return blocks;
}

/**
 * Slide the whole laid-out frame clear of every external pinned family (nodes
 * present in the doc but absent from `finalX` — a load-bearing in-law and its
 * blood family). For each shared generation row the frame must clear the pinned
 * nodes by `minGap`; the frame shifts away from the side the pinned family sits
 * on (its dominant side), and a single uniform translation of every placed node
 * keeps every descent line vertical.
 *
 * @remarks
 * This is the directional analogue of the per-row block sweep: whereas
 * {@link separateGenerations} resolves collisions *within* the frame by pushing
 * cousin blocks apart, this resolves the frame-vs-outside overlap that arises when
 * a married pair both carry their own (partly pinned) parents. A single
 * translation handles the common single-sided case; opposite-sided pinned families
 * can't both be cleared by one shift (that needs the frame to widen internally),
 * so only the dominant side is resolved.
 *
 * @param doc - The pedigree slice being laid out.
 * @param finalX - Absolute x per placed node; mutated in place.
 * @param genOf - Generation lookup for a node id.
 * @param minGap - Minimum gap between the frame and a pinned node in a shared row.
 */
function clearExternalObstacles(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  genOf: (id: string) => number,
  minGap: number,
): void {
  const obstacleIds = Object.keys(doc.individuals).filter((id) => !(id in finalX));
  if (obstacleIds.length === 0) return;

  const frameByGen = new Map<number, number[]>();
  const extByGen = new Map<number, number[]>();
  const bucket = (m: Map<number, number[]>, g: number, x: number): void => {
    const arr = m.get(g);
    if (arr) arr.push(x);
    else m.set(g, [x]);
  };
  for (const [id, x] of Object.entries(finalX)) bucket(frameByGen, genOf(id), x);
  for (const id of obstacleIds) bucket(extByGen, genOf(id), doc.individuals[id].position.x);

  const flat = (m: Map<number, number[]>): number[] => [...m.values()].flat();
  const frameXs = flat(frameByGen);
  const extXs = flat(extByGen);
  if (!frameXs.length || !extXs.length) return;
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
  if (shift === 0) return;
  for (const id of Object.keys(finalX)) finalX[id] += shift;
}

/**
 * Enforce minimum horizontal separation across every generation row by sliding
 * rigid descent blocks rightward. Processes rows top-down; within each row the
 * blocks present are sorted by current x (block-key tie-break) and swept with the
 * same monotone `prevMax + minGap - minX` rule that {@link resolveRowSeparation}
 * encodes, then each block's shift is applied to ALL its members across every row —
 * so a descendant sub-block moves with its couple and descent lines stay vertical.
 * Because higher rows settle first, a shift there is reflected in the lower rows
 * before they are separated in turn.
 *
 * Pinned in-law nodes (placed in the doc but absent from `finalX`) participate as
 * fixed obstacles: they occupy their row and re-anchor the running edge but never
 * move. {@link resolveRowSeparation} has no notion of a fixed obstacle (every entry
 * it receives shifts together), so the monotone rule is applied inline here with
 * obstacle entries short-circuited via `continue`. The directional frame-vs-outside
 * clearance is handled beforehand by {@link clearExternalObstacles}; here obstacles
 * only prevent a cousin block from being packed on top of an internal pinned in-law.
 *
 * @param doc - The pedigree slice being laid out.
 * @param finalX - Absolute x per placed node; mutated in place.
 * @param genOf - Generation lookup for a node id.
 * @param minGap - Minimum gap between adjacent blocks' extents.
 * @param blocks - The rigid blocks (from {@link computeRigidBlocks}); each block's
 *   members are shifted together. Reused across calls so shifts accumulate.
 */
function separateGenerations(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  genOf: (id: string) => number,
  minGap: number,
  blocks: readonly DescentBlock[],
): void {
  const blockOf = new Map<string, DescentBlock>();
  for (const b of blocks) for (const id of b.members) blockOf.set(id, b);

  // Fixed obstacles: every node present in the doc but absent from the frame —
  // a pinned in-law and its external family. They occupy their row but never move.
  const obstacleIds = Object.keys(doc.individuals).filter(
    (id) => !(id in finalX),
  );

  // Bucket every row by generation.
  const rows = new Set<number>();
  for (const id of Object.keys(finalX)) rows.add(genOf(id));
  for (const id of obstacleIds) rows.add(genOf(id));
  const gens = [...rows].sort((a, b) => a - b);

  for (const gen of gens) {
    // A "row item" is either a rigid block (footprint = its members in this row)
    // or a fixed obstacle (a zero-membership pinned in-law).
    interface RowItem {
      block: DescentBlock | null; // null → fixed obstacle
      minX: number;
      maxX: number;
      key: string;
    }
    const items: RowItem[] = [];

    const seenBlocks = new Set<DescentBlock>();
    for (const id of Object.keys(finalX)) {
      if (genOf(id) !== gen) continue;
      const b = blockOf.get(id);
      if (!b || seenBlocks.has(b)) continue;
      seenBlocks.add(b);
      const xsInRow = [...b.members]
        .filter((m) => genOf(m) === gen && m in finalX)
        .map((m) => finalX[m]);
      if (xsInRow.length === 0) continue;
      items.push({
        block: b,
        minX: Math.min(...xsInRow),
        maxX: Math.max(...xsInRow),
        key: b.unionId,
      });
    }
    for (const id of obstacleIds) {
      if (genOf(id) !== gen) continue;
      const x = doc.individuals[id].position.x;
      items.push({ block: null, minX: x, maxX: x, key: id });
    }
    if (items.length < 2) continue;

    // Left-to-right by current x; stable tie-break on the item key.
    items.sort((a, b) =>
      a.minX !== b.minX ? a.minX - b.minX : a.key < b.key ? -1 : 1,
    );

    // Right-shift each movable block to clear its predecessor's extent by minGap;
    // a fixed obstacle cannot move, so it re-anchors the running edge in place.
    let prevMax = -Infinity;
    for (const item of items) {
      if (item.block === null) {
        prevMax = Math.max(prevMax, item.maxX);
        continue;
      }
      let shift = 0;
      if (prevMax !== -Infinity) {
        const need = prevMax + minGap - item.minX;
        if (need > 0) shift = need;
      }
      if (shift > 0) {
        for (const m of item.block.members) finalX[m] += shift;
      }
      prevMax = Math.max(prevMax, item.maxX + shift);
    }
  }
}

/**
 * Centre each union's sibship on its couple midpoint, then immediately re-separate
 * so the shift cannot introduce an overlap. Processes unions top-down (by the
 * generation of their present partners): a higher couple settles before a lower
 * one re-centres against it, so a chained wide couple picks up its parent's shift
 * exactly once (issue #105). For each union the target is the midpoint of its
 * present partners (blood + pinned in-law alike, using the in-law's stored x), and
 * the union's rigid descent block (children + descendants, excluding the couple
 * itself) slides so the sibship centre lands on that target.
 *
 * The centring shift is clamped so the sibship never crosses within `minGap` of a
 * foreign node (a cousin block or a pinned in-law obstacle) in any of its rows on
 * the shift side. Full centring is therefore taken only when there is room for it
 * (the pure #105 case); when a wide couple's midpoint sits over a crowded cousin,
 * the sibship moves as far as it can without introducing an overlap or a crossing.
 * After each generation's centring, {@link separateGenerations} re-runs so the
 * no-overlap invariant is restored before the next generation is centred. This is
 * the finishing stage that makes no-overlap an invariant rather than a hope.
 *
 * @param doc - The pedigree slice being laid out.
 * @param finalX - Absolute x per placed node; mutated in place.
 * @param genOf - Generation lookup for a node id.
 * @param spacing - Layout spacing; `siblingSpacing` (floored at
 *   `MIN_GENERATION_NODE_SPACING`) is the separation gap.
 * @param blocks - The rigid blocks (from {@link computeRigidBlocks}), shared with
 *   {@link separateGenerations} so descent sub-blocks translate consistently.
 */
function centerAndReproject(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
  blocks: readonly DescentBlock[],
): void {
  const placed = (id: string): boolean => id in finalX;
  const minGap = Math.max(spacing.siblingSpacing, MIN_GENERATION_NODE_SPACING);
  const blockOf = new Map<string, DescentBlock>();
  for (const b of blocks) for (const id of b.members) blockOf.set(id, b);

  // Pinned in-law obstacles (present in the doc, absent from the frame) are fixed
  // foreign nodes the sibship must not cross when centring.
  const obstacleIds = Object.keys(doc.individuals).filter((id) => !placed(id));
  const xOf = (id: string): number =>
    placed(id) ? finalX[id] : doc.individuals[id].position.x;

  // The descent sub-block for a union: the members of its owning block that are
  // NOT the couple's own partners (i.e. the sibship and everything below). The
  // couple's partners stay put; the sibship slides under them.
  const descentSubBlock = (u: PartnershipRelationship): DescentBlock | null => {
    const child = u.childrenIds.find(placed);
    if (!child) return null;
    return blockOf.get(child) ?? null;
  };

  /**
   * Clamp a desired centring shift so no moving member comes within `minGap` of a
   * foreign node (any placed node or obstacle not in `moving`) in its row on the
   * shift side. Returns a shift with the same sign but bounded magnitude.
   */
  const clampShift = (moving: Set<string>, desired: number): number => {
    if (Math.abs(desired) < 1e-6) return desired;
    const foreign = [
      ...Object.keys(finalX).filter((id) => !moving.has(id)),
      ...obstacleIds,
    ];
    let bound = Math.abs(desired);
    for (const m of moving) {
      const mg = genOf(m);
      const mx = finalX[m];
      for (const f of foreign) {
        if (genOf(f) !== mg) continue;
        const fx = xOf(f);
        if (desired > 0 && fx > mx) {
          bound = Math.min(bound, Math.max(0, fx - minGap - mx));
        } else if (desired < 0 && fx < mx) {
          bound = Math.min(bound, Math.max(0, mx - minGap - fx));
        }
      }
    }
    return Math.sign(desired) * bound;
  };

  const unions = Object.values(doc.partnerships)
    .map((u) => {
      const present = [u.partner1Id, u.partner2Id].filter(
        (id): id is string => !!id && !!doc.individuals[id],
      );
      const gen = present.length
        ? Math.min(...present.map(genOf))
        : Infinity;
      return { u, present, gen };
    })
    // Top-down: a higher couple settles before a lower one re-centres on it.
    // Id tie-break makes same-generation unions process in a stable id order.
    .sort((a, b) => a.gen - b.gen || (a.u.id < b.u.id ? -1 : a.u.id > b.u.id ? 1 : 0));

  for (const { u, present } of unions) {
    if (present.length === 0) continue;
    const childrenInFrame = u.childrenIds.filter(placed);
    if (childrenInFrame.length === 0) continue;

    // Couple midpoint uses each present partner's current x (a pinned in-law's
    // stored x, a placed partner's laid-out x) so the descent stays vertical.
    const coupleXs = present.map((id) =>
      placed(id) ? finalX[id] : doc.individuals[id].position.x,
    );
    const coupleMid = coupleXs.reduce((s, v) => s + v, 0) / coupleXs.length;
    const childXs = childrenInFrame.map((id) => finalX[id]);
    const sibCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    const desired = coupleMid - sibCenter;
    if (Math.abs(desired) < 1e-6) continue;

    const sub = descentSubBlock(u);
    if (!sub) continue;
    // Slide only the sibship-and-below portion (never the couple's own partners).
    const couplePartners = new Set(present.filter(placed));
    const moving = new Set([...sub.members].filter((id) => !couplePartners.has(id)));
    if (moving.size === 0) continue;
    // Clamp so the sibship never crosses within minGap of a cousin or obstacle.
    const shift = clampShift(moving, desired);
    if (Math.abs(shift) < 1e-6) continue;
    for (const id of moving) finalX[id] += shift;
    // Restore the no-overlap invariant before the next (lower) couple centres.
    separateGenerations(doc, finalX, genOf, minGap, blocks);
  }
}

/**
 * Compute tidy x and per-generation-row y for every node in the blood family
 * rooted at `rootUnionId`, plus its married-in partners. Anchored so the root
 * union's centre keeps its current x (the canvas does not jump). A principled
 * finishing stage — {@link centerAndReproject} (centre sibships under couple
 * midpoints) followed by a final {@link separateGenerations} sweep — makes
 * no-overlap an invariant of the output. Returns only the nodes whose position
 * changes, so a tidy family yields an empty map.
 */
export function computeTreeLayout(
  doc: LayoutDoc,
  rootUnionId: string,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): Record<string, { x: number; y: number }> {
  const rootUnion = doc.partnerships[rootUnionId];
  if (!rootUnion) return {};

  // All child-bearing unions a placed person heads (deterministic by id).
  const childBearingUnionsOf = (personId: string): PartnershipRelationship[] =>
    Object.values(doc.partnerships)
      .filter(
        (u) =>
          (u.partner1Id === personId || u.partner2Id === personId) &&
          u.childrenIds.some((cid) => doc.individuals[cid]),
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // A root partner that heads ≥2 child-bearing unions is a remarriage hub whose
  // second (and later) sibships must be laid out too (issue #131). Lay out the
  // hub's unions together via composeHubUnions rather than only `rootUnionId`, so
  // every union descending from the root founder is placed and separated. When no
  // root partner is such a hub, fall back to the ordinary single-union frame.
  const rootFounders = [rootUnion.partner1Id, rootUnion.partner2Id].filter(
    (id): id is string => !!id && !!doc.individuals[id],
  );
  const hubId = rootFounders.find((id) => childBearingUnionsOf(id).length >= 2);
  const visited = new Set<string>();
  const frame = hubId
    ? composeHubUnions(hubId, childBearingUnionsOf(hubId), doc, spacing, visited)
    : layoutUnionFrame(rootUnionId, null, doc, spacing, visited);

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

  /**
   * Resolve the generation row for every node that has a non-finite `generation`
   * by walking the parent-child links upward to the nearest ancestor whose row is
   * known, then setting this node's row = ancestorRow + depth. Nodes with a finite
   * `generation` are left unchanged. A visited set guards against consanguinity cycles.
   *
   * The resolved rows are stored in `resolvedRow` and consulted by both `genOf`
   * (used for horizontal separation) and the final y computation, so a node with a
   * missing generation lands on the correct row in both axes.
   */
  const resolvedRow = new Map<string, number>();

  // Seed the map with every node that already has a finite generation.
  for (const [id, node] of Object.entries(doc.individuals)) {
    if (Number.isFinite(node.generation)) {
      resolvedRow.set(id, node.generation as number);
    }
  }

  /**
   * Walk parent links upward from `nodeId` until a node with a known row is found.
   * Returns `{ row, depth }` where `depth` is the number of hops taken, or null
   * when no ancestor with a known row is reachable. Guards against cycles.
   */
  function resolveAncestorRow(
    nodeId: string,
    visited: Set<string>,
  ): { row: number; depth: number } | null {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    if (resolvedRow.has(nodeId)) return { row: resolvedRow.get(nodeId)!, depth: 0 };
    // Find which union this node is a child of.
    const parentLink = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === nodeId,
    );
    if (!parentLink) return null;
    const parentUnion = doc.partnerships[parentLink.parentPartnershipId];
    if (!parentUnion) return null;
    // Try both partners as the upward path, prefer the one with a known row.
    const candidates = [parentUnion.partner1Id, parentUnion.partner2Id].filter(
      (id): id is string => !!id && !!doc.individuals[id],
    );
    for (const parentId of candidates) {
      const found = resolveAncestorRow(parentId, visited);
      if (found !== null) return { row: found.row, depth: found.depth + 1 };
    }
    return null;
  }

  // Resolve all non-finite nodes by walking the graph.
  for (const id of Object.keys(doc.individuals)) {
    if (!resolvedRow.has(id)) {
      const found = resolveAncestorRow(id, new Set());
      resolvedRow.set(id, found !== null ? found.row + found.depth : rootGen);
    }
  }

  const genOf = (id: string): number => resolvedRow.get(id) ?? rootGen;

  // Absolute x for every laid-out node (frame + anchor).
  const finalX: Record<string, number> = {};
  for (const [id, fx] of Object.entries(frame.positions)) {
    if (doc.individuals[id]) finalX[id] = fx + dx;
  }

  // Finishing stage. (1) Slide the whole frame clear of any external pinned
  // in-law family (directional). (2) Partition into rigid descent blocks and
  // centre each sibship under its couple midpoint (#105), clamped and re-separated
  // after every shift. (3) Sweep every row once more so no-overlap holds as an
  // invariant (#115). A pinned load-bearing in-law is a fixed obstacle in its row,
  // never a block member, so it is never relocated.
  const minGap = Math.max(spacing.siblingSpacing, MIN_GENERATION_NODE_SPACING);
  clearExternalObstacles(doc, finalX, genOf, minGap);
  const blocks = computeRigidBlocks(doc, finalX, genOf);
  centerAndReproject(doc, finalX, genOf, spacing, blocks);
  separateGenerations(doc, finalX, genOf, minGap, blocks);

  const result: Record<string, { x: number; y: number }> = {};
  for (const [id, x] of Object.entries(finalX)) {
    const node = doc.individuals[id];
    // Use the pre-resolved row (handles undefined/NaN generation via graph depth).
    const gen = resolvedRow.get(id) ?? rootGen;
    const y = rootY + (gen - rootGen) * spacing.generationSpacing;
    if (node.position.x !== x || node.position.y !== y) result[id] = { x, y };
  }
  return result;
}
