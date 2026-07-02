import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePedigreeStore,
  createDefaultIndividual,
  createDefaultDocument,
  createSeededDocument,
} from './pedigreeStore';
import { generateId } from '../utils/idGenerator';
import { RelationshipType, GenderIdentity, VitalStatus, TwinType } from '../types/enums';
import { MIN_GENERATION_NODE_SPACING, GENERATION_SPACING, PARTNER_SPACING } from '../utils/constants';
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
  it('addPartnerToIndividual inserts the partner and leaves a childless-union neighbour in place', () => {
    // An existing target at x=0 and a neighbour sitting where the new partner
    // will land (x = PARTNER_SPACING is well within MIN_GENERATION_NODE_SPACING
    // of the partner). All three share generation 0.
    // The tidy layout engine only runs when the anchor node has a blood-family
    // union with children; a childless new partnership is a no-op.
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const neighbour = createDefaultIndividual({
      id: 'neighbour',
      generation: 0,
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
    // Target and partner are inserted/preserved at their original positions.
    expect(individuals.target.position.x).toBe(0);
    expect(individuals.partner.position.x).toBe(120);
    // Left-to-right order is preserved (neighbour was not displaced).
    expect(individuals.partner.position.x).toBeLessThan(
      individuals.neighbour.position.x,
    );
    // No-op invariant: childless partnership triggers no layout, so the
    // neighbour stays exactly where it started.
    expect(individuals.neighbour.position.x).toBe(130);
  });

  it('a single undo reverts the partner add (no layout ran for a childless union)', () => {
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const neighbour = createDefaultIndividual({
      id: 'neighbour',
      generation: 0,
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
    // Tidy layout is a no-op for childless partnerships — neighbour is not moved.
    expect(
      usePedigreeStore.getState().document.individuals.neighbour.position.x,
    ).toBe(130);

    usePedigreeStore.temporal.getState().undo();

    const individuals = usePedigreeStore.getState().document.individuals;
    // One undo removes the partner; neighbour was never moved so its x is unchanged.
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

  it('re-centres the children under the parents when a sibling is added', () => {
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
    // Tidy layout: parents are the anchor (fixed); children re-centre under them.
    // Centred: couple midpoint equals midpoint of the children's x-span.
    const coupleCenter =
      (individuals.dad.position.x + individuals.mum.position.x) / 2;
    const childXs = [individuals.c1.position.x, individuals.c2.position.x].sort(
      (a, b) => a - b,
    );
    const sibshipCenter = (childXs[0] + childXs[childXs.length - 1]) / 2;
    expect(coupleCenter).toBe(sibshipCenter);
    // No overlap: siblings must be at least SIBLING_SPACING apart.
    expect(childXs[childXs.length - 1] - childXs[0]).toBeGreaterThanOrEqual(
      MIN_GENERATION_NODE_SPACING,
    );
  });

  it('inserts a partner to a childless union without displacing unrelated families', () => {
    // Tidy layout only runs when there is a blood-family tree rooted at the
    // anchor; a childless new partnership is a no-op, so sibling families are
    // not displaced.
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
    // Target and partner are inserted/preserved at their given positions.
    expect(individuals.target.position.x).toBe(0);
    expect(individuals.partner.position.x).toBe(120);
    // The unrelated sibling family is not displaced by the childless partnership.
    expect(individuals.sibling.position.x).toBe(80);
    expect(individuals.sibspouse.position.x).toBe(200);
    expect(individuals.sibkid.position.x).toBe(140);
  });

  it('adds new parents centred over their child; load-bearing in-laws are pinned', () => {
    // Tidy layout: the new parents' blood family is rooted at `newparents`. The
    // spouse is a load-bearing in-law (it has its own parents), so it is pinned
    // and the new family lays out independently around the child.
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
    // New parents stay centred over their child, keeping the descent line vertical.
    const newParentsCenter =
      (individuals.newdad.position.x + individuals.newmum.position.x) / 2;
    expect(newParentsCenter).toBe(individuals.child.position.x);
    // The child's family slides left to clear the spouse's pinned parents — the
    // couple-both-have-parents overlap — so the child no longer stays at x=0.
    expect(individuals.child.position.x).toBe(-80);
    // Spouse and its parents are a load-bearing in-law family — pinned, unmoved.
    expect(individuals.spouse.position.x).toBe(120);
    expect(individuals.spdad.position.x).toBe(60);
    expect(individuals.spmum.position.x).toBe(180);
    // Grandparent row clears: spouse's left parent vs child's right parent ≥ 80.
    expect(individuals.spdad.position.x - individuals.newmum.position.x).toBeGreaterThanOrEqual(80);
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
    // The child's family slides left to clear the spouse's pinned parents.
    expect(
      usePedigreeStore.getState().document.individuals.child.position.x,
    ).toBe(-80);

    usePedigreeStore.temporal.getState().undo();

    const individuals = usePedigreeStore.getState().document.individuals;
    // One undo removes the new parents AND restores the child's original x — the
    // clearance shift reverts as part of the same single step.
    expect(individuals.newdad).toBeUndefined();
    expect(individuals.newmum).toBeUndefined();
    expect(individuals.child.position.x).toBe(0);
  });

  it('adds a partner to a real sibling and pushes siblings clear (issue #55 regression)', () => {
    // Regression: addPartnerToIndividual was anchoring relayoutFamily on the
    // NEW partner (no family tree → no-op). Siblings of the target were never
    // pushed clear. The fix anchors on the TARGET (blood-family member).
    //
    // Setup: dad + mum at gen -1, with two children (target + sib) at gen 0.
    const store = usePedigreeStore.getState();

    const dad = createDefaultIndividual({
      id: 'dad',
      generation: -1,
      position: { x: -60, y: -150 },
    });
    const mum = createDefaultIndividual({
      id: 'mum',
      generation: -1,
      position: { x: 60, y: -150 },
    });
    const target = createDefaultIndividual({
      id: 'target',
      generation: 0,
      position: { x: 0, y: 0 },
    });
    const sib = createDefaultIndividual({
      id: 'sib',
      generation: 0,
      position: { x: 80, y: 0 },
    });

    const fam: PartnershipRelationship = {
      id: 'fam',
      type: RelationshipType.Partnership,
      partner1Id: dad.id,
      partner2Id: mum.id,
      childrenIds: [target.id, sib.id],
    };

    store.addIndividual(dad);
    store.addIndividual(mum);
    store.addIndividual(target);
    store.addIndividual(sib);
    store.addPartnership(fam);
    store.addParentChildLink(link('l-target', 'fam', 'target'));
    store.addParentChildLink(link('l-sib', 'fam', 'sib'));

    // Clear undo history so the setup ops don't interfere with the undo test.
    usePedigreeStore.temporal.getState().clear();

    // Add a partner to target via a childless union.
    const partner = createDefaultIndividual({
      id: 'partner',
      generation: 0,
      position: { x: 120, y: 0 },
    });
    const targetUnion: PartnershipRelationship = {
      id: 'targetfam',
      type: RelationshipType.Partnership,
      partner1Id: target.id,
      partner2Id: partner.id,
      childrenIds: [],
    };
    store.addPartnerToIndividual(partner, targetUnion);

    const individuals = usePedigreeStore.getState().document.individuals;

    // 1. Real sibling sib must be pushed clear of the new partner.
    expect(
      Math.abs(individuals.sib.position.x - individuals.partner.position.x),
    ).toBeGreaterThanOrEqual(MIN_GENERATION_NODE_SPACING);

    // 2. No same-generation overlap: every adjacent pair in gen 0
    //    (target, partner, sib) must be at least MIN_GENERATION_NODE_SPACING apart.
    const gen0Xs = [
      individuals.target.position.x,
      individuals.partner.position.x,
      individuals.sib.position.x,
    ].sort((a, b) => a - b);
    for (let i = 1; i < gen0Xs.length; i++) {
      expect(gen0Xs[i] - gen0Xs[i - 1]).toBeGreaterThanOrEqual(
        MIN_GENERATION_NODE_SPACING,
      );
    }

    // 3. Parents stay centred: couple midpoint == midpoint of blood children's x-span.
    //    Only target and sib are blood children of fam; partner is an in-law.
    const bloodXs = [individuals.target.position.x, individuals.sib.position.x].sort(
      (a, b) => a - b,
    );
    const bloodChildrenMidpoint = (bloodXs[0] + bloodXs[bloodXs.length - 1]) / 2;
    const coupleMidpoint = (individuals.dad.position.x + individuals.mum.position.x) / 2;
    expect(coupleMidpoint).toBe(bloodChildrenMidpoint);

    // 4. Single undo step: partner is gone and sib is back at its original x=80.
    usePedigreeStore.temporal.getState().undo();

    const afterUndo = usePedigreeStore.getState().document.individuals;
    expect(afterUndo.partner).toBeUndefined();
    expect(afterUndo.sib.position.x).toBe(80);
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
  it('centres the child under the couple when the existing partner is load-bearing (3-gen fix)', () => {
    // Regression: fillUnionPartner anchored relayoutFamily on the NEW partner.
    // When the existing partner is load-bearing (has parents) it was pinned, so the
    // layout placed C at newPartner's x instead of centring the couple over C.
    //
    // Fixture: gp1+gp2 (gen -1) → E (gen 0) heads 1-partner union fam → C (gen 1).
    const store = usePedigreeStore.getState();

    const gp1 = createDefaultIndividual({ id: 'gp1', generation: -1, position: { x: -60, y: -150 } });
    const gp2 = createDefaultIndividual({ id: 'gp2', generation: -1, position: { x: 60, y: -150 } });
    const E = createDefaultIndividual({ id: 'E', generation: 0, position: { x: 0, y: 0 } });
    const C = createDefaultIndividual({ id: 'C', generation: 1, position: { x: 0, y: 150 } });

    store.addIndividual(gp1);
    store.addIndividual(gp2);
    store.addIndividual(E);
    store.addPartnership({
      id: 'gpUnion',
      type: RelationshipType.Partnership,
      partner1Id: gp1.id,
      partner2Id: gp2.id,
      childrenIds: [E.id],
    });
    store.addParentChildLink({
      id: 'gpLink',
      type: RelationshipType.ParentChild,
      parentPartnershipId: 'gpUnion',
      childId: E.id,
      isAdoptive: false,
    });
    // 1-partner union: E is the sole parent, C is the child.
    store.addChildViaNewUnion(
      C,
      { id: 'fam', type: RelationshipType.Partnership, partner1Id: E.id, childrenIds: [C.id] },
      { id: 'famLink', type: RelationshipType.ParentChild, parentPartnershipId: 'fam', childId: C.id, isAdoptive: false },
    );

    // Fill the empty partner slot with a new partner placed to the right of E.
    const newPartner = createDefaultIndividual({ id: 'newPartner', generation: 0, position: { x: 120, y: 0 } });
    store.fillUnionPartner(newPartner, 'fam');

    const individuals = usePedigreeStore.getState().document.individuals;
    // The couple must be centred over their single child.
    const coupleMidpoint = (individuals['E'].position.x + individuals['newPartner'].position.x) / 2;
    expect(coupleMidpoint).toBe(individuals['C'].position.x);
  });

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

describe('addParentSet (multi-parentage #64)', () => {
  // Build a child that already has one complete parent couple, then attach a
  // second couple — the biological/adoptive both-families case.
  function seedChildWithParents(): { childId: string; firstUnionId: string } {
    const store = usePedigreeStore.getState();
    const child = createDefaultIndividual({ generation: 1, position: { x: 0, y: 0 } });
    const dad = createDefaultIndividual({ generation: 0, position: { x: -60, y: -150 } });
    const mom = createDefaultIndividual({ generation: 0, position: { x: 60, y: -150 } });
    store.addIndividual(child);
    const firstUnionId = 'u-bio';
    store.addParentsForChild(
      dad, mom,
      { id: firstUnionId, type: RelationshipType.Partnership, partner1Id: dad.id, partner2Id: mom.id, childrenIds: [child.id] },
      parentChildLink(firstUnionId, child.id),
      child.id, 1,
    );
    return { childId: child.id, firstUnionId };
  }

  it('attaches a second parent couple + link without touching the first set', () => {
    const store = usePedigreeStore.getState();
    const { childId, firstUnionId } = seedChildWithParents();

    const dad2 = createDefaultIndividual({ generation: 0, position: { x: 300, y: -150 } });
    const mom2 = createDefaultIndividual({ generation: 0, position: { x: 380, y: -150 } });
    const secondUnion: PartnershipRelationship = {
      id: 'u-adopt', type: RelationshipType.Partnership,
      partner1Id: dad2.id, partner2Id: mom2.id, childrenIds: [childId],
    };
    const link = { ...parentChildLink('u-adopt', childId), isAdoptive: true };
    store.addParentSet(dad2, mom2, secondUnion, link);

    const doc = usePedigreeStore.getState().document;
    // Both couples exist and both partnerships list the child.
    expect(doc.individuals[dad2.id]).toBeDefined();
    expect(doc.partnerships['u-adopt'].childrenIds).toContain(childId);
    expect(doc.partnerships[firstUnionId].childrenIds).toContain(childId);
    // The child now has two parent links, the new one marked adoptive.
    const links = Object.values(doc.parentChildLinks).filter((l) => l.childId === childId);
    expect(links).toHaveLength(2);
    expect(links.some((l) => l.parentPartnershipId === 'u-adopt' && l.isAdoptive)).toBe(true);
    // The second couple is placed exactly where the caller put it (no relayout).
    expect(doc.individuals[dad2.id].position).toEqual({ x: 300, y: -150 });
  });

  it('is a single undo step', () => {
    const store = usePedigreeStore.getState();
    const { childId } = seedChildWithParents();
    usePedigreeStore.temporal.getState().clear();

    const dad2 = createDefaultIndividual({ generation: 0 });
    const mom2 = createDefaultIndividual({ generation: 0 });
    const secondUnion: PartnershipRelationship = {
      id: 'u-adopt', type: RelationshipType.Partnership,
      partner1Id: dad2.id, partner2Id: mom2.id, childrenIds: [childId],
    };
    store.addParentSet(dad2, mom2, secondUnion, parentChildLink('u-adopt', childId));
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[dad2.id]).toBeUndefined();
    expect(doc.partnerships['u-adopt']).toBeUndefined();
    expect(Object.values(doc.parentChildLinks).filter((l) => l.childId === childId)).toHaveLength(1);
  });

  it('no-ops when the child does not exist', () => {
    const store = usePedigreeStore.getState();
    const dad2 = createDefaultIndividual();
    const mom2 = createDefaultIndividual();
    const secondUnion: PartnershipRelationship = {
      id: 'u-adopt', type: RelationshipType.Partnership,
      partner1Id: dad2.id, partner2Id: mom2.id, childrenIds: ['ghost'],
    };
    store.addParentSet(dad2, mom2, secondUnion, parentChildLink('u-adopt', 'ghost'));
    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals[dad2.id]).toBeUndefined();
    expect(doc.partnerships['u-adopt']).toBeUndefined();
  });
});

describe('autospacing acceptance (#55)', () => {
  beforeEach(() => {
    usePedigreeStore.setState({ document: createDefaultDocument() });
    usePedigreeStore.temporal.getState().clear();
  });

  it('S4: sole parent re-centres after each sibling add', () => {
    const store = usePedigreeStore.getState();

    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    // First child via addChildViaNewUnion (creates the 1-partner union).
    const child1 = createDefaultIndividual({ id: 'child1', generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      child1,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child1.id] },
      parentChildLink('u1', child1.id),
    );

    // Add two more siblings via addChildToFamily.
    const child2 = createDefaultIndividual({ id: 'child2', generation: 1, position: { x: 80, y: 150 } });
    store.addChildToFamily(child2, 'u1', parentChildLink('u1', child2.id));

    const child3 = createDefaultIndividual({ id: 'child3', generation: 1, position: { x: 160, y: 150 } });
    store.addChildToFamily(child3, 'u1', parentChildLink('u1', child3.id));

    const individuals = usePedigreeStore.getState().document.individuals;
    const parentX = individuals.parent.position.x;
    const childXs = ['child1', 'child2', 'child3']
      .map((id) => individuals[id].position.x)
      .sort((a, b) => a - b);

    // Sole parent must be centred over the full sibling row.
    expect(parentX).toBe((childXs[0] + childXs[childXs.length - 1]) / 2);
    // Every adjacent sibling pair must be at least SIBLING_SPACING apart.
    for (let i = 1; i < childXs.length; i++) {
      expect(childXs[i] - childXs[i - 1]).toBeGreaterThanOrEqual(MIN_GENERATION_NODE_SPACING);
    }
  });

  it('every family add collapses to a single undo step', () => {
    const store = usePedigreeStore.getState();

    // Build a parent+spouse union with one child so that adding a second partner
    // to the parent triggers a real relayout (siblings get re-centred).
    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: 0 } });
    const spouse = createDefaultIndividual({ id: 'spouse', generation: 0, position: { x: 80, y: 0 } });
    const child = createDefaultIndividual({ id: 'child', generation: 1, position: { x: 40, y: 150 } });
    const fam: PartnershipRelationship = {
      id: 'fam',
      type: RelationshipType.Partnership,
      partner1Id: parent.id,
      partner2Id: spouse.id,
      childrenIds: [child.id],
    };
    store.addIndividual(parent);
    store.addIndividual(spouse);
    store.addIndividual(child);
    store.addPartnership(fam);
    store.addParentChildLink(parentChildLink('fam', child.id));

    // Clear history so only the upcoming add is on the undo stack.
    usePedigreeStore.temporal.getState().clear();

    const before = usePedigreeStore.getState().document.individuals;

    // addPartnerToIndividual on a blood-family member triggers relayout, moving
    // siblings around.  One undo must restore all positions.
    const newPartner = createDefaultIndividual({ id: 'newPartner', generation: 0, position: { x: -60, y: 0 } });
    const union: PartnershipRelationship = {
      id: 'pUnion',
      type: RelationshipType.Partnership,
      partner1Id: parent.id,
      partner2Id: newPartner.id,
      childrenIds: [],
    };
    store.addPartnerToIndividual(newPartner, union);

    const afterAdd = usePedigreeStore.getState().document.individuals;
    // Adding the partner to a blood-family member must have re-tidied the existing
    // family (proves relayout ran, so the single-undo below genuinely reverts both
    // the insert and the relayout, not just a trivial no-op insert).
    expect(
      afterAdd.parent.position.x !== before.parent.position.x ||
      afterAdd.child.position.x !== before.child.position.x,
    ).toBe(true);

    // A single undo must fully restore the pre-add individuals map (positions included).
    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals).toEqual(before);
  });

  it('a manual reorder survives the next sibling add (order-preserving relayout)', () => {
    const store = usePedigreeStore.getState();

    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    // Add children A and B via the normal path.
    const childA = createDefaultIndividual({ id: 'childA', generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      childA,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [childA.id] },
      parentChildLink('u1', childA.id),
    );

    const childB = createDefaultIndividual({ id: 'childB', generation: 1, position: { x: 80, y: 150 } });
    store.addChildToFamily(childB, 'u1', parentChildLink('u1', childB.id));

    // Manually drag B to the left of A — simulating a user reorder.
    store.moveIndividual('childB', { x: -80, y: 150 });

    // Add a third child; the relayout must honour the new B < A order.
    const childC = createDefaultIndividual({ id: 'childC', generation: 1, position: { x: 160, y: 150 } });
    store.addChildToFamily(childC, 'u1', parentChildLink('u1', childC.id));

    const individuals = usePedigreeStore.getState().document.individuals;

    // After relayout, the final left-to-right order must be B, A, C.
    expect(individuals.childB.position.x).toBeLessThan(individuals.childA.position.x);
    expect(individuals.childA.position.x).toBeLessThan(individuals.childC.position.x);
  });

  it('addSiblingViaNewUnion: siblings are pushed at least SIBLING_SPACING apart', () => {
    const store = usePedigreeStore.getState();

    // Place sibling intentionally closer than 80 to the target so the layout
    // must push them apart.
    const target = createDefaultIndividual({ id: 'target', generation: 1, position: { x: 0, y: 0 } });
    store.addIndividual(target);

    const sibling = createDefaultIndividual({ id: 'sibling', generation: 1, position: { x: 30, y: 0 } });
    store.addSiblingViaNewUnion(
      target, sibling,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [target.id, sibling.id] },
      parentChildLink('u1', target.id),
      parentChildLink('u1', sibling.id),
    );

    const individuals = usePedigreeStore.getState().document.individuals;

    // Both siblings must be present.
    expect(individuals[target.id]).toBeDefined();
    expect(individuals[sibling.id]).toBeDefined();

    // They must be at least SIBLING_SPACING apart (no overlap).
    const gap = Math.abs(individuals[sibling.id].position.x - individuals[target.id].position.x);
    expect(gap).toBeGreaterThanOrEqual(MIN_GENERATION_NODE_SPACING);

    // The layout must preserve the sibship centroid (no systematic drift).
    const initialCentroid = (0 + 30) / 2;
    const finalCentroid = (individuals[target.id].position.x + individuals[sibling.id].position.x) / 2;
    expect(finalCentroid).toBe(initialCentroid);
  });

  it('addChildViaNewUnion: single child lands centred under its sole parent', () => {
    const store = usePedigreeStore.getState();

    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    // Intentionally place the child off-centre so the layout engine has something to correct.
    const child = createDefaultIndividual({ id: 'child', generation: 1, position: { x: 50, y: 150 } });
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    const individuals = usePedigreeStore.getState().document.individuals;

    // A single child under a sole parent must land directly below it.
    expect(individuals.child.position.x).toBe(individuals.parent.position.x);
    // And must be exactly one generation row below.
    expect(individuals.child.position.y).toBe(individuals.parent.position.y + GENERATION_SPACING);
  });

  it('fillUnionPartner: couple midpoint equals child x after filling the second slot', () => {
    const store = usePedigreeStore.getState();

    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: 0 } });
    store.addIndividual(parent);

    // 1-partner union with one child.
    const child = createDefaultIndividual({ id: 'child', generation: 1, position: { x: 0, y: 150 } });
    store.addChildViaNewUnion(
      child,
      { id: 'u1', type: RelationshipType.Partnership, partner1Id: parent.id, childrenIds: [child.id] },
      parentChildLink('u1', child.id),
    );

    // Fill the empty slot with a partner placed at PARTNER_SPACING from the parent.
    const partner = createDefaultIndividual({ id: 'partner', generation: 0, position: { x: 120, y: 0 } });
    store.fillUnionPartner(partner, 'u1');

    const individuals = usePedigreeStore.getState().document.individuals;

    // After filling, the couple must be centred over their single child.
    const coupleMidpoint =
      (individuals.parent.position.x + individuals.partner.position.x) / 2;
    expect(coupleMidpoint).toBe(individuals.child.position.x);
  });

  it('addParentsToParentlessUnion: new couple midpoint equals children x-span midpoint', () => {
    const store = usePedigreeStore.getState();

    // Build a 0-partner sibship with two children.
    const childA = createDefaultIndividual({ id: 'childA', generation: 1, position: { x: 0, y: 0 } });
    const childB = createDefaultIndividual({ id: 'childB', generation: 1, position: { x: 80, y: 0 } });
    store.addIndividual(childA);
    store.addSiblingViaNewUnion(
      childA, childB,
      { id: 'u1', type: RelationshipType.Partnership, childrenIds: [childA.id, childB.id] },
      parentChildLink('u1', childA.id),
      parentChildLink('u1', childB.id),
    );

    // Add parents to the parentless sibship.
    const dad = createDefaultIndividual({ id: 'dad', generation: 0, position: { x: -60, y: -150 } });
    const mom = createDefaultIndividual({ id: 'mom', generation: 0, position: { x: 60, y: -150 } });
    store.addParentsToParentlessUnion(dad, mom, 'u1');

    const individuals = usePedigreeStore.getState().document.individuals;

    // The new couple must be centred over the children's x-span.
    const coupleMidpoint = (individuals.dad.position.x + individuals.mom.position.x) / 2;
    const childrenXs = [individuals.childA.position.x, individuals.childB.position.x];
    const childrenMidpoint = (Math.min(...childrenXs) + Math.max(...childrenXs)) / 2;
    expect(coupleMidpoint).toBe(childrenMidpoint);
  });
});

