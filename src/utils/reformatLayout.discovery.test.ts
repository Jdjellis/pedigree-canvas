import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import { arbitraryLayoutDoc, FULL_SPACE } from './__fixtures__/arbitraryPedigree';
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

// Opt-in only: `npm run test:discovery` (sets REFORMAT_DISCOVERY=1). Never runs
// in normal CI — it shows as skipped. Uses a rotating seed + high numRuns so each
// run explores new territory; on failure fast-check prints the shrunk
// counterexample AND the seed, so any finding is reproducible.
describe.skipIf(!process.env.REFORMAT_DISCOVERY)('reformatLayout — discovery (full space)', () => {
  it('finds no invariant violation across the full topology space', () => {
    fc.assert(
      // Same invariant set as the (deferred) green property — checkAllInvariants
      // + noNodeBetweenPartners + twinContiguity + idempotence — over FULL_SPACE.
      fc.property(arbitraryLayoutDoc(FULL_SPACE), (doc) => {
        const pos = finalPositions(doc, reformatLayout(doc));
        expect(checkAllInvariants(pos, doc).violations).toEqual([]);
        expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
        expect(twinContiguity(pos, doc, doc.twinGroups ?? {}).ok).toBe(true);
        const settled = settle(doc, reformatLayout(doc));
        const twice = reformatLayout(settled);
        for (const [id, p] of Object.entries(twice)) {
          expect(Math.abs(p.x - settled.individuals[id].position.x)).toBeLessThan(1);
          expect(Math.abs(p.y - settled.individuals[id].position.y)).toBeLessThan(1);
        }
      }),
      { numRuns: 2000 },
    );
  });
});
