import {
  DEFAULT_LAYOUT_SPACING,
  resolveGenerationRows,
} from './treeLayout';
import type { LayoutDoc, LayoutSpacing } from './treeLayout';
import type { TwinGroup } from '../types/pedigree';
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
 * mirroring `orderSiblingsWithTwins` for the single-family engine. Only members
 * that are single-node chains are pulled (a twin who is themselves a partner in a
 * couple chain stays with their spouse); the run is anchored at the group's
 * leftmost member and preserves the members' relative order.
 */
function makeTwinsContiguous(
  chains: string[][],
  twinGroups: Record<string, TwinGroup>,
): string[][] {
  if (Object.keys(twinGroups).length === 0) return chains;
  const singleId = (c: string[]): string | null => (c.length === 1 ? c[0] : null);

  const present = new Set<string>();
  for (const c of chains) {
    const s = singleId(c);
    if (s) present.add(s);
  }
  // Map each present single-node twin member to its group's member set (only
  // groups with ≥2 present single members can interleave and so matter here).
  const groupOf = new Map<string, Set<string>>();
  for (const g of Object.values(twinGroups)) {
    const members = g.individualIds.filter((id) => present.has(id));
    if (members.length < 2) continue;
    const set = new Set(members);
    for (const id of members) groupOf.set(id, set);
  }
  if (groupOf.size === 0) return chains;

  // Walk left to right; the first time a group's member is seen, emit the whole
  // group's member-chains (in their current order) as a contiguous run.
  const result: string[][] = [];
  const emitted = new Set<string>();
  for (const chain of chains) {
    const s = singleId(chain);
    if (s && groupOf.has(s)) {
      if (emitted.has(s)) continue;
      const group = groupOf.get(s)!;
      for (const c of chains) {
        const cs = singleId(c);
        if (cs && group.has(cs) && !emitted.has(cs)) {
          result.push(c);
          emitted.add(cs);
        }
      }
    } else {
      result.push(chain);
    }
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