describe('3-generation layout integration (#55 FIX 4)', () => {
  beforeEach(() => {
    usePedigreeStore.setState({ document: createDefaultDocument() });
    usePedigreeStore.temporal.getState().clear();
  });

  it('keeps each couple centred over its children and avoids same-generation overlap', () => {
    // Build grandparents → parents (a real couple) → two children using store ops.
    // After each add, the tidy layout runs; the final state must satisfy:
    //   1. Grandparent couple midpoint == midpoint of parents' x-span.
    //   2. Parent couple midpoint == midpoint of children's x-span.
    //   3. No same-generation overlap (gap ≥ 80 between adjacent nodes in each row).
    //
    // Invariants, not hard-coded x values, so the test is stable under spacing changes.
    const store = usePedigreeStore.getState();

    const gDad = createDefaultIndividual({ id: 'gDad', generation: -1, position: { x: -60, y: -300 } });
    const gMum = createDefaultIndividual({ id: 'gMum', generation: -1, position: { x: 60, y: -300 } });
    store.addIndividual(gDad);
    store.addIndividual(gMum);
    store.addPartnership({
      id: 'gpUnion',
      type: RelationshipType.Partnership,
      partner1Id: gDad.id,
      partner2Id: gMum.id,
      childrenIds: [],
    });

    // Add a child (parent) to the grandparents' union.
    const parent = createDefaultIndividual({ id: 'parent', generation: 0, position: { x: 0, y: -150 } });
    store.addChildToFamily(parent, 'gpUnion', parentChildLink('gpUnion', parent.id));

    // Give the parent a spouse.
    const spouse = createDefaultIndividual({ id: 'spouse', generation: 0, position: { x: 120, y: -150 } });
    const famUnion: PartnershipRelationship = {
      id: 'famUnion',
      type: RelationshipType.Partnership,
      partner1Id: parent.id,
      partner2Id: spouse.id,
      childrenIds: [],
    };
    store.addPartnerToIndividual(spouse, famUnion);

    // Add two children to the parent couple.
    const kidA = createDefaultIndividual({ id: 'kidA', generation: 1, position: { x: 0, y: 150 } });
    store.addChildToFamily(kidA, 'famUnion', parentChildLink('famUnion', kidA.id));

    const kidB = createDefaultIndividual({ id: 'kidB', generation: 1, position: { x: 80, y: 150 } });
    store.addChildToFamily(kidB, 'famUnion', parentChildLink('famUnion', kidB.id));

    const ind = usePedigreeStore.getState().document.individuals;

    // --- Centring invariants ---
    // Row -1: grandparent couple midpoint == midpoint of parents' x-span (only 'parent' in gen 0).
    const gpMidpoint = (ind.gDad.position.x + ind.gMum.position.x) / 2;
    expect(gpMidpoint).toBe(ind.parent.position.x);

    // Row 0: parent couple midpoint == midpoint of children's x-span.
    const parentMidpoint = (ind.parent.position.x + ind.spouse.position.x) / 2;
    const childXs = [ind.kidA.position.x, ind.kidB.position.x].sort((a, b) => a - b);
    const childMidpoint = (childXs[0] + childXs[childXs.length - 1]) / 2;
    expect(parentMidpoint).toBe(childMidpoint);

    // --- No same-generation overlap ---
    // Gen -1: just two grandparents — must be ≥ 80 apart.
    expect(Math.abs(ind.gDad.position.x - ind.gMum.position.x)).toBeGreaterThanOrEqual(80);

    // Gen 0: parent + spouse — must be ≥ 80 apart.
    expect(Math.abs(ind.parent.position.x - ind.spouse.position.x)).toBeGreaterThanOrEqual(80);

    // Gen 1: two children — must be ≥ 80 apart.
    expect(childXs[childXs.length - 1] - childXs[0]).toBeGreaterThanOrEqual(80);
  });
});

