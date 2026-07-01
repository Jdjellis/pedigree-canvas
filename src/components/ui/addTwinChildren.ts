import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { getPresentPartners } from '../../utils/graphTraversal';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity, TwinType } from '../../types/enums';
import { GENERATION_SPACING, SIBLING_SPACING } from '../../utils/constants';
import type {
  Individual,
  ParentChildRelationship,
  PartnershipRelationship,
  PedigreeDocument,
  TwinGroup,
} from '../../types/pedigree';

/** A built pair of twin children plus the group that binds them. */
interface BuiltTwinChildren {
  children: Individual[];
  links: ParentChildRelationship[];
  twinGroup: TwinGroup;
}

/**
 * Build TWO new children who are twins of each other under an EXISTING union,
 * without touching any store. The mirror of {@link buildChildForUnion} for the
 * "hold ⌥ over Child" flow: because the menu target is the parent (not a
 * co-twin), a twin child can only be created as a pair of new siblings born
 * together.
 *
 * Both are created Unknown so the inline gender picker can prompt for the first,
 * anchored under the union's present partners (falling back to the target's x
 * for a partnerless sibship) and offset past the existing children so they fan
 * out rather than stack. Pure so it can be unit-tested (react-konva/jsdom can't
 * render the components that consume it — see CLAUDE.md).
 */
export function buildTwinChildrenForUnion(
  doc: PedigreeDocument,
  target: Individual,
  partnership: PartnershipRelationship,
  twinType: TwinType,
): BuiltTwinChildren {
  const partners = getPresentPartners(doc.individuals, partnership);
  const midX = partners.length
    ? partners.reduce((s, p) => s + p.position.x, 0) / partners.length
    : target.position.x;
  const existingChildren = partnership.childrenIds.length;

  // Anchor a full generation below the union's LOWEST partner, matching
  // buildChildForUnion so cross-generation unions place twins correctly.
  const lowestPartnerGeneration = partners.length
    ? Math.max(...partners.map((p) => p.generation ?? 0))
    : target.generation ?? 0;
  const lowestPartnerY = partners.length
    ? Math.max(...partners.map((p) => p.position.y))
    : target.position.y;

  const childGeneration = lowestPartnerGeneration + 1;
  const childY = lowestPartnerY + GENERATION_SPACING;

  const first = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: childGeneration,
    position: { x: midX + existingChildren * SIBLING_SPACING, y: childY },
  });
  const second = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: childGeneration,
    position: { x: midX + (existingChildren + 1) * SIBLING_SPACING, y: childY },
  });

  return assembleTwins([first, second], partnership.id, twinType);
}

/** A built pair of twin children plus the fresh union they hang under. */
interface BuiltTwinChildrenViaNewUnion extends BuiltTwinChildren {
  partnership: PartnershipRelationship;
}

/**
 * Build TWO new twin children under a BRAND-NEW 1-partner union with `target` as
 * the sole parent — the "hold ⌥ over Child" path when the target has no union
 * yet. Mirrors the partnerless branch of the radial menu's single-child add.
 */
export function buildTwinChildrenViaNewUnion(
  target: Individual,
  twinType: TwinType,
): BuiltTwinChildrenViaNewUnion {
  const partnershipId = generateId();
  const childGeneration = (target.generation ?? 0) + 1;
  const childY = target.position.y + GENERATION_SPACING;

  const first = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: childGeneration,
    position: { x: target.position.x - SIBLING_SPACING / 2, y: childY },
  });
  const second = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: childGeneration,
    position: { x: target.position.x + SIBLING_SPACING / 2, y: childY },
  });

  const partnership: PartnershipRelationship = {
    id: partnershipId,
    type: RelationshipType.Partnership,
    partner1Id: target.id,
    childrenIds: [first.id, second.id],
  };

  return { ...assembleTwins([first, second], partnershipId, twinType), partnership };
}

/** Wire the built children to a union with parent-child links + a twin group. */
function assembleTwins(
  children: Individual[],
  partnershipId: string,
  twinType: TwinType,
): BuiltTwinChildren {
  const links: ParentChildRelationship[] = children.map((child) => ({
    id: generateId(),
    type: RelationshipType.ParentChild,
    parentPartnershipId: partnershipId,
    childId: child.id,
  }));
  const twinGroup: TwinGroup = {
    id: generateId(),
    twinType,
    individualIds: children.map((c) => c.id),
    parentPartnershipId: partnershipId,
  };
  return { children, links, twinGroup };
}

/**
 * Add twin children under a SPECIFIC existing union and open the inline gender
 * picker on the first one. Shared by the radial menu's single-union path and the
 * union picker's per-union choice, so both routes place the twins identically —
 * the mirror of {@link addChildToUnion}.
 */
export function addTwinChildrenToUnion(
  doc: PedigreeDocument,
  target: Individual,
  partnership: PartnershipRelationship,
  twinType: TwinType,
): void {
  const { children, links, twinGroup } = buildTwinChildrenForUnion(
    doc,
    target,
    partnership,
    twinType,
  );
  usePedigreeStore.getState().addTwinChildren(children, links, twinGroup, null);
  useUIStore.getState().select(children[0].id);
  useUIStore.getState().showGenderPicker(children[0].id);
}
