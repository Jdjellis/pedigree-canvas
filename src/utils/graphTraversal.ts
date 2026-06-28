import type { PedigreeDocument, Individual, PartnershipRelationship } from '../types/pedigree';

export function findParents(
  doc: PedigreeDocument,
  individualId: string
): { father?: Individual; mother?: Individual; partnershipId?: string } {
  for (const link of Object.values(doc.parentChildLinks)) {
    if (link.childId === individualId) {
      const partnership = doc.partnerships[link.parentPartnershipId];
      if (!partnership) continue;

      const p1 = partnership.partner1Id ? doc.individuals[partnership.partner1Id] : undefined;
      const p2 = partnership.partner2Id ? doc.individuals[partnership.partner2Id] : undefined;

      // Return by biological role if possible, otherwise by order
      return {
        father: p1,
        mother: p2,
        partnershipId: partnership.id,
      };
    }
  }
  return {};
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
  const { partnershipId } = findParents(doc, individualId);
  if (!partnershipId) return [];

  const partnership = doc.partnerships[partnershipId];
  if (!partnership) return [];

  return partnership.childrenIds
    .filter((id) => id !== individualId)
    .map((id) => doc.individuals[id])
    .filter(Boolean);
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
