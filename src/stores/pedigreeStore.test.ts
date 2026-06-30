import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual, createDefaultDocument, createSeededDocument } from './pedigreeStore';
import { generateId } from '../utils/idGenerator';
import { GenderIdentity, RelationshipType } from '../types/enums';
import { MIN_GENERATION_NODE_SPACING } from '../utils/constants';
import type {
  TextAnnotation,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../types/pedigree';

/**
 * Reset the store to a fresh empty document (and clear undo/redo history)
 * before each test so cases are independent.
 */
beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  usePedigreeStore.temporal.getState().clear();
});

function seedPartnership(): string {
  const a = createDefaultIndividual();
  const b = createDefaultIndividual();
  const partnership: PartnershipRelationship = {
    id: 'pa-1',
    type: RelationshipType.Partnership,
    partner1Id: a.id,
    partner2Id: b.id,
    childrenIds: [],
  };
  const store = usePedigreeStore.getState();
  store.addIndividual(a);
  store.addIndividual(b);
  store.addPartnership(partnership);
  return partnership.id;
}

function makeAnnotation(overrides: Partial<TextAnnotation> = {}): TextAnnotation {
  return {
    id: 'anno-1',
    text: 'Family A',
    position: { x: 10, y: 20 },
    fontSize: 18,
    ...overrides,
  };
}

describe('updatePartnership', () => {
  it('changes the partnership type', () => {
    const id = seedPartnership();
    usePedigreeStore
      .getState()
      .updatePartnership(id, { type: RelationshipType.Separation });
    expect(usePedigreeStore.getState().document.partnerships[id].type).toBe(
      RelationshipType.Separation,
    );
  });

  it('preserves other fields when patching type', () => {
    const id = seedPartnership();
    const before = usePedigreeStore.getState().document.partnerships[id];
    usePedigreeStore
      .getState()
      .updatePartnership(id, { type: RelationshipType.Consanguinity });
    const after = usePedigreeStore.getState().document.partnerships[id];
    expect(after.partner1Id).toBe(before.partner1Id);
    expect(after.partner2Id).toBe(before.partner2Id);
    expect(after.childrenIds).toEqual(before.childrenIds);
  });

  it('is a no-op for an unknown id', () => {
    const id = seedPartnership();
    const before = usePedigreeStore.getState().document.partnerships[id];
    usePedigreeStore
      .getState()
      .updatePartnership('does-not-exist', { type: RelationshipType.Separation });
    expect(usePedigreeStore.getState().document.partnerships[id]).toEqual(before);
  });
});

describe('pedigreeStore text annotation actions', () => {
  it('starts with an empty textAnnotations map on a new document', () => {
    expect(usePedigreeStore.getState().document.textAnnotations).toEqual({});
  });

  it('addTextAnnotation inserts the annotation keyed by id', () => {
    const annotation = makeAnnotation();
    usePedigreeStore.getState().addTextAnnotation(annotation);

    expect(
      usePedigreeStore.getState().document.textAnnotations['anno-1'],
    ).toEqual(annotation);
  });

  it('updateTextAnnotation patches text without dropping other fields', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    usePedigreeStore
      .getState()
      .updateTextAnnotation('anno-1', { text: 'Renamed' });

    const updated =
      usePedigreeStore.getState().document.textAnnotations['anno-1'];
    expect(updated.text).toBe('Renamed');
    expect(updated.position).toEqual({ x: 10, y: 20 });
    expect(updated.fontSize).toBe(18);
  });

  it('updateTextAnnotation moves the annotation when given a new position', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    usePedigreeStore
      .getState()
      .updateTextAnnotation('anno-1', { position: { x: 99, y: 88 } });

    expect(
      usePedigreeStore.getState().document.textAnnotations['anno-1'].position,
    ).toEqual({ x: 99, y: 88 });
  });

  it('updateTextAnnotation is a no-op for an unknown id', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    usePedigreeStore
      .getState()
      .updateTextAnnotation('missing', { text: 'x' });

    expect(
      Object.keys(usePedigreeStore.getState().document.textAnnotations),
    ).toEqual(['anno-1']);
  });

  it('removeTextAnnotation deletes only the targeted annotation', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    usePedigreeStore
      .getState()
      .addTextAnnotation(makeAnnotation({ id: 'anno-2', text: 'Other' }));

    usePedigreeStore.getState().removeTextAnnotation('anno-1');

    const remaining = usePedigreeStore.getState().document.textAnnotations;
    expect(Object.keys(remaining)).toEqual(['anno-2']);
  });

  it('add then undo removes the annotation (zundo tracks the change)', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    expect(
      usePedigreeStore.getState().document.textAnnotations['anno-1'],
    ).toBeDefined();

    usePedigreeStore.temporal.getState().undo();

    expect(
      usePedigreeStore.getState().document.textAnnotations['anno-1'],
    ).toBeUndefined();
  });

  it('move then undo restores the previous position (zundo tracks moves)', () => {
    usePedigreeStore.getState().addTextAnnotation(makeAnnotation());
    usePedigreeStore
      .getState()
      .updateTextAnnotation('anno-1', { position: { x: 500, y: 600 } });

    usePedigreeStore.temporal.getState().undo();

    expect(
      usePedigreeStore.getState().document.textAnnotations['anno-1'].position,
    ).toEqual({ x: 10, y: 20 });
  });
});

