import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
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
  // eslint-disable-next-line no-constant-condition
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

// Re-export types consumed from pedigree for convenience (layout module consumers
// only need to import from this module).
export type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
};