describe('seed → add partner → add parents to partner (regression)', () => {
  beforeEach(() => {
    usePedigreeStore.temporal.getState().clear();
  });

  // Reproduces the exact two-action bug report: from a freshly seeded pedigree,
  // (1) add a partner to the founder, then (2) add parents to that new partner.
  // The partner and the founder are spouses and MUST stay on the same row; the
  // partner's parents sit exactly one generation above them. The bug: the seed
  // had no `generation`, so the partner inherited `undefined`, the relayout
  // mapped that to the parents' row, and the founder was yanked up onto its
  // in-laws' row while the partner dropped a generation.
  it('keeps the founder and partner on one row with parents directly above', () => {
    const store = usePedigreeStore.getState();
    store.setDocument(createSeededDocument({ x: 800, y: 500 }));

    const seed = Object.values(usePedigreeStore.getState().document.individuals)[0];

    // Action 1 — mirror RadialMenu.handleAddPartner (founder has no union yet).
    const partner = createDefaultIndividual({
      generation: seed.generation,
      position: { x: seed.position.x + PARTNER_SPACING, y: seed.position.y },
    });
    const union: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: seed.id,
      partner2Id: partner.id,
      childrenIds: [],
    };
    store.addPartnerToIndividual(partner, union);

    // Action 2 — mirror RadialMenu.handleAddParent case C (no parent union yet),
    // targeting the newly created partner.
    const target = usePedigreeStore.getState().document.individuals[partner.id];
    const childGeneration = target.generation ?? 0;
    const parentGeneration = childGeneration - 1;
    const parentY = target.position.y - GENERATION_SPACING;
    const dad = createDefaultIndividual({
      genderIdentity: GenderIdentity.Man,
      generation: parentGeneration,
      position: { x: target.position.x - PARTNER_SPACING / 2, y: parentY },
    });
    const mum = createDefaultIndividual({
      genderIdentity: GenderIdentity.Woman,
      generation: parentGeneration,
      position: { x: target.position.x + PARTNER_SPACING / 2, y: parentY },
    });
    const parentUnion: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: dad.id,
      partner2Id: mum.id,
      childrenIds: [target.id],
    };
    store.addParentsForChild(
      dad,
      mum,
      parentUnion,
      {
        id: generateId(),
        type: RelationshipType.ParentChild,
        parentPartnershipId: parentUnion.id,
        childId: target.id,
      },
      target.id,
      childGeneration,
    );

    const ind = usePedigreeStore.getState().document.individuals;

    // Founder and partner are spouses: same row.
    expect(ind[seed.id].position.y).toBe(ind[partner.id].position.y);
    // Parents sit exactly one generation above the couple's row.
    expect(ind[dad.id].position.y).toBe(ind[mum.id].position.y);
    expect(ind[dad.id].position.y).toBe(ind[partner.id].position.y - GENERATION_SPACING);
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

describe('updateIndividuals (bulk)', () => {
  it('applies the patch to every listed individual and leaves others untouched', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));
    store.addIndividual(createDefaultIndividual({ id: 'c' }));

    store.updateIndividuals(['a', 'b'], { vitalStatus: VitalStatus.Deceased });

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals.a.vitalStatus).toBe(VitalStatus.Deceased);
    expect(doc.individuals.b.vitalStatus).toBe(VitalStatus.Deceased);
    expect(doc.individuals.c.vitalStatus).toBe(VitalStatus.Alive);
  });

  it('ignores unknown ids', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.updateIndividuals(['a', 'missing'], { genderIdentity: GenderIdentity.Woman });
    expect(usePedigreeStore.getState().document.individuals.a.genderIdentity).toBe(
      GenderIdentity.Woman,
    );
  });

  it('records a single undoable step for the whole batch', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));

    store.updateIndividuals(['a', 'b'], { adopted: true });
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals.a.adopted).toBeUndefined();
    expect(doc.individuals.b.adopted).toBeUndefined();
  });
});

