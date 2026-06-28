import type { PedigreeDocument, TwinGroup } from '../types/pedigree';
import type { TwinType } from '../types/enums';
import { generateId } from './idGenerator';

/**
 * Twin-group creation/query helpers, kept as pure functions of the document so
 * they can be unit-tested without the canvas (which is not jsdom-renderable).
 * The store/UI layer wires these to `addTwinGroup` / `removeTwinGroup` /
 * `updateTwinGroup`.
 */

/**
 * The id of the parent partnership shared by every given individual, or `null`
 * if they do not all descend from the same union (or any id has no parent
 * link). This is the sibship test: twins must be siblings of one partnership.
 */
export function sharedParentPartnershipId(
  doc: PedigreeDocument,
  individualIds: readonly string[],
): string | null {
  let shared: string | null = null;
  for (const id of individualIds) {
    const link = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === id,
    );
    if (!link) return null;
    if (shared === null) {
      shared = link.parentPartnershipId;
    } else if (shared !== link.parentPartnershipId) {
      return null;
    }
  }
  return shared;
}

/**
 * Build a {@link TwinGroup} marking the given individuals as twins of the given
 * zygosity, or `null` when they cannot form a valid group:
 *
 * - fewer than two distinct individuals, or
 * - any individual is missing from the document, or
 * - the individuals are not all siblings of one parent partnership.
 *
 * The caller is responsible for inserting the returned group via the store.
 */
export function buildTwinGroup(
  doc: PedigreeDocument,
  individualIds: readonly string[],
  twinType: TwinType,
): TwinGroup | null {
  const unique = Array.from(new Set(individualIds));
  if (unique.length < 2) return null;
  if (unique.some((id) => !doc.individuals[id])) return null;

  const parentPartnershipId = sharedParentPartnershipId(doc, unique);
  if (!parentPartnershipId) return null;

  return {
    id: generateId(),
    twinType,
    individualIds: unique,
    parentPartnershipId,
  };
}

/**
 * The twin group that contains `individualId`, or `undefined` if the individual
 * is not part of any twin group.
 */
export function findTwinGroupForIndividual(
  doc: PedigreeDocument,
  individualId: string,
): TwinGroup | undefined {
  return Object.values(doc.twinGroups).find((tg) =>
    tg.individualIds.includes(individualId),
  );
}
