import { describe, it, expect } from 'vitest';
import {
  findParents,
  findParentSets,
  findChildren,
  findSiblings,
  findPartnerships,
  hasParents,
  hasPartnership,
  getPresentPartners,
} from './graphTraversal';
import { RelationshipType } from '../types/enums';
import { createDefaultDocument, createDefaultIndividual } from '../stores/pedigreeStore';
import type { PedigreeDocument, PartnershipRelationship } from '../types/pedigree';

/**
 * Builds a small nuclear family:
 *   father + mother (partnership) -> child1, child2
 * plus an unrelated `loner` with no relationships.
 */
function makeFamily(): {
  doc: PedigreeDocument;
  fatherId: string;
  motherId: string;
  child1Id: string;
  child2Id: string;
  lonerId: string;
  partnershipId: string;
} {
  const doc = createDefaultDocument();

  const father = createDefaultIndividual();
  const mother = createDefaultIndividual();
  const child1 = createDefaultIndividual();
  const child2 = createDefaultIndividual();
  const loner = createDefaultIndividual();

  for (const ind of [father, mother, child1, child2, loner]) {
    doc.individuals[ind.id] = ind;
  }

  const partnershipId = 'p1';
  doc.partnerships[partnershipId] = {
    id: partnershipId,
    type: RelationshipType.Partnership,
    partner1Id: father.id,
    partner2Id: mother.id,
    childrenIds: [child1.id, child2.id],
  };

  for (const childId of [child1.id, child2.id]) {
    const linkId = `link-${childId}`;
    doc.parentChildLinks[linkId] = {
      id: linkId,
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId,
      childId,
    };
  }

  return {
    doc,
    fatherId: father.id,
    motherId: mother.id,
    child1Id: child1.id,
    child2Id: child2.id,
    lonerId: loner.id,
    partnershipId,
  };
}

/**
 * Attach a SECOND parent set to `child1` (multi-parentage, #64): a new couple in
 * partnership `p2` who also have a biological child `bioSibling`. Returns the new
 * ids so tests can assert both sets and their combined siblings.
 */
function addSecondParentSet(doc: PedigreeDocument, childId: string): {
  dad2Id: string;
  mom2Id: string;
  bioSiblingId: string;
  partnership2Id: string;
} {
  const dad2 = createDefaultIndividual();
  const mom2 = createDefaultIndividual();
  const bioSibling = createDefaultIndividual();
  for (const ind of [dad2, mom2, bioSibling]) doc.individuals[ind.id] = ind;

  const partnership2Id = 'p2';
  doc.partnerships[partnership2Id] = {
    id: partnership2Id,
    type: RelationshipType.Partnership,
    partner1Id: dad2.id,
    partner2Id: mom2.id,
    childrenIds: [childId, bioSibling.id],
  };
  for (const cid of [childId, bioSibling.id]) {
    const linkId = `link2-${cid}`;
    doc.parentChildLinks[linkId] = {
      id: linkId,
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnership2Id,
      childId: cid,
    };
  }
  return { dad2Id: dad2.id, mom2Id: mom2.id, bioSiblingId: bioSibling.id, partnership2Id };
}

describe('findParentSets', () => {
  it('returns a single set for an ordinary child', () => {
    const { doc, child1Id, fatherId, motherId, partnershipId } = makeFamily();
    const sets = findParentSets(doc, child1Id);
    expect(sets).toHaveLength(1);
    expect(sets[0].father?.id).toBe(fatherId);
    expect(sets[0].mother?.id).toBe(motherId);
    expect(sets[0].partnershipId).toBe(partnershipId);
    expect(sets[0].link.childId).toBe(child1Id);
  });

  it('returns BOTH parent sets for a child with two parent couples', () => {
    const { doc, child1Id, partnershipId } = makeFamily();
    const { partnership2Id } = addSecondParentSet(doc, child1Id);
    const sets = findParentSets(doc, child1Id);
    expect(sets.map((s) => s.partnershipId).sort()).toEqual(
      [partnershipId, partnership2Id].sort(),
    );
  });

  it('returns an empty array when the child has no parent link', () => {
    const { doc, lonerId } = makeFamily();
    expect(findParentSets(doc, lonerId)).toEqual([]);
  });

  it('skips a set whose partnership has been deleted', () => {
    const { doc, child1Id, partnershipId } = makeFamily();
    delete doc.partnerships[partnershipId];
    expect(findParentSets(doc, child1Id)).toEqual([]);
  });
});

describe('findParents', () => {
  it('returns both partners and the partnership for a child', () => {
    const { doc, fatherId, motherId, child1Id, partnershipId } = makeFamily();
    const parents = findParents(doc, child1Id);
    expect(parents.father?.id).toBe(fatherId);
    expect(parents.mother?.id).toBe(motherId);
    expect(parents.partnershipId).toBe(partnershipId);
  });

  it('returns an empty object for an individual with no parent link', () => {
    const { doc, lonerId } = makeFamily();
    expect(findParents(doc, lonerId)).toEqual({});
  });

  it('skips a link whose partnership has been deleted', () => {
    const { doc, child1Id, partnershipId } = makeFamily();
    delete doc.partnerships[partnershipId];
    expect(findParents(doc, child1Id)).toEqual({});
  });
});

