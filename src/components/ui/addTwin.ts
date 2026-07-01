import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity, TwinType } from '../../types/enums';
import { SIBLING_SPACING } from '../../utils/constants';
import type {
  Individual,
  ParentChildRelationship,
  PartnershipRelationship,
  PedigreeDocument,
  TwinGroup,
} from '../../types/pedigree';

/**
 * Whether `individualId` already belongs to a twin group. Callers use this to
 * hide/disable a "make twins" affordance so a person can't be double-grouped.
 */
export function isTwin(doc: PedigreeDocument, individualId: string): boolean {
  return Object.values(doc.twinGroups).some((g) => g.individualIds.includes(individualId));
}

/**
 * Create a twin OF an existing individual: a new sibling sharing the target's
 * parent union (or a fresh 0-partner sibship when the target has no parents),
 * grouped with the target as MZ/DZ twins. Selects the new twin and opens the
 * inline gender picker on it.
 *
 * Shared by the radial menu's ⌥ twin split and the gender popup's "make twins"
 * section so both routes produce an identical structure — the new twin created
 * Unknown for the picker, placed to the right of the last sibling, in the two
 * store writes (add + group) the existing flow already uses.
 */
export function addTwinOf(
  doc: PedigreeDocument,
  target: Individual,
  twinType: TwinType,
): void {
  const pedigree = usePedigreeStore.getState();
  const ui = useUIStore.getState();
  const parentLink = Object.values(doc.parentChildLinks).find((l) => l.childId === target.id);

  if (parentLink) {
    const partnership = doc.partnerships[parentLink.parentPartnershipId];
    if (!partnership) return;
    const siblings = partnership.childrenIds.map((id) => doc.individuals[id]).filter(Boolean);
    const maxX = Math.max(...siblings.map((s) => s.position.x));
    const twin = createDefaultIndividual({
      generation: target.generation,
      position: { x: maxX + SIBLING_SPACING, y: target.position.y },
    });
    const link: ParentChildRelationship = {
      id: generateId(),
      type: RelationshipType.ParentChild,
      parentPartnershipId: partnership.id,
      childId: twin.id,
    };
    const twinGroup: TwinGroup = {
      id: generateId(),
      twinType,
      individualIds: [target.id, twin.id],
      parentPartnershipId: partnership.id,
    };
    pedigree.addChildToFamily(twin, partnership.id, link);
    pedigree.addTwinGroup(twinGroup);
    ui.select(twin.id);
    ui.showGenderPicker(twin.id);
    return;
  }

  // No parents: create a 0-partner sibship holding the pair, then group them.
  const partnershipId = generateId();
  const twin = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: target.generation,
    position: { x: target.position.x + SIBLING_SPACING, y: target.position.y },
  });
  const partnership: PartnershipRelationship = {
    id: partnershipId,
    type: RelationshipType.Partnership,
    childrenIds: [target.id, twin.id],
  };
  const targetLink: ParentChildRelationship = {
    id: generateId(),
    type: RelationshipType.ParentChild,
    parentPartnershipId: partnershipId,
    childId: target.id,
  };
  const siblingLink: ParentChildRelationship = {
    id: generateId(),
    type: RelationshipType.ParentChild,
    parentPartnershipId: partnershipId,
    childId: twin.id,
  };
  const twinGroup: TwinGroup = {
    id: generateId(),
    twinType,
    individualIds: [target.id, twin.id],
    parentPartnershipId: partnershipId,
  };
  pedigree.addSiblingViaNewUnion(target, twin, partnership, targetLink, siblingLink);
  pedigree.addTwinGroup(twinGroup);
  ui.select(twin.id);
  ui.showGenderPicker(twin.id);
}
