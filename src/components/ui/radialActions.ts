import { createDefaultIndividual } from '../../stores/pedigreeStore';
import { genderForSex, type DefaultSex } from '../../utils/sex';
import type { Individual } from '../../types/pedigree';

/**
 * Build a new singly-added relative (partner / child / sibling) whose sex is the
 * current default. +Parents does NOT use this — it always creates a fixed
 * father+mother pair.
 *
 * Kept in its own module (not in {@link ./RadialMenu}) so that component file
 * exports only components — satisfying the `react-refresh/only-export-components`
 * rule, mirroring the `toolIcons` / `toolDefs` split.
 *
 * @param sex - The active default sex.
 * @param overrides - Position/generation (and any other) overrides.
 * @returns A new individual with the mapped gender identity.
 */
export function createRelativeIndividual(
  sex: DefaultSex,
  overrides: Partial<Individual>,
): Individual {
  return createDefaultIndividual({ genderIdentity: genderForSex(sex), ...overrides });
}
