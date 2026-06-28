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
  isAdoptive?: boolean;
}

export interface ParentChildRelationship {
  id: string;
  type: RelationshipType.ParentChild | RelationshipType.Adoption;
  parentPartnershipId: string;
  childId: string;
  isAdopted: boolean;
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
