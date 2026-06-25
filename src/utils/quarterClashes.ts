import type { LegendEntry, QuarterPosition } from '../types/pedigree';

/**
 * All quarter positions a condition can occupy, in a stable display order.
 */
export const ALL_QUARTERS: readonly QuarterPosition[] = [
  'topRight',
  'topLeft',
  'bottomLeft',
  'bottomRight',
] as const;

/**
 * A group of two or more conditions that an individual has applied to the same
 * symbol quarter. Because conditions are differentiated by colour/pattern within
 * a quarter, sharing a quarter is allowed globally — but an individual that
 * applies more than one condition to the same quarter cannot render them
 * distinctly, so the overlap is reported here as a clash to be resolved.
 */
export interface QuarterClash {
  /** The quarter that two or more applied conditions share. */
  quarter: QuarterPosition;
  /**
   * The clashing legend entries, in the order they appear in `entries`. Always
   * length >= 2.
   */
  entries: LegendEntry[];
}

/**
 * Detect quarters where an individual has applied two or more conditions.
 *
 * The check is purely per-individual: it only considers legend entries whose id
 * appears in `conditionIds`. Two global conditions that share a quarter are not
 * a clash unless the same individual applies both of them.
 *
 * @param conditionIds - The ids of conditions applied to one individual.
 * @param entries - All legend entries defined for the document.
 * @returns One {@link QuarterClash} per quarter that has 2+ applied conditions.
 *   Empty when there is no overlap.
 */
export function detectQuarterClashes(
  conditionIds: string[],
  entries: LegendEntry[],
): QuarterClash[] {
  const applied = entries.filter((entry) => conditionIds.includes(entry.id));

  const byQuarter = new Map<QuarterPosition, LegendEntry[]>();
  for (const entry of applied) {
    const group = byQuarter.get(entry.quarter) ?? [];
    group.push(entry);
    byQuarter.set(entry.quarter, group);
  }

  const clashes: QuarterClash[] = [];
  for (const quarter of ALL_QUARTERS) {
    const group = byQuarter.get(quarter);
    if (group && group.length >= 2) {
      clashes.push({ quarter, entries: group });
    }
  }
  return clashes;
}

/**
 * Compute the quarters an individual could move one of its applied conditions
 * into without colliding with another condition the same individual applies.
 *
 * Only conditions applied to THIS individual constrain the result; the entry
 * being moved (`entryIdToMove`) does not block itself.
 *
 * @param entryIdToMove - The id of the condition the user wants to relocate.
 * @param conditionIds - The ids of conditions applied to the individual.
 * @param entries - All legend entries defined for the document.
 * @returns Quarters that are free among this individual's applied conditions,
 *   in {@link ALL_QUARTERS} order.
 */
export function freeQuartersFor(
  entryIdToMove: string,
  conditionIds: string[],
  entries: LegendEntry[],
): QuarterPosition[] {
  const occupied = new Set<QuarterPosition>(
    entries
      .filter(
        (entry) =>
          entry.id !== entryIdToMove && conditionIds.includes(entry.id),
      )
      .map((entry) => entry.quarter),
  );
  return ALL_QUARTERS.filter((quarter) => !occupied.has(quarter));
}