describe('pedigreeStore bounded respacing on add', () => {
  it('addPartnerToIndividual nudges an overlapping same-generation neighbour right', () => {
    // An existing target at x=0 and a neighbour sitting where the new partner
    // will land (x = PARTNER_SPACING is well within MIN_GENERATION_NODE_SPACING
    // of the partner). All three share generation 0.
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const neighbour = createDefaultIndividual({
      id: 'neighbour',
      generation: 0,
      // Just to the right of where the new partner will land (x=120), so it
      // overlaps the partner and must be pushed right; order is unambiguous.
      position: { x: 130, y: 0 },
    });
    usePedigreeStore.getState().addIndividual(target);
    usePedigreeStore.getState().addIndividual(neighbour);

    const partner = createDefaultIndividual({
      id: 'partner',
      generation: 0,
      position: { x: 120, y: 0 }, // target.x + PARTNER_SPACING
    });
    const partnership: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: target.id,
      partner2Id: partner.id,
      childrenIds: [],
    };

    usePedigreeStore.getState().addPartnerToIndividual(partner, partnership);

    const individuals = usePedigreeStore.getState().document.individuals;
    // The partner stays put; the overlapping neighbour is pushed right to keep
    // at least MIN_GENERATION_NODE_SPACING, and left-to-right order is preserved.
    expect(individuals.target.position.x).toBe(0);
    expect(individuals.partner.position.x).toBe(120);
    expect(individuals.neighbour.position.x).toBe(
      120 + MIN_GENERATION_NODE_SPACING,
    );
    expect(individuals.partner.position.x).toBeLessThan(
      individuals.neighbour.position.x,
    );
  });

  it('a single undo reverts both the partner add and the respacing nudge', () => {
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const neighbour = createDefaultIndividual({
      id: 'neighbour',
      generation: 0,
      // Just to the right of where the new partner will land (x=120), so it
      // overlaps the partner and must be pushed right; order is unambiguous.
      position: { x: 130, y: 0 },
    });
    usePedigreeStore.getState().addIndividual(target);
    usePedigreeStore.getState().addIndividual(neighbour);

    const partner = createDefaultIndividual({
      id: 'partner',
      generation: 0,
      position: { x: 120, y: 0 },
    });
    const partnership: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: target.id,
      partner2Id: partner.id,
      childrenIds: [],
    };

    usePedigreeStore.getState().addPartnerToIndividual(partner, partnership);
    expect(
      usePedigreeStore.getState().document.individuals.neighbour.position.x,
    ).toBe(120 + MIN_GENERATION_NODE_SPACING);

    usePedigreeStore.temporal.getState().undo();

    const individuals = usePedigreeStore.getState().document.individuals;
    // One undo removes the partner AND restores the nudged neighbour's x.
    expect(individuals.partner).toBeUndefined();
    expect(individuals.neighbour.position.x).toBe(130);
  });
});

