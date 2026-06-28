import { GenderIdentity } from '../types/enums';

/** The sex applied to a singly-added person (the seed and radial +Partner/+Child/+Sibling). */
export type DefaultSex = 'male' | 'female' | 'unknown';

/**
 * Map a {@link DefaultSex} UI selection to its document-model {@link GenderIdentity}.
 *
 * @param sex - The default-sex UI selection.
 * @returns The corresponding gender identity for a new individual.
 */
export function genderForSex(sex: DefaultSex): GenderIdentity {
  switch (sex) {
    case 'male':
      return GenderIdentity.Man;
    case 'female':
      return GenderIdentity.Woman;
    case 'unknown':
      return GenderIdentity.Unknown;
  }
}
