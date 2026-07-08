/**
 * Gender identity determines the pedigree SYMBOL shape per NSGC 2022:
 *   man -> square, woman -> circle, nonBinary/unknown -> diamond
 */
export enum GenderIdentity {
  Man = 'man',
  Woman = 'woman',
  NonBinary = 'nonBinary',
  Unknown = 'unknown',
}

/**
 * Sex assigned at birth — clinically relevant for risk assessment.
 * Shown as annotation text below the symbol (AMAB, AFAB).
 * Omitted for cisgender individuals (implied by symbol).
 */
export enum SexAssignedAtBirth {
  AMAB = 'AMAB',
  AFAB = 'AFAB',
  UAAB = 'UAAB',
}

export enum VitalStatus {
  Alive = 'alive',
  Deceased = 'deceased',
  Stillborn = 'stillborn',
}

/**
 * Pregnancy loss not carried to term — rendered as a triangle per NSGC/Bennett.
 * Note: a stillbirth is NOT one of these; it is a later-gestation loss drawn
 * with the sex-specific symbol and a deceased slash (see {@link VitalStatus}).
 */
export enum PregnancyOutcome {
  SAB = 'SAB',
  TOP = 'TOP',
  ECT = 'ECT',
}

export enum RelationshipType {
  Partnership = 'partnership',
  /**
   * @deprecated Legacy union sub-type. Consanguinity is now an orthogonal
   * boolean flag ({@link PartnershipRelationship.consanguineous}) that can
   * co-exist with any {@link PartnershipRelationship.type}, so a union is never
   * stored with this type. Retained only so the {@link jsonIO} migration can
   * recognise and upgrade documents saved under the old mutually-exclusive enum.
   */
  Consanguinity = 'consanguinity',
  Separation = 'separation',
  ParentChild = 'parentChild',
  Adoption = 'adoption',
}

export enum TwinType {
  Monozygotic = 'monozygotic',
  Dizygotic = 'dizygotic',
  Unknown = 'unknown',
}