describe('pedigreeStore layout reflow on add (issue #30)', () => {
  function link(
    id: string,
    parentPartnershipId: string,
    childId: string,
  ): ParentChildRelationship {
    return {
      id,
      type: RelationshipType.ParentChild,
      parentPartnershipId,
      childId,
    };
  }

  it('re-centres the parents over the full sibling row when a sibling is added', () => {
    const store = usePedigreeStore.getState();
    // Parents centred over x=0, one child directly below them.
    const dad = createDefaultIndividual({
      id: 'dad',
      generation: -1,
      position: { x: -60, y: 0 },
    });
    const mum = createDefaultIndividual({
      id: 'mum',
      generation: -1,
      position: { x: 60, y: 0 },
    });
    const firstChild = createDefaultIndividual({
      id: 'c1',
      generation: 0,
      position: { x: 0, y: 150 },
    });
    const partnership: PartnershipRelationship = {
      id: 'fam',
      type: RelationshipType.Partnership,
      partner1Id: dad.id,
      partner2Id: mum.id,
      childrenIds: [firstChild.id],
    };
    store.addIndividual(dad);
    store.addIndividual(mum);
    store.addIndividual(firstChild);
    store.addPartnership(partnership);
    store.addParentChildLink(link('l1', 'fam', 'c1'));

    // Add a sibling to the right of the first child (x = 0 + 80).
    const sibling = createDefaultIndividual({
      id: 'c2',
      generation: 0,
      position: { x: 80, y: 150 },
    });
    store.addChildToFamily(sibling, 'fam', link('l2', 'fam', 'c2'));

    const individuals = usePedigreeStore.getState().document.individuals;
    // Children now span 0..80 (centre 40); the couple slides right by 40,
    // preserving their 120-unit gap.
    expect(individuals.dad.position.x).toBe(-20);
    expect(individuals.mum.position.x).toBe(100);
    // Children themselves are untouched.
    expect(individuals.c1.position.x).toBe(0);
    expect(individuals.c2.position.x).toBe(80);
  });

  it('shifts a sibling and its subtree aside when a partner is added', () => {
    const store = usePedigreeStore.getState();
    // Target at x=0 with a sibling at x=80 that itself has a child below it.
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const sibling = createDefaultIndividual({
      id: 'sibling',
      generation: 0,
      position: { x: 80, y: 0 },
    });
    const siblingSpouse = createDefaultIndividual({
      id: 'sibspouse',
      generation: 0,
      position: { x: 200, y: 0 },
    });
    const siblingChild = createDefaultIndividual({
      id: 'sibkid',
      generation: 1,
      position: { x: 140, y: 150 },
    });
    const siblingUnion: PartnershipRelationship = {
      id: 'sibfam',
      type: RelationshipType.Partnership,
      partner1Id: sibling.id,
      partner2Id: siblingSpouse.id,
      childrenIds: [siblingChild.id],
    };
    store.addIndividual(target);
    store.addIndividual(sibling);
    store.addIndividual(siblingSpouse);
    store.addIndividual(siblingChild);
    store.addPartnership(siblingUnion);

    // Add a partner to the target at x = 0 + PARTNER_SPACING (120).
    const partner = createDefaultIndividual({
      id: 'partner',
      generation: 0,
      position: { x: 120, y: 0 },
    });
    const union: PartnershipRelationship = {
      id: 'targetfam',
      type: RelationshipType.Partnership,
      partner1Id: target.id,
      partner2Id: partner.id,
      childrenIds: [],
    };
    store.addPartnerToIndividual(partner, union);

    const individuals = usePedigreeStore.getState().document.individuals;
    // Target and partner stay anchored.
    expect(individuals.target.position.x).toBe(0);
    expect(individuals.partner.position.x).toBe(120);
    // The sibling clears the partner by MIN_GENERATION_NODE_SPACING ...
    expect(individuals.sibling.position.x).toBe(
      120 + MIN_GENERATION_NODE_SPACING,
    );
    // ... and its whole subtree travels the same distance (80 -> 200, delta 120).
    const delta = 120 + MIN_GENERATION_NODE_SPACING - 80;
    expect(individuals.sibspouse.position.x).toBe(200 + delta);
    expect(individuals.sibkid.position.x).toBe(140 + delta);
  });

  it('slides new parents clear of the partner\'s parents and re-centres the partner', () => {
    const store = usePedigreeStore.getState();
    // Union: child (left, x=0) + spouse (right, x=120). The spouse already has
    // parents centred over x=120, at 60 and 180.
    const child = createDefaultIndividual({
      id: 'child',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const spouse = createDefaultIndividual({
      id: 'spouse',
      generation: 0,
      position: { x: 120, y: 0 },
    });
    const spDad = createDefaultIndividual({
      id: 'spdad',
      generation: -1,
      position: { x: 60, y: -150 },
    });
    const spMum = createDefaultIndividual({
      id: 'spmum',
      generation: -1,
      position: { x: 180, y: -150 },
    });
    const union: PartnershipRelationship = {
      id: 'union',
      type: RelationshipType.Partnership,
      partner1Id: child.id,
      partner2Id: spouse.id,
      childrenIds: [],
    };
    const spParents: PartnershipRelationship = {
      id: 'spparents',
      type: RelationshipType.Partnership,
      partner1Id: spDad.id,
      partner2Id: spMum.id,
      childrenIds: [spouse.id],
    };
    store.addIndividual(child);
    store.addIndividual(spouse);
    store.addIndividual(spDad);
    store.addIndividual(spMum);
    store.addPartnership(union);
    store.addPartnership(spParents);
    store.addParentChildLink(link('spl', 'spparents', 'spouse'));

    // Add parents to the child, created centred over x=0 (at -60 and 60).
    const newDad = createDefaultIndividual({
      id: 'newdad',
      generation: -1,
      position: { x: -60, y: -150 },
    });
    const newMum = createDefaultIndividual({
      id: 'newmum',
      generation: -1,
      position: { x: 60, y: -150 },
    });
    const newPartnership: PartnershipRelationship = {
      id: 'newparents',
      type: RelationshipType.Partnership,
      partner1Id: newDad.id,
      partner2Id: newMum.id,
      childrenIds: [child.id],
    };
    store.addParentsForChild(
      newDad,
      newMum,
      newPartnership,
      link('newlink', 'newparents', 'child'),
      'child',
      0,
    );

    const individuals = usePedigreeStore.getState().document.individuals;
    // New parents slide left by 80 to clear the spouse's left parent (60):
    // their right edge moves from 60 to -20, leaving an 80-unit gap.
    expect(individuals.newdad.position.x).toBe(-140);
    expect(individuals.newmum.position.x).toBe(-20);
    // The child follows by the same 80 so it stays centred under its parents.
    expect(individuals.child.position.x).toBe(-80);
    // The spouse and its parents are untouched.
    expect(individuals.spouse.position.x).toBe(120);
    expect(individuals.spdad.position.x).toBe(60);
    expect(individuals.spmum.position.x).toBe(180);
  });

  it('a single undo reverts an add-parents reflow', () => {
    const store = usePedigreeStore.getState();
    const child = createDefaultIndividual({
      id: 'child',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const spouse = createDefaultIndividual({
      id: 'spouse',
      generation: 0,
      position: { x: 120, y: 0 },
    });
    const spDad = createDefaultIndividual({
      id: 'spdad',
      generation: -1,
      position: { x: 60, y: -150 },
    });
    const spMum = createDefaultIndividual({
      id: 'spmum',
      generation: -1,
      position: { x: 180, y: -150 },
    });
    store.addIndividual(child);
    store.addIndividual(spouse);
    store.addIndividual(spDad);
    store.addIndividual(spMum);
    store.addPartnership({
      id: 'union',
      type: RelationshipType.Partnership,
      partner1Id: child.id,
      partner2Id: spouse.id,
      childrenIds: [],
    });
    store.addPartnership({
      id: 'spparents',
      type: RelationshipType.Partnership,
      partner1Id: spDad.id,
      partner2Id: spMum.id,
      childrenIds: [spouse.id],
    });
    store.addParentChildLink(link('spl', 'spparents', 'spouse'));

    const newDad = createDefaultIndividual({
      id: 'newdad',
      generation: -1,
      position: { x: -60, y: -150 },
    });
    const newMum = createDefaultIndividual({
      id: 'newmum',
      generation: -1,
      position: { x: 60, y: -150 },
    });
    store.addParentsForChild(
      newDad,
      newMum,
      {
        id: 'newparents',
        type: RelationshipType.Partnership,
        partner1Id: newDad.id,
        partner2Id: newMum.id,
        childrenIds: [child.id],
      },
      link('newlink', 'newparents', 'child'),
      'child',
      0,
    );
    expect(
      usePedigreeStore.getState().document.individuals.child.position.x,
    ).toBe(-80);

    usePedigreeStore.temporal.getState().undo();

    const individuals = usePedigreeStore.getState().document.individuals;
    // One undo removes the new parents AND restores the child's original x.
    expect(individuals.newdad).toBeUndefined();
    expect(individuals.newmum).toBeUndefined();
    expect(individuals.child.position.x).toBe(0);
  });
});

function parentChildLink(partnershipId: string, childId: string): ParentChildRelationship {
  return { id: generateId(), type: RelationshipType.ParentChild, parentPartnershipId: partnershipId, childId };
}

describe('addSiblingViaNewUnion', () => {
  it('creates a 0-partner union holding the target and the new sibling', () => {
    const store = usePedigreeStore.getState();
    const target = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    store.addIndividual(target);

    const sibling = createDefaultIndividual({ generation: 1, position: { x: 80, y: 0 } });
    const partnership: PartnershipRelationship = {
      id: 'u1', type: RelationshipType.Partnership, childrenIds: [target.id, sibling.id],
    };
    store.addSiblingViaNewUnion(
      target, sibling, partnership,
      parentChildLink('u1', target.id), parentChildLink('u1', sibling.id),
    );

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[sibling.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner1Id).toBeUndefined();
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
    expect(doc.partnerships['u1'].childrenIds).toEqual([target.id, sibling.id]);
    expect(Object.values(doc.parentChildLinks).filter((l) => l.parentPartnershipId === 'u1')).toHaveLength(2);
  });

  it('is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const target = createDefaultIndividual({ generation: 1 });
    store.addIndividual(target);
    usePedigreeStore.temporal.getState().clear();

    const sibling = createDefaultIndividual({ generation: 1 });
    store.addSiblingViaNewUnion(
      target, sibling,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [target.id, sibling.id] },
      parentChildLink('u1', target.id), parentChildLink('u1', sibling.id),
    );
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[sibling.id]).toBeUndefined();
    expect(doc.partnerships['u1']).toBeUndefined();
  });
});

describe('addChildViaNewUnion', () => {
  it('creates a 1-partner union with the target as sole parent', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[child.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner1Id).toBe(parent.id);
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
    expect(doc.partnerships['u1'].childrenIds).toEqual([child.id]);
  });

  it('addChildViaNewUnion is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);
    usePedigreeStore.temporal.getState().clear();

    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[child.id]).toBeUndefined();
    expect(doc.partnerships['u1']).toBeUndefined();
  });
});

