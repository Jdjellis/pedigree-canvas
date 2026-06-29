import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  PedigreeDocument,
  PedigreeMetadata,
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
  TextAnnotation,
  Position,
  LegendEntry,
} from '../types/pedigree';
import {
  GenderIdentity,
  VitalStatus,
} from '../types/enums';
import { generateId } from '../utils/idGenerator';
import { genderForSex, type DefaultSex } from '../utils/sex';
import {
  computeTreeLayout,
  findRootUnion,
  DEFAULT_LAYOUT_SPACING,
  type LayoutDoc,
} from '../utils/treeLayout';

/**
 * Apply id -> {x,y} position changes immutably; untouched individuals are kept.
 * Returns the original map when there is nothing to apply.
 */
function applyPositions(
  individuals: Record<string, Individual>,
  positions: Record<string, { x: number; y: number }>,
): Record<string, Individual> {
  if (Object.keys(positions).length === 0) return individuals;
  const next: Record<string, Individual> = { ...individuals };
  for (const [id, pos] of Object.entries(positions)) {
    const ind = next[id];
    if (!ind) continue;
    next[id] = { ...ind, position: { x: pos.x, y: pos.y } };
  }
  return next;
}

/**
 * Re-tidy the connected blood family containing `anchorId`: find its root union,
 * run the deterministic layout, and return a new individuals map with the moves
 * applied. A no-op (returns the same map) when the anchor has no blood-family
 * union with children.
 */
function relayoutFamily(
  doc: LayoutDoc,
  anchorId: string,
): Record<string, Individual> {
  const rootUnion = findRootUnion(doc, anchorId);
  if (!rootUnion) return doc.individuals;
  const positions = computeTreeLayout(doc, rootUnion, DEFAULT_LAYOUT_SPACING);
  return applyPositions(doc.individuals, positions);
}

/** Build an empty PedigreeDocument with sensible defaults. */
export function createDefaultDocument(): PedigreeDocument {
  return {
    metadata: {
      id: generateId(),
      title: 'Untitled Pedigree',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0',
    },
    individuals: {},
    partnerships: {},
    parentChildLinks: {},
    twinGroups: {},
    textAnnotations: {},
    generationOrder: [],
    legendConfig: { entries: [], position: { x: 50, y: 50 } },
  };
}

export function createDefaultIndividual(
  overrides: Partial<Individual> = {}
): Individual {
  return {
    id: generateId(),
    genderIdentity: GenderIdentity.Unknown,
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 0, y: 0 },
    annotations: [],
    ...overrides,
  };
}

/**
 * Build a fresh document seeded with a single starting person of the given
 * default sex, positioned at `position` (canvas coordinates). The seed is NOT
 * the proband. Used whenever the user starts a new pedigree.
 *
 * @param sex - The default sex for the seeded person.
 * @param position - Canvas-space position; defaults to the origin.
 * @returns A new document containing exactly one individual.
 */
export function createSeededDocument(
  sex: DefaultSex,
  position: { x: number; y: number } = { x: 0, y: 0 },
): PedigreeDocument {
  const doc = createDefaultDocument();
  const seed = createDefaultIndividual({
    genderIdentity: genderForSex(sex),
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  });
  doc.individuals[seed.id] = seed;
  return doc;
}

interface PedigreeState {
  document: PedigreeDocument;

  // Individual actions
  addIndividual: (individual: Individual) => void;
  updateIndividual: (id: string, patch: Partial<Individual>) => void;
  removeIndividual: (id: string) => void;
  moveIndividual: (id: string, position: Position) => void;
  /** Commit a drag: set the dropped position, then re-tidy the family (one undo step). */
  commitDragWithRelayout: (id: string, position: Position) => void;

  // Partnership actions
  addPartnership: (partnership: PartnershipRelationship) => void;
  removePartnership: (id: string) => void;
  addChildToPartnership: (
    partnershipId: string,
    childId: string
  ) => void;
  removeChildFromPartnership: (
    partnershipId: string,
    childId: string
  ) => void;
  updatePartnership: (
    id: string,
    patch: Partial<PartnershipRelationship>
  ) => void;

  // Parent-child link actions
  addParentChildLink: (link: ParentChildRelationship) => void;
  removeParentChildLink: (id: string) => void;

  // Twin group actions
  addTwinGroup: (tg: TwinGroup) => void;
  updateTwinGroup: (id: string, patch: Partial<TwinGroup>) => void;
  removeTwinGroup: (id: string) => void;

  // Text annotation actions
  addTextAnnotation: (annotation: TextAnnotation) => void;
  updateTextAnnotation: (id: string, patch: Partial<TextAnnotation>) => void;
  removeTextAnnotation: (id: string) => void;

