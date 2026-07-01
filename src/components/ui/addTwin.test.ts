import { describe, it, expect, beforeEach } from 'vitest';
import { addTwinOf, isTwin } from './addTwin';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType, TwinType } from '../../types/enums';

const KID = 'kid';
const UNION = 'u1';

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.getState().hideGenderPicker();
});

describe('addTwinOf', () => {
  it('adds the co-twin to the target’s existing sibship and groups them', () => {
    const store = usePedigreeStore.getState();
    // A child with a parent union (parented branch of addTwinOf).
    store.addIndividual(createDefaultIndividual({ id: KID, generation: 1, position: { x: 0, y: 150 } }));
    store.addPartnership({ id: UNION, type: RelationshipType.Partnership, childrenIds: [KID] });
    store.addParentChildLink({
      id: 'pcl', type: RelationshipType.ParentChild, parentPartnershipId: UNION, childId: KID,
    });

    const doc = usePedigreeStore.getState().document;
    addTwinOf(doc, doc.individuals[KID], TwinType.Monozygotic);

    const after = usePedigreeStore.getState().document;
    const created = Object.values(after.individuals).filter((i) => i.id !== KID);
    expect(created).toHaveLength(1);
    // The co-twin joins the SAME union (not a new sibship).
    expect(after.partnerships[UNION].childrenIds).toEqual([KID, created[0].id]);

    const groups = Object.values(after.twinGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentPartnershipId).toBe(UNION);
    expect(groups[0].twinType).toBe(TwinType.Monozygotic);
    expect(useUIStore.getState().genderPicker.targetId).toBe(created[0].id);
  });
});

describe('isTwin', () => {
  it('is true only for members of a twin group', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup({
      id: 'tg', twinType: TwinType.Dizygotic, individualIds: ['a', 'b'], parentPartnershipId: 'u',
    });
    const doc = usePedigreeStore.getState().document;
    expect(isTwin(doc, 'a')).toBe(true);
    expect(isTwin(doc, 'z')).toBe(false);
  });
});
