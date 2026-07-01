import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildTwinChildrenForUnion,
  buildTwinChildrenViaNewUnion,
  addTwinChildrenToUnion,
} from './addTwinChildren';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity, RelationshipType, TwinType } from '../../types/enums';
import type { PartnershipRelationship } from '../../types/pedigree';

const MOM = 'mom';
const DAD = 'dad';
const UNION = 'u1';

/** Seed a two-parent union with no children yet. */
function seedCouple(): PartnershipRelationship {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(
    createDefaultIndividual({ id: MOM, genderIdentity: GenderIdentity.Woman, generation: 0, position: { x: 0, y: 0 } }),
  );
  store.addIndividual(
    createDefaultIndividual({ id: DAD, genderIdentity: GenderIdentity.Man, generation: 0, position: { x: 120, y: 0 } }),
  );
  const union: PartnershipRelationship = {
    id: UNION,
    type: RelationshipType.Partnership,
    partner1Id: MOM,
    partner2Id: DAD,
    childrenIds: [],
  };
  store.addPartnership(union);
  return union;
}

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.getState().hideGenderPicker();
  useUIStore.getState().clearSelection();
});

describe('buildTwinChildrenForUnion', () => {
  it('builds two Unknown children twinned with the requested zygosity', () => {
    const union = seedCouple();
    const doc = usePedigreeStore.getState().document;
    const mom = doc.individuals[MOM];

    const { children, links, twinGroup } = buildTwinChildrenForUnion(
      doc,
      mom,
      union,
      TwinType.Monozygotic,
    );

    expect(children).toHaveLength(2);
    expect(children.every((c) => c.genderIdentity === GenderIdentity.Unknown)).toBe(true);
    // Distinct ids, distinct x positions so they fan out rather than stack.
    expect(children[0].id).not.toBe(children[1].id);
    expect(children[0].position.x).not.toBe(children[1].position.x);

    // One link per child, both pointing at the union.
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.parentPartnershipId === UNION)).toBe(true);
    expect(links.map((l) => l.childId).sort()).toEqual(children.map((c) => c.id).sort());

    // The group binds exactly the two children with the chosen zygosity.
    expect(twinGroup.twinType).toBe(TwinType.Monozygotic);
    expect(twinGroup.parentPartnershipId).toBe(UNION);
    expect(twinGroup.individualIds.sort()).toEqual(children.map((c) => c.id).sort());
  });
});

describe('buildTwinChildrenViaNewUnion', () => {
  it('builds a fresh 1-partner union under the target holding both twins', () => {
    const store = usePedigreeStore.getState();
    store.resetDocument();
    const solo = createDefaultIndividual({ id: 'solo', generation: 0, position: { x: 50, y: 0 } });

    const { children, links, partnership, twinGroup } = buildTwinChildrenViaNewUnion(
      solo,
      TwinType.Dizygotic,
    );

    expect(partnership.partner1Id).toBe('solo');
    expect(partnership.partner2Id).toBeUndefined();
    expect(partnership.childrenIds).toEqual(children.map((c) => c.id));
    expect(links.every((l) => l.parentPartnershipId === partnership.id)).toBe(true);
    expect(twinGroup.twinType).toBe(TwinType.Dizygotic);
    expect(twinGroup.parentPartnershipId).toBe(partnership.id);
    // Children sit a generation below the sole parent.
    expect(children.every((c) => c.generation === 1)).toBe(true);
  });
});

describe('addTwinChildrenToUnion', () => {
  it('adds both twins to the union, groups them, and opens the gender picker on the first', () => {
    const union = seedCouple();
    const doc = usePedigreeStore.getState().document;
    const mom = doc.individuals[MOM];

    addTwinChildrenToUnion(doc, mom, union, TwinType.Dizygotic);

    const after = usePedigreeStore.getState().document;
    const created = Object.values(after.individuals).filter((i) => i.id !== MOM && i.id !== DAD);
    expect(created).toHaveLength(2);

    // Both are children of the union.
    expect(after.partnerships[UNION].childrenIds).toHaveLength(2);
    created.forEach((c) => expect(after.partnerships[UNION].childrenIds).toContain(c.id));

    // Exactly one twin group binds the pair.
    const groups = Object.values(after.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].twinType).toBe(TwinType.Dizygotic);
    expect(groups[0].individualIds.sort()).toEqual(created.map((c) => c.id).sort());

    // Gender picker opens on one of the newly created twins.
    const picked = useUIStore.getState().genderPicker.targetId;
    expect(created.map((c) => c.id)).toContain(picked);
  });

  it('is a single undoable step (children + group revert together)', () => {
    const union = seedCouple();
    const doc = usePedigreeStore.getState().document;
    const mom = doc.individuals[MOM];

    addTwinChildrenToUnion(doc, mom, union, TwinType.Monozygotic);
    usePedigreeStore.temporal.getState().undo();

    const after = usePedigreeStore.getState().document;
    expect(Object.values(after.individuals).filter((i) => i.id !== MOM && i.id !== DAD)).toHaveLength(0);
    expect(Object.values(after.twinGroups)).toHaveLength(0);
    expect(after.partnerships[UNION].childrenIds).toHaveLength(0);
  });
});