  // Compound / atomic family actions (each produces one undo step)
  addParentsForChild: (
    parent1: Individual,
    parent2: Individual,
    partnership: PartnershipRelationship,
    link: ParentChildRelationship,
    childId: string,
    childGeneration: number
  ) => void;
  addPartnerToIndividual: (
    partner: Individual,
    partnership: PartnershipRelationship,
  ) => void;
  addChildToFamily: (
    child: Individual,
    partnershipId: string,
    link: ParentChildRelationship,
  ) => void;
  addSiblingViaNewUnion: (
    target: Individual,
    sibling: Individual,
    partnership: PartnershipRelationship,
    targetLink: ParentChildRelationship,
    siblingLink: ParentChildRelationship,
  ) => void;
  addChildViaNewUnion: (
    child: Individual,
    partnership: PartnershipRelationship,
    link: ParentChildRelationship,
  ) => void;
  fillUnionPartner: (partner: Individual, partnershipId: string) => void;
  addParentsToParentlessUnion: (
    parent1: Individual,
    parent2: Individual,
    partnershipId: string,
  ) => void;

  // Legend actions
  addLegendEntry: (entry: LegendEntry) => void;
  updateLegendEntry: (id: string, patch: Partial<LegendEntry>) => void;
  removeLegendEntry: (id: string) => void;
  moveLegend: (position: Position) => void;

  // Document actions
  setDocument: (doc: PedigreeDocument) => void;
  resetDocument: () => void;
  updateMetadata: (patch: Partial<PedigreeMetadata>) => void;
}

type PartializedState = Pick<PedigreeState, 'document'>;

