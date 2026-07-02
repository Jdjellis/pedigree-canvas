import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import {
  finalPositions, checkAllInvariants, manualOrderPreserved,
} from './__fixtures__/invariants';
import {
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
} from './__fixtures__/pedigrees';

// Fixtures that already satisfy their invariants on the current code.
const GREEN_TODAY = [
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
];

describe('computeTreeLayout — invariant regression guards', () => {
  for (const build of GREEN_TODAY) {
    const f = build();
    it(`${f.name}: satisfies all positional invariants`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      const res = checkAllInvariants(pos, f.doc);
      expect(res.violations, JSON.stringify(res.violations, null, 2)).toEqual([]);
    });
    it(`${f.name}: preserves manual sibling order`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      expect(manualOrderPreserved(f.doc, pos).violations).toEqual([]);
    });
  }
});
