/**
 * Invariant matchers for the pedigree layout engine.
 *
 * Pure predicates that return `{ ok, violations }`. Used by Tasks 3–11 of the
 * auto-spacing rewrite (issue #131) to assert correctness of `computeTreeLayout`
 * output. Framework-agnostic: no React, no Konva, no side-effects.
 */

import type { TwinGroup } from '../../types/pedigree';
import {
  DEFAULT_LAYOUT_SPACING,
  isLoadBearingInLaw,
} from '../treeLayout';
import type { LayoutDoc, LayoutSpacing } from '../treeLayout';
import { SYMBOL_SIZE } from '../constants';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** A canvas-space coordinate. */
export interface Point {
  x: number;
  y: number;
}

/** Final resolved positions keyed by individual id. */
export type Positions = Record<string, Point>;

/** A single invariant violation. */
export interface Violation {
  rule: string;
  ids: string[];
  detail: string;
}

/** Result returned by every matcher. */
export interface InvariantResult {
  ok: boolean;
  violations: Violation[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the set of present children for a union (children present in `doc`). */
function siblingsOf(
  doc: LayoutDoc,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [uid, u] of Object.entries(doc.partnerships)) {
    const present = u.childrenIds.filter((id) => id in doc.individuals);
    if (present.length > 0) {
      result.set(uid, present);
    }
  }
  return result;
}

/**
 * Sort ids by x in `pos`, with id as a deterministic tie-break.
 */
function sortByX(ids: string[], pos: Positions): string[] {
  return [...ids].sort((a, b) => {
    const dx = pos[a].x - pos[b].x;
    if (dx !== 0) return dx;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Compute the arithmetic mean of an array of numbers. */
function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * True when union `uA` is an ancestor of union `uB` (i.e. one of uA's children
 * is a parent in uB, directly or via further nesting). Prevents subtreeNonCollision
 * from flagging parent/child sibships as colliding.
 */
function isAncestorUnion(
  doc: LayoutDoc,
  uA: string,
  uB: string,
  visited = new Set<string>(),
): boolean {
  if (visited.has(uA)) return false;
  visited.add(uA);
  const unionA = doc.partnerships[uA];
  if (!unionA) return false;
  for (const child of unionA.childrenIds) {
    // Is this child a partner in uB?
    const uBObj = doc.partnerships[uB];
    if (
      uBObj &&
      (uBObj.partner1Id === child || uBObj.partner2Id === child)
    ) {
      return true;
    }
    // Walk child's own unions recursively.
    for (const [uid, u] of Object.entries(doc.partnerships)) {
      if (u.partner1Id === child || u.partner2Id === child) {
        if (isAncestorUnion(doc, uid, uB, visited)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exported matchers
// ---------------------------------------------------------------------------

/**
 * Produce final canvas positions by merging a move-map over the stored positions
 * in `doc`. For every individual in `doc`, use `moved[id]` when present, else
 * the individual's own `position`.
 */
export function finalPositions(
  doc: LayoutDoc,
  moved: Record<string, { x: number; y: number }>,
): Positions {
  const result: Positions = {};
  for (const id of Object.keys(doc.individuals)) {
    const m = moved[id];
    result[id] = m ? { x: m.x, y: m.y } : { ...doc.individuals[id].position };
  }
  return result;
}

/**
 * Assert that no two individuals whose final y-coordinates are the same (within
 * 1 px tolerance) have centres closer than `SYMBOL_SIZE` horizontally.
 */
export function noSymbolOverlap(
  pos: Positions,
  _doc: LayoutDoc,
): InvariantResult {
  const violations: Violation[] = [];
  const ids = Object.keys(pos);
  // Bucket ids by rounded y (tolerance = 1 px).
  const byY = new Map<number, string[]>();
  for (const id of ids) {
    const ky = Math.round(pos[id].y);
    const bucket = byY.get(ky) ?? [];
    bucket.push(id);
    byY.set(ky, bucket);
  }
  for (const bucket of byY.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (Math.abs(pos[a].x - pos[b].x) < SYMBOL_SIZE) {
          violations.push({
            rule: 'noSymbolOverlap',
            ids: [a, b],
            detail: `|x(${a}) - x(${b})| = ${Math.abs(pos[a].x - pos[b].x).toFixed(1)} < SYMBOL_SIZE(${SYMBOL_SIZE})`,
          });
        }
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Assert that adjacent siblings (ordered by final x) within every union are at
 * least `spacing.siblingSpacing` apart (tolerance 0.5 px).
 */
export function minSiblingSpacing(
  pos: Positions,
  doc: LayoutDoc,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): InvariantResult {
  const violations: Violation[] = [];
  const tol = 0.5;
  const sibMap = siblingsOf(doc);
  for (const [uid, children] of sibMap) {
    const present = children.filter((id) => id in pos);
    const ordered = sortByX(present, pos);
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      const gap = pos[b].x - pos[a].x;
      if (gap < spacing.siblingSpacing - tol) {
        violations.push({
          rule: 'minSiblingSpacing',
          ids: [uid, a, b],
          detail: `gap(${a},${b}) = ${gap.toFixed(1)} < siblingSpacing(${spacing.siblingSpacing})`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Assert that every ordinary couple (neither partner is a load-bearing in-law)
 * is exactly `spacing.partnerSpacing` apart (tolerance 0.5 px).
 * Wide couples (where one partner is load-bearing) are exempt.
 */
export function minPartnerSpacing(
  pos: Positions,
  doc: LayoutDoc,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): InvariantResult {
  const violations: Violation[] = [];
  const tol = 0.5;
  for (const [uid, u] of Object.entries(doc.partnerships)) {
    const p1 = u.partner1Id;
    const p2 = u.partner2Id;
    if (!p1 || !p2) continue;
    if (!(p1 in pos) || !(p2 in pos)) continue;
    // Self-partnered union (degenerate): skip — it is not a real couple.
    if (p1 === p2) continue;
    // Wide-couple exemption: skip if either partner is load-bearing.
    if (isLoadBearingInLaw(doc, p1) || isLoadBearingInLaw(doc, p2)) continue;
    const gap = Math.abs(pos[p1].x - pos[p2].x);
    if (Math.abs(gap - spacing.partnerSpacing) > tol) {
      violations.push({
        rule: 'minPartnerSpacing',
        ids: [uid, p1, p2],
        detail: `|x(${p1}) - x(${p2})| = ${gap.toFixed(1)}, expected ${spacing.partnerSpacing}`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Assert structural generation-row alignment:
 * 1. All present children of each union share a single y (max-min ≤ tol).
 * 2. Both present partners of each union share a single y.
 * 3. Each child's y is strictly greater than both its parents' y.
 *
 * Default tolerance: 1 px.
 */
export function generationRowAlignment(
  pos: Positions,
  doc: LayoutDoc,
  tol = 1,
): InvariantResult {
  const violations: Violation[] = [];

  for (const [uid, u] of Object.entries(doc.partnerships)) {
    // 1. Children must share a y.
    const children = u.childrenIds.filter((id) => id in pos);
    if (children.length >= 2) {
      const ys = children.map((id) => pos[id].y);
      const spread = Math.max(...ys) - Math.min(...ys);
      if (spread > tol) {
        violations.push({
          rule: 'generationRowAlignment',
          ids: [uid, ...children],
          detail: `children y-spread = ${spread.toFixed(1)} > tol(${tol})`,
        });
      }
    }

    // 2. Both partners must share a y.
    const p1 = u.partner1Id;
    const p2 = u.partner2Id;
    if (p1 && p2 && p1 in pos && p2 in pos) {
      const dy = Math.abs(pos[p1].y - pos[p2].y);
      if (dy > tol) {
        violations.push({
          rule: 'generationRowAlignment',
          ids: [uid, p1, p2],
          detail: `partners y-diff = ${dy.toFixed(1)} > tol(${tol})`,
        });
      }
    }

    // 3. Each child must be below both parents.
    const parentYs: number[] = [];
    if (p1 && p1 in pos) parentYs.push(pos[p1].y);
    if (p2 && p2 in pos) parentYs.push(pos[p2].y);
    if (parentYs.length === 0) continue;
    const maxParentY = Math.max(...parentYs);
    for (const cid of children) {
      if (pos[cid].y <= maxParentY + tol) {
        violations.push({
          rule: 'generationRowAlignment',
          ids: [uid, cid],
          detail: `child(${cid}).y = ${pos[cid].y.toFixed(1)} not > parent y(${maxParentY.toFixed(1)})`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Assert that descent lines do not cross. For every ordered pair of unions (U, V)
 * with present children **in the same generation row**: if the parent-anchor x of U
 * is strictly left of V's (gap > tol), then every child of U must have x strictly
 * less than every child of V. A breach means lines from U and V would cross.
 *
 * "Same generation row" is determined by the y-coordinate of the unions' present
 * children (all children of a union share a row; we use the minimum child y as the
 * row key, bucketed with 1 px tolerance). Pairs whose children sit on different
 * rows are skipped — crossing between different generations is not meaningful.
 *
 * Parent-anchor x is the mean of present partners' x; fallback: mean of children x.
 */
export function noCrossedDescentLines(
  pos: Positions,
  doc: LayoutDoc,
): InvariantResult {
  const violations: Violation[] = [];
  const tol = 0.5;
  const sibMap = siblingsOf(doc);

  const anchorX = (uid: string): number => {
    const u = doc.partnerships[uid];
    const partnerXs: number[] = [];
    if (u.partner1Id && u.partner1Id in pos) partnerXs.push(pos[u.partner1Id].x);
    if (u.partner2Id && u.partner2Id in pos) partnerXs.push(pos[u.partner2Id].x);
    if (partnerXs.length > 0) return mean(partnerXs);
    const cids = sibMap.get(uid)!.filter((id) => id in pos);
    return mean(cids.map((id) => pos[id].x));
  };

  /** Compute the child-row y for a union (min y of its present children). */
  const childRowY = (uid: string): number => {
    const children = sibMap.get(uid)!.filter((id) => id in pos);
    return Math.min(...children.map((id) => pos[id].y));
  };

  // Bucket union ids by their child-row y (1 px tolerance → use Math.round).
  const byChildRow = new Map<number, string[]>();
  for (const uid of sibMap.keys()) {
    const presentChildren = sibMap.get(uid)!.filter((id) => id in pos);
    if (presentChildren.length === 0) continue;
    const rowKey = Math.round(childRowY(uid));
    const bucket = byChildRow.get(rowKey) ?? [];
    bucket.push(uid);
    byChildRow.set(rowKey, bucket);
  }

  // Only compare unions within the same child-row bucket.
  for (const bucket of byChildRow.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const uId = bucket[i];
        const vId = bucket[j];
        const uChildren = sibMap.get(uId)!.filter((id) => id in pos);
        const vChildren = sibMap.get(vId)!.filter((id) => id in pos);
        if (uChildren.length === 0 || vChildren.length === 0) continue;

        const axU = anchorX(uId);
        const axV = anchorX(vId);

        // Only check when U is meaningfully left of V.
        if (axU >= axV - tol) continue;

        const maxUChildX = Math.max(...uChildren.map((id) => pos[id].x));
        const minVChildX = Math.min(...vChildren.map((id) => pos[id].x));
        if (maxUChildX >= minVChildX - tol) {
          violations.push({
            rule: 'noCrossedDescentLines',
            ids: [uId, vId],
            detail: `anchor(${uId})=${axU.toFixed(1)} < anchor(${vId})=${axV.toFixed(1)} but maxChild(${uId})=${maxUChildX.toFixed(1)} >= minChild(${vId})=${minVChildX.toFixed(1)}`,
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Assert that independent cousin sibships do not horizontally overlap.
 * Two sibships overlap when their child-x extents intersect by more than `tol`
 * AND neither union is an ancestor of the other.
 */
export function subtreeNonCollision(
  pos: Positions,
  doc: LayoutDoc,
): InvariantResult {
  const violations: Violation[] = [];
  const tol = 0.5;
  const sibMap = siblingsOf(doc);
  const unionIds = [...sibMap.keys()];

  for (let i = 0; i < unionIds.length; i++) {
    for (let j = i + 1; j < unionIds.length; j++) {
      const uId = unionIds[i];
      const vId = unionIds[j];
      const uKids = sibMap.get(uId)!.filter((id) => id in pos);
      const vKids = sibMap.get(vId)!.filter((id) => id in pos);
      if (uKids.length === 0 || vKids.length === 0) continue;

      // Skip ancestor/descendant pairs.
      if (
        isAncestorUnion(doc, uId, vId) ||
        isAncestorUnion(doc, vId, uId)
      ) {
        continue;
      }

      const uMin = Math.min(...uKids.map((id) => pos[id].x));
      const uMax = Math.max(...uKids.map((id) => pos[id].x));
      const vMin = Math.min(...vKids.map((id) => pos[id].x));
      const vMax = Math.max(...vKids.map((id) => pos[id].x));

      // Overlap when neither extent is fully to the right of the other.
      const overlap = Math.min(uMax, vMax) - Math.max(uMin, vMin);
      if (overlap > tol) {
        violations.push({
          rule: 'subtreeNonCollision',
          ids: [uId, vId],
          detail: `extents [${uMin},${uMax}] and [${vMin},${vMax}] overlap by ${overlap.toFixed(1)}`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Assert that the relative left-to-right order of siblings in the output
 * (`pos`) matches their order in the input (`doc` positions). This preserves
 * any manual arrangement the user placed before triggering relayout.
 */
export function manualOrderPreserved(
  doc: LayoutDoc,
  pos: Positions,
): InvariantResult {
  const violations: Violation[] = [];

  for (const [uid, u] of Object.entries(doc.partnerships)) {
    const present = u.childrenIds.filter(
      (id) => id in doc.individuals && id in pos,
    );
    if (present.length < 2) continue;

    // Input order: sort by doc position x, id tie-break.
    const inputOrder = [...present].sort((a, b) => {
      const dx = doc.individuals[a].position.x - doc.individuals[b].position.x;
      if (dx !== 0) return dx;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    // Output order: sort by final pos x, id tie-break.
    const outputOrder = sortByX(present, pos);

    const changed = inputOrder.some((id, i) => id !== outputOrder[i]);
    if (changed) {
      violations.push({
        rule: 'manualOrderPreserved',
        ids: [uid, ...present],
        detail: `input=[${inputOrder.join(',')}] output=[${outputOrder.join(',')}]`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Assert that all members of each twin group occupy a contiguous run in the
 * left-to-right ordering of their sibship.
 */
export function twinContiguity(
  pos: Positions,
  doc: LayoutDoc,
  twinGroups: Record<string, TwinGroup>,
): InvariantResult {
  const violations: Violation[] = [];
  const sibMap = siblingsOf(doc);

  for (const [gid, group] of Object.entries(twinGroups)) {
    const members = new Set(group.individualIds.filter((id) => id in pos));
    if (members.size < 2) continue;

    // Find the union whose children include all members.
    let unionId: string | null = null;
    for (const [uid, children] of sibMap) {
      if (group.individualIds.every((id) => children.includes(id))) {
        unionId = uid;
        break;
      }
    }
    if (!unionId) continue;

    const children = sibMap.get(unionId)!.filter((id) => id in pos);
    const ordered = sortByX(children, pos);

    // Find the first and last index of any twin member.
    const indices = ordered
      .map((id, i) => (members.has(id) ? i : -1))
      .filter((i) => i >= 0);
    const firstIdx = Math.min(...indices);
    const lastIdx = Math.max(...indices);

    // All slots between firstIdx and lastIdx must be members.
    const run = ordered.slice(firstIdx, lastIdx + 1);
    const nonMembersInRun = run.filter((id) => !members.has(id));
    if (nonMembersInRun.length > 0) {
      violations.push({
        rule: 'twinContiguity',
        ids: [gid, ...group.individualIds],
        detail: `non-twin siblings [${nonMembersInRun.join(',')}] sit between twin members`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Assert that the anchor individual did not move (or is absent from the
 * move-map). The anchor is the individual whose position the caller wants to
 * hold fixed across a relayout.
 *
 * @param tol - Tolerance in canvas units (default 0.5).
 */
export function anchorStability(
  doc: LayoutDoc,
  moved: Record<string, { x: number; y: number }>,
  anchorId: string,
  tol = 0.5,
): InvariantResult {
  const m = moved[anchorId];
  if (m === undefined) {
    return { ok: true, violations: [] };
  }
  const original = doc.individuals[anchorId]?.position;
  if (!original) {
    return { ok: true, violations: [] };
  }
  const dx = Math.abs(m.x - original.x);
  const dy = Math.abs(m.y - original.y);
  if (dx <= tol && dy <= tol) {
    return { ok: true, violations: [] };
  }
  return {
    ok: false,
    violations: [
      {
        rule: 'anchorStability',
        ids: [anchorId],
        detail: `anchor moved by (${dx.toFixed(1)}, ${dy.toFixed(1)}), tol=${tol}`,
      },
    ],
  };
}

/**
 * Run all six positional invariants and aggregate results.
 * Does NOT run `manualOrderPreserved`, `twinContiguity`, or `anchorStability`
 * as those require additional inputs.
 */
export function checkAllInvariants(
  pos: Positions,
  doc: LayoutDoc,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): InvariantResult {
  const results = [
    noSymbolOverlap(pos, doc),
    minSiblingSpacing(pos, doc, spacing),
    minPartnerSpacing(pos, doc, spacing),
    generationRowAlignment(pos, doc),
    noCrossedDescentLines(pos, doc),
    subtreeNonCollision(pos, doc),
  ];
  const violations = results.flatMap((r) => r.violations);
  return { ok: violations.length === 0, violations };
}
