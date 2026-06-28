import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { hasParents, hasPartnership, findPartnerships } from '../../utils/graphTraversal';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity } from '../../types/enums';
import { PARTNER_SPACING, GENERATION_SPACING, SIBLING_SPACING } from '../../utils/constants';
import type { PartnershipRelationship, ParentChildRelationship } from '../../types/pedigree';
import { RADIAL_MENU_DISMISS_DISTANCE } from '../../utils/constants';
import { createRelativeIndividual } from './radialActions';
import styles from './RadialMenu.module.css';
import clsx from 'clsx';

export function RadialMenu() {
  const { visible, targetId, screenPosition } = useUIStore(
    (s) => s.radialMenu
  );
  const hideRadialMenu = useUIStore((s) => s.hideRadialMenu);
  const select = useUIStore((s) => s.select);
  const defaultSex = useUIStore((s) => s.defaultSex);
  const editingLocked = useUIStore((s) => s.editingLocked);

  const doc = usePedigreeStore((s) => s.document);
  const addParentsForChild = usePedigreeStore((s) => s.addParentsForChild);
  const addPartnerToIndividual = usePedigreeStore((s) => s.addPartnerToIndividual);
  const addChildToFamily = usePedigreeStore((s) => s.addChildToFamily);

  const menuRef = useRef<HTMLDivElement>(null);

  const target = targetId ? doc.individuals[targetId] : null;

  const canAddSibling = targetId ? hasParents(doc, targetId) : false;
  const canAddChild = targetId ? hasPartnership(doc, targetId) : false;

  // Dismiss when mouse drifts too far — pinned menus ignore drift entirely.
  useEffect(() => {
    if (!visible) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (useUIStore.getState().radialMenu.pinned) return;
      const dx = e.clientX - screenPosition.x;
      const dy = e.clientY - screenPosition.y;
      if (Math.sqrt(dx * dx + dy * dy) > RADIAL_MENU_DISMISS_DISTANCE) {
        hideRadialMenu();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [visible, screenPosition, hideRadialMenu]);

  // Dismiss on Escape (also clears the pinned flag via hideRadialMenu)
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideRadialMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, hideRadialMenu]);

  const handleAddParent = useCallback(() => {
    if (!target) return;

    const childGeneration = target.generation ?? 1;
    const parentGeneration = childGeneration - 1;

    const parent1 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Man,
      generation: parentGeneration,
      position: {
        x: target.position.x - PARTNER_SPACING / 2,
        y: target.position.y - GENERATION_SPACING,
      },
    });
    const parent2 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Woman,
      generation: parentGeneration,
      position: {
        x: target.position.x + PARTNER_SPACING / 2,
        y: target.position.y - GENERATION_SPACING,
      },
    });

    const partnership: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: parent1.id,
      partner2Id: parent2.id,
      childrenIds: [target.id],
    };

    const link: ParentChildRelationship = {
      id: generateId(),
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id,
      childId: target.id,
      isAdopted: false,
    };

    addParentsForChild(parent1, parent2, partnership, link, target.id, childGeneration);
    hideRadialMenu();
    select(parent1.id);
  }, [target, addParentsForChild, hideRadialMenu, select]);

  const handleAddPartner = useCallback(() => {
    if (!target) return;

    const partner = createRelativeIndividual(defaultSex, {
      generation: target.generation,
      position: {
        x: target.position.x + PARTNER_SPACING,
        y: target.position.y,
      },
    });

    const partnership: PartnershipRelationship = {
      id: generateId(),
      type: RelationshipType.Partnership,
      partner1Id: target.id,
      partner2Id: partner.id,
      childrenIds: [],
    };

    addPartnerToIndividual(partner, partnership);
    hideRadialMenu();
    select(partner.id);
  }, [target, defaultSex, addPartnerToIndividual, hideRadialMenu, select]);

  const handleAddChild = useCallback(() => {
    if (!target || !targetId) return;

    // Find the first partnership this individual is in
    const partnershipIds = findPartnerships(doc, targetId);
    if (partnershipIds.length === 0) return;

    const partnership = doc.partnerships[partnershipIds[0]];
    if (!partnership) return;

    const p1 = doc.individuals[partnership.partner1Id];
    const p2 = doc.individuals[partnership.partner2Id];
    if (!p1 || !p2) return;

    const midX = (p1.position.x + p2.position.x) / 2;
    const existingChildren = partnership.childrenIds.length;

    const child = createRelativeIndividual(defaultSex, {
      generation: (target.generation ?? 0) + 1,
      position: {
        x: midX + existingChildren * SIBLING_SPACING,
        y: target.position.y + GENERATION_SPACING,
      },
    });

    const link: ParentChildRelationship = {
      id: generateId(),
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id,
      childId: child.id,
      isAdopted: false,
    };

    addChildToFamily(child, partnership.id, link);
    hideRadialMenu();
    select(child.id);
  }, [
    target,
    targetId,
    doc,
    defaultSex,
    addChildToFamily,
    hideRadialMenu,
    select,
  ]);

  const handleAddSibling = useCallback(() => {
    if (!target || !targetId) return;

    // Find parent partnership
    const parentLink = Object.values(doc.parentChildLinks).find(
      (l) => l.childId === targetId
    );
    if (!parentLink) return;

    const partnership = doc.partnerships[parentLink.parentPartnershipId];
    if (!partnership) return;

    // Position to the right of the rightmost sibling
    const siblings = partnership.childrenIds
      .map((id) => doc.individuals[id])
      .filter(Boolean);
    const maxX = Math.max(...siblings.map((s) => s.position.x));

    const sibling = createRelativeIndividual(defaultSex, {
      generation: target.generation,
      position: {
        x: maxX + SIBLING_SPACING,
        y: target.position.y,
      },
    });

    const link: ParentChildRelationship = {
      id: generateId(),
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id,
      childId: sibling.id,
      isAdopted: false,
    };

    addChildToFamily(sibling, partnership.id, link);
    hideRadialMenu();
    select(sibling.id);
  }, [
    target,
    targetId,
    doc,
    defaultSex,
    addChildToFamily,
    hideRadialMenu,
    select,
  ]);

  if (!visible || !target || editingLocked) return null;

  return (
    <div
      className={styles.overlay}
      style={{
        left: screenPosition.x,
        top: screenPosition.y,
      }}
      ref={menuRef}
    >
      <div className={styles.menu}>
        <button
          className={clsx(styles.option, styles.top)}
          onClick={handleAddParent}
          title="Add Parents"
        >
          Parent
        </button>
        <button
          className={clsx(styles.option, styles.right)}
          onClick={handleAddPartner}
          title="Add Partner"
        >
          Partner
        </button>
        <button
          className={clsx(
            styles.option,
            styles.bottom,
            !canAddChild && styles.disabled
          )}
          onClick={canAddChild ? handleAddChild : undefined}
          title={
            canAddChild
              ? 'Add Child'
              : 'Add a partner first to add children'
          }
        >
          Child
        </button>
        <button
          className={clsx(
            styles.option,
            styles.left,
            !canAddSibling && styles.disabled
          )}
          onClick={canAddSibling ? handleAddSibling : undefined}
          title={
            canAddSibling
              ? 'Add Sibling'
              : 'Individual needs parents to add siblings'
          }
        >
          Sibling
        </button>
      </div>
    </div>
  );
}