describe('fillUnionPartner', () => {
  it('fills the empty slot of a 1-partner union', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addIndividual(parent);
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    const partner = createDefaultIndividual({ generation: 0, position: { x: 120, y: 0 } });
    store.fillUnionPartner(partner, 'u1');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[partner.id]).toBeDefined();
    expect(doc.partnerships['u1'].partner2Id).toBe(partner.id);
  });

  it('fillUnionPartner is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const parent = createDefaultIndividual({ generation: 0, position: { x: 0, y: 0 } });
    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 150 } });
    store.addIndividual(parent);
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );
    usePedigreeStore.temporal.getState().clear();

    const partner = createDefaultIndividual({ generation: 0, position: { x: 120, y: 0 } });
    store.fillUnionPartner(partner, 'u1');
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[partner.id]).toBeUndefined();
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
  });
});

describe('removeIndividual cascade', () => {
  /**
   * Build the family from the bug report: two parents (`dad`, `mum`) joined in a
   * union with four children, each wired to the union by a parent-child link.
   * Returns the ids so individual tests can delete a parent and inspect the
   * surviving union/links.
   */
  function seedTwoParentFamily(): {
    dadId: string;
    mumId: string;
    childIds: string[];
    unionId: string;
  } {
    const store = usePedigreeStore.getState();
    const dad = createDefaultIndividual({ id: 'dad', generation: 0, position: { x: -60, y: 0 } });
    const mum = createDefaultIndividual({ id: 'mum', generation: 0, position: { x: 60, y: 0 } });
    const children = ['c1', 'c2', 'c3', 'c4'].map((id, i) =>
      createDefaultIndividual({ id, generation: 1, position: { x: i * 80, y: 150 } }),
    );
    const union: PartnershipRelationship = {
      id: 'fam',
      type: RelationshipType.Partnership,
      partner1Id: dad.id,
      partner2Id: mum.id,
      childrenIds: children.map((c) => c.id),
    };
    store.addIndividual(dad);
    store.addIndividual(mum);
    children.forEach((c) => store.addIndividual(c));
    store.addPartnership(union);
    children.forEach((c) =>
      store.addParentChildLink({
        id: `link-${c.id}`,
        type: RelationshipType.ParentChild,
        parentPartnershipId: union.id,
        childId: c.id,
      }),
    );
    return { dadId: dad.id, mumId: mum.id, childIds: children.map((c) => c.id), unionId: union.id };
  }

  it('keeps the union and points it at the surviving parent when one parent is deleted', () => {
    const { dadId, mumId, childIds, unionId } = seedTwoParentFamily();

    usePedigreeStore.getState().removeIndividual(mumId);

    const doc = usePedigreeStore.getState().document;
    const union = doc.partnerships[unionId];
    expect(union).toBeDefined();
    // The deleted parent is cleared from her slot; the surviving parent remains.
    expect(union.partner1Id).toBe(dadId);
    expect(union.partner2Id).toBeUndefined();
    // Every child stays attached to the union.
    expect(union.childrenIds).toEqual(childIds);
    const links = Object.values(doc.parentChildLinks).filter(
      (l) => l.parentPartnershipId === unionId,
    );
    expect(links).toHaveLength(childIds.length);
  });

  it('keeps the sibship (union with no partners) when both parents are deleted', () => {
    const { dadId, mumId, childIds, unionId } = seedTwoParentFamily();

    usePedigreeStore.getState().removeIndividual(mumId);
    usePedigreeStore.getState().removeIndividual(dadId);

    const doc = usePedigreeStore.getState().document;
    const union = doc.partnerships[unionId];
    // The union survives with both slots empty so siblings stay joined ...
    expect(union).toBeDefined();
    expect(union.partner1Id).toBeUndefined();
    expect(union.partner2Id).toBeUndefined();
    expect(union.childrenIds).toEqual(childIds);
    // ... and the children keep their links to that parentless sibship.
    const links = Object.values(doc.parentChildLinks).filter(
      (l) => l.parentPartnershipId === unionId,
    );
    expect(links).toHaveLength(childIds.length);
  });

  it('prunes a childless union once its last partner is deleted', () => {
    const store = usePedigreeStore.getState();
    const a = createDefaultIndividual({ id: 'a', generation: 0, position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ id: 'b', generation: 0, position: { x: 120, y: 0 } });
    store.addIndividual(a);
    store.addIndividual(b);
    store.addPartnership({
      id: 'couple',
      type: RelationshipType.Partnership,
      partner1Id: a.id,
      partner2Id: b.id,
      childrenIds: [],
    });

    store.removeIndividual(b.id);

    // A childless union with a single surviving partner depicts nothing, so it
    // is pruned rather than left dangling.
    expect(usePedigreeStore.getState().document.partnerships['couple']).toBeUndefined();
    expect(usePedigreeStore.getState().document.individuals['a']).toBeDefined();
  });

  it('drops a deleted child from its union and removes only that child link', () => {
    const { childIds, unionId } = seedTwoParentFamily();
    const [removedChild, ...survivingChildren] = childIds;

    usePedigreeStore.getState().removeIndividual(removedChild);

    const doc = usePedigreeStore.getState().document;
    expect(doc.partnerships[unionId].childrenIds).toEqual(survivingChildren);
    expect(doc.parentChildLinks[`link-${removedChild}`]).toBeUndefined();
    survivingChildren.forEach((cId) =>
      expect(doc.parentChildLinks[`link-${cId}`]).toBeDefined(),
    );
  });

  it('reverts a parent deletion in a single undo step', () => {
    const { dadId, mumId, unionId } = seedTwoParentFamily();
    usePedigreeStore.temporal.getState().clear();

    usePedigreeStore.getState().removeIndividual(mumId);
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    // Undo restores the deleted parent and both partner slots.
    expect(doc.individuals[mumId]).toBeDefined();
    expect(doc.partnerships[unionId].partner1Id).toBe(dadId);
    expect(doc.partnerships[unionId].partner2Id).toBe(mumId);
  });
});

