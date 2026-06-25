import { GenderIdentity, VitalStatus, RelationshipType } from '../types/enums';
import type {
  PedigreeDocument,
  PedigreeMetadata,
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../types/pedigree';
import { generateId } from '../utils/idGenerator';

// ---------------------------------------------------------------------------
// PED column constants
// ---------------------------------------------------------------------------

const SEX_MALE = 1;
const SEX_FEMALE = 2;
const SEX_UNKNOWN = 0;

const PHENO_UNAFFECTED = 1;
const PHENO_AFFECTED = 2;

const MISSING_PARENT = '0';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Convert a PedigreeDocument to a PED-format string.
 *
 * PED format (tab-separated, one individual per line):
 * ```
 * FamilyID  IndividualID  FatherID  MotherID  Sex  Phenotype
 * ```
 */
export function exportToPed(doc: PedigreeDocument): string {
  const familyId = doc.metadata.title || 'FAM001';

  // Build a lookup: childId -> { fatherId, motherId }
  const parentMap = buildParentMap(doc);

  const lines: string[] = [];

  for (const individual of Object.values(doc.individuals)) {
    const indId = individual.id;
    const parents = parentMap.get(indId);
    const fatherId = parents?.fatherId ?? MISSING_PARENT;
    const motherId = parents?.motherId ?? MISSING_PARENT;
    const sex = mapGenderToSex(individual.genderIdentity);
    const phenotype = individual.conditionIds.length > 0 ? PHENO_AFFECTED : PHENO_UNAFFECTED;

    lines.push(
      [familyId, indId, fatherId, motherId, sex, phenotype].join('\t'),
    );
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface PedRow {
  familyId: string;
  individualId: string;
  fatherId: string;
  motherId: string;
  sex: number;
  phenotype: number;
}

/**
 * Parse a PED-format string into a PedigreeDocument.
 *
 * Handles comments (lines starting with `#`), empty lines, and the standard
 * `0` convention for missing parents.
 */
export function importFromPed(
  pedContent: string,
  docTitle?: string,
): PedigreeDocument {
  const rows = parsePedRows(pedContent);

  if (rows.length === 0) {
    throw new Error('PED file contains no valid data rows.');
  }

  // Derive family ID from the first row if no title was provided.
  const title = docTitle ?? rows[0].familyId ?? 'Imported Pedigree';

  // 1. Create Individual records keyed by PED individual ID.
  //    We also keep a mapping from PED ID -> new UUID.
  const pedIdToUuid = new Map<string, string>();
  const individuals: Record<string, Individual> = {};

  for (const row of rows) {
    const uuid = generateId();
    pedIdToUuid.set(row.individualId, uuid);
    individuals[uuid] = makeIndividual(uuid, row);
  }

  // 2. Derive partnerships from unique (fatherId, motherId) pairs.
  const partnerships: Record<string, PartnershipRelationship> = {};
  const parentChildLinks: Record<string, ParentChildRelationship> = {};

  // Key: "fatherPedId|motherPedId" -> partnership UUID
  const partnershipKeyToUuid = new Map<string, string>();

  for (const row of rows) {
    if (row.fatherId === MISSING_PARENT && row.motherId === MISSING_PARENT) {
      continue; // No known parents.
    }

    const pKey = `${row.fatherId}|${row.motherId}`;
    let partnershipUuid = partnershipKeyToUuid.get(pKey);

    if (partnershipUuid == null) {
      partnershipUuid = generateId();
      partnershipKeyToUuid.set(pKey, partnershipUuid);

      const partner1Id =
        row.fatherId !== MISSING_PARENT
          ? pedIdToUuid.get(row.fatherId)
          : undefined;
      const partner2Id =
        row.motherId !== MISSING_PARENT
          ? pedIdToUuid.get(row.motherId)
          : undefined;

      // If both parents reference individuals not in the file we create
      // placeholder individuals for them.
      const p1 = ensureIndividual(
        row.fatherId,
        GenderIdentity.Man,
        pedIdToUuid,
        individuals,
      );
      const p2 = ensureIndividual(
        row.motherId,
        GenderIdentity.Woman,
        pedIdToUuid,
        individuals,
      );

      partnerships[partnershipUuid] = {
        id: partnershipUuid,
        type: RelationshipType.Partnership,
        partner1Id: partner1Id ?? p1,
        partner2Id: partner2Id ?? p2,
        childrenIds: [],
      };
    }

    const childUuid = pedIdToUuid.get(row.individualId)!;

    // Add child to partnership
    partnerships[partnershipUuid].childrenIds.push(childUuid);

    // Create parent-child link
    const linkId = generateId();
    parentChildLinks[linkId] = {
      id: linkId,
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipUuid,
      childId: childUuid,
      isAdopted: false,
    };
  }

  // 3. Assign positions using a simple generational layout.
  assignPositions(individuals, partnerships, parentChildLinks);

  // 4. Build generationOrder
  const generationOrder = buildGenerationOrder(individuals);

  // 5. Assemble metadata.
  const now = new Date().toISOString();
  const metadata: PedigreeMetadata = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    version: '1',
  };

  return {
    metadata,
    individuals,
    partnerships,
    parentChildLinks,
    twinGroups: {},
    textAnnotations: {},
    generationOrder,
    legendConfig: { entries: [], position: { x: 50, y: 50 } },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse PED rows, skipping comments and blank lines. */
function parsePedRows(content: string): PedRow[] {
  const rows: PedRow[] = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 6) continue; // Malformed line — skip.

    rows.push({
      familyId: parts[0],
      individualId: parts[1],
      fatherId: parts[2],
      motherId: parts[3],
      sex: parseInt(parts[4], 10),
      phenotype: parseInt(parts[5], 10),
    });
  }

  return rows;
}

/** Map GenderIdentity to PED sex code. */
function mapGenderToSex(gender: GenderIdentity): number {
  switch (gender) {
    case GenderIdentity.Man:
      return SEX_MALE;
    case GenderIdentity.Woman:
      return SEX_FEMALE;
    default:
      return SEX_UNKNOWN;
  }
}

/** Map PED sex code to GenderIdentity. */
function mapSexToGender(sex: number): GenderIdentity {
  switch (sex) {
    case SEX_MALE:
      return GenderIdentity.Man;
    case SEX_FEMALE:
      return GenderIdentity.Woman;
    default:
      return GenderIdentity.Unknown;
  }
}


/** Build a map from child ID -> { fatherId, motherId } using PED IDs. */
function buildParentMap(
  doc: PedigreeDocument,
): Map<string, { fatherId: string; motherId: string }> {
  const map = new Map<string, { fatherId: string; motherId: string }>();

  for (const link of Object.values(doc.parentChildLinks)) {
    const partnership = doc.partnerships[link.parentPartnershipId];
    if (!partnership) continue;

    // Determine which partner is father / mother based on gender.
    const p1 = doc.individuals[partnership.partner1Id];
    const p2 = doc.individuals[partnership.partner2Id];

    let fatherId = MISSING_PARENT;
    let motherId = MISSING_PARENT;

    if (p1 && p2) {
      // Conventional assignment: Man -> father, Woman -> mother.
      if (p1.genderIdentity === GenderIdentity.Man) {
        fatherId = p1.id;
        motherId = p2.id;
      } else {
        fatherId = p2.id;
        motherId = p1.id;
      }
    } else if (p1) {
      if (p1.genderIdentity === GenderIdentity.Man) fatherId = p1.id;
      else motherId = p1.id;
    } else if (p2) {
      if (p2.genderIdentity === GenderIdentity.Man) fatherId = p2.id;
      else motherId = p2.id;
    }

    map.set(link.childId, { fatherId, motherId });
  }

  return map;
}

/** Create an Individual from a parsed PED row. */
function makeIndividual(uuid: string, row: PedRow): Individual {
  return {
    id: uuid,
    genderIdentity: mapSexToGender(row.sex),
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    geneticTests: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 0, y: 0 },
    annotations: [],
  };
}

/**
 * Ensure an individual exists for the given PED ID. If the ID is the missing
 * marker (`0`) this is a no-op and returns a placeholder UUID. Otherwise the
 * individual is created if it does not already exist.
 */
function ensureIndividual(
  pedId: string,
  defaultGender: GenderIdentity,
  pedIdToUuid: Map<string, string>,
  individuals: Record<string, Individual>,
): string {
  if (pedId === MISSING_PARENT) {
    // Return a deterministic placeholder; the caller will handle missing.
    return MISSING_PARENT;
  }

  let uuid = pedIdToUuid.get(pedId);
  if (uuid != null) return uuid;

  // Parent referenced but not present as its own row — create a stub.
  uuid = generateId();
  pedIdToUuid.set(pedId, uuid);
  individuals[uuid] = {
    id: uuid,
    genderIdentity: defaultGender,
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    geneticTests: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 0, y: 0 },
    annotations: [],
  };

  return uuid;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * Assign generation numbers and (x, y) positions using a simple top-down
 * layout. Parents are placed above children; siblings are spaced horizontally.
 */
function assignPositions(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  parentChildLinks: Record<string, ParentChildRelationship>,
): void {
  // Build child -> parentPartnershipId lookup
  const childToPartnership = new Map<string, string>();
  for (const link of Object.values(parentChildLinks)) {
    childToPartnership.set(link.childId, link.parentPartnershipId);
  }

  // Build set of all individual IDs that are children
  const childIds = new Set(childToPartnership.keys());

  // Collect parent IDs (partners in partnerships that have children)
  const parentIds = new Set<string>();
  for (const p of Object.values(partnerships)) {
    if (p.childrenIds.length > 0) {
      parentIds.add(p.partner1Id);
      parentIds.add(p.partner2Id);
    }
  }

  // Compute generations via BFS starting from founders (individuals who are
  // not children of any partnership).
  const generation = new Map<string, number>();

  // Founders: individuals not appearing as a child
  const founders: string[] = [];
  for (const id of Object.keys(individuals)) {
    if (!childIds.has(id)) {
      founders.push(id);
      generation.set(id, 0);
    }
  }

  // BFS down through partnerships
  const queue = [...founders];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const gen = generation.get(current) ?? 0;

    // Find partnerships this individual belongs to
    for (const p of Object.values(partnerships)) {
      if (p.partner1Id !== current && p.partner2Id !== current) continue;

      // Ensure the partner has the same generation
      const partnerId =
        p.partner1Id === current ? p.partner2Id : p.partner1Id;
      if (!generation.has(partnerId)) {
        generation.set(partnerId, gen);
        queue.push(partnerId);
      }

      // Children are one generation below
      for (const childId of p.childrenIds) {
        if (!generation.has(childId)) {
          generation.set(childId, gen + 1);
          queue.push(childId);
        }
      }
    }
  }

  // Any remaining individuals without a generation (disconnected) get gen 0
  for (const id of Object.keys(individuals)) {
    if (!generation.has(id)) {
      generation.set(id, 0);
    }
  }

  // Group individuals by generation
  const genGroups = new Map<number, string[]>();
  for (const [id, gen] of generation) {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen)!.push(id);
  }

  // Assign positions
  const X_SPACING = 100;
  const Y_SPACING = 150;

  for (const [gen, ids] of genGroups) {
    ids.forEach((id, index) => {
      const individual = individuals[id];
      if (individual) {
        individual.position = {
          x: index * X_SPACING,
          y: gen * Y_SPACING,
        };
        individual.generation = gen;
      }
    });
  }
}

/** Build the generationOrder array from assigned generation numbers. */
function buildGenerationOrder(
  individuals: Record<string, Individual>,
): string[][] {
  const genMap = new Map<number, string[]>();
  for (const ind of Object.values(individuals)) {
    const gen = ind.generation ?? 0;
    if (!genMap.has(gen)) genMap.set(gen, []);
    genMap.get(gen)!.push(ind.id);
  }

  const sorted = [...genMap.entries()].sort(([a], [b]) => a - b);
  return sorted.map(([, ids]) => ids);
}
