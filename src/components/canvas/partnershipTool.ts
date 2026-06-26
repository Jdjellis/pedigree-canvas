import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType } from '../../types/enums';
import { generateId } from '../../utils/idGenerator';
import type { PartnershipRelationship } from '../../types/pedigree';

/**
 * Create a partnership union between two individuals and add it to the store.
 * Mirrors the relationship built by the drag-link `LinkTypePopup`, so both
 * entry paths produce identical document state.
 *
 * @returns the new partnership's id.
 */
export function createPartnershipBetween(
  partner1Id: string,
  partner2Id: string,
): string {
  const partnership: PartnershipRelationship = {
    id: generateId(),
    type: RelationshipType.Partnership,
    partner1Id,
    partner2Id,
    childrenIds: [],
  };
  usePedigreeStore.getState().addPartnership(partnership);
  return partnership.id;
}

/**
 * Drive the two-click partnership tool. The first click on an individual sets
 * the pending anchor; a second click on a different individual creates the
 * partnership and clears the anchor; clicking the same individual again cancels.
 */
export function handlePartnershipClick(individualId: string): void {
  const ui = useUIStore.getState();
  const anchor = ui.partnershipAnchorId;
  if (anchor === null) {
    ui.setPartnershipAnchor(individualId);
    return;
  }
  if (anchor === individualId) {
    ui.setPartnershipAnchor(null);
    return;
  }
  createPartnershipBetween(anchor, individualId);
  ui.setPartnershipAnchor(null);
}
