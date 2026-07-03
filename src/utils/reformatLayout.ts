import {
  DEFAULT_LAYOUT_SPACING,
  resolveGenerationRows,
  computeTreeLayout,
  unionDescendants,
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
  const first = reformatPass(doc, spacing);
  if (!first.crossBranchSeen) return first.moves;

  // On a document with a cross-branch couple, one pass may not be the engine's
  // fixed point: the corrective changes the row order it hands the next pass
  // (whose linear re-pack may then be clean, flipping the detect-then-correct
  // decision — see retidyCrossBranchComponent), and the barycentric ordering
  // itself can re-settle on a cross-branch component's geometry. Iterate
  // internally to the fixed point (small cap; measured convergence is 1–2
  // extra passes) so a second user-visible pass moves nothing.
  const settle = (
    base: LayoutDoc,
    moves: Record<string, { x: number; y: number }>,
  ): LayoutDoc => ({
    ...base,
    individuals: Object.fromEntries(
      Object.entries(base.individuals).map(([id, node]) => [
        id,
        moves[id] ? { ...node, position: { x: moves[id].x, y: moves[id].y } } : node,
      ]),
    ),
  });
  let settled = settle(doc, first.moves);
  for (let i = 0; i < 6; i++) {
    const next = reformatPass(settled, spacing);
    let maxDelta = 0;
    for (const [id, p] of Object.entries(next.moves)) {
      const cur = settled.individuals[id].position;
      maxDelta = Math.max(maxDelta, Math.abs(p.x - cur.x), Math.abs(p.y - cur.y));
    }
    if (maxDelta < 0.5) break;
    settled = settle(settled, next.moves);
  }
  const result: Record<string, { x: number; y: number }> = {};
  for (const id of Object.keys(doc.individuals)) {
    const p = settled.individuals[id].position;
    const cur = doc.individuals[id].position;
    if (Math.abs(cur.x - p.x) > 1e-6 || Math.abs(cur.y - p.y) > 1e-6) {
      result[id] = { x: p.x, y: p.y };
    }
  }
  return result;
}

/** One full engine pass; `crossBranchSeen` reports whether any component was
 *  eligible for the cross-branch phase (and so needs the convergence re-run). */
