import {
  GenderIdentity,
  SexAssignedAtBirth,
  VitalStatus,
  PregnancyOutcome,
  RelationshipType,
  TwinType,
} from './enums';

// ---------------------------------------------------------------------------
// Quarter-based condition shading types
// ---------------------------------------------------------------------------

export type QuarterPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export type FillPatternType =
  | 'solid'
  | 'diagonalLines'
  | 'dots'
  | 'crosshatch'
  | 'horizontalStripes'
  | 'verticalStripes';

export interface LegendEntry {
  id: string;
  quarter: QuarterPosition;
  fillColor: string;
  fillPattern: FillPatternType;
  name: string;
  applicableTo?: 'man' | 'woman';
}

export interface LegendConfig {
  entries: LegendEntry[];
  position: Position;
}

export interface Position {
  x: number;
  y: number;
}

export interface Condition {
  id: string;
  name: string;
  ageOfOnset?: number;
  ageOfDiagnosis?: number;
}

export interface Annotation {
  label: string;
}

/**
 * A genetic test / investigation recorded on an individual.
 *
 * Split into two fields so the short identifier and the free-text result can be
 * surfaced in different places: the {@link label} appears on the canvas symbol,
 * while the {@link description} appears in the properties panel and the exported
 * key (SVG/PDF), where each row reads `label = description`.
 */
export interface Investigation {
  /** Short identifier shown on the canvas symbol (e.g. "Karyotype", "BRCA1"). */
  label: string;
  /** Free-text result or note (e.g. "46,XX", "Pathogenic variant detected"). */
  description: string;
}

/**
 * A free-text annotation placed anywhere on the canvas (titles, captions,
 * notes). Unlike {@link Annotation}, which decorates an individual, a
 * TextAnnotation is a first-class, independently positioned document entity.
 */
export interface TextAnnotation {
  /** Stable unique identifier. */
  id: string;
  /** The text to display. May contain newlines. */
  text: string;
  /** Top-left position of the text in canvas coordinates. */
  position: Position;
  /** Font size in canvas units (pixels at 1x zoom). */
  fontSize: number;
}

/**
 * The two documented forms of childlessness (a double cross-bar for infertility,
 * a single bar for no children), shared by {@link Individual} and
 * {@link PartnershipRelationship}.
 */
export type ChildlessStatus = 'infertility' | 'noChildren';

export interface Individual {
  id: string;

  // Identity
  genderIdentity: GenderIdentity;
  sexAssignedAtBirth?: SexAssignedAtBirth;

  // Display
  displayName?: string;
  dateOfBirth?: string;
  age?: number;

  // Clinical
  vitalStatus: VitalStatus;
  causeOfDeath?: string;
  conditionIds: string[];
  conditions: Condition[];

  // Pedigree role
  isProband: boolean;
  isConsultand?: boolean;
  isPregnancy: boolean;
  pregnancyOutcome?: PregnancyOutcome;
  gestationalAge?: string;

  // Visual position
  position: Position;
  generation?: number;

  /**
   * When true the individual was adopted: the symbol is drawn enclosed in
   * square brackets and the line of descent from their (adoptive) parents is
   * dashed, per NSGC/Bennett nomenclature. See {@link AdoptionBrackets}.
   */
  adopted?: boolean;

  /**
   * Documented childlessness of this individual, as an alternative to marking a
   * partnership childless when there is no partner drawn. Drawn per NSGC/Bennett
   * as a vertical line dropping from the symbol terminated by cross-bar(s),
   * identical to the partnership marker ({@link PartnershipRelationship.childlessStatus}):
   *   - `'infertility'` → a double cross-bar;
   *   - `'noChildren'` → a single cross-bar.
   * Either may be annotated with a free-text {@link childlessReason}. Suppressed
   * once the individual has children on the canvas (a marker would contradict the
   * descent line).
   */
  childlessStatus?: ChildlessStatus;
  /**
   * Free-text cause/description for this individual's childlessness (e.g.
   * "vasectomy", "azoospermia"), for the currently selected {@link childlessStatus}.
   * The cause for the *other* status (if the user ever typed one) is parked in
   * {@link childlessReasonByStatus} so switching status and back does not lose it.
   */
  childlessReason?: string;
  /**
   * Parked causes for the childless status(es) that are not currently selected,
   * so an accidental status change never discards typed text. The active
   * status's cause always lives in {@link childlessReason}; this holds only the
   * inactive one(s).
   */
  childlessReasonByStatus?: Partial<Record<ChildlessStatus, string>>;

  // Annotations
  investigations: Investigation[];
  annotations: Annotation[];
  notes?: string;
}

export interface PartnershipRelationship {
  id: string;
  type:
    | RelationshipType.Partnership
    | RelationshipType.Consanguinity
    | RelationshipType.Separation;
  partner1Id?: string;
  partner2Id?: string;
  childrenIds: string[];
  /**
   * Free-text degree of relationship for a consanguineous union (e.g.
   * "1st cousins"), rendered above the double partnership line. Only
   * meaningful when {@link type} is {@link RelationshipType.Consanguinity}.
   */
  consanguinityDegree?: string;
  /**
   * Documented childlessness of this union, drawn as marks hanging below the
   * relationship line per NSGC/Bennett. Orthogonal to {@link type} (an infertile
   * couple may also be consanguineous or separated):
   *   - `'infertility'` → a double cross-bar (e.g. cause "azoospermia");
   *   - `'noChildren'` → a single cross-bar ("no children by choice or reason
   *     unknown", e.g. cause "vasectomy").
   * Either may be annotated with a free-text {@link childlessReason}.
   * Absent → an ordinary union that draws no childless marks.
   */
  childlessStatus?: ChildlessStatus;
  /**
   * Free-text cause/description for a childless union (e.g. "azoospermia",
   * "endometriosis", "vasectomy"), rendered below the marks, for the currently
   * selected {@link childlessStatus}. The cause for the *other* status is parked
   * in {@link childlessReasonByStatus} so switching status and back keeps it.
   */
  childlessReason?: string;
  /**
   * Parked causes for the childless status(es) not currently selected, so an
   * accidental status change never discards typed text. The active status's
   * cause always lives in {@link childlessReason}; this holds only the inactive
   * one(s).
   */
  childlessReasonByStatus?: Partial<Record<ChildlessStatus, string>>;
}

export interface ParentChildRelationship {
  id: string;
  type: RelationshipType.ParentChild;
  parentPartnershipId: string;
  childId: string;
  /**
   * Line-of-descent style for this edge, per NSGC/Bennett: `true` → adoptive
   * parents (dashed line), `false`/absent → biological parents (solid line).
   * Brackets around the child are separate ({@link Individual.adopted}).
   */
  isAdoptive?: boolean;
}

export interface TwinGroup {
  id: string;
  twinType: TwinType;
  individualIds: string[];
  parentPartnershipId: string;
}

export interface PedigreeMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  referenceCondition?: string;
  institution?: string;
  version: string;
}

export interface PedigreeDocument {
  metadata: PedigreeMetadata;
  individuals: Record<string, Individual>;
  partnerships: Record<string, PartnershipRelationship>;
  parentChildLinks: Record<string, ParentChildRelationship>;
  twinGroups: Record<string, TwinGroup>;
  textAnnotations: Record<string, TextAnnotation>;
  generationOrder: string[][];
  legendConfig: LegendConfig;
}
