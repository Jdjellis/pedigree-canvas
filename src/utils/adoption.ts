import type {
  Individual,
  ParentChildRelationship,
  PartnershipRelationship,
} from '../types/pedigree';

/** Union of the three adoption states shown in the properties panel. */
export type AdoptionMode = 'none' | 'in' | 'out';

/**
 * Returns every parent-child link in `links` whose `childId` equals the given
 * `childId`. Drives the properties-panel branch logic (0 / 1 / 2+ parent links).
 */
export function parentLinksForChild(
  links: Record<string, ParentChildRelationship>,
  childId: string,
): ParentChildRelationship[] {
  return Object.values(links).filter((l) => l.childId === childId);
}

/**
 * Collapses the individual `adopted` flag and one parent-child link into the
 * three-way UI mode used by the segmented control.
 *
 * - `'none'` — `adopted` is falsy (no adoption bracket, solid descent line).
 * - `'in'`   — adopted + `link.isAdoptive === true` (dashed line to adoptive parents).
 * - `'out'`  — adopted + `link.isAdoptive` is `false` or absent (solid line to biological parents).
 */
export function adoptionModeForLink(
  adopted: boolean | undefined,
  link: ParentChildRelationship | undefined,
): AdoptionMode {
  if (!adopted) return 'none';
  return link?.isAdoptive ? 'in' : 'out';
}

/**
 * Returns a human-readable label for the parent couple of a parent-child link,
 * e.g. `"Dad & Mum"`. Falls back to the partner ids when `displayName` is
 * absent, and to `"Parents"` when the partnership itself is not found in the
 * document.
 */
export function parentCoupleLabel(
  source: {
    individuals: Record<string, Individual>;
    partnerships: Record<string, PartnershipRelationship>;
  },
  link: ParentChildRelationship,
): string {
  const partnership = source.partnerships[link.parentPartnershipId];
  if (!partnership) return 'Parents';

  const name = (id: string | undefined): string =>
    (id !== undefined && source.individuals[id]?.displayName) || id || '?';

  const a = name(partnership.partner1Id);
  const b =
    partnership.partner2Id !== undefined &&
    partnership.partner2Id !== partnership.partner1Id
      ? name(partnership.partner2Id)
      : null;

  return b ? `${a} & ${b}` : a;
}
