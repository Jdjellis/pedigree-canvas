import type {
  PedigreeDocument,
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../types/pedigree';

/** One set of parents for a child: a partnership plus the edge linking it. */
export interface ParentSet {
  father?: Individual;
  mother?: Individual;
  partnershipId: string;
  /** The parent-child edge, carrying its per-edge line style (`isAdoptive`). */
  link: ParentChildRelationship;
}

/**
 * Return **every** parent set for a child, in `parentChildLinks` iteration order.
 * A child normally has one, but multi-parentage (e.g. a biological couple plus an
 * adoptive couple, issue #64) attaches more than one — each is its own set.
 * Links whose partnership is missing from the document are skipped.
 */
export function findParentSets(
  doc: PedigreeDocument,
  individualId: string
): ParentSet[] {
  const sets: ParentSet[] = [];
  for (const link of Object.values(doc.parentChildLinks)) {
    if (link.childId !== individualId) continue;
    const partnership = doc.partnerships[link.parentPartnershipId];
    if (!partnership) continue;
    sets.push({
      father: partnership.partner1Id ? doc.individuals[partnership.partner1Id] : undefined,
      mother: partnership.partner2Id ? doc.individuals[partnership.partner2Id] : undefined,
      partnershipId: partnership.id,
      link,
    });
  }
  return sets;
}

/**
 * The **first** parent set for a child, or `{}` when none. Retained for callers
 * that only need a single couple; use {@link findParentSets} to see all of them.
 */
export function findParents(
  doc: PedigreeDocument,
  individualId: string
): { father?: Individual; mother?: Individual; partnershipId?: string } {
  const [first] = findParentSets(doc, individualId);
  if (!first) return {};
  return { father: first.father, mother: first.mother, partnershipId: first.partnershipId };
}

export function findChildren(
  doc: PedigreeDocument,
  individualId: string
): Individual[] {
  const children: Individual[] = [];

  for (const partnership of Object.values(doc.partnerships)) {
    if (
      partnership.partner1Id === individualId ||
      partnership.partner2Id === individualId
    ) {
      for (const childId of partnership.childrenIds) {
        const child = doc.individuals[childId];
        if (child) children.push(child);
      }
    }
  }

  return children;
}

export function findSiblings(
  doc: PedigreeDocument,
  individualId: string
): Individual[] {
  // Aggregate siblings across every parent set: a child with two parent couples
  // (multi-parentage, #64) has siblings under each. Dedupe by id and drop the
  // individual themselves.
  const seen = new Set<string>([individualId]);
  const siblings: Individual[] = [];
  for (const { partnershipId } of findParentSets(doc, individualId)) {
    const partnership = doc.partnerships[partnershipId];
    if (!partnership) continue;
    for (const id of partnership.childrenIds) {
      if (seen.has(id)) continue;
      const sib = doc.individuals[id];
      if (!sib) continue;
      seen.add(id);
      siblings.push(sib);
    }
  }
  return siblings;
}

export function findPartnerships(
  doc: PedigreeDocument,
  individualId: string
): string[] {
  return Object.values(doc.partnerships)
    .filter(
      (p) =>
        p.partner1Id === individualId || p.partner2Id === individualId
    )
    .map((p) => p.id);
}

/** The partner individuals that actually exist for a union (0, 1, or 2). */
export function getPresentPartners(
  individuals: Record<string, Individual>,
  partnership: PartnershipRelationship,
): Individual[] {
  const result: Individual[] = [];
  const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
  const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;
  if (p1) result.push(p1);
  if (p2) result.push(p2);
  return result;
}

/** True only when the individual's parent union has at least one present partner. */
export function hasParents(
  doc: PedigreeDocument,
  individualId: string,
): boolean {
  for (const link of Object.values(doc.parentChildLinks)) {
    if (link.childId !== individualId) continue;
    const p = doc.partnerships[link.parentPartnershipId];
    if (p && (p.partner1Id || p.partner2Id)) return true;
  }
  return false;
}

export function hasPartnership(
  doc: PedigreeDocument,
  individualId: string
): boolean {
  return Object.values(doc.partnerships).some(
    (p) =>
      p.partner1Id === individualId || p.partner2Id === individualId
  );
}