describe('setConditionForIndividuals (bulk)', () => {
  it('adds the condition to every individual that lacks it (idempotent for those that have it)', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a', conditionIds: [] }));
    store.addIndividual(createDefaultIndividual({ id: 'b', conditionIds: ['x'] }));

    store.setConditionForIndividuals(['a', 'b'], 'x', true);

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals.a.conditionIds).toEqual(['x']);
    expect(doc.individuals.b.conditionIds).toEqual(['x']); // not duplicated
  });

  it('removes the condition from every individual that has it', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a', conditionIds: ['x', 'y'] }));
    store.addIndividual(createDefaultIndividual({ id: 'b', conditionIds: ['x'] }));

    store.setConditionForIndividuals(['a', 'b'], 'x', false);

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals.a.conditionIds).toEqual(['y']);
    expect(doc.individuals.b.conditionIds).toEqual([]);
  });

  it('records a single undoable step', () => {
    const store = usePedigreeStore.getState();
    store.addIndividual(createDefaultIndividual({ id: 'a', conditionIds: [] }));
    store.addIndividual(createDefaultIndividual({ id: 'b', conditionIds: [] }));

    store.setConditionForIndividuals(['a', 'b'], 'x', true);
    usePedigreeStore.temporal.getState().undo();

    const doc = usePedigreeStore.getState().document;
    expect(doc.individuals.a.conditionIds).toEqual([]);
    expect(doc.individuals.b.conditionIds).toEqual([]);
  });
});

