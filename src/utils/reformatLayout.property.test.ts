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

// STILL SKIPPED — narrowed but not yet green (#141 progress).
//
// The first engine gap is FIXED: a *plain* branching family (every union
// blood × married-in, no hub, no cross-branch couple) is now re-tidied through
// `computeTreeLayout`'s contour separation, so `subtreeCollisionRegression` and
// its whole class no longer overlap. What remains red over SUPPORTED_SPACE, found
// by `npm run test:discovery`:
//   - cross-branch couples and multi-union hubs are still laid out by the linear
//     packing (delegating would balloon chart width — see `wideMultiFounderChart`),
//     which leaves their deep subtrees overlapping (`subtreeNonCollision`) and can
//     cross descent lines (`noCrossedDescentLines`);
//   - a hub keeps a foreign node between a stranded union's partners
//     (`minPartnerSpacing`, `noNodeBetweenPartners`) — the rec 3.2 follow-up; and
//   - `computeTreeLayout` itself still overlaps cousin subtrees on rare very deep
//     asymmetric families.
// When those are closed, remove `.skip`, confirm `npm run test:discovery` is clean,
// and this becomes the standing green regression gate.
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