function reformatPass(
  doc: LayoutDoc,
  spacing: LayoutSpacing,
): { moves: Record<string, { x: number; y: number }>; crossBranchSeen: boolean } {
  const ids = Object.keys(doc.individuals);
  if (ids.length === 0) return { moves: {}, crossBranchSeen: false };

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
  const crossBranchSeen = retidyHubFreeComponents(doc, finalX, componentOf, genOf, parentsOf, spacing);
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
  return { moves: result, crossBranchSeen };
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
 * A family is **not delegated whole** when `computeTreeLayout` would lay it out
 * *wider* than the compacting packing here, which is the whole reason this
 * whole-document engine exists:
 *   - a **multi-union hub** (a node with ≥2 same-slice unions) — its remarriage
 *     frame spaces the hub's second-and-later spouses by sibling spacing, wider
 *     than the adjacent partner spacing the linear packing gives (the reported
 *     cross-branch bug); and
 *   - a **cross-branch couple** (both partners have present parents) — its frame
 *     spreads the two grandparent families apart, whereas the packing pulls them
 *     together, so delegating would balloon the chart width.
 * A component whose only such feature is a single cross-branch couple gets the
 * purpose-built {@link retidyCrossBranchComponent} coordinate phase (issue #141
 * residual 1a); the remaining hub shapes keep the aligned linear layout (the
 * tracked residual 1b). A plain branching family (every union is blood ×
 * married-in) is re-tidied by whole-slice delegation, which is exactly where the
 * linear packing left cousin subtrees overlapping.
 *
 * Mutates `finalX` in place. Deterministic and order-preserving, so a document
 * that is already tidy is left unchanged (idempotent). Returns whether any
 * component was eligible for the cross-branch phase (the caller then iterates
 * to the engine's fixed point — see `reformatLayout`).
 */
function retidyHubFreeComponents(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  componentOf: Map<string, string>,
  genOf: (id: string) => number,
  parentsOf: Map<string, string[]>,
  spacing: LayoutSpacing,
): boolean {
  const hasParents = (id: string): boolean => (parentsOf.get(id)?.length ?? 0) > 0;
  let crossBranchSeen = false;
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
    const crossUnions: PartnershipRelationship[] = [];
    for (const u of Object.values(partnerships)) {
      for (const p of [u.partner1Id, u.partner2Id]) if (p && present.has(p)) degree.set(p, (degree.get(p) ?? 0) + 1);
      if (u.partner1Id && u.partner2Id && u.partner1Id !== u.partner2Id &&
        present.has(u.partner1Id) && present.has(u.partner2Id) &&
        hasParents(u.partner1Id) && hasParents(u.partner2Id)) crossUnions.push(u);
    }
    if (crossUnions.length > 0 || [...degree.values()].some((d) => d >= 2)) {
      // A component whose ONLY departure from a plain family is a single
      // same-row cross-branch couple gets the purpose-built cross-branch
      // coordinate phase (issue #141, residual 1a). Anything else — a ≥3-union
      // hub, a non-cross-branch remarriage, chained cross-branch couples, or a
      // MARRIED TWIN in the component (the corrective is validated only for the
      // supported space, which excludes married twins) — keeps the aligned
      // linear layout (residual 1b and the tracked follow-ups).
      const cross = crossUnions.length === 1 ? crossUnions[0] : null;
      const marriedTwin = Object.values(doc.twinGroups ?? {}).some((t) =>
        t.individualIds.some((id) => present.has(id) && (degree.get(id) ?? 0) > 0),
      );
      const eligible =
        cross !== null &&
        !marriedTwin &&
        genOf(cross.partner1Id!) === genOf(cross.partner2Id!) &&
        [...degree.entries()].every(
          ([id, d]) =>
            d <= 2 && (d < 2 || id === cross.partner1Id || id === cross.partner2Id),
        );
      if (eligible) {
        crossBranchSeen = true;
        retidyCrossBranchComponent(doc, finalX, group, genOf, spacing, cross);
      }
      continue;
    }

    // Seed x with the aligned x so computeTreeLayout preserves the phase-2 order.
    const slice = sliceFor(doc, group, (id) => finalX[id], genOf, spacing);
    const rootUnionId = pickRootUnion(slice, genOf);
    if (rootUnionId === null) continue; // no childbearing union: nothing to tidy

    const moves = computeTreeLayout(slice, rootUnionId, spacing);
    for (const id of group) if (moves[id]) finalX[id] = moves[id].x;
  }
  return crossBranchSeen;
}

/** Options for {@link sliceFor}. */
interface SliceOptions {
  /**
   * An extra individual admitted as a married-in LEAF spouse: present in the
   * slice's `individuals` (so its couple frame can place and orient around it)
   * but not counted for union inclusion and carrying no parent links there, so
   * within the slice it is never load-bearing.
   */
  leafSpouse?: { id: string; seedX: number };
  /** A union excluded from the slice (a split side drops the cross union). */
  excludeUnionId?: string;
  /** Seed-x overrides (the spine bias of the cross-branch order derivation). */
  seedXOverrides?: ReadonlyMap<string, number>;
}

/**
 * Build the {@link LayoutDoc} slice for a set of component members: the unions
 * with at least one member partner, the parent-child links whose child and union
 * are both in the slice, and the individuals re-seeded at `xOf` (with the row's
 * generation y), so `computeTreeLayout` preserves the seeded order.
 */
function sliceFor(
  doc: LayoutDoc,
  ids: readonly string[],
  xOf: (id: string) => number,
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
  opts: SliceOptions = {},
): LayoutDoc {
  const present = new Set(ids);
  const partnerships: Record<string, PartnershipRelationship> = {};
  for (const [uid, u] of Object.entries(doc.partnerships)) {
    if (uid === opts.excludeUnionId) continue;
    if ((u.partner1Id && present.has(u.partner1Id)) || (u.partner2Id && present.has(u.partner2Id))) {
      partnerships[uid] = u;
    }
  }
  const parentChildLinks: Record<string, ParentChildRelationship> = {};
  for (const [lid, l] of Object.entries(doc.parentChildLinks)) {
    if (present.has(l.childId) && partnerships[l.parentPartnershipId]) parentChildLinks[lid] = l;
  }
  const individuals: Record<string, Individual> = {};
  const seedX = (id: string): number => opts.seedXOverrides?.get(id) ?? xOf(id);
  for (const id of ids) {
    individuals[id] = { ...doc.individuals[id], position: { x: seedX(id), y: genOf(id) * spacing.generationSpacing } };
  }
  if (opts.leafSpouse) {
    const ls = opts.leafSpouse;
    individuals[ls.id] = { ...doc.individuals[ls.id], position: { x: ls.seedX, y: genOf(ls.id) * spacing.generationSpacing } };
  }
  return { individuals, partnerships, parentChildLinks, twinGroups: doc.twinGroups };
}

/**
 * Root a re-tidy at the topmost childbearing union of a slice: any union with at
 * least one present partner and ≥1 present child, at the minimum partner
 * generation (id tie-break). A **single-parent apex** union (one partner
 * undefined) must be eligible — it is often the family's topmost union, and
 * rooting instead at a deeper childless couple lays the family out wrong (e.g.
 * `computeTreeLayout` strands a married twin's spouse across a non-twin
 * sibling). Requiring a present child skips isolated childless couples, which
 * the linear packing already spaces correctly. Returns null when the slice has
 * no childbearing union.
 * Regression guard: the `marriedTwinInterleaved` fixture (ALL_FIXTURES) —
 * reverting this to a two-partner-only root makes its `twinContiguity` fail.
 */
function pickRootUnion(slice: LayoutDoc, genOf: (id: string) => number): string | null {
  const isPresent = (id: string | undefined): id is string => !!id && !!slice.individuals[id];
  const candidates = Object.keys(slice.partnerships).filter((uid) => {
    const u = slice.partnerships[uid];
    return (
      (isPresent(u.partner1Id) || isPresent(u.partner2Id)) &&
      u.childrenIds.some((id) => isPresent(id))
    );
  });
  if (candidates.length === 0) return null;
  const gen = (uid: string): number =>
    Math.min(
      ...[slice.partnerships[uid].partner1Id, slice.partnerships[uid].partner2Id]
        .filter(isPresent)
        .map(genOf),
    );
  return candidates.sort((a, b) => gen(a) - gen(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
}

// ---------------------------------------------------------------------------
// Cross-branch coordinate phase (issue #141, residual 1a)
// ---------------------------------------------------------------------------

/**
 * Seed-x magnitude used to bias a partner's blood spine to its family's edge
 * during cross-branch order derivation. Far outside any packed coordinate, so a
 * biased node always sorts to the intended end of every sibship on its path.
 */
const SPINE_BIAS = 1e7;

/**
 * Coordinate phase for a component whose only non-plain feature is a single
 * cross-branch couple — a union whose BOTH partners are load-bearing (each has
 * present parents). The linear engine keeps the couple adjacent but cannot stop
 * the two subtrees hanging below it from overlapping or crossing descent lines;
 * whole-component `computeTreeLayout` delegation keeps the subtrees apart but
 * pins the far partner's family and balloons the chart width (both measured and
 * rejected, see #141). This phase splits the difference by SPLITTING THE
 * COMPONENT AT THE CROSS UNION:
 *
 * - each resulting blood side is a hub-free plain family — exactly the space
 *   the standing property gate proves green — tidied on its own with
 *   `computeTreeLayout` (no pinning: the far partner is either absent or a
 *   parentless leaf spouse in the side's slice), seed-biased so partner `a`
 *   hugs its family's right edge and partner `b` its family's left edge;
 * - the sides' laid-out geometries are then composed with the couple at
 *   `partnerSpacing`, pushed apart only by what same-row clearance and
 *   unrelated cross-side sibship extents demand ({@link retidyTwoSided});
 * - a consanguineous component (still connected without the cross union) is a
 *   single plain family instead, delegated whole with a divergence-sibship bias
 *   that makes the couple's branches adjacent ({@link retidyConsanguineous}).
 *
 * An earlier prototype re-packed the derived per-row ORDERS tightly and
 * re-separated with anchored rigid blocks; it was measurably better than the
 * linear layout but structurally leaky — per-row sweeps cannot see
 * `subtreeNonCollision`'s CROSS-ROW extent constraint, which the recursive
 * frame geometry satisfies by construction. Keeping the sides' geometry closes
 * that gap.
 *
 * Mutates `finalX` in place; falls back to the aligned linear layout when no
 * side layout can be derived. Deterministic; returns whether a corrective was
 * applied.
 */
function retidyCrossBranchComponent(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  group: readonly string[],
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
  cross: PartnershipRelationship,
): boolean {
  const p1 = cross.partner1Id!;
  const p2 = cross.partner2Id!;
  // a = the partner the aligned layout put on the left; b = the right partner.
  const [a, b] =
    finalX[p1] < finalX[p2] || (finalX[p1] === finalX[p2] && p1 < p2)
      ? [p1, p2]
      : [p2, p1];

  const slice = sliceFor(doc, group, (id) => finalX[id], genOf, spacing);

  // Detect-then-correct: the aligned linear layout is KEPT whenever it already
  // satisfies the hard geometric invariants — it is the tightest packing the
  // engine produces (the compaction the reformat fixtures pin), and most
  // cross-branch components are shallow enough for it. The corrective below is
  // wider (rigid per-side frames cannot slant a kid row toward the seam the way
  // the aligned rows do), so it runs only where the linear layout genuinely
  // fails: a deep subtree overlap or crossed descent (the #141 residual-1a
  // taxonomy).
  if (alignedCrossBranchIsClean(slice, finalX, genOf)) return false;

  // b's blood side: everything reachable from b without traversing the cross
  // union. If it reaches a, the families share ancestry (consanguineous).
  const bSide = sideOf(slice, b, cross.id);

  return bSide.has(a)
    ? retidyConsanguineous(doc, finalX, group, slice, a, b, cross, genOf, spacing)
    : retidyTwoSided(doc, finalX, group, slice, bSide, a, b, cross, genOf, spacing);
}

/**
 * Production-local check of the two hard invariants the linear layout can break
 * on a cross-branch component (mirrors the test oracle's `subtreeNonCollision`
 * and `noCrossedDescentLines`, evaluated on the component slice only — see
 * `reformatSuggestion.ts` for the same production-copy precedent):
 *
 * - no two non-ancestor-related sibship extents overlap in x, and
 * - for two sibships on the same child row, the left parent anchor's children
 *   all sit left of the right anchor's children.
 */
function alignedCrossBranchIsClean(
  slice: LayoutDoc,
  x: Record<string, number>,
  genOf: (id: string) => number,
): boolean {
  const tol = 0.5;
  const placed = new Set(Object.keys(slice.individuals));
  const exts = sibshipExtents(slice, placed, x, 0);
  const desc = unionDescendants(slice);
  const related = (u: string, v: string): boolean =>
    desc.get(u)?.has(v) === true || desc.get(v)?.has(u) === true;

  for (let i = 0; i < exts.length; i++) {
    for (let j = i + 1; j < exts.length; j++) {
      if (related(exts[i].unionId, exts[j].unionId)) continue;
      const overlap = Math.min(exts[i].max, exts[j].max) - Math.max(exts[i].min, exts[j].min);
      if (overlap > tol) return false;
    }
  }

  // Crossed descent lines: same child-row sibships must order children like
  // their parent anchors.
  const anchorX = (uid: string): number => {
    const u = slice.partnerships[uid];
    const partnerXs = [u.partner1Id, u.partner2Id]
      .filter((id): id is string => !!id && placed.has(id))
      .map((id) => x[id]);
    if (partnerXs.length > 0) return meanBy(partnerXs, (v) => v);
    const kids = u.childrenIds.filter((id) => placed.has(id));
    return meanBy(kids, (id) => x[id]);
  };
  const byRow = new Map<number, SibshipExtent[]>();
  for (const e of exts) {
    const kids = slice.partnerships[e.unionId].childrenIds.filter((id) => placed.has(id));
    const row = Math.min(...kids.map(genOf));
    (byRow.get(row) ?? byRow.set(row, []).get(row)!).push(e);
  }
  for (const rowExts of byRow.values()) {
    for (let i = 0; i < rowExts.length; i++) {
      for (let j = i + 1; j < rowExts.length; j++) {
        const axI = anchorX(rowExts[i].unionId);
        const axJ = anchorX(rowExts[j].unionId);
        const [l, r] = axI < axJ ? [rowExts[i], rowExts[j]] : [rowExts[j], rowExts[i]];
        if (Math.abs(axI - axJ) <= tol) continue;
        if (l.max >= r.min - tol) return false;
      }
    }
  }
  return true;
}

/**
 * Lay out and compose a two-family cross-branch component. Each side is tidied
 * as its own plain family (`a`'s side right-edge-biased and carrying the cross
 * union — with `b` as a parentless leaf spouse, so the couple's own children
 * are laid out under the couple on that side; `b`'s side left-edge-biased with
 * the cross union removed). The right side is then translated so the couple
 * sits at exactly `partnerSpacing`, plus whatever extra the hard constraints
 * demand:
 *
 * 1. same-row symbol clearance (`minGap`) between the sides, and
 * 2. disjointness of every unrelated cross-side pair of sibship extents —
 *    `subtreeNonCollision` compares child-x extents ACROSS rows, so a deep left
 *    subtree must not reach under the right family's children even when they
 *    share no row. Ancestor/descendant pairs (the cross union's own descent vs
 *    the partners' blood spines) are exempt, exactly as the invariant exempts
 *    them.
 *
 * The couple therefore reads adjacent (nothing between the partners; gap grows
 * past `partnerSpacing` only when a subtree genuinely needs the room), while
 * each side keeps the frame-built geometry whose internal validity the plain
 * property gate already proves.
 */
function retidyTwoSided(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  group: readonly string[],
  slice: LayoutDoc,
  bSide: ReadonlySet<string>,
  a: string,
  b: string,
  cross: PartnershipRelationship,
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
): boolean {
  const leftIds = group.filter((id) => !bSide.has(id));
  const rightIds = group.filter((id) => bSide.has(id));

  const leftSlice = sliceFor(doc, leftIds, (id) => finalX[id], genOf, spacing, {
    leafSpouse: { id: b, seedX: SPINE_BIAS + spacing.partnerSpacing },
    seedXOverrides: new Map(spineOf(doc, a, new Set(leftIds)).map((id) => [id, SPINE_BIAS])),
  });
  const rightSlice = sliceFor(doc, rightIds, (id) => finalX[id], genOf, spacing, {
    excludeUnionId: cross.id,
    seedXOverrides: new Map(spineOf(doc, b, new Set(rightIds)).map((id) => [id, -SPINE_BIAS])),
  });
  const xL = deriveSideLayout(leftSlice, genOf, spacing);
  const xR = deriveSideLayout(rightSlice, genOf, spacing);
  if (!xL || !xR) return false; // no childbearing root — keep the aligned layout

  const minGap = Math.max(spacing.siblingSpacing, MIN_GENERATION_NODE_SPACING);
  // Compose with the couple at exactly partnerSpacing…
  let shift = xL[a] + spacing.partnerSpacing - xR[b];

  // …then push the right side out by what clearance demands.
  let extra = 0;
  // (1) Same-row clearance between the sides.
  const rowMax = new Map<number, number>();
  for (const id of leftIds) {
    const g = genOf(id);
    const m = rowMax.get(g);
    if (m === undefined || xL[id] > m) rowMax.set(g, xL[id]);
  }
  for (const id of rightIds) {
    const m = rowMax.get(genOf(id));
    if (m === undefined) continue;
    const need = m + minGap - (xR[id] + shift);
    if (need > extra) extra = need;
  }
  // (2) Unrelated cross-side sibship extents must not overlap (cross-row).
  const desc = unionDescendants(slice);
  const related = (u: string, v: string): boolean =>
    desc.get(u)?.has(v) === true || desc.get(v)?.has(u) === true;
  for (const le of sibshipExtents(slice, new Set(leftIds), xL, 0)) {
    for (const re of sibshipExtents(slice, new Set(rightIds), xR, shift)) {
      if (related(le.unionId, re.unionId)) continue;
      const need = le.max + minGap - re.min;
      if (need > extra) extra = need;
    }
  }
  shift += Math.max(0, extra);

  for (const id of leftIds) finalX[id] = xL[id];
  for (const id of rightIds) finalX[id] = xR[id] + shift;
  return true;
}

/**
 * Lay out a consanguineous cross-branch component (the couple shares blood
 * ancestry, so the component minus the cross union is still ONE connected plain
 * family). The whole slice is delegated with the cross union removed — keeping
 * it would pin the far partner inside the frame and split the couple across
 * rigid blocks, which measurably corrupts the layout — and seed-biased so the
 * couple reads adjacent:
 *
 * - at the DIVERGENCE sibship (where the two blood spines are siblings under
 *   their deepest shared union), `a`'s branch is pushed to the right end with
 *   `b`'s branch immediately after it;
 * - below the divergence, `a` hugs its branch's right edge and `b` its branch's
 *   left edge.
 *
 * Every row then reads `… a's branch …, sa, a, b, sb, … b's branch …`, and the
 * frame geometry keeps all sibship extents disjoint by construction. Children
 * of the cross union (fixture-only; the generator's cross unions are childless)
 * are disconnected in the sliced graph and keep their aligned-linear
 * arrangement, re-centred under the couple.
 */
function retidyConsanguineous(
  doc: LayoutDoc,
  finalX: Record<string, number>,
  group: readonly string[],
  slice: LayoutDoc,
  a: string,
  b: string,
  cross: PartnershipRelationship,
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
): boolean {
  const present = new Set(group);
  const spineA = spineOf(doc, a, present);
  const spineB = spineOf(doc, b, present);
  const parentUnionOf = (id: string): string | undefined =>
    Object.values(doc.parentChildLinks).find((l) => l.childId === id)?.parentPartnershipId;

  // Deepest shared parent union: the sibship where the two spines diverge.
  const bLevel = new Map<string, number>();
  spineB.forEach((id, j) => {
    const u = parentUnionOf(id);
    if (u !== undefined && !bLevel.has(u)) bLevel.set(u, j);
  });
  let ai = -1;
  let bj = -1;
  for (let i = 0; i < spineA.length; i++) {
    const u = parentUnionOf(spineA[i]);
    if (u !== undefined && bLevel.has(u)) {
      ai = i;
      bj = bLevel.get(u)!;
      break;
    }
  }
  if (ai < 0) return false; // no shared blood sibship: keep the aligned layout

  const bias = new Map<string, number>();
  for (let i = 0; i <= ai; i++) bias.set(spineA[i], SPINE_BIAS);
  for (let j = 0; j < bj; j++) bias.set(spineB[j], -SPINE_BIAS);
  bias.set(spineB[bj], SPINE_BIAS + 1);
  // When b itself sits at the divergence (the couple are siblings), its own
  // huge seed would flip its married-in spouse to its LEFT — between the cross
  // couple. Bias the spouse past b so it stays on the outside.
  if (bj === 0) {
    for (const u of Object.values(doc.partnerships)) {
      if (u.id === cross.id) continue;
      const s = u.partner1Id === b ? u.partner2Id : u.partner2Id === b ? u.partner1Id : undefined;
      if (s && s !== b && present.has(s) && !bias.has(s)) bias.set(s, SPINE_BIAS + 2);
    }
  }

  const biased = sliceFor(doc, group, (id) => finalX[id], genOf, spacing, {
    excludeUnionId: cross.id,
    seedXOverrides: bias,
  });
  const xo = deriveSideLayout(biased, genOf, spacing);
  if (!xo) return false; // no childbearing root — keep the aligned layout

  // The cross union's own descent (if any) is disconnected in the sliced graph
  // and never placed by the frame; re-centre its aligned-linear arrangement
  // under the couple. Everything reachable from `a` takes the frame geometry.
  const placedSet = sideOf(slice, a, cross.id);
  const floaters: string[] = [];
  for (const id of group) {
    if (placedSet.has(id)) finalX[id] = xo[id];
    else floaters.push(id);
  }
  if (floaters.length > 0) {
    const target = (xo[a] + xo[b]) / 2;
    const shift = target - meanBy(floaters, (id) => finalX[id]);
    for (const id of floaters) finalX[id] += shift;
  }
  return true;
}

/** One union's placed-children x-extent (its sibship footprint). */
interface SibshipExtent {
  unionId: string;
  min: number;
  max: number;
}

/**
 * The x-extent of every union's placed children within `ids`, offset by
 * `offset` — the footprint {@link subtreeNonCollision} compares across rows.
 */
function sibshipExtents(
  slice: LayoutDoc,
  ids: ReadonlySet<string>,
  x: Record<string, number>,
  offset: number,
): SibshipExtent[] {
  const out: SibshipExtent[] = [];
  for (const [uid, u] of Object.entries(slice.partnerships)) {
    const xs = u.childrenIds
      .filter((id) => ids.has(id) && x[id] !== undefined)
      .map((id) => x[id] + offset);
    if (xs.length === 0) continue;
    out.push({ unionId: uid, min: Math.min(...xs), max: Math.max(...xs) });
  }
  return out;
}

/**
 * The set of slice members reachable from `start` over partner and parent-child
 * edges, with the union `excludeUnionId` (and its child links) removed — one
 * blood side of a cross-branch split.
 */
function sideOf(slice: LayoutDoc, start: string, excludeUnionId: string): Set<string> {
  const adj = new Map<string, string[]>();
  const addEdge = (x: string, y: string): void => {
    (adj.get(x) ?? adj.set(x, []).get(x)!).push(y);
    (adj.get(y) ?? adj.set(y, []).get(y)!).push(x);
  };
  for (const [uid, u] of Object.entries(slice.partnerships)) {
    if (uid === excludeUnionId) continue;
    const q1 = u.partner1Id;
    const q2 = u.partner2Id;
    if (q1 && q2 && q1 !== q2 && slice.individuals[q1] && slice.individuals[q2]) addEdge(q1, q2);
  }
  for (const l of Object.values(slice.parentChildLinks)) {
    if (l.parentPartnershipId === excludeUnionId) continue;
    const u = slice.partnerships[l.parentPartnershipId];
    if (!u || !slice.individuals[l.childId]) continue;
    for (const p of [u.partner1Id, u.partner2Id]) {
      if (p && slice.individuals[p]) addEdge(p, l.childId);
    }
  }
  const side = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of adj.get(cur) ?? []) {
      if (!side.has(n)) {
        side.add(n);
        stack.push(n);
      }
    }
  }
  return side;
}

/**
 * The blood spine of `start` within `within`: the node itself plus, at each
 * parent union above, the partner who continues the blood line (has their own
 * parent link). Every sibship along this path contains exactly one spine node,
 * so seeding the whole spine to one extreme x pushes `start`'s branch to that
 * edge of its family at every level. Cycle-guarded.
 */
function spineOf(doc: LayoutDoc, start: string, within: ReadonlySet<string>): string[] {
  const out: string[] = [start];
  const seen = new Set<string>([start]);
  let cur = start;
  for (;;) {
    const l = Object.values(doc.parentChildLinks).find((l2) => l2.childId === cur);
    if (!l) break;
    const u = doc.partnerships[l.parentPartnershipId];
    if (!u) break;
    const next = [u.partner1Id, u.partner2Id].find(
      (p): p is string =>
        !!p && within.has(p) && !seen.has(p) &&
        Object.values(doc.parentChildLinks).some((l2) => l2.childId === p),
    );
    if (!next) break;
    seen.add(next);
    out.push(next);
    cur = next;
  }
  return out;
}

/**
 * Lay out one blood side of a cross-branch split: delegate the slice to
 * `computeTreeLayout` rooted at its topmost childbearing union, and return
 * every slice member's resulting x (an unmoved member keeps its seed). Null
 * when the slice has no childbearing union to root at.
 */
function deriveSideLayout(
  slice: LayoutDoc,
  genOf: (id: string) => number,
  spacing: LayoutSpacing,
): Record<string, number> | null {
  const root = pickRootUnion(slice, genOf);
  if (root === null) return null;
  const moves = computeTreeLayout(slice, root, spacing);
  const out: Record<string, number> = {};
  for (const id of Object.keys(slice.individuals)) {
    out[id] = moves[id]?.x ?? slice.individuals[id].position.x;
  }
  return out;
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
