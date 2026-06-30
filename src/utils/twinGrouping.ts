import type { TwinGroup } from '../types/pedigree';

/**
 * Return the twin groups that contain at least one of the given individual ids.
 * Used to decide whether a multi-selection touches existing twin groups (and,
 * with {@link pickSurvivingTwinGroup}, which one survives a merge).
 */
export function twinGroupsTouching(
  twinGroups: Record<string, TwinGroup>,
  ids: string[],
): TwinGroup[] {
  return Object.values(twinGroups).filter((g) =>
    g.individualIds.some((m) => ids.includes(m)),
  );
}

/**
 * Pick the twin group whose zygosity survives a merge: the group with the most
 * members, ties broken by the lexicographically-smallest group id (stable and
 * deterministic). Returns `undefined` when `groups` is empty.
 *
 * Single source of truth shared by the `groupTwins` store action (which merges
 * into the survivor) and the multi-select panel (which displays the survivor's
 * zygosity), so the two never disagree.
 */
export function pickSurvivingTwinGroup(
  groups: TwinGroup[],
): TwinGroup | undefined {
  return groups
    .slice()
    .sort(
      (a, b) =>
        b.individualIds.length - a.individualIds.length ||
        (a.id < b.id ? -1 : 1),
    )[0];
}
