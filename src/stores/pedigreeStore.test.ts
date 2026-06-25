import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from './pedigreeStore';
import { generateId } from '../utils/idGenerator';
import { RelationshipType } from '../types/enums';
import { MIN_GENERATION_NODE_SPACING } from '../utils/constants';
import type {
  TextAnnotation,
  PartnershipRelationship,
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
