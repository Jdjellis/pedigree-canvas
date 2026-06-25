import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from './pedigreeStore';
import { generateId } from '../utils/idGenerator';
import { RelationshipType } from '../types/enums';
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
      isAdopted: false,
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
