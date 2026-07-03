import {
  DEFAULT_LAYOUT_SPACING,
  resolveGenerationRows,
  computeTreeLayout,
} from './treeLayout';
import type { LayoutDoc, LayoutSpacing } from './treeLayout';
import type {
  Individual,
  ParentChildRelationship,
  PartnershipRelationship,
  TwinGroup,
} from '../types/pedigree';
import { GENERATION_SPACING, MIN_GENERATION_NODE_SPACING } from './constants';

/**
 * Whole-document "re-tidy" layout (issue #137). A layered (Sugiyama /
 * Brandes–Köpf-style) engine that — unlike the order-preserving
 * `computeTreeLayout` used on every incremental edit — is free to **reorder**
 * each generation row. It fixes the two reported bugs at once:
 *
 * - **A non-partner rendered between a couple** — the ordering phase groups each
 *   row into partnership "chains" so a couple's partners are always adjacent and
 *   a multi-union hub sits *between* its spouses.
 * - **Very wide pedigrees** — the coordinate phase packs each row tightly and
 *   pulls cross-branch families together, so slack disappears.
 *
 * Pure and deterministic (id tie-breaks throughout). Returns only the nodes
 * whose position changed, matching `computeTreeLayout`'s contract.
 */
export function reformatLayout(
  doc: LayoutDoc,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): Record<string, { x: number; y: number }> {
  const ids = Object.keys(doc.individuals);
  if (ids.length === 0) return {};

  const genOfMap = resolveGenerationRows(doc, 0);
  const genOf = (id: string): number => genOfMap.get(id) ?? 0;
  const seedX = (id: string): number => doc.individuals[id].position.x;

  // Present ids grouped by generation row, and the sorted list of rows.
  const rowIds = new Map<number, string[]>();
  for (const id of ids) {
    const g = genOf(id);
    const arr = rowIds.get(g);
    if (arr) arr.push(id);
    else rowIds.set(g, [id]);
  }
  const gens = [...rowIds.keys()].sort((a, b) => a - b);

  // --- graph relations -----------------------------------------------------
  // Partners of a node that are present AND on the same row (partnership chains).
  const rowPartners = new Map<string, Set<string>>();
  const addPartner = (a: string, b: string): void => {
    const s = rowPartners.get(a) ?? new Set<string>();
    s.add(b);
    rowPartners.set(a, s);
  };
  for (const u of Object.values(doc.partnerships)) {
    const p1 = u.partner1Id;
    const p2 = u.partner2Id;
    if (!p1 || !p2 || p1 === p2) continue;
    if (!doc.individuals[p1] || !doc.individuals[p2]) continue;
    if (genOf(p1) !== genOf(p2)) continue;
    addPartner(p1, p2);
    addPartner(p2, p1);
  }

  // Parents (present partners of the union a node is a child of) and children
  // (present children of unions a node partners in) — the cross-row edges.
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const l of Object.values(doc.parentChildLinks)) {
    const child = l.childId;
    const u = doc.partnerships[l.parentPartnershipId];
    if (!u || !doc.individuals[child]) continue;
    const parents = [u.partner1Id, u.partner2Id].filter(
      (id): id is string => !!id && !!doc.individuals[id],
    );
    parentsOf.set(child, parents);
    for (const p of parents) {
      const arr = childrenOf.get(p) ?? [];
      arr.push(child);
      childrenOf.set(p, arr);
    }
  }

  // --- Phase 2: ordering ---------------------------------------------------
  const order = new Map<number, string[][]>();
  for (const g of gens) {
    order.set(g, buildChains(rowIds.get(g)!, rowPartners, seedX));
  }
  // Seed chain order by mean seed x of members (id tie-break).
  for (const g of gens) {
    order.set(g, sortChains(order.get(g)!, (c) => meanBy(c, seedX)));
  }

  // Fractional position of each node within its row: `(index + 0.5) / rowSize`,
  // in [0, 1]. Normalising by row size lets barycentres compare meaningfully
  // across rows of very different sizes (e.g. a lone child under a wide couple).
  const posIndex = (): Map<string, number> => {
    const pos = new Map<string, number>();
    for (const g of gens) {
      const flat = order.get(g)!.flat();
      const n = flat.length;
      flat.forEach((id, i) => pos.set(id, (i + 0.5) / n));
    }
    return pos;
  };

  const SWEEPS = 6;
  for (let s = 0; s < SWEEPS; s++) {
    // Down sweep: order each row (top → bottom) by its parents' positions.
    for (let gi = 1; gi < gens.length; gi++) {
      reorderRow(gens[gi], parentsOf, posIndex());
    }
    // Up sweep: order each row (bottom → top) by its children's positions.
    for (let gi = gens.length - 2; gi >= 0; gi--) {
      reorderRow(gens[gi], childrenOf, posIndex());
    }
  }

  // Twin contiguity: barycentre ordering keeps siblings together but leaves a
  // non-twin free to tie-break its way between two twins. Pull each twin group's
  // members into a contiguous run as a final ordering constraint.
  const twinGroups = doc.twinGroups ?? {};
  for (const g of gens) {
    order.set(g, makeTwinsContiguous(order.get(g)!, twinGroups));
  }

  // Component contiguity: keep every connected family's chains together in each
  // row, so a disconnected component is never packed *between* another family's
  // nodes (which would open a gap the coordinate phase can't reclaim and would
  // break idempotence — the extracted component re-seeds a different order next
  // pass). A cross-branch marriage joins two founders into one component, so this
  // never splits an intentionally-interleaved couple.
  //
  // A single *global* left-to-right component order (each component's mean row-
  // normalised position, before contiguity is imposed) drives both this reorder
  // and the coordinate-phase banding. Ordering per row independently would let a
  // family that only dips left in a deeper row disagree with the band order and
  // flip the row on the next pass — the classic idempotence break.
  const componentOf = connectedComponents(doc, ids);
  const compRank = componentOrder(ids, componentOf, posIndex());
  for (const g of gens) {
    order.set(g, makeComponentsContiguous(order.get(g)!, componentOf, compRank));
  }

  /** Reorder one row's chains by the barycentre of each member's neighbours. */
  function reorderRow(
    g: number,
    neigh: Map<string, string[]>,
    pos: Map<string, number>,
  ): void {
    const chains = order.get(g)!;
    const key = (chain: string[]): number => {
      // Only members that actually have neighbours in the adjacent row inform the
      // barycentre; a no-neighbour founder spouse would otherwise contribute its
      // arbitrary current position and skew the chain's order.
      const keys: number[] = [];
      for (const id of chain) {
        const ns = (neigh.get(id) ?? []).filter((n) => pos.has(n));
        if (ns.length) keys.push(meanBy(ns, (n) => pos.get(n)!));
      }
      // No member has a neighbour on this side: keep the chain where it is.
      if (!keys.length) return meanBy(chain, (id) => pos.get(id)!);
      return keys.reduce((a, b) => a + b, 0) / keys.length;
    };
    order.set(g, sortChains(chains, key));
  }

  // --- Phase 3: coordinates ------------------------------------------------
  const betweenGap = Math.max(spacing.siblingSpacing, MIN_GENERATION_NODE_SPACING);
  const x = new Map<string, number>();
  for (const g of gens) {
    let cursor = 0;
    let first = true;
    for (const chain of order.get(g)!) {
      for (let k = 0; k < chain.length; k++) {
        if (first) {
          cursor = 0;
          first = false;
        } else {
          cursor += k === 0 ? betweenGap : spacing.partnerSpacing;
        }
        x.set(chain[k], cursor);
      }
    }
  }

  // Rigid per-row alignment: slide each row (as one unit — preserving spacing) so
  // it centres over its cross-row neighbours. Top-down then bottom-up, a few
  // passes. Never changes order or intra-row spacing, so no overlap is created.
  const alignPass = (over: Map<string, string[]>, topDown: boolean): void => {
    const seq = topDown ? gens : [...gens].reverse();
    for (const g of seq) {
      const members = rowIds.get(g)!;
      const diffs: number[] = [];
      for (const id of members) {
        const ns = (over.get(id) ?? []).filter((n) => x.has(n));
        if (ns.length) diffs.push(meanBy(ns, (n) => x.get(n)!) - x.get(id)!);
      }
      if (!diffs.length) continue;
      const shift = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      for (const id of members) x.set(id, x.get(id)! + shift);
    }
  };
  for (let p = 0; p < 4; p++) {
    alignPass(parentsOf, true);
    alignPass(childrenOf, false);
  }

  // --- Phase 3b: subtree separation (issue #141) ---------------------------
  // The rigid per-row alignment above slides each row as one unit; it can never
  // *widen* a row to make room for a deep subtree below, so a reordered branchy
  // family can slide two cousin subtrees over one another — and
  // `subtreeNonCollision` flags any two non-ancestor sibships whose child-x
  // extents overlap, regardless of row. Two passes close the gap:
  //
  //   1. Re-tidy each hub-free connected family with the order-preserving,
  //      contour-based `computeTreeLayout` — the same engine used on every
  //      incremental edit, which already separates cousin subtrees and centres
  //      sibships. It is seeded with the aligned x above, so it keeps the order
  //      the phase-2 sweeps chose; it is skipped for a family containing a
  //      multi-union hub, because its remarriage-frame widens a hub's spouses past
  //      partner spacing, whereas the linear packing here keeps them adjacent
  //      (the reported cross-branch bug). Hub families keep the aligned layout;
  //      the residual hub geometry is the tracked follow-up.
  //   2. Give each connected family its own disjoint x-band — a rigid whole-family
  //      translation, so no internal couple, nesting, or spacing is disturbed
  //      while two independent families (however many rows apart) never overlap.
  const finalX: Record<string, number> = {};
  for (const id of ids) finalX[id] = x.get(id)!;
  retidyHubFreeComponents(doc, finalX, componentOf, genOf, parentsOf, spacing);
  separateComponents(finalX, betweenGap, ids, componentOf, compRank);
  for (const id of ids) x.set(id, finalX[id]);

  // --- Phase 4: anchor + y -------------------------------------------------
  // x: keep the document centroid fixed so the canvas does not jump.
  const meanSeed = meanBy(ids, seedX);
  const meanNow = meanBy(ids, (id) => x.get(id)!);
  const dx = meanSeed - meanNow;

  // y: anchor rows on a stable reference node (smallest id) so y = its original
  // y + (gen − its gen) × generationSpacing.
  const refId = [...ids].sort((a, b) => (a < b ? -1 : 1))[0];
  const refGen = genOf(refId);
  const refY = doc.individuals[refId].position.y;

  const result: Record<string, { x: number; y: number }> = {};
  for (const id of ids) {
    const nx = x.get(id)! + dx;
    const ny = refY + (genOf(id) - refGen) * GENERATION_SPACING;
    const cur = doc.individuals[id].position;
    if (Math.abs(cur.x - nx) > 1e-6 || Math.abs(cur.y - ny) > 1e-6) {
      result[id] = { x: nx, y: ny };
    }
  }
  return result;
}

