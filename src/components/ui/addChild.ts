import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { getPresentPartners } from '../../utils/graphTraversal';
import { generateId } from '../../utils/idGenerator';
import { RelationshipType, GenderIdentity } from '../../types/enums';
import { GENERATION_SPACING, SIBLING_SPACING } from '../../utils/constants';
import type {
  Individual,
  ParentChildRelationship,
  PartnershipRelationship,
  PedigreeDocument,
} from '../../types/pedigree';

/**
 * Build the new child individual and its parent-child link for adding a child
 * under an EXISTING union, without touching any store.
 *
 * The child is created Unknown so the inline gender picker can prompt for it,
 * anchored under the average x of whichever partners are present (falling back
 * to the target's x for a partnerless sibship) and offset by the existing
 * children so siblings fan out rather than stack. Pure so it can be unit-tested
 * (react-konva/jsdom can't render the components that consume it — see CLAUDE.md).
 */
export function buildChildForUnion(
  doc: PedigreeDocument,
  target: Individual,
  partnership: PartnershipRelationship,
): { child: Individual; link: ParentChildRelationship } {
  const partners = getPresentPartners(doc.individuals, partnership);
  const midX = partners.length
    ? partners.reduce((s, p) => s + p.position.x, 0) / partners.length
    : target.position.x;
  const existingChildren = partnership.childrenIds.length;

  // Anchor the child a full generation below the union's LOWEST (most-descendant)
  // partner, not below whichever partner the menu was opened on. For a
  // cross-generation union (e.g. consanguineous aunt/uncle × niece/nephew) the
  // partners live on different rows, so deriving from `target` would place the
  // child on the same row as the lower partner when initiated from the upper one.
  // Fall back to the target when the union has no present partners (a 0-partner
  // sibship), where there is no cross-generation ambiguity.
  const lowestPartnerGeneration = partners.length
    ? Math.max(...partners.map((p) => p.generation ?? 0))
    : target.generation ?? 0;
  const lowestPartnerY = partners.length
    ? Math.max(...partners.map((p) => p.position.y))
    : target.position.y;

  const child = createDefaultIndividual({
    genderIdentity: GenderIdentity.Unknown,
    generation: lowestPartnerGeneration + 1,
    position: {
      x: midX + existingChildren * SIBLING_SPACING,
      y: lowestPartnerY + GENERATION_SPACING,
    },
  });
  const link: ParentChildRelationship = {
    id: generateId(),
    type: RelationshipType.ParentChild,
    parentPartnershipId: partnership.id,
    childId: child.id,
  };
  return { child, link };
}

/**
 * Add a child under a SPECIFIC existing union and open the inline gender picker
 * on it. Shared by the radial menu's single-union Add Child path and the union
 * picker's per-union choice, so both routes place the child identically — the
 * only difference is how the union was chosen.
 */
export function addChildToUnion(
  doc: PedigreeDocument,
  target: Individual,
  partnership: PartnershipRelationship,
): void {
  const { child, link } = buildChildForUnion(doc, target, partnership);
  usePedigreeStore.getState().addChildToFamily(child, partnership.id, link);
  useUIStore.getState().select(child.id);
  useUIStore.getState().showGenderPicker(child.id);
}