export const usePedigreeStore = create<PedigreeState>()(
  temporal(
    (set) => ({
      document: createDefaultDocument(),

      addIndividual: (individual) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            individuals: {
              ...state.document.individuals,
              [individual.id]: individual,
            },
          },
        })),

      updateIndividual: (id, patch) =>
        set((state) => {
          const existing = state.document.individuals[id];
          if (!existing) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals: {
                ...state.document.individuals,
                [id]: { ...existing, ...patch },
              },
            },
          };
        }),

      removeIndividual: (id) =>
        set((state) => {
          const { [id]: _, ...remainingIndividuals } =
            state.document.individuals;

          // Detach this individual from every union it touches, but keep the
          // union itself wherever it still depicts something. Clearing a
          // parent's slot (rather than deleting the union) lets the children
          // keep their sibship: with one parent left they drop to that single
          // parent; with both parents gone they keep the bare sibship bar
          // joining the siblings. A union is pruned only once it has fewer than
          // two partners AND no children — i.e. it would draw neither a couple
          // line nor a sibship.
          const remainingPartnerships: Record<
            string,
            PartnershipRelationship
          > = {};
          for (const [pId, p] of Object.entries(
            state.document.partnerships
          )) {
            const partner1Id = p.partner1Id === id ? undefined : p.partner1Id;
            const partner2Id = p.partner2Id === id ? undefined : p.partner2Id;
            const childrenIds = p.childrenIds.filter((cId) => cId !== id);

            const partnerCount = (partner1Id ? 1 : 0) + (partner2Id ? 1 : 0);
            if (partnerCount < 2 && childrenIds.length === 0) continue;

            remainingPartnerships[pId] = {
              ...p,
              partner1Id,
              partner2Id,
              childrenIds,
            };
          }

          // Remove parent-child links involving this individual
          const remainingLinks: Record<string, ParentChildRelationship> =
            {};
          for (const [lId, link] of Object.entries(
            state.document.parentChildLinks
          )) {
            if (link.childId === id) continue;
            // Also remove links referencing deleted partnerships
            if (!remainingPartnerships[link.parentPartnershipId])
              continue;
            remainingLinks[lId] = link;
          }

          // Remove from twin groups
          const remainingTwinGroups: Record<string, TwinGroup> = {};
          for (const [tId, tg] of Object.entries(
            state.document.twinGroups
          )) {
            const filtered = tg.individualIds.filter(
              (iId) => iId !== id
            );
            if (filtered.length >= 2) {
              remainingTwinGroups[tId] = {
                ...tg,
                individualIds: filtered,
              };
            }
          }

          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals: remainingIndividuals,
              partnerships: remainingPartnerships,
              parentChildLinks: remainingLinks,
              twinGroups: remainingTwinGroups,
              generationOrder: state.document.generationOrder.map((gen) =>
                gen.filter((gId) => gId !== id)
              ),
            },
          };
        }),

      moveIndividual: (id, position) =>
        set((state) => {
          const existing = state.document.individuals[id];
          if (!existing) return state;
          return {
            document: {
              ...state.document,
              individuals: {
                ...state.document.individuals,
                [id]: { ...existing, position },
              },
            },
          };
        }),

      commitDragWithRelayout: (id, position) =>
        set((state) => {
          const existing = state.document.individuals[id];
          if (!existing) return state;
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [id]: { ...existing, position },
          };
          individuals = relayoutFamily(
            {
              individuals,
              partnerships: state.document.partnerships,
              parentChildLinks: state.document.parentChildLinks,
            },
            id,
          );
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
            },
          };
        }),

      addPartnership: (partnership) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            partnerships: {
              ...state.document.partnerships,
              [partnership.id]: partnership,
            },
          },
        })),

      removePartnership: (id) =>
        set((state) => {
          const { [id]: _, ...remaining } = state.document.partnerships;

          // Remove parent-child links referencing this partnership
          const remainingLinks: Record<string, ParentChildRelationship> =
            {};
          for (const [lId, link] of Object.entries(
            state.document.parentChildLinks
          )) {
            if (link.parentPartnershipId !== id) {
              remainingLinks[lId] = link;
            }
          }

          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              partnerships: remaining,
              parentChildLinks: remainingLinks,
            },
          };
        }),

      addChildToPartnership: (partnershipId, childId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              partnerships: {
                ...state.document.partnerships,
                [partnershipId]: {
                  ...partnership,
                  childrenIds: [...partnership.childrenIds, childId],
                },
              },
            },
          };
        }),

      removeChildFromPartnership: (partnershipId, childId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              partnerships: {
                ...state.document.partnerships,
                [partnershipId]: {
                  ...partnership,
                  childrenIds: partnership.childrenIds.filter(
                    (id) => id !== childId
                  ),
                },
              },
            },
          };
        }),

      updatePartnership: (id, patch) =>
        set((state) => {
          const partnership = state.document.partnerships[id];
          if (!partnership) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              partnerships: {
                ...state.document.partnerships,
                [id]: { ...partnership, ...patch },
              },
            },
          };
        }),

      addParentChildLink: (link) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            parentChildLinks: {
              ...state.document.parentChildLinks,
              [link.id]: link,
            },
          },
        })),

      removeParentChildLink: (id) =>
        set((state) => {
          const { [id]: _, ...remaining } =
            state.document.parentChildLinks;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              parentChildLinks: remaining,
            },
          };
        }),

      addTwinGroup: (tg) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            twinGroups: {
              ...state.document.twinGroups,
              [tg.id]: tg,
            },
          },
        })),

      updateTwinGroup: (id, patch) =>
        set((state) => {
          const existing = state.document.twinGroups[id];
          if (!existing) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              twinGroups: {
                ...state.document.twinGroups,
                [id]: { ...existing, ...patch },
              },
            },
          };
        }),

      removeTwinGroup: (id) =>
        set((state) => {
          const { [id]: _, ...remaining } = state.document.twinGroups;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              twinGroups: remaining,
            },
          };
        }),

      addTextAnnotation: (annotation) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            textAnnotations: {
              ...state.document.textAnnotations,
              [annotation.id]: annotation,
            },
          },
        })),

      updateTextAnnotation: (id, patch) =>
        set((state) => {
          const existing = state.document.textAnnotations[id];
          if (!existing) return state;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              textAnnotations: {
                ...state.document.textAnnotations,
                [id]: { ...existing, ...patch },
              },
            },
          };
        }),

      removeTextAnnotation: (id) =>
        set((state) => {
          const { [id]: _, ...remaining } = state.document.textAnnotations;
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              textAnnotations: remaining,
            },
          };
        }),

      addParentsForChild: (parent1, parent2, partnership, link, childId, childGeneration) =>
        set((state) => {
          const existing = state.document.individuals[childId];
          if (!existing) return state;
          // Insert the parents and pin the child's generation. Build the full
          // updated doc slices first so relayoutFamily sees the new link.
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [parent1.id]: parent1,
            [parent2.id]: parent2,
            [childId]: { ...existing, generation: childGeneration },
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          const parentChildLinks = {
            ...state.document.parentChildLinks,
            [link.id]: link,
          };
          // Re-tidy the whole blood family so parents are centred over their
          // children. The add and the layout share this one `set` so a single
          // undo reverts the whole operation.
          individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, childId);
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals,
              partnerships,
              parentChildLinks,
            },
          };
        }),

      addPartnerToIndividual: (partner, partnership) =>
        set((state) => {
          // Insert the partner and the new union, then re-tidy the blood family
          // rooted at the EXISTING target individual (not the new partner).
          // The new partner has no parents and the new partnership is childless,
          // so findRootUnion(partner.id) returns null and no layout would run.
          // Anchoring on the target traverses up to the family root so real
          // siblings are pushed clear of the incoming partner.
          // The insert and the layout share this one `set` so a single undo
          // reverts both.
          const targetId =
            partnership.partner1Id === partner.id
              ? partnership.partner2Id
              : partnership.partner1Id;
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [partner.id]: partner,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          individuals = relayoutFamily(
            { individuals, partnerships, parentChildLinks: state.document.parentChildLinks },
            targetId ?? partner.id,
          );
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals,
              partnerships,
            },
          };
        }),

      addChildToFamily: (child, partnershipId, link) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;
          const updatedPartnership = {
            ...partnership,
            childrenIds: [...partnership.childrenIds, child.id],
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnershipId]: updatedPartnership,
          };
          const parentChildLinks = {
            ...state.document.parentChildLinks,
            [link.id]: link,
          };
          // Insert the child, then re-tidy the whole blood family so the parents
          // are re-centred over the full sibling row. The link is included in the
          // doc slice so relayoutFamily can traverse up to the root union. The
          // insert and the layout share this one `set` so a single undo reverts both.
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [child.id]: child,
          };
          individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, child.id);
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals,
              partnerships,
              parentChildLinks,
            },
          };
        }),

      addSiblingViaNewUnion: (_target, sibling, partnership, targetLink, siblingLink) =>
        set((state) => {
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [sibling.id]: sibling,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          const parentChildLinks = {
            ...state.document.parentChildLinks,
            [targetLink.id]: targetLink,
            [siblingLink.id]: siblingLink,
          };
          individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, sibling.id);
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
              parentChildLinks,
            },
          };
        }),

      addChildViaNewUnion: (child, partnership, link) =>
        set((state) => {
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [child.id]: child,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnership.id]: partnership,
          };
          const parentChildLinks = {
            ...state.document.parentChildLinks,
            [link.id]: link,
          };
          individuals = relayoutFamily({ individuals, partnerships, parentChildLinks }, child.id);
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
              parentChildLinks,
            },
          };
        }),

      fillUnionPartner: (partner, partnershipId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;

          const updatedPartnership = !partnership.partner1Id
            ? { ...partnership, partner1Id: partner.id }
            : { ...partnership, partner2Id: partner.id };

          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [partner.id]: partner,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnershipId]: updatedPartnership,
          };
          // Both slots are now filled; re-tidy the family so the couple is
          // centred over their children.
          individuals = relayoutFamily(
            { individuals, partnerships, parentChildLinks: state.document.parentChildLinks },
            partner.id,
          );
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
            },
          };
        }),

      addParentsToParentlessUnion: (parent1, parent2, partnershipId) =>
        set((state) => {
          const partnership = state.document.partnerships[partnershipId];
          if (!partnership) return state;

          const updatedPartnership = {
            ...partnership,
            partner1Id: parent1.id,
            partner2Id: parent2.id,
          };
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [parent1.id]: parent1,
            [parent2.id]: parent2,
          };
          const partnerships = {
            ...state.document.partnerships,
            [partnershipId]: updatedPartnership,
          };
          // Re-tidy the family so the new parents are centred over their children.
          individuals = relayoutFamily(
            { individuals, partnerships, parentChildLinks: state.document.parentChildLinks },
            parent1.id,
          );
          return {
            document: {
              ...state.document,
              metadata: { ...state.document.metadata, updatedAt: new Date().toISOString() },
              individuals,
              partnerships,
            },
          };
        }),

      addLegendEntry: (entry) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            legendConfig: {
              ...state.document.legendConfig,
              entries: [...state.document.legendConfig.entries, entry],
            },
          },
        })),

      updateLegendEntry: (id, patch) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              updatedAt: new Date().toISOString(),
            },
            legendConfig: {
              ...state.document.legendConfig,
              entries: state.document.legendConfig.entries.map((e) =>
                e.id === id ? { ...e, ...patch } : e,
              ),
            },
          },
        })),

      removeLegendEntry: (id) =>
        set((state) => {
          // Remove from legend and cascade-remove from all individuals
          const updatedIndividuals: Record<string, Individual> = {};
          for (const [iId, ind] of Object.entries(
            state.document.individuals,
          )) {
            updatedIndividuals[iId] = {
              ...ind,
              conditionIds: ind.conditionIds.filter((cId) => cId !== id),
            };
          }

          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals: updatedIndividuals,
              legendConfig: {
                ...state.document.legendConfig,
                entries: state.document.legendConfig.entries.filter(
                  (e) => e.id !== id,
                ),
              },
            },
          };
        }),

      moveLegend: (position) =>
        set((state) => ({
          document: {
            ...state.document,
            legendConfig: {
              ...state.document.legendConfig,
              position,
            },
          },
        })),

      setDocument: (doc) => set({ document: doc }),

      resetDocument: () => set({ document: createDefaultDocument() }),

      updateMetadata: (patch) =>
        set((state) => ({
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        })),
    }),
    {
      partialize: (state): PartializedState => ({
        document: state.document,
      }),
      limit: 100,
    }
  )
);
