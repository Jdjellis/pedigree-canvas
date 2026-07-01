import { describe, it, expect } from 'vitest';
import { buildChildForUnion } from './addChild';
import type { Individual, PartnershipRelationship, PedigreeDocument } from '../../types/pedigree';
import { GenderIdentity, VitalStatus, RelationshipType } from '../../types/enums';

function person(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    genderIdentity: GenderIdentity.Unknown,
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    investigations: [],
    annotations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 0, y: 0 },
    generation: 0,
    ...overrides,
  };
}

function docWith(individuals: Individual[], partnership: PartnershipRelationship): PedigreeDocument {
  return {
    metadata: {
      id: 'd', title: 't', createdAt: '', updatedAt: '', version: '1.0.0',
    },
    individuals: Object.fromEntries(individuals.map((p) => [p.id, p])),
    partnerships: { [partnership.id]: partnership },
    parentChildLinks: {},
    twinGroups: {},
    textAnnotations: {},
    generationOrder: [],
    legendConfig: { entries: [], position: { x: 0, y: 0 } },
  };
}

describe('buildChildForUnion', () => {
  it('anchors the child under the midpoint of both present partners, one generation down', () => {
    const p1 = person({ id: 'p1', generation: 0, position: { x: 140, y: 0 } });
    const p2 = person({ id: 'p2', generation: 0, position: { x: 260, y: 0 } });
    const union: PartnershipRelationship = {
      id: 'u', type: RelationshipType.Partnership,
      partner1Id: 'p1', partner2Id: 'p2', childrenIds: [],
    };
    const doc = docWith([p1, p2], union);

    const { child, link } = buildChildForUnion(doc, p1, union);

    // midX = (140 + 260) / 2 = 200, no existing children so no sibling offset.
    expect(child.position.x).toBe(200);
    expect(child.position.y).toBe(p1.position.y + 150); // GENERATION_SPACING
    expect(child.generation).toBe(1);
    expect(child.genderIdentity).toBe(GenderIdentity.Unknown);
    expect(link.parentPartnershipId).toBe('u');
    expect(link.childId).toBe(child.id);
    expect(link.type).toBe(RelationshipType.ParentChild);
  });

  it('offsets each subsequent child so siblings fan out rather than stack', () => {
    const p1 = person({ id: 'p1', generation: 0, position: { x: 0, y: 0 } });
    const p2 = person({ id: 'p2', generation: 0, position: { x: 0, y: 0 } });
    const union: PartnershipRelationship = {
      id: 'u', type: RelationshipType.Partnership,
      partner1Id: 'p1', partner2Id: 'p2', childrenIds: ['existing-a', 'existing-b'],
    };
    const doc = docWith([p1, p2], union);

    const { child } = buildChildForUnion(doc, p1, union);

    // midX = 0, two existing children → offset by 2 * SIBLING_SPACING (80).
    expect(child.position.x).toBe(160);
  });

  it('places the child a generation below the LOWEST partner for a cross-generation union, regardless of entry point', () => {
    // Consanguineous union spanning generations: partner A on gen 0, partner B one row down.
    const a = person({ id: 'a', generation: 0, position: { x: 0, y: 0 } });
    const b = person({ id: 'b', generation: 1, position: { x: 0, y: 150 } });
    const union: PartnershipRelationship = {
      id: 'u', type: RelationshipType.Partnership,
      partner1Id: 'a', partner2Id: 'b', childrenIds: [],
    };
    const doc = docWith([a, b], union);

    // Initiating from the upper partner (gen 0) must still land the child at gen 2.
    const fromA = buildChildForUnion(doc, a, union);
    expect(fromA.child.generation).toBe(2);
    expect(fromA.child.position.y).toBe(300); // below partner B (y 150) + GENERATION_SPACING

    // Initiating from the lower partner yields the same placement — no entry-point dependence.
    const fromB = buildChildForUnion(doc, b, union);
    expect(fromB.child.generation).toBe(2);
    expect(fromB.child.position.y).toBe(300);
  });

  it('falls back to the target x when the union has no present partners', () => {
    const target = person({ id: 't', generation: 0, position: { x: 42, y: 0 } });
    const union: PartnershipRelationship = {
      id: 'u', type: RelationshipType.Partnership, childrenIds: [],
    };
    const doc = docWith([target], union);

    const { child } = buildChildForUnion(doc, target, union);
    expect(child.position.x).toBe(42);
  });
});