/** Mean of `f` over `xs`. */
function meanBy<T>(xs: readonly T[], f: (x: T) => number): number {
  return xs.reduce((s, x) => s + f(x), 0) / xs.length;
}

/**
 * Re-tidy each hub-free connected family in place with `computeTreeLayout`, the
 * order-preserving contour engine used on every incremental edit (issue #141).
 * The rigid per-row alignment cannot widen a row to fit a deep subtree, so it
 * leaves cousin subtrees overlapping; `computeTreeLayout` resolves exactly this
 * with its descent-block separation and sibship centring. Each family is laid out
 * on its own doc slice, seeded with the current (aligned) x so the phase-2 sibling
 * order is preserved, and only the resulting x is written back — y is assigned by
 * the caller's generation anchor.
 *
 * A family is **skipped** (kept in its linear form) when `computeTreeLayout` would
 * lay it out *wider* than the compacting packing here, which is the whole reason
 * this whole-document engine exists:
 *   - a **multi-union hub** (a node with ≥2 same-slice unions) — its remarriage
 *     frame spaces the hub's second-and-later spouses by sibling spacing, wider
 *     than the adjacent partner spacing the linear packing gives (the reported
 *     cross-branch bug); and
 *   - a **cross-branch couple** (both partners have present parents) — its frame
 *     spreads the two grandparent families apart, whereas the packing pulls them
 *     together, so delegating would balloon the chart width.
 * These families keep the aligned layout; a hub's stranded union and a deep
 * cross-branch subtree overlap are the tracked follow-ups (#141 rec 3.1–3.2). A
 * plain branching family (every union is blood × married-in) is re-tidied, which
 * is exactly where the linear packing left cousin subtrees overlapping.
 *
 * Mutates `finalX` in place. Deterministic and order-preserving, so a document
 * that is already tidy is left unchanged (idempotent).
 */
