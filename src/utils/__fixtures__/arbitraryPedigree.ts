import * as fc from 'fast-check';
import type { LayoutDoc } from '../treeLayout';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { RelationshipType, TwinType } from '../../types/enums';
import { createDefaultIndividual } from '../../stores/pedigreeStore';

export interface PedigreeGenOptions {
  /** Max unions any one individual may hold. Supported space: 2; full: 3. */
  maxUnionDegree: number;
  /** May a twin also be a partner in a couple? Supported: false; full: true. */
  allowMarriedTwins: boolean;
  /**
   * May two blood individuals (both load-bearing, each with present parents)
   * marry — a cross-branch couple? Now true in BOTH spaces: the residual-1a
   * topology is handled by `reformatLayout`'s cross-branch coordinate phase
   * (detect-then-correct split at the cross union, issue #141). The flag stays
   * so the class can be excluded again while diagnosing a regression.
   */
  allowCrossBranch: boolean;
  maxGenerations: number;
  maxFounderFamilies: number;
  maxChildrenPerUnion: number;
}

/**
 * The currently-supported topology space, fed to the standing green CI property.
 * Excludes the two remaining known-unhandled shapes: 3+-union hubs and married
 * twins (residual 1b). Everything else — plain branching families of any
 * depth/asymmetry (residual 4, fixed), twins, remarriage half-sibs,
 * disconnected components, and cross-branch couples (residual 1a, fixed by the
 * cross-branch coordinate phase) — is handled and green. Widen these caps as
 * each remaining topology is closed (#141).
 */
export const SUPPORTED_SPACE: PedigreeGenOptions = {
  maxUnionDegree: 2,
  allowMarriedTwins: false,
  allowCrossBranch: true,
  maxGenerations: 4,
  maxFounderFamilies: 3,
  maxChildrenPerUnion: 3,
};

/** The full topology space, including the known-unhandled shapes. Fed to the
 *  opt-in discovery harness. */
export const FULL_SPACE: PedigreeGenOptions = {
  maxUnionDegree: 3,
  allowMarriedTwins: true,
  allowCrossBranch: true,
  maxGenerations: 4,
  maxFounderFamilies: 3,
  maxChildrenPerUnion: 3,
};

/**
 * A fast-check arbitrary producing a structurally valid {@link LayoutDoc}, built
 * top-down (founders → descendants) so validity holds by construction. Uses
 * `fc.gen()` so the imperative builder still shrinks (fast-check shrinks the
 * underlying draws), yielding minimal, valid counterexamples.
 */
export function arbitraryLayoutDoc(opts: PedigreeGenOptions): fc.Arbitrary<LayoutDoc> {
  return fc.gen().map((gen) => buildDoc(gen, opts));
}

function buildDoc(gen: fc.GeneratorValue, opts: PedigreeGenOptions): LayoutDoc {
  const individuals: Record<string, Individual> = {};
  const partnerships: Record<string, PartnershipRelationship> = {};
  const parentChildLinks: Record<string, ParentChildRelationship> = {};
  const twinGroups: Record<string, TwinGroup> = {};
  let n = 0;
  const nextId = (p: string): string => `${p}${n++}`;
  const unionDegree = new Map<string, number>(); // individual → #unions held

  const addInd = (generation: number): string => {
    const id = nextId('i');
    individuals[id] = createDefaultIndividual({
      id,
      generation,
      position: { x: 0, y: generation * 150 },
    });
    return id;
  };
  const addUnion = (a: string | undefined, b: string | undefined): string => {
    const id = nextId('u');
    partnerships[id] = {
      id,
      type: RelationshipType.Partnership,
      partner1Id: a,
      partner2Id: b,
      childrenIds: [],
    };
    for (const p of [a, b]) if (p) unionDegree.set(p, (unionDegree.get(p) ?? 0) + 1);
    return id;
  };
  const addChild = (unionId: string, childGen: number): string => {
    const c = addInd(childGen);
    partnerships[unionId].childrenIds.push(c);
    const lid = nextId('l');
    parentChildLinks[lid] = {
      id: lid,
      type: RelationshipType.ParentChild,
      parentPartnershipId: unionId,
      childId: c,
      isAdoptive: false,
    };
    return c;
  };
  const isTwin = (id: string): boolean =>
    Object.values(twinGroups).some((t) => t.individualIds.includes(id));

  // Gen 0: founder couples.
  const families = gen(fc.integer, { min: 1, max: opts.maxFounderFamilies });
  let fertile: Array<{ unionId: string; gen: number }> = [];
  const eligible: string[] = []; // individuals that could take another spouse

  for (let f = 0; f < families; f++) {
    const u = addUnion(addInd(0), addInd(0));
    fertile.push({ unionId: u, gen: 1 });
  }

  // Descend generation by generation.
  const maxGen = gen(fc.integer, { min: 1, max: opts.maxGenerations });
  for (let g = 1; g <= maxGen; g++) {
    const nextFertile: Array<{ unionId: string; gen: number }> = [];
    for (const fu of fertile) {
      if (fu.gen !== g) {
        nextFertile.push(fu);
        continue;
      }
      const childCount = gen(fc.integer, { min: 0, max: opts.maxChildrenPerUnion });
      const kids: string[] = [];
      for (let c = 0; c < childCount; c++) kids.push(addChild(fu.unionId, g));
      if (kids.length >= 2 && gen(fc.boolean)) {
        const tid = nextId('t');
        twinGroups[tid] = {
          id: tid,
          twinType: TwinType.Monozygotic,
          individualIds: [kids[0], kids[1]],
          parentPartnershipId: fu.unionId,
        };
      }
      for (const kid of kids) {
        if (gen(fc.boolean) && (opts.allowMarriedTwins || !isTwin(kid))) {
          const u = addUnion(kid, addInd(g));
          nextFertile.push({ unionId: u, gen: g + 1 });
          eligible.push(kid);
        }
      }
    }
    fertile = nextFertile;
  }

  // Cross-branch marriage: marry two eligible same-generation individuals (both
  // load-bearing) — reformatLayout's core case (residual 1a). Gated so the
  // supported space can exclude it until the coordinate phase handles it.
  if (opts.allowCrossBranch && eligible.length >= 2 && gen(fc.boolean)) {
    const byGen = new Map<number, string[]>();
    for (const id of eligible) {
      const gg = individuals[id].generation as number;
      const arr = byGen.get(gg) ?? [];
      arr.push(id);
      byGen.set(gg, arr);
    }
    const rows = [...byGen.values()].filter((r) => r.length >= 2);
    if (rows.length) {
      const row = rows[gen(fc.integer, { min: 0, max: rows.length - 1 })];
      const a = row[0];
      const b = row[1];
      if (
        a !== b &&
        (unionDegree.get(a) ?? 0) < opts.maxUnionDegree &&
        (unionDegree.get(b) ?? 0) < opts.maxUnionDegree
      ) {
        addUnion(a, b);
      }
    }
  }

  // Hub boost (full space only): give one eligible individual extra spouses up
  // to maxUnionDegree.
  if (eligible.length && opts.maxUnionDegree > 2 && gen(fc.boolean)) {
    const hub = eligible[gen(fc.integer, { min: 0, max: eligible.length - 1 })];
    const hg = individuals[hub].generation as number;
    while ((unionDegree.get(hub) ?? 0) < opts.maxUnionDegree) addUnion(hub, addInd(hg));
  }

  return { individuals, partnerships, parentChildLinks, twinGroups };
}
