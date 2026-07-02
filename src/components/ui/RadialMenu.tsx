import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { getPresentPartners, findPartnerships } from '../../utils/graphTraversal';
import { addChildToUnion } from './addChild';
import { addTwinChildrenToUnion, buildTwinChildrenViaNewUnion } from './addTwinChildren';
import { addTwinOf } from './addTwin';
import { featureFlags } from '../../config/featureFlags';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity, TwinType } from '../../types/enums';
import { PARTNER_SPACING, GENERATION_SPACING, SIBLING_SPACING } from '../../utils/constants';
import type { PartnershipRelationship, ParentChildRelationship } from '../../types/pedigree';
import styles from './RadialMenu.module.css';
import clsx from 'clsx';

/**
 * A tiny persistent ⌥ badge shown on the Sibling and Child buttons, advertising
 * the "hold ⌥ for twins" shortcut at a glance. Aria-hidden so the button keeps
 * its plain accessible name ("Sibling"/"Child") — the `title` stays the
 * screen-reader affordance — and it fades out with its button once ⌥ (or a
 * dwell) reveals the twins.
 */
function TwinBadge() {
  return (
    <span className={styles.altBadge} aria-hidden="true">
      ⌥
    </span>
  );
}

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
  const addParentSet = usePedigreeStore((s) => s.addParentSet);
  const addPartnerToIndividual = usePedigreeStore((s) => s.addPartnerToIndividual);
  const addChildToFamily = usePedigreeStore((s) => s.addChildToFamily);
  const addSiblingViaNewUnion = usePedigreeStore((s) => s.addSiblingViaNewUnion);
  const addChildViaNewUnion = usePedigreeStore((s) => s.addChildViaNewUnion);
  const fillUnionPartner = usePedigreeStore((s) => s.fillUnionPartner);
  const addParentsToParentlessUnion = usePedigreeStore((s) => s.addParentsToParentlessUnion);
  const addTwinChildren = usePedigreeStore((s) => s.addTwinChildren);

  const [altMod, setAltMod] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Twins-discovery via dwell: hovering the Sibling or Child button for ~0.8 s
  // reveals faded "ghost" MZ/DZ options flanking it, so users find twins without
  // knowing about ⌥. `null` = no ghosts shown.
  const [ghostGroup, setGhostGroup] = useState<'sibling' | 'child' | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  // Arm the dwell timer when the pointer enters a group's primary button. A
  // short hide timer (started on leave) is cancelled here so moving between the
  // primary and its ghosts keeps them alive.
  const armGhost = useCallback((group: 'sibling' | 'child') => {
    window.clearTimeout(hideTimer.current);
    setGhostGroup((current) => {
      if (current === group) return current;
      window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => setGhostGroup(group), 800);
      return current;
    });
  }, []);
  // Hovering a revealed ghost keeps the group open (cancels any pending hide).
  const keepGhost = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);
  // Leaving the group: cancel a not-yet-fired dwell and fade the ghosts after a
  // short grace period (so a quick hop primary→ghost doesn't dismiss them).
  const disarmGhost = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setGhostGroup(null), 140);
  }, []);

  // Cancel any pending dwell/hide timers whenever the menu hides, so a reveal
  // can't fire onto a closed menu.
  useEffect(() => {
    if (visible) return;
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  }, [visible]);

  const target = targetId ? doc.individuals[targetId] : null;

  // Derive screen position from the live canvas position + live viewport so the
  // menu tracks pan, zoom, and drag without stale coordinates.
  const screenPosition = target
    ? { x: target.position.x * viewportScale + viewportX, y: target.position.y * viewportScale + viewportY }
    : { x: 0, y: 0 };

  // Add Parents is always available for a real target: with no parents (or an
  // incomplete couple) it fills the first set; with a complete couple it attaches
  // an ADDITIONAL parent set (multi-parentage, #64 — e.g. biological + adoptive).
  const canAddParents = !!targetId;
  // Whether clicking "Parent" will create a second parent set rather than fill
  // the first — drives the button's tooltip so the affordance is discoverable.
  const addsSecondParentSet = (() => {
    if (!targetId) return false;
    const link = Object.values(doc.parentChildLinks).find((l) => l.childId === targetId);
    if (!link) return false;
    const union = doc.partnerships[link.parentPartnershipId];
    if (!union) return false;
    return getPresentPartners(doc.individuals, union).length >= 2;
  })();

  // Tracks Escape (dismiss) and ⌥/Alt (reveal twin split).
  // altMod needs no explicit reset: listeners are torn down on hide, so it
  // can only be true if a live keydown set it. If the user reopens the menu
  // while still holding Alt that's correct — the split shows immediately.
  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGhostGroup(null);
        hideRadialMenu();
      }
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
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts

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

    // Case D — the child already has a complete parent couple: attach a SECOND
    // parent set (multi-parentage, #64 — e.g. a biological couple alongside an
    // adoptive one). Place the new couple one row up, clear to the right of the
    // existing couple so the two descent lines converge on the child without
    // colliding; the new edge defaults to biological (solid) and is switched to
    // adoptive in the properties panel. No relayout — the solver roots on a
    // single parent union, so the placement is explicit.
    if (union && partners.length >= 2) {
      const rightEdge = Math.max(...partners.map((p) => p.position.x));
      const secondMidX = rightEdge + SIBLING_SPACING + PARTNER_SPACING;
      const secondParent1 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Man, generation: parentGeneration,
        position: { x: secondMidX - PARTNER_SPACING / 2, y: parentY },
      });
      const secondParent2 = createDefaultIndividual({
        genderIdentity: GenderIdentity.Woman, generation: parentGeneration,
        position: { x: secondMidX + PARTNER_SPACING / 2, y: parentY },
      });
      const secondPartnership: PartnershipRelationship = {
        id: generateId(), type: RelationshipType.Partnership,
        partner1Id: secondParent1.id, partner2Id: secondParent2.id, childrenIds: [target.id],
      };
      const secondLink: ParentChildRelationship = {
        id: generateId(), type: RelationshipType.ParentChild,
        parentPartnershipId: secondPartnership.id, childId: target.id,
      };
      addParentSet(secondParent1, secondParent2, secondPartnership, secondLink);
      hideRadialMenu();
      select(secondParent1.id);
      return;
    }

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
  }, [target, targetId, doc, addParentsForChild, addParentSet, addParentsToParentlessUnion, fillUnionPartner, hideRadialMenu, select]);

  const handleAddPartner = useCallback(() => {
    if (!target || !targetId) return;
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts

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
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts

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
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts

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
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts

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
    setGhostGroup(null); // clicking closes the menu; drop any dwell-revealed ghosts
    hideRadialMenu();
    // Shared with the gender popup's "make twins" section (addTwin.ts) so both
    // routes create an identical twin structure.
    addTwinOf(doc, target, twinType);
  }, [target, targetId, doc, hideRadialMenu]);

  if (!visible || !target || editingLocked || genderPicker.targetId) return null;

  // A group's ghost twins are revealed either by dwelling on its primary or by
  // holding ⌥ (⌥ reveals both groups at once — the keyboard accelerator for the
  // same ghost preview, replacing the old solid split).
  const siblingRevealed = altMod || ghostGroup === 'sibling';
  const childRevealed = altMod || ghostGroup === 'child';

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
          title={addsSecondParentSet ? 'Add another parent set (e.g. adoptive)' : 'Add Parents'}
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
          className={clsx(styles.option, styles.bottom)}
          onClick={handleAddChild}
          onMouseEnter={() => armGhost('child')}
          onMouseLeave={disarmGhost}
          title="Add Child (hold ⌥ or dwell for MZ / DZ twin children)"
        >
          Child
          {featureFlags.altHint && <TwinBadge />}
        </button>
        <button
          className={clsx(styles.option, styles.bottomLeft, childRevealed && styles.ghostActive)}
          onClick={() => handleAddChildTwin(TwinType.Monozygotic)}
          onMouseEnter={keepGhost}
          onMouseLeave={disarmGhost}
          title="Add Monozygotic (MZ) twin children"
        >
          MZ
        </button>
        <button
          className={clsx(styles.option, styles.bottomRight, childRevealed && styles.ghostActive)}
          onClick={() => handleAddChildTwin(TwinType.Dizygotic)}
          onMouseEnter={keepGhost}
          onMouseLeave={disarmGhost}
          title="Add Dizygotic (DZ) twin children"
        >
          DZ
        </button>
        <button
          className={clsx(styles.option, styles.left)}
          onClick={handleAddSibling}
          onMouseEnter={() => armGhost('sibling')}
          onMouseLeave={disarmGhost}
          title="Add Sibling (hold ⌥ or dwell for MZ / DZ twin)"
        >
          Sibling
          {featureFlags.altHint && <TwinBadge />}
        </button>
        <button
          className={clsx(styles.option, styles.leftUpper, siblingRevealed && styles.ghostActive)}
          onClick={() => handleAddTwin(TwinType.Monozygotic)}
          onMouseEnter={keepGhost}
          onMouseLeave={disarmGhost}
          title="Add Monozygotic twin (MZ)"
        >
          MZ
        </button>
        <button
          className={clsx(styles.option, styles.leftLower, siblingRevealed && styles.ghostActive)}
          onClick={() => handleAddTwin(TwinType.Dizygotic)}
          onMouseEnter={keepGhost}
          onMouseLeave={disarmGhost}
          title="Add Dizygotic twin (DZ)"
        >
          DZ
        </button>
      </div>
    </div>
  );
}