function retidyHubFreeComponents(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  componentOf: Map<string, string>,
  genOf: (id: string) => number,
  parentsOf: Map<string, string[]>,
  spacing: LayoutSpacing,
): void {
  const hasParents = (id: string): boolean => (parentsOf.get(id)?.length ?? 0) > 0;
  const members = new Map<string, string[]>();
  for (const [id, root] of componentOf) {
    const arr = members.get(root);
    if (arr) arr.push(id);
    else members.set(root, [id]);
  }

  for (const group of members.values()) {
    const present = new Set(group);
    // Slice this family's unions and parent-child links.
    const partnerships: Record<string, PartnershipRelationship> = {};
    for (const [uid, u] of Object.entries(doc.partnerships)) {
      if ((u.partner1Id && present.has(u.partner1Id)) || (u.partner2Id && present.has(u.partner2Id))) {
        partnerships[uid] = u;
      }
    }
    // Keep the linear layout for a family `computeTreeLayout` would widen: one
    // with a multi-union hub, or a cross-branch couple (both partners blood).
    const degree = new Map<string, number>();
    let crossBranch = false;
    for (const u of Object.values(partnerships)) {
      for (const p of [u.partner1Id, u.partner2Id]) if (p && present.has(p)) degree.set(p, (degree.get(p) ?? 0) + 1);
      if (u.partner1Id && u.partner2Id && present.has(u.partner1Id) && present.has(u.partner2Id) &&
        hasParents(u.partner1Id) && hasParents(u.partner2Id)) crossBranch = true;
    }
    if (crossBranch || [...degree.values()].some((d) => d >= 2)) continue;

    // Candidate root unions: any childbearing union (≥1 present child) with at
    // least one present partner. A **single-parent apex** union (one partner
    // undefined) must be eligible — it is often the family's topmost union, and
    // rooting instead at a deeper childless couple lays the family out wrong
    // (e.g. `computeTreeLayout` strands a married twin's spouse across a non-twin
    // sibling). Requiring a present child skips isolated childless couples, which
    // the linear packing already spaces correctly.
    const isPresent = (id: string | undefined): id is string => !!id && present.has(id);
    const rootCandidates = Object.keys(partnerships).filter((uid) => {
      const u = partnerships[uid];
      return (isPresent(u.partner1Id) || isPresent(u.partner2Id)) &&
        u.childrenIds.some((id) => present.has(id));
    });
    if (rootCandidates.length === 0) continue; // no childbearing union: nothing to tidy

    const parentChildLinks: Record<string, ParentChildRelationship> = {};
    for (const [lid, l] of Object.entries(doc.parentChildLinks)) {
      if (present.has(l.childId) && partnerships[l.parentPartnershipId]) parentChildLinks[lid] = l;
    }
    const individuals: Record<string, Individual> = {};
    for (const id of group) {
      // Seed x with the aligned x so computeTreeLayout preserves the phase-2 order.
      individuals[id] = { ...doc.individuals[id], position: { x: finalX[id], y: genOf(id) * spacing.generationSpacing } };
    }
    const slice: LayoutDoc = { individuals, partnerships, parentChildLinks, twinGroups: doc.twinGroups };

    // Root at the topmost childbearing union (min partner generation; id tie-break).
    const rootUnionId = [...rootCandidates].sort((a, b) => {
      const gen = (uid: string): number =>
        Math.min(...[partnerships[uid].partner1Id, partnerships[uid].partner2Id].filter(isPresent).map(genOf));
      return gen(a) - gen(b) || (a < b ? -1 : a > b ? 1 : 0);
    })[0];

    const moves = computeTreeLayout(slice, rootUnionId, spacing);
    for (const id of group) if (moves[id]) finalX[id] = moves[id].x;
  }
}

