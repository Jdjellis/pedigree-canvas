/** localStorage key recording that first-run onboarding has been dismissed. */
export const ONBOARDED_STORAGE_KEY = 'pedigree-onboarded';

/**
 * Whether to show first-run onboarding. Shown only before the user has grown
 * the seed (<= 1 individual) and only until they've onboarded once.
 *
 * @param individualCount - Number of individuals in the document.
 * @param onboarded - Whether onboarding has already been dismissed.
 * @returns True when the onboarding layer should render.
 */
export function shouldShowOnboarding(individualCount: number, onboarded: boolean): boolean {
  return !onboarded && individualCount <= 1;
}
