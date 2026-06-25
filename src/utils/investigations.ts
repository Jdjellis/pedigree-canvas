import type { Individual } from '../types/pedigree';

/**
 * Collect the distinct set of free-text investigations recorded across every
 * individual in the chart, trimmed, with empties removed, sorted alphabetically.
 *
 * This single projection feeds both the editor autocomplete and the legend's
 * "Investigations" subheading, so the key can never drift from the symbols.
 *
 * @param individuals - all individuals in the document.
 * @returns distinct, trimmed, non-empty investigation strings, sorted by `localeCompare`.
 */
export function collectInvestigations(individuals: Individual[]): string[] {
  const set = new Set<string>();
  for (const individual of individuals) {
    for (const raw of individual.investigations) {
      const value = raw.trim();
      if (value) set.add(value);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