/**
 * Partition the present individuals into connected family components — union-find
 * over partnership and parent-child edges — returning each id's component root
 * (the smallest id in its component). A cross-branch marriage joins two founder
 * families into one component; a childless isolated couple or an orphan sibship
 * is its own component.
 */
function connectedComponents(
  doc: LayoutDoc,
  ids: readonly string[],
): Map<string, string> {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    for (let cur = a; cur !== r; ) {
      const next = parent.get(cur)!;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const present = (id: string | undefined): id is string => !!id && parent.has(id);
  const unite = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const u of Object.values(doc.partnerships)) {
    if (present(u.partner1Id) && present(u.partner2Id)) unite(u.partner1Id, u.partner2Id);
  }
  for (const l of Object.values(doc.parentChildLinks)) {
    const u = doc.partnerships[l.parentPartnershipId];
    if (!u || !present(l.childId)) continue;
    for (const p of [u.partner1Id, u.partner2Id]) if (present(p)) unite(p, l.childId);
  }
  const root = new Map<string, string>();
  for (const id of ids) root.set(id, find(id));
  return root;
}

/**
 * A single global left-to-right ordering of the connected components, keyed by
 * each component's mean normalised horizontal position (`posIndex`, in [0, 1]).
 * Returned as a component-root → rank map. Used by BOTH the row-contiguity pass
 * and the coordinate-phase banding so they never disagree on which family sits
 * left of which — the agreement that makes the layout a fixed point.
 */
