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
import {
  respaceGenerationWithSubtrees,
  centerParentsOverChildren,
  collectDescendants,
  computeParentClearanceShift,
  makeRoomForPartner,
} from '../utils/respacing';
import { MIN_GENERATION_NODE_SPACING } from '../utils/constants';

/**
 * Return a new individuals map with `moved` (id -> new x) applied immutably.
 * Vertical (y) positions and every individual not in `moved` are left
 * untouched. Returns the original map when there is nothing to move.
 */
function applyMoves(
  individuals: Record<string, Individual>,
  moved: Record<string, number>,
): Record<string, Individual> {
  if (Object.keys(moved).length === 0) return individuals;

  const next: Record<string, Individual> = { ...individuals };
  for (const [id, newX] of Object.entries(moved)) {
    const individual = next[id];
    if (!individual) continue;
    next[id] = {
      ...individual,
      position: { ...individual.position, x: newX },
    };
  }
  return next;
}

/**
 * Return a new individuals map with bounded, subtree-aware respacing applied to
 * the given generation. Overlapping nodes in that generation are pushed apart
 * and each shifted node carries its whole subtree along, so descendants stay
 * aligned. Every other individual is returned untouched.
 *
 * Callers must invoke this on the already-inserted individuals map within the
 * SAME `set(...)` update as the insert, so the add and the nudge collapse into a
 * single zundo history entry (one undo reverts both).
 */
function applyGenerationRespacing(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  generation: number,
): Record<string, Individual> {
  const moved = respaceGenerationWithSubtrees(
    individuals,
    partnerships,
    generation,
    MIN_GENERATION_NODE_SPACING,
  );
  return applyMoves(individuals, moved);
}

/**
 * Shift `rootId` and its whole subtree horizontally by `delta`, returning a new
 * individuals map. Used to keep a node centred under newly added parents while
 * carrying its descendants rigidly along.
 */
function shiftSubtree(
  individuals: Record<string, Individual>,
  partnerships: Record<string, PartnershipRelationship>,
  rootId: string,
  delta: number,
): Record<string, Individual> {
  if (delta === 0) return individuals;

  const moved: Record<string, number> = {};
  const root = individuals[rootId];
  if (root) moved[rootId] = root.position.x + delta;
  for (const descId of collectDescendants(rootId, partnerships)) {
    const descendant = individuals[descId];
    if (descendant) moved[descId] = descendant.position.x + delta;
  }
  return applyMoves(individuals, moved);
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

interface PedigreeState {
  document: PedigreeDocument;

  // Individual actions
  addIndividual: (individual: Individual) => void;
  updateIndividual: (id: string, patch: Partial<Individual>) => void;
  removeIndividual: (id: string) => void;
  moveIndividual: (id: string, position: Position) => void;

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

          // Remove partnerships involving this individual
          const remainingPartnerships: Record<
            string,
            PartnershipRelationship
          > = {};
          for (const [pId, p] of Object.entries(
            state.document.partnerships
          )) {
            if (p.partner1Id === id || p.partner2Id === id) continue;
            remainingPartnerships[pId] = {
              ...p,
              childrenIds: p.childrenIds.filter((cId) => cId !== id),
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
          // Insert the parents (created centred over the child) and pin the
          // child's generation. Everything below shares this one `set` so a
          // single undo reverts the whole operation.
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

          // Slide the new parents clear of the other partner's parents (the
          // child's in-laws), then carry the child and its subtree by the same
          // amount so the child stays centred under its new parents.
          const shift = computeParentClearanceShift(
            individuals,
            state.document.partnerships,
            state.document.parentChildLinks,
            parent1.id,
            parent2.id,
            childId,
            MIN_GENERATION_NODE_SPACING,
          );
          if (shift !== 0) {
            individuals = applyMoves(individuals, {
              [parent1.id]: parent1.position.x + shift,
              [parent2.id]: parent2.position.x + shift,
            });
            individuals = shiftSubtree(individuals, partnerships, childId, shift);
          }

          // Resolve any remaining overlap in the parents' generation, carrying
          // affected subtrees along.
          if (parent1.generation !== undefined) {
            individuals = applyGenerationRespacing(
              individuals,
              partnerships,
              parent1.generation,
            );
          }
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals,
              partnerships,
              parentChildLinks: {
                ...state.document.parentChildLinks,
                [link.id]: link,
              },
            },
          };
        }),

      addPartnerToIndividual: (partner, partnership) =>
        set((state) => {
          // Insert the partner, then make room for the new union. When the
          // individual already has siblings, the partner would land on top of
          // them, so the siblings — and their subtrees — are swept aside while
          // the target and partner stay anchored together. Insert + reflow share
          // this one `set` so a single undo reverts both.
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [partner.id]: partner,
          };
          const targetId =
            partnership.partner1Id === partner.id
              ? partnership.partner2Id
              : partnership.partner1Id;
          individuals = applyMoves(
            individuals,
            makeRoomForPartner(
              individuals,
              state.document.partnerships,
              targetId,
              partner.id,
              MIN_GENERATION_NODE_SPACING,
            ),
          );
          return {
            document: {
              ...state.document,
              metadata: {
                ...state.document.metadata,
                updatedAt: new Date().toISOString(),
              },
              individuals,
              partnerships: {
                ...state.document.partnerships,
                [partnership.id]: partnership,
              },
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
          // Insert the child, then respace the child's generation so the new
          // node does not overlap existing siblings/cousins (subtrees carried
          // along). Finally re-centre the parents over the full sibling row so
          // the couple sits above the middle of their children, not off to one
          // side. Everything shares this one `set` so a single undo reverts it.
          let individuals: Record<string, Individual> = {
            ...state.document.individuals,
            [child.id]: child,
          };
          if (child.generation !== undefined) {
            individuals = applyGenerationRespacing(
              individuals,
              partnerships,
              child.generation,
            );
          }
          individuals = applyMoves(
            individuals,
            centerParentsOverChildren(individuals, updatedPartnership),
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
              parentChildLinks: {
                ...state.document.parentChildLinks,
                [link.id]: link,
              },
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
