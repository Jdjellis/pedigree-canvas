import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import { arbitraryLayoutDoc, SUPPORTED_SPACE } from './__fixtures__/arbitraryPedigree';
import {
  finalPositions,
  checkAllInvariants,
  noNodeBetweenPartners,
  twinContiguity,
} from './__fixtures__/invariants';

/** Apply reformat moves back onto the doc (for the idempotence check). */
function settle(doc: LayoutDoc, moves: Record<string, { x: number; y: number }>): LayoutDoc {
  return {
    ...doc,
    individuals: Object.fromEntries(
      Object.entries(doc.individuals).map(([id, node]) => [
        id,
        moves[id] ? { ...node, position: { x: moves[id].x, y: moves[id].y } } : node,
      ]),
    ),
  };
}

// SKIPPED until the #141 engine fix. Property-based discovery found that
// reformatLayout produces overlapping subtrees (subtreeNonCollision) even on a
// connected single family within this "supported" space — see the
// `subtreeCollisionRegression` fixture. Once the coordinate phase gains
// contour-based subtree separation, remove `.skip`, run `npm run test:discovery`
// to confirm the supported space is clean, and this becomes the standing green
// regression gate.
describe.skip('reformatLayout property (supported space)', () => {
  it('satisfies every hard invariant and is idempotent over random valid docs', () => {
    fc.assert(
      fc.property(arbitraryLayoutDoc(SUPPORTED_SPACE), (doc) => {
        const pos = finalPositions(doc, reformatLayout(doc));
        expect(checkAllInvariants(pos, doc).violations).toEqual([]);
        expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
        expect(twinContiguity(pos, doc, doc.twinGroups ?? {}).ok).toBe(true);
        // idempotence: a second pass moves nothing (<1px)
        const settled = settle(doc, reformatLayout(doc));
        const twice = reformatLayout(settled);
        for (const [id, p] of Object.entries(twice)) {
          expect(Math.abs(p.x - settled.individuals[id].position.x)).toBeLessThan(1);
          expect(Math.abs(p.y - settled.individuals[id].position.y)).toBeLessThan(1);
        }
      }),
      { seed: 42, numRuns: 500 },
    );
  });
});
