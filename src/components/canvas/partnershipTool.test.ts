import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType } from '../../types/enums';
import { createPartnershipBetween, handlePartnershipClick } from './partnershipTool';

function seedTwo(): void {
  const store = usePedigreeStore.getState();
  store.resetDocument();
  store.addIndividual(createDefaultIndividual({ id: 'a', position: { x: 0, y: 0 } }));
  store.addIndividual(createDefaultIndividual({ id: 'b', position: { x: 100, y: 0 } }));
  useUIStore.setState({ partnershipAnchorId: null });
}

describe('createPartnershipBetween', () => {
  beforeEach(seedTwo);

  it('creates a partnership relationship between two individuals', () => {
    const id = createPartnershipBetween('a', 'b');
    const p = usePedigreeStore.getState().document.partnerships[id];
    expect(p.partner1Id).toBe('a');
    expect(p.partner2Id).toBe('b');
    expect(p.type).toBe(RelationshipType.Partnership);
    expect(p.childrenIds).toEqual([]);
  });
});

describe('handlePartnershipClick anchor flow', () => {
  beforeEach(seedTwo);

  it('sets the anchor on the first click', () => {
    handlePartnershipClick('a');
    expect(useUIStore.getState().partnershipAnchorId).toBe('a');
    expect(Object.keys(usePedigreeStore.getState().document.partnerships)).toHaveLength(0);
  });

  it('creates the partnership and clears the anchor on the second click', () => {
    handlePartnershipClick('a');
    handlePartnershipClick('b');
    expect(useUIStore.getState().partnershipAnchorId).toBeNull();
    expect(Object.keys(usePedigreeStore.getState().document.partnerships)).toHaveLength(1);
  });

  it('clicking the same individual twice cancels the anchor', () => {
    handlePartnershipClick('a');
    handlePartnershipClick('a');
    expect(useUIStore.getState().partnershipAnchorId).toBeNull();
    expect(Object.keys(usePedigreeStore.getState().document.partnerships)).toHaveLength(0);
  });
});