function componentOrder(
  ids: readonly string[],
  componentOf: Map<string, string>,
  posIndex: Map<string, number>,
): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const id of ids) {
    const r = componentOf.get(id) ?? id;
    const e = acc.get(r) ?? { sum: 0, n: 0 };
    e.sum += posIndex.get(id) ?? 0;
    e.n += 1;
    acc.set(r, e);
  }
  const rank = new Map<string, number>();
  [...acc.entries()]
    .map(([root, { sum, n }]) => ({ root, mean: sum / n }))
    .sort((a, b) => a.mean - b.mean || (a.root < b.root ? -1 : a.root > b.root ? 1 : 0))
    .forEach((e, i) => rank.set(e.root, i));
  return rank;
}

/**
 * Reorder a row's chains so every connected component's chains form a contiguous
 * run, mirroring {@link makeTwinsContiguous} at the family level, with the
 * families laid out in the global {@link componentOrder}. Each component's chains
 * keep their relative order, so twin and couple runs already fixed inside a
 * family are preserved. Keeps a disconnected component from interleaving another
 * family's row (see {@link separateComponents}).
 */
function makeComponentsContiguous(
  chains: string[][],
  componentOf: Map<string, string>,
  compRank: Map<string, number>,
): string[][] {
  const compOf = (chain: string[]): string => componentOf.get(chain[0]) ?? chain[0];
  const groups = new Map<string, string[][]>();
  for (const chain of chains) {
    const comp = compOf(chain);
    const g = groups.get(comp);
    if (g) g.push(chain);
    else groups.set(comp, [chain]);
  }
  return [...groups.keys()]
    .sort((a, b) => (compRank.get(a) ?? 0) - (compRank.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((comp) => groups.get(comp)!);
}

/**
 * Give each connected family component its own disjoint horizontal band (issue
 * #141). `subtreeNonCollision` flags *any* two non-ancestor sibships whose
 * child-x extents overlap — including sibships in two unrelated families, however
 * many rows apart. The per-row sweep only clears blocks that share a row, so a
 * family whose deep (or in-law-stretched) descendants reach under a shallower
 * neighbour still trips it. Fixing it is simple and safe at the family level:
 * pack the components left-to-right into non-overlapping x-intervals separated by
 * `minGap`.
 *
 * Each component moves as a single rigid unit, so no couple spacing, sibling
 * order, nesting, or descent line inside it is disturbed. Because the ordering
 * phase already keeps each component's nodes contiguous per row, a component's
 * `[minX, maxX]` has no foreign node inside it, so the bands pack tightly with no
 * reclaimable gap. Components are swept in the global {@link componentOrder}
 * (`compRank`) — the SAME order the row-contiguity pass used — and only ever
 * pushed right, so the two never disagree, and the pass is deterministic and
 * idempotent (a document already in disjoint bands is left untouched).
 */
function separateComponents(
  finalX: Record<string, number>,
  minGap: number,
  ids: readonly string[],
  componentOf: Map<string, string>,
  compRank: Map<string, number>,
): void {
  interface Comp {
    members: string[];
    minX: number;
    maxX: number;
    root: string;
  }
  const byRoot = new Map<string, Comp>();
  for (const id of ids) {
    const r = componentOf.get(id) ?? id;
    const c = byRoot.get(r);
    if (c) {
      c.members.push(id);
      c.minX = Math.min(c.minX, finalX[id]);
      c.maxX = Math.max(c.maxX, finalX[id]);
    } else {
      byRoot.set(r, { members: [id], minX: finalX[id], maxX: finalX[id], root: r });
    }
  }

  const comps = [...byRoot.values()].sort(
    (a, b) =>
      (compRank.get(a.root) ?? 0) - (compRank.get(b.root) ?? 0) ||
      (a.root < b.root ? -1 : a.root > b.root ? 1 : 0),
  );
  let runningMax = -Infinity;
  for (const c of comps) {
    if (runningMax !== -Infinity && c.minX < runningMax + minGap) {
      const shift = runningMax + minGap - c.minX;
      for (const m of c.members) finalX[m] += shift;
      c.minX += shift;
      c.maxX += shift;
    }
    runningMax = c.maxX;
  }
}

/**
 * Sort a row's chains by an ascending numeric key, breaking ties by the chain's
 * smallest member id for determinism.
 */
function sortChains(chains: string[][], key: (c: string[]) => number): string[][] {
  const minId = (c: string[]): string => c.reduce((m, id) => (id < m ? id : m), c[0]);
  return [...chains].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka - kb;
    const ma = minId(a);
    const mb = minId(b);
    return ma < mb ? -1 : ma > mb ? 1 : 0;
  });
}

