import type { LayoutDoc } from './treeLayout';
import { SYMBOL_SIZE } from './constants';

/**
 * Whether the document's CURRENT positions contain a *foreign* individual sitting
 * strictly between the two partners of a couple on their shared generation row —
 * the one hard, clearly-wrong layout state that the order-preserving per-edit
 * engine (`computeTreeLayout`) cannot clear but the whole-document `reformatLayout`
 * re-tidy resolves by construction.
 *
 * This is the signal behind the *suggest-a-reformat* nudge. We deliberately do
 * **not** auto-apply a reformat: `reformatLayout` is free to reorder rows and so
 * would blow away the user's manual arrangement, whereas the per-edit engine
 * preserves it. So when a cross-branch marriage or a multi-union hub leaves a
 * relative wedged between a couple — something no incremental, order-preserving
 * pass can undo — we surface an opt-in "reformat to tidy" prompt rather than
 * reformatting behind the user's back.
 *
 * Mirrors the `noNodeBetweenPartners` invariant (issue #137) exactly: same
 * tolerance (`SYMBOL_SIZE / 2`), same 1 px row match, and the same **hub carve-out**
 * — a hub (an individual with ≥ 3 same-row unions) unavoidably keeps one of its own
 * spouses between it and a non-adjacent spouse, which no linear row can avoid, so
 * that co-spouse is not flagged (reformat cannot improve it either). Kept as a
 * focused production predicate instead of importing the test-only invariants
 * module; `reformatSuggestion.test.ts` cross-checks the two agree on every fixture.
 *
 * Pure and side-effect free. Returns `false` for an empty or single-person
 * document (no couples ⇒ nothing to untangle), so a fresh or trivial pedigree
 * never nags.
 *
 * @param doc - Document slice (individuals carry the live canvas positions).
 * @returns `true` when a reformat would untangle a foreign node from between a
 *   couple; `false` otherwise.
 */
export function shouldSuggestReformat(doc: LayoutDoc): boolean {
  const tol = SYMBOL_SIZE / 2;
  const rowTol = 1;
  const inds = doc.individuals;

  // Same-row partner graph — used both to locate couples and for the hub
  // carve-out. Mirrors noNodeBetweenPartners: keyed on every union's two partners,
  // presence is enforced later via each node's position lookup.
  const partnersOf = new Map<string, Set<string>>();
  for (const u of Object.values(doc.partnerships)) {
    const a = u.partner1Id;
    const b = u.partner2Id;
    if (!a || !b || a === b) continue;
    (partnersOf.get(a) ?? partnersOf.set(a, new Set<string>()).get(a)!).add(b);
    (partnersOf.get(b) ?? partnersOf.set(b, new Set<string>()).get(b)!).add(a);
  }

  /** How many of `id`'s partners are placed on its own row (effective union degree). */
  const sameRowDegree = (id: string, y: number): number => {
    let n = 0;
    for (const q of partnersOf.get(id) ?? []) {
      const qp = inds[q]?.position;
      if (qp && Math.abs(qp.y - y) <= rowTol) n++;
    }
    return n;
  };

  /** A hub (≥3 same-row unions) may keep one own-spouse between it and a
   *  non-adjacent spouse — the only structurally-unavoidable betweenness. */
  const isUnavoidableHubSpouse = (
    x: string,
    p1: string,
    p2: string,
    y: number,
  ): boolean =>
    (partnersOf.get(p1)?.has(x) === true && sameRowDegree(p1, y) >= 3) ||
    (partnersOf.get(p2)?.has(x) === true && sameRowDegree(p2, y) >= 3);

  const allIds = Object.keys(inds);
  for (const u of Object.values(doc.partnerships)) {
    const p1 = u.partner1Id;
    const p2 = u.partner2Id;
    if (!p1 || !p2 || p1 === p2) continue;
    const p1pos = inds[p1]?.position;
    const p2pos = inds[p2]?.position;
    if (!p1pos || !p2pos) continue;
    const lo = Math.min(p1pos.x, p2pos.x);
    const hi = Math.max(p1pos.x, p2pos.x);
    const rowY = (p1pos.y + p2pos.y) / 2;
    for (const id of allIds) {
      if (id === p1 || id === p2) continue;
      const pos = inds[id].position;
      if (Math.abs(pos.y - rowY) > rowTol) continue;
      if (pos.x > lo + tol && pos.x < hi - tol) {
        if (isUnavoidableHubSpouse(id, p1, p2, rowY)) continue;
        return true;
      }
    }
  }
  return false;
}
