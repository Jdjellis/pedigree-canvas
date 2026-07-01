import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { RelationshipType } from '../../types/enums';
import { generateId } from '../../utils/idGenerator';
import { clearCanvasCursor } from '../../utils/canvasCursor';
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

  // When the popup closes — however it closes (create, Cancel, backdrop) — the
  // hover cursor the canvas is holding is stale: the popup overlay swallowed the
  // pointer-leave that would have reset it, so it stays stuck as a hand. Reset
  // the canvas cursor and the hovered id when the popup goes from open to shut.
  useEffect(() => {
    if (!visible) return;
    return () => {
      clearCanvasCursor();
      useUIStore.getState().setHovered(null);
    };
  }, [visible]);

  // Close after a relationship is created. If the connect tool drove this, drop
  // back to select — one connection per tool activation (Excalidraw-style), so
  // the user isn't left armed for accidental extra links. Cancelling keeps the
  // connect tool active so a fumbled attempt can be retried immediately.
  const finishAfterCreate = useCallback(() => {
    const ui = useUIStore.getState();
    ui.hideLinkPopup();
    if (ui.activeTool === 'connect') ui.setActiveTool('select');
  }, []);

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
      finishAfterCreate();
    },
    [sourceId, targetId, addPartnership, finishAfterCreate],
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
      };
      addPartnership(partnership);
      addParentChildLink(link);
      finishAfterCreate();
    },
    [addPartnership, addParentChildLink, finishAfterCreate],
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
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId,
      childId: targetId,
      isAdoptive: true,
    };
    addPartnership(partnership);
    addParentChildLink(link);
    // Flag the adoptee so its symbol is drawn in adoption brackets.
    updateIndividual(targetId, { adopted: true });
    finishAfterCreate();
  }, [sourceId, targetId, addPartnership, addParentChildLink, updateIndividual, finishAfterCreate]);

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