/**
 * Partition a row into partnership "chains": connected components under the
 * same-row partner graph, each ordered as a path so married partners are
 * adjacent and a two-spouse hub sits between its spouses. A lone individual is a
 * one-element chain.
 */
function buildChains(
  rowList: readonly string[],
  rowPartners: Map<string, Set<string>>,
  seedX: (id: string) => number,
): string[][] {
  const byX = [...rowList].sort((a, b) => {
    const dx = seedX(a) - seedX(b);
    return dx !== 0 ? dx : a < b ? -1 : 1;
  });
  const visited = new Set<string>();
  const chains: string[][] = [];
  for (const start of byX) {
    if (visited.has(start)) continue;
    // Collect the connected component.
    const comp = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (comp.has(cur)) continue;
      comp.add(cur);
      for (const p of rowPartners.get(cur) ?? []) if (!comp.has(p)) stack.push(p);
    }
    for (const id of comp) visited.add(id);
    chains.push(orderChainMembers(comp, rowPartners, seedX));
  }
  return chains;
}

/**
 * Reorder a row's chains so every twin group's members occupy a contiguous run,
 * mirroring `orderSiblingsWithTwins` for the single-family engine. A chain is
 * treated as belonging to a twin group when **any** of its members is in the
 * group, so a twin who is themselves partnered — locked into a couple chain — is
 * pulled into the run alongside a single-node co-twin rather than stranded (the
 * `marriedTwinInterleaved` gap, issue #141). The run is emitted at the group's
 * leftmost chain and preserves the chains' relative order.
 *
 * Each chain in a multi-chain run is **oriented** so its twin member sits on the
 * side facing the rest of the group (spouses to the outside): the leftmost chain
 * keeps its twin member last, the rightmost keeps it first. That way a married
 * twin's spouse never lands between the two twins — which would trip both
 * `twinContiguity` (in the sibship) and `noNodeBetweenPartners` (the couple).
 */
