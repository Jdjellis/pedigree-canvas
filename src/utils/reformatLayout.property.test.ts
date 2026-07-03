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

// ARMED — the standing green regression gate over the supported topology space.
//
// SUPPORTED_SPACE excludes the two remaining known-unhandled shapes (3+-union
// hubs and married twins); everything else it generates — plain branching
// families of any depth/asymmetry, twins, remarriage half-sibs, disconnected
// components, and cross-branch couples — satisfies every hard invariant and is
// idempotent.
//
// History (#141): the subtree-overlap correctness gap was closed in two steps —
// plain families are re-tidied through `computeTreeLayout`'s contour separation
// (#144, `subtreeCollisionRegression`), and the `separateGenerations` sweep now
// excludes ancestor/descendant blocks so a deep asymmetric family no longer
// drifts a nested subtree into a shallow cousin (residual 4, `deepAsymmetricSubtree`).
// Cross-branch couples (residual 1a) joined the space when the cross-branch
// coordinate phase landed: a component whose only non-plain feature is a single
// cross-branch couple keeps its aligned linear layout while that layout is
// clean, and is otherwise split at the cross union into two plain families that
// are re-tidied and composed at the couple (`retidyCrossBranchComponent`;
// fixtures `consanguineousSibCouple`, `crossBranchChainCrossing`,
// `cousinCoupleSubtreeCollision`). Still tracked and still excluded until its
// coordinate phase lands: multi-union hub / twin-as-hub (residual 1b). Widen
// the `SUPPORTED_SPACE` caps as each is closed; the opt-in
// `npm run test:discovery` harness (FULL_SPACE) is where they still surface.
describe('reformatLayout property (supported space)', () => {
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
      { seed: 42, numRuns: 1000 },
    );
  });
});
