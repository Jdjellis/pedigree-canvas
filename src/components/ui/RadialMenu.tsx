import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { getPresentPartners, findPartnerships } from '../../utils/graphTraversal';
import { addChildToUnion } from './addChild';
import { addTwinChildrenToUnion, buildTwinChildrenViaNewUnion } from './addTwinChildren';
import { addTwinOf } from './addTwin';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity, TwinType } from '../../types/enums';
import { PARTNER_SPACING, GENERATION_SPACING, SIBLING_SPACING } from '../../utils/constants';
import type { PartnershipRelationship, ParentChildRelationship } from '../../types/pedigree';
import styles from './RadialMenu.module.css';
import clsx from 'clsx';

export function RadialMenu() {
  const { visible, targetId } = useUIStore((s) => s.radialMenu);
  const hideRadialMenu = useUIStore((s) => s.hideRadialMenu);
  const select = useUIStore((s) => s.select);
  const showGenderPicker = useUIStore((s) => s.showGenderPicker);
  const showUnionPicker = useUIStore((s) => s.showUnionPicker);
  const genderPicker = useUIStore((s) => s.genderPicker);
  const editingLocked = useUIStore((s) => s.editingLocked);

  // Subscribe to viewport primitives so the menu re-renders on pan/zoom.
  const viewportScale = useViewportStore((s) => s.scale);
  const viewportX = useViewportStore((s) => s.position.x);
  const viewportY = useViewportStore((s) => s.position.y);

  const doc = usePedigreeStore((s) => s.document);
  const addParentsForChild = usePedigreeStore((s) => s.addParentsForChild);
  const addPartnerToIndividual = usePedigreeStore((s) => s.addPartnerToIndividual);
  const addChildToFamily = usePedigreeStore((s) => s.addChildToFamily);
  const addSiblingViaNewUnion = usePedigreeStore((s) => s.addSiblingViaNewUnion);
  const addChildViaNewUnion = usePedigreeStore((s) => s.addChildViaNewUnion);
  const fillUnionPartner = usePedigreeStore((s) => s.fillUnionPartner);
  const addParentsToParentlessUnion = usePedigreeStore((s) => s.addParentsToParentlessUnion);
  const addTwinChildren = usePedigreeStore((s) => s.addTwinChildren);

  const [altMod, setAltMod] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const target = targetId ? doc.individuals[targetId] : null;

  // Derive screen position from the live canvas position + live viewport so the
  // menu tracks pan, zoom, and drag without stale coordinates.
  const screenPosition = target
    ? { x: target.position.x * viewportScale + viewportX, y: target.position.y * viewportScale + viewportY }
    : { x: 0, y: 0 };

  // Add Parents is disabled only when the target already has two present parents.
  const canAddParents = (() => {
    if (!targetId) return false;
    const link = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);
    if (!link) return true;
    const union = doc.partnerships[link.parentPartnershipId];
    if (!union) return true;
    return getPresentPartners(doc.individuals, union).length < 2;
  })();

  // Tracks Escape (dismiss) and ⌥/Alt (reveal twin split).
  // altMod needs no explicit reset: listeners are torn down on hide, so it
  // can only be true if a live keydown set it. If the user reopens the menu
  // while still holding Alt that's correct — the split shows immediately.
  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideRadialMenu();
      setAltMod(e.altKey);
    };
    const onKeyUp = (e: KeyboardEvent) => setAltMod(e.altKey);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [visible, hideRadialMenu]);

  const handleAddParent = useCallback(() => {
    if (!target || !targetId) return;

    const childGeneration = target.generation ?? 0;
    const parentGeneration = childGeneration - 1;
    const parentY = target.position.y - GENERATION_SPACING;

    const existingLink = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);
    const union = existingLink ? doc.partnerships[existingLink.parentPartnershipId] : undefined;
    const partners = union ? getPresentPartners(doc.individuals, union) : [];

    // Case A — a 0-partner sibship: add a couple as parents of the whole sibship.
    if (union && partners.length === 0) {
      const childXs = union.childrenIds
        .map((id) => doc.individuals[id])
        .filter(Boolean)
        .map((c) => c.position.x);
      const midX = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      const parent1 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Man, generation: parentGeneration,
        position: { x: midX - PARTNER_SPACING / 2, y: parentY },
      });
      const parent2 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Woman, generation: parentGeneration,
        position: { x: midX + PARTNER_SPACING / 2, y: parentY },
      });
      addParentsToParentlessUnion(parent1, parent2, union.id);
      hideRadialMenu();
      select(parent1.id);
      return;
    }

    // Case B — a 1-partner union: add the missing second parent.
    if (union && partners.length === 1) {
      const existing = partners[0];
      const secondParent = createDefaultIndividual({
        genderIdentity:
          existing.genderIdentity === GenderIdentity.Man ? GenderIdentity.Woman : GenderIdentity.Man,
        generation: existing.generation,
        position: { x: existing.position.x + PARTNER_SPACING, y: existing.position.y },
      });
      fillUnionPartner(secondParent, union.id);
      hideRadialMenu();
      select(secondParent.id);
      return;
    }

    // Two parents already present — nothing to add (also gated in the UI).
    if (union && partners.length >= 2) return;

    // Case C — no parent union: create a fresh couple above the target.
    const parent1 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Man, generation: parentGeneration,
      position: { x: target.position.x - PARTNER_SPACING / 2, y: parentY },
    });
    const parent2 = createDefaultIndividual({
      genderIdentity: GenderIdentity.Woman, generation: parentGeneration,
      position: { x: target.position.x + PARTNER_SPACING / 2, y: parentY },
    });
    const partnership: PartnershipRelationship = {
      id: generateId(), type: RelationshipType.Partnership,
      partner1Id: parent1.id, partner2Id: parent2.id, childrenIds: [target.id],
    };
    const link: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id, childId: target.id,
    };
    addParentsForChild(parent1, parent2, partnership, link, target.id, childGeneration);
    hideRadialMenu();
    select(parent1.id);
  }, [target, targetId, doc, addParentsForChild, addParentsToParentlessUnion, fillUnionPartner, hideRadialMenu, select]);

  const handleAddPartner = useCallback(() => {
    if (!target || !targetId) return;

    // If the target is the sole partner of a 1-partner union, the new partner
    // becomes the co-parent of its existing children.
    const soleUnionId = findPartnerships(doc, targetId).find(
      (id) => getPresentPartners(doc.individuals, doc.partnerships[id]).length === 1,
    );
    if (soleUnionId) {
      const partner = createDefaultIndividual({
        generation: target.generation,
        position: { x: target.position.x + PARTNER_SPACING, y: target.position.y },
      });
      fillUnionPartner(partner, soleUnionId);
      hideRadialMenu();
      select(partner.id);
      showGenderPicker(partner.id);
      return;
    }

    const partner = createDefaultIndividual({
      genderIdentity: GenderIdentity.Unknown,
      generation: target.generation,
      position: {
        x: target.position.x + PARTNER_SPACING,
        y: target.position.y,
      },
    });
    const partnership: PartnershipRelationship = {
      id: generateId(), type: RelationshipType.Partnership,
      partner1Id: target.id, partner2Id: partner.id, childrenIds: [],
    };
    addPartnerToIndividual(partner, partnership);
    hideRadialMenu();
    select(partner.id);
    showGenderPicker(partner.id);
  }, [target, targetId, doc, showGenderPicker, fillUnionPartner, addPartnerToIndividual, hideRadialMenu, select]);

  const handleAddChild = useCallback(() => {
    if (!target || !targetId) return;

    const partnershipIds = findPartnerships(doc, targetId);

    // No union yet: create a 1-partner union with the target as sole parent.
    if (partnershipIds.length === 0) {
      const partnershipId = generateId();
      const child = createDefaultIndividual({
        generation: (target.generation ?? 0) + 1,
        position: { x: target.position.x, y: target.position.y + GENERATION_SPACING },
      });
      const partnership: PartnershipRelationship = {
        id: partnershipId, type: RelationshipType.Partnership,
        partner1Id: target.id, childrenIds: [child.id],
      };
      const link: ParentChildRelationship = {
        id: generateId(), type: RelationshipType.ParentChild,
        parentPartnershipId: partnershipId, childId: child.id,
      };
      addChildViaNewUnion(child, partnership, link);
      hideRadialMenu();
      select(child.id);
      showGenderPicker(child.id);
      return;
    }

    // Multiple unions: which one the child belongs to is ambiguous, so prompt
    // the user to pick rather than silently defaulting to the first in iteration
    // order (issue #97). The union picker adds the child via addChildToUnion.
    if (partnershipIds.length > 1) {
      hideRadialMenu();
      showUnionPicker(targetId);
      return;
    }

    const partnership = doc.partnerships[partnershipIds[0]];
    if (!partnership) return;

    hideRadialMenu();
    addChildToUnion(doc, target, partnership);
  }, [target, targetId, doc, showGenderPicker, showUnionPicker, addChildViaNewUnion, hideRadialMenu, select]);

  // Hold ⌥ over Child: add a pair of twin CHILDREN. Because the target is the
  // parent (not a co-twin), a twin child can only exist as two new siblings born
  // together — so this mirrors handleAddChild's union resolution but creates a
  // pair grouped by zygosity rather than a single child.
  const handleAddChildTwin = useCallback((twinType: TwinType) => {
    if (!target || !targetId) return;

    const partnershipIds = findPartnerships(doc, targetId);

    // No union yet: create a 1-partner union with the target as sole parent
    // holding both twins.
    if (partnershipIds.length === 0) {
      const { children, links, partnership, twinGroup } = buildTwinChildrenViaNewUnion(
        target,
        twinType,
      );
      addTwinChildren(children, links, twinGroup, partnership);
      hideRadialMenu();
      select(children[0].id);
      showGenderPicker(children[0].id);
      return;
    }

    // Multiple unions: which one the twins belong to is ambiguous, so defer to
    // the union picker (carrying the twin intent) — same as single Add Child.
    if (partnershipIds.length > 1) {
      hideRadialMenu();
      showUnionPicker(targetId, twinType);
      return;
    }

    const partnership = doc.partnerships[partnershipIds[0]];
    if (!partnership) return;

    hideRadialMenu();
    addTwinChildrenToUnion(doc, target, partnership, twinType);
  }, [target, targetId, doc, showGenderPicker, showUnionPicker, addTwinChildren, hideRadialMenu, select]);

  const handleAddSibling = useCallback(() => {
    if (!target || !targetId) return;

    const parentLink = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);

    // Has real parents (or a single parent): add another child to that union.
    if (parentLink) {
      const partnership = doc.partnerships[parentLink.parentPartnershipId];
      if (!partnership) return;
      const siblings = partnership.childrenIds
        .map((id) => doc.individuals[id])
        .filter(Boolean);
      const maxX = Math.max(...siblings.map((s) => s.position.x));
      const sibling = createDefaultIndividual({
        generation: target.generation,
        position: { x: maxX + SIBLING_SPACING, y: target.position.y },
      });
      const link: ParentChildRelationship = {
        id: generateId(), type: RelationshipType.ParentChild,
        parentPartnershipId: partnership.id, childId: sibling.id,
      };
      addChildToFamily(sibling, partnership.id, link);
      hideRadialMenu();
      select(sibling.id);
      showGenderPicker(sibling.id);
      return;
    }

    // No parents: create a 0-partner sibship holding the target and the new sibling.
    const partnershipId = generateId();
    const sibling = createDefaultIndividual({
      genderIdentity: GenderIdentity.Unknown,
      generation: target.generation,
      position: { x: target.position.x + SIBLING_SPACING, y: target.position.y },
    });
    const partnership: PartnershipRelationship = {
      id: partnershipId, type: RelationshipType.Partnership,
      childrenIds: [target.id, sibling.id],
    };
    const targetLink: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId, childId: target.id,
    };
    const siblingLink: ParentChildRelationship = {
      id: generateId(), type: RelationshipType.ParentChild,
      parentPartnershipId: partnershipId, childId: sibling.id,
    };
    addSiblingViaNewUnion(target, sibling, partnership, targetLink, siblingLink);
    hideRadialMenu();
    select(sibling.id);
    showGenderPicker(sibling.id);
  }, [target, targetId, doc, showGenderPicker, addChildToFamily, addSiblingViaNewUnion, hideRadialMenu, select]);

  const handleAddTwin = useCallback((twinType: TwinType) => {
    if (!target || !targetId) return;
    hideRadialMenu();
    // Shared with the gender popup's "make twins" section (addTwin.ts) so both
    // routes create an identical twin structure.
    addTwinOf(doc, target, twinType);
  }, [target, targetId, doc, hideRadialMenu]);

  if (!visible || !target || editingLocked || genderPicker.targetId) return null;

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
          className={clsx(styles.option, styles.top, !canAddParents && styles.disabled)}
          onClick={canAddParents ? handleAddParent : undefined}
          title={canAddParents ? 'Add Parents' : 'Both parents already added'}
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
          className={clsx(styles.option, styles.bottom, altMod && styles.altActive)}
          onClick={handleAddChild}
          title="Add Child (hold ⌥ for MZ / DZ twin children)"
        >
          Child
        </button>
        <button
          className={clsx(styles.option, styles.bottomLeft, altMod && styles.altActive)}
          onClick={() => handleAddChildTwin(TwinType.Monozygotic)}
          title="Add Monozygotic (MZ) twin children"
        >
          MZ
        </button>
        <button
          className={clsx(styles.option, styles.bottomRight, altMod && styles.altActive)}
          onClick={() => handleAddChildTwin(TwinType.Dizygotic)}
          title="Add Dizygotic (DZ) twin children"
        >
          DZ
        </button>
        <button
          className={clsx(styles.option, styles.left, altMod && styles.altActive)}
          onClick={handleAddSibling}
          title="Add Sibling (hold ⌥ for MZ / DZ twin)"
        >
          Sibling
        </button>
        <button
          className={clsx(styles.option, styles.leftUpper, altMod && styles.altActive)}
          onClick={() => handleAddTwin(TwinType.Monozygotic)}
          title="Add Monozygotic twin (MZ)"
        >
          MZ
        </button>
        <button
          className={clsx(styles.option, styles.leftLower, altMod && styles.altActive)}
          onClick={() => handleAddTwin(TwinType.Dizygotic)}
          title="Add Dizygotic twin (DZ)"
        >
          DZ
        </button>
      </div>
    </div>
  );
}