describe('addParentsToParentlessUnion', () => {
  it('fills both slots of a 0-partner sibship without adding a child link', () => {
    const store = usePedigreeStore.getState();
    const a = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ generation: 1, position: { x: 80, y: 0 } });
    store.addIndividual(a);
    store.addSiblingViaNewUnion(
      a, b,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [a.id, b.id] },
      parentChildLink('u1', a.id), parentChildLink('u1', b.id),
    );
    const linksBefore = Object.keys(usePedigreeStore.getState().document.parentChildLinks).length;

    const dad = createDefaultIndividual({ generation: 0, position: { x: -60, y: -150 } });
    const mom = createDefaultIndividual({ generation: 0, position: { x: 60, y: -150 } });
    store.addParentsToParentlessUnion(dad, mom, 'u1');

    const doc = usePedigreeStore.getState().document;
    expect(doc.partnerships['u1'].partner1Id).toBe(dad.id);
    expect(doc.partnerships['u1'].partner2Id).toBe(mom.id);
    expect(Object.keys(doc.parentChildLinks)).toHaveLength(linksBefore);
  });

  it('addParentsToParentlessUnion is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const a = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    const b = createDefaultIndividual({ generation: 1, position: { x: 80, y: 0 } });
    store.addIndividual(a);
    store.addSiblingViaNewUnion(
      a, b,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [a.id, b.id] },
      parentChildLink('u1', a.id), parentChildLink('u1', b.id),
    );
    usePedigreeStore.temporal.getState().clear();

    const dad = createDefaultIndividual({ generation: 0, position: { x: -60, y: -150 } });
    const mom = createDefaultIndividual({ generation: 0, position: { x: 60, y: -150 } });
    store.addParentsToParentlessUnion(dad, mom, 'u1');
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[dad.id]).toBeUndefined();
    expect(doc.partnerships['u1'].partner1Id).toBeUndefined();
    expect(doc.partnerships['u1'].partner2Id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setAdoption
// ---------------------------------------------------------------------------

describe('setAdoption', () => {
  /**
   * Seed a child individual with one parent-child link via setDocument, then
   * clear temporal so the setup itself is not an undo step.
   */
  function seedChildWithLink(): { childId: string; linkId: string } {
    const childId = 'child-1';
    const partnershipId = 'p-1';
    const linkId = 'link-1';

    usePedigreeStore.getState().setDocument({
      ...createDefaultDocument(),
      individuals: {
        [childId]: createDefaultIndividual({ id: childId }),
      },
      partnerships: {
        [partnershipId]: {
          id: partnershipId,
          type: RelationshipType.Partnership,
          childrenIds: [childId],
        },
      },
      parentChildLinks: {
        [linkId]: {
          id: linkId,
          type: RelationshipType.ParentChild,
          parentPartnershipId: partnershipId,
          childId,
        },
      },
    });
    usePedigreeStore.temporal.getState().clear();
    return { childId, linkId };
  }

  it("'in' sets adopted=true and marks the parent link isAdoptive=true", () => {
    const { childId, linkId } = seedChildWithLink();
    usePedigreeStore.getState().setAdoption(childId, 'in');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[childId].adopted).toBe(true);
    expect(doc.parentChildLinks[linkId].isAdoptive).toBe(true);
  });

  it("'out' sets adopted=true and marks the parent link isAdoptive=false", () => {
    const { childId, linkId } = seedChildWithLink();
    usePedigreeStore.getState().setAdoption(childId, 'out');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[childId].adopted).toBe(true);
    expect(doc.parentChildLinks[linkId].isAdoptive).toBe(false);
  });

  it("'none' clears adopted and clears the parent link isAdoptive to undefined, and undo restores 'in'", () => {
    const { childId, linkId } = seedChildWithLink();
    usePedigreeStore.getState().setAdoption(childId, 'in');
    usePedigreeStore.getState().setAdoption(childId, 'none');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[childId].adopted).toBeUndefined();
    expect(doc.parentChildLinks[linkId].isAdoptive).toBeUndefined();

    usePedigreeStore.temporal.getState().undo();

    const reverted = usePedigreeStore.getState().document;
    expect(reverted.individuals[childId].adopted).toBe(true);
    expect(reverted.parentChildLinks[linkId].isAdoptive).toBe(true);
  });

  it("'in' with no parent links only sets adopted=true and leaves parentChildLinks unchanged", () => {
    const childId = 'child-2';
    usePedigreeStore.getState().setDocument({
      ...createDefaultDocument(),
      individuals: {
        [childId]: createDefaultIndividual({ id: childId }),
      },
    });
    usePedigreeStore.temporal.getState().clear();

    usePedigreeStore.getState().setAdoption(childId, 'in');

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[childId].adopted).toBe(true);
    expect(Object.keys(doc.parentChildLinks)).toHaveLength(0);
  });

  it('is a single undo step — individual.adopted and link.isAdoptive revert together', () => {
    const { childId, linkId } = seedChildWithLink();
    usePedigreeStore.getState().setAdoption(childId, 'in');

    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[childId].adopted).toBeFalsy();
    expect(doc.parentChildLinks[linkId].isAdoptive).toBeUndefined();
  });

  it('is a no-op for an unknown individual id', () => {
    const { childId, linkId } = seedChildWithLink();
    const before = usePedigreeStore.getState().document;
    usePedigreeStore.getState().setAdoption('does-not-exist', 'in');

    const after = usePedigreeStore.getState().document;
    expect(after.individuals[childId].adopted).toBeFalsy();
    expect(after.parentChildLinks[linkId].isAdoptive).toBeUndefined();
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// setLinkAdoptive
// ---------------------------------------------------------------------------

describe('setLinkAdoptive', () => {
  function seedLink(): string {
    const partnershipId = 'p-1';
    const linkId = 'link-1';
    usePedigreeStore.getState().setDocument({
      ...createDefaultDocument(),
      partnerships: {
        [partnershipId]: {
          id: partnershipId,
          type: RelationshipType.Partnership,
          childrenIds: ['c1'],
        },
      },
      parentChildLinks: {
        [linkId]: {
          id: linkId,
          type: RelationshipType.ParentChild,
          parentPartnershipId: partnershipId,
          childId: 'c1',
        },
      },
    });
    usePedigreeStore.temporal.getState().clear();
    return linkId;
  }

  it('sets isAdoptive=true on the named link', () => {
    const linkId = seedLink();
    usePedigreeStore.getState().setLinkAdoptive(linkId, true);
    expect(usePedigreeStore.getState().document.parentChildLinks[linkId].isAdoptive).toBe(true);
  });

  it('sets isAdoptive=false on the named link', () => {
    const linkId = seedLink();
    usePedigreeStore.getState().setLinkAdoptive(linkId, true);
    usePedigreeStore.getState().setLinkAdoptive(linkId, false);
    expect(usePedigreeStore.getState().document.parentChildLinks[linkId].isAdoptive).toBe(false);
  });

  it('is a no-op for an unknown link id', () => {
    seedLink();
    const before = usePedigreeStore.getState().document;
    usePedigreeStore.getState().setLinkAdoptive('does-not-exist', true);
    expect(usePedigreeStore.getState().document).toBe(before);
  });

  it('is a single undo step', () => {
    const linkId = seedLink();
    usePedigreeStore.getState().setLinkAdoptive(linkId, true);
    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.parentChildLinks[linkId].isAdoptive).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createSeededDocument
// ---------------------------------------------------------------------------

describe('createSeededDocument', () => {
  it('createSeededDocument seeds a single Unknown individual at the given position', () => {
    const doc = createSeededDocument({ x: 5, y: 7 });
    const people = Object.values(doc.individuals);
    expect(people).toHaveLength(1);
    expect(people[0].genderIdentity).toBe(GenderIdentity.Unknown);
    expect(people[0].position).toEqual({ x: 5, y: 7 });
  });
});
