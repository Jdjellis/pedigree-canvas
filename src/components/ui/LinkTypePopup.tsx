import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { RelationshipType } from '../../types/enums';
import { generateId } from '../../utils/idGenerator';
import type { PartnershipRelationship, ParentChildRelationship } from '../../types/pedigree';
import styles from './LinkTypePopup.module.css';

export function LinkTypePopup() {
  const { visible, sourceId, targetId, screenPosition } = useUIStore(
    (s) => s.linkPopup,
  );
  const hideLinkPopup = useUIStore((s) => s.hideLinkPopup);
  const addPartnership = usePedigreeStore((s) => s.addPartnership);
  const addParentChildLink = usePedigreeStore((s) => s.addParentChildLink);
  const updateIndividual = usePedigreeStore((s) => s.updateIndividual);

  const createPartnership = useCallback(
    (type: RelationshipType.Partnership | RelationshipType.Consanguinity) => {
      if (!sourceId || !targetId) return;
      const partnership: PartnershipRelationship = {
        id: generateId(),
        type,
        partner1Id: sourceId,
        partner2Id: targetId,
        childrenIds: [],
      };
      addPartnership(partnership);
      hideLinkPopup();
    },
    [sourceId, targetId, addPartnership, hideLinkPopup],
  );

  const createParentChild = useCallback(
    (parentId: string, childId: string) => {
      if (!parentId || !childId) return;
      const partnershipId = generateId();
      const partnership: PartnershipRelationship = {
        id: partnershipId,
        type: RelationshipType.Partnership,
        partner1Id: parentId,
        partner2Id: parentId,
        childrenIds: [childId],
      };
      const link: ParentChildRelationship = {
        id: generateId(),
        type: RelationshipType.ParentChild,
        parentPartnershipId: partnershipId,
        childId,
        isAdopted: false,
      };
      addPartnership(partnership);
      addParentChildLink(link);
      hideLinkPopup();
    },
    [addPartnership, addParentChildLink, hideLinkPopup],
  );

  const createAdoption = useCallback(() => {
    if (!sourceId || !targetId) return;
    const partnershipId = generateId();
    const partnership: PartnershipRelationship = {
      id: partnershipId,
      type: RelationshipType.Partnership,
      partner1Id: sourceId,
      partner2Id: sourceId,
      childrenIds: [targetId],
    };
    const link: ParentChildRelationship = {
      id: generateId(),
      type: RelationshipType.Adoption,
      parentPartnershipId: partnershipId,
      childId: targetId,
      isAdopted: true,
    };
    addPartnership(partnership);
    addParentChildLink(link);
    // Flag the adoptee so its symbol is drawn in adoption brackets.
    updateIndividual(targetId, { adopted: true });
    hideLinkPopup();
  }, [sourceId, targetId, addPartnership, addParentChildLink, updateIndividual, hideLinkPopup]);

  if (!visible || !sourceId || !targetId) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={hideLinkPopup}
    >
      <div
        className={styles.popup}
        style={{ left: screenPosition.x, top: screenPosition.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>Create Relationship</div>
        <button
          className={styles.option}
          onClick={() => createPartnership(RelationshipType.Partnership)}
        >
          Partnership
        </button>
        <button
          className={styles.option}
          onClick={() => createPartnership(RelationshipType.Consanguinity)}
        >
          Consanguinity
        </button>
        <button
          className={styles.option}
          onClick={() => createParentChild(sourceId, targetId)}
        >
          Parent &rarr; Child (source is parent)
        </button>
        <button
          className={styles.option}
          onClick={() => createParentChild(targetId, sourceId)}
        >
          Parent &rarr; Child (target is parent)
        </button>
        <button
          className={styles.option}
          onClick={createAdoption}
        >
          Adoption
        </button>
        <button
          className={styles.cancelButton}
          onClick={hideLinkPopup}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