describe('groupTwins', () => {
  // Build a sibship: union1 with N children, each wired by a parent-child link.
  function seedSibship(childIds: string[]) {
    const store = usePedigreeStore.getState();
    store.addPartnership({
      id: 'union1',
      type: RelationshipType.Partnership,
      partner1Id: 'p1',
      partner2Id: 'p2',
      childrenIds: childIds,
    });
    for (const id of childIds) {
      store.addIndividual(createDefaultIndividual({ id }));
      store.addParentChildLink({
        id: `link-${id}`,
        type: RelationshipType.ParentChild,
        parentPartnershipId: 'union1',
        childId: id,
        isAdoptive: false,
      });
    }
  }

  it('creates a new twin group from two ungrouped siblings', () => {
    seedSibship(['a', 'b']);
    const id = usePedigreeStore.getState().groupTwins(['a', 'b'], TwinType.Dizygotic);
    expect(id).not.toBeNull();
    const tg = usePedigreeStore.getState().document.twinGroups[id as string];
    expect(tg.twinType).toBe(TwinType.Dizygotic);
    expect([...tg.individualIds].sort()).toEqual(['a', 'b']);
    expect(tg.parentPartnershipId).toBe('union1');
  });

  it('groups three siblings as triplets', () => {
    seedSibship(['a', 'b', 'c']);
    const id = usePedigreeStore.getState().groupTwins(['a', 'b', 'c'], TwinType.Monozygotic);
    const tg = usePedigreeStore.getState().document.twinGroups[id as string];
    expect([...tg.individualIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('extends an existing pair to a triplet, keeping the existing zygosity', () => {
    seedSibship(['a', 'b', 'c']);
    const store = usePedigreeStore.getState();
    store.addTwinGroup({
      id: 'tg1',
      twinType: TwinType.Monozygotic,
      individualIds: ['a', 'b'],
      parentPartnershipId: 'union1',
    });

    const id = store.groupTwins(['b', 'c'], TwinType.Dizygotic);

    expect(id).toBe('tg1'); // merged into existing group
    const tg = usePedigreeStore.getState().document.twinGroups['tg1'];
    expect([...tg.individualIds].sort()).toEqual(['a', 'b', 'c']);
    expect(tg.twinType).toBe(TwinType.Monozygotic); // existing type kept
  });

  it('merges two existing groups into the larger one and removes the smaller', () => {
    seedSibship(['a', 'b', 'c', 'd', 'e']);
    const store = usePedigreeStore.getState();
    store.addTwinGroup({
      id: 'big',
      twinType: TwinType.Monozygotic,
      individualIds: ['a', 'b', 'c'],
      parentPartnershipId: 'union1',
    });
    store.addTwinGroup({
      id: 'small',
      twinType: TwinType.Dizygotic,
      individualIds: ['d', 'e'],
      parentPartnershipId: 'union1',
    });

    const id = store.groupTwins(['a', 'd'], TwinType.Unknown);

    expect(id).toBe('big');
    const groups = usePedigreeStore.getState().document.twinGroups;
    expect(groups['small']).toBeUndefined();
    expect([...groups['big'].individualIds].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(groups['big'].twinType).toBe(TwinType.Monozygotic); // larger group's type wins
  });

  it('returns null and changes nothing when ids span different sibships', () => {
    const store = usePedigreeStore.getState();
    store.addPartnership({ id: 'u1', type: RelationshipType.Partnership, childrenIds: ['a'] });
    store.addPartnership({ id: 'u2', type: RelationshipType.Partnership, childrenIds: ['b'] });
    store.addIndividual(createDefaultIndividual({ id: 'a' }));
    store.addIndividual(createDefaultIndividual({ id: 'b' }));
    store.addParentChildLink({ id: 'la', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'a', isAdoptive: false });
    store.addParentChildLink({ id: 'lb', type: RelationshipType.ParentChild, parentPartnershipId: 'u2', childId: 'b', isAdoptive: false });

    const id = store.groupTwins(['a', 'b'], TwinType.Dizygotic);

    expect(id).toBeNull();
    expect(Object.keys(usePedigreeStore.getState().document.twinGroups)).toHaveLength(0);
  });

  it('records a single undoable step', () => {
    seedSibship(['a', 'b']);
    const store = usePedigreeStore.getState();
    store.groupTwins(['a', 'b'], TwinType.Dizygotic);
    usePedigreeStore.temporal.getState().undo();
    expect(Object.keys(usePedigreeStore.getState().document.twinGroups)).toHaveLength(0);
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