function makeTwinsContiguous(
  chains: string[][],
  twinGroups: Record<string, TwinGroup>,
): string[][] {
  if (Object.keys(twinGroups).length === 0) return chains;

  // Every id placed on this row (across all chains, not just single-node ones).
  const present = new Set<string>();
  for (const c of chains) for (const id of c) present.add(id);

  // Map each present twin member to its group's present-member set (only groups
  // with ≥2 present members can interleave and so matter here).
  const memberGroup = new Map<string, Set<string>>();
  for (const g of Object.values(twinGroups)) {
    const members = g.individualIds.filter((id) => present.has(id));
    if (members.length < 2) continue;
    const set = new Set(members);
    for (const id of members) memberGroup.set(id, set);
  }
  if (memberGroup.size === 0) return chains;

  const isTwin = (id: string): boolean => memberGroup.has(id);
  // The twin group a chain belongs to (its first twin member's group), keyed by
  // that group's smallest member id so the key is stable; null if none.
  const groupKeyOf = (chain: string[]): string | null => {
    for (const id of chain) {
      const set = memberGroup.get(id);
      if (set) return [...set].reduce((m, x) => (x < m ? x : m));
    }
    return null;
  };

  // Bucket each group's chains in row order.
  const groupChains = new Map<string, string[][]>();
  for (const chain of chains) {
    const key = groupKeyOf(chain);
    if (key === null) continue;
    const arr = groupChains.get(key);
    if (arr) arr.push(chain);
    else groupChains.set(key, [chain]);
  }

  // Orient a run's endpoints so twin members face inward, spouses outward.
  const orientRun = (run: string[][]): string[][] => {
    if (run.length < 2) return run;
    const out = run.map((c) => [...c]);
    const first = out[0];
    if (first.length > 1 && isTwin(first[0]) && !isTwin(first[first.length - 1])) first.reverse();
    const last = out[out.length - 1];
    if (last.length > 1 && isTwin(last[last.length - 1]) && !isTwin(last[0])) last.reverse();
    return out;
  };

  // Walk left to right; on the first chain of a group emit the whole (oriented)
  // run, else emit an ungrouped chain in place. Later chains of an
  // already-emitted group are skipped (their slots collapse into the run).
  const result: string[][] = [];
  const emitted = new Set<string>();
  for (const chain of chains) {
    const key = groupKeyOf(chain);
    if (key === null) {
      result.push(chain);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    for (const c of orientRun(groupChains.get(key)!)) result.push(c);
  }
  return result;
}

/**
 * Order the members of one partnership component as a path (so each married pair
 * is adjacent). Starts from a degree-1 endpoint with the smallest seed x and
 * walks greedily; falls back to smallest-id start for a cycle. A component of
 * size 1 returns itself.
 */
function orderChainMembers(
  comp: Set<string>,
  rowPartners: Map<string, Set<string>>,
  seedX: (id: string) => number,
): string[] {
  if (comp.size === 1) return [...comp];
  const deg = (id: string): number =>
    [...(rowPartners.get(id) ?? [])].filter((p) => comp.has(p)).length;
  const bySeed = (a: string, b: string): number => {
    const dx = seedX(a) - seedX(b);
    return dx !== 0 ? dx : a < b ? -1 : 1;
  };
  const endpoints = [...comp].filter((id) => deg(id) === 1).sort(bySeed);
  const start = endpoints.length ? endpoints[0] : [...comp].sort(bySeed)[0];
  const ordered: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start;
  while (cur) {
    ordered.push(cur);
    seen.add(cur);
    const next: string | undefined = [...(rowPartners.get(cur) ?? [])]
      .filter((p) => comp.has(p) && !seen.has(p))
      .sort(bySeed)[0];
    cur = next;
  }
  // Any members not reached by the walk (branchy hub) are appended by seed x.
  for (const id of [...comp].sort(bySeed)) if (!seen.has(id)) ordered.push(id);
  return ordered;
}