describe('findChildren', () => {
  it('returns every child of any partnership the individual is in', () => {
    const { doc, fatherId, motherId, child1Id, child2Id } = makeFamily();
    expect(findChildren(doc, fatherId).map((c) => c.id).sort()).toEqual(
      [child1Id, child2Id].sort(),
    );
    // mother is the other partner — same children.
    expect(findChildren(doc, motherId).map((c) => c.id).sort()).toEqual(
      [child1Id, child2Id].sort(),
    );
  });

  it('returns an empty array for someone with no partnerships', () => {
    const { doc, lonerId } = makeFamily();
    expect(findChildren(doc, lonerId)).toEqual([]);
  });

  it('ignores child ids that no longer resolve to an individual', () => {
    const { doc, fatherId, child2Id } = makeFamily();
    delete doc.individuals[child2Id];
    const children = findChildren(doc, fatherId);
    expect(children.map((c) => c.id)).not.toContain(child2Id);
    expect(children).toHaveLength(1);
  });
});

describe('findSiblings', () => {
  it('returns the other children of the same partnership', () => {
    const { doc, child1Id, child2Id } = makeFamily();
    const siblings = findSiblings(doc, child1Id);
    expect(siblings.map((s) => s.id)).toEqual([child2Id]);
  });

  it('excludes the individual themselves', () => {
    const { doc, child1Id } = makeFamily();
    expect(findSiblings(doc, child1Id).map((s) => s.id)).not.toContain(child1Id);
  });

  it('returns an empty array when the individual has no parents', () => {
    const { doc, fatherId } = makeFamily();
    expect(findSiblings(doc, fatherId)).toEqual([]);
  });

  it('aggregates siblings across BOTH parent sets, deduped and self-excluded', () => {
    const { doc, child1Id, child2Id } = makeFamily();
    const { bioSiblingId } = addSecondParentSet(doc, child1Id);
    // child2 is a sibling via the first set; bioSibling via the second set.
    const ids = findSiblings(doc, child1Id).map((s) => s.id).sort();
    expect(ids).toEqual([child2Id, bioSiblingId].sort());
    expect(ids).not.toContain(child1Id);
  });
});

describe('findPartnerships', () => {
  it('returns ids of partnerships the individual belongs to', () => {
    const { doc, fatherId, partnershipId } = makeFamily();
    expect(findPartnerships(doc, fatherId)).toEqual([partnershipId]);
  });

  it('returns an empty array for an unpartnered individual', () => {
    const { doc, lonerId } = makeFamily();
    expect(findPartnerships(doc, lonerId)).toEqual([]);
  });
});

describe('hasParents', () => {
  it('is true for a child with a parent link and false otherwise', () => {
    const { doc, child1Id, fatherId } = makeFamily();
    expect(hasParents(doc, child1Id)).toBe(true);
    expect(hasParents(doc, fatherId)).toBe(false);
  });
});

describe('hasPartnership', () => {
  it('is true for a partnered individual and false for a loner', () => {
    const { doc, fatherId, lonerId } = makeFamily();
    expect(hasPartnership(doc, fatherId)).toBe(true);
    expect(hasPartnership(doc, lonerId)).toBe(false);
  });
});

describe('getPresentPartners', () => {
  it('returns only the partner individuals that exist', () => {
    const doc = createDefaultDocument();
    const dad = createDefaultIndividual();
    doc.individuals[dad.id] = dad;

    const oneParent: PartnershipRelationship = {
      id: 'u1', type: RelationshipType.Partnership,
      partner1Id: dad.id, childrenIds: [],
    };
    expect(getPresentPartners(doc.individuals, oneParent).map((p) => p.id)).toEqual([dad.id]);

    const sibship: PartnershipRelationship = { id: 'u2', type: RelationshipType.Partnership, childrenIds: [] };
    expect(getPresentPartners(doc.individuals, sibship)).toEqual([]);
  });
});

describe('hasParents with partnerless unions', () => {
  function sibshipDoc() {
    const doc = createDefaultDocument();
    const a = createDefaultIndividual();
    const b = createDefaultIndividual();
    doc.individuals[a.id] = a;
    doc.individuals[b.id] = b;
    doc.partnerships['s1'] = { id: 's1', type: RelationshipType.Partnership, childrenIds: [a.id, b.id] };
    doc.parentChildLinks['l1'] = { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 's1', childId: a.id };
    doc.parentChildLinks['l2'] = { id: 'l2', type: RelationshipType.ParentChild, parentPartnershipId: 's1', childId: b.id };
    return { doc, aId: a.id };
  }

  it('reports no parents for a member of a 0-partner sibship', () => {
    const { doc, aId } = sibshipDoc();
    expect(hasParents(doc, aId)).toBe(false);
  });

  it('reports parents once a partner is filled into the union', () => {
    const { doc, aId } = sibshipDoc();
    const parent = createDefaultIndividual();
    doc.individuals[parent.id] = parent;
    doc.partnerships['s1'].partner1Id = parent.id;
    expect(hasParents(doc, aId)).toBe(true);
  });
});
