import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import {
  finalPositions, checkAllInvariants, manualOrderPreserved,
  noSymbolOverlap, minSiblingSpacing, noCrossedDescentLines, subtreeNonCollision,
  generationRowAlignment,
} from './__fixtures__/invariants';
import {
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
  crossBranchMarriage, wideCoupleAdjacentCousin, wideCoupleInverted,
  wideCoupleOppositeCousin, undefinedGenerationChild,
} from './__fixtures__/pedigrees';

// Fixtures that already satisfy their invariants on the current code.
const GREEN_TODAY = [
  loneFounder, coupleWithSibship, threeGenerations, marriedInWithParents,
  consanguinity, chainedWideCouples, wideCousinFan,
];

// #115 overlap/wide-couple fixtures: crossBranchMarriage/wideCoupleAdjacentCousin
// currently collide (kidA/kidB coincide) on the pre-fix code and must be resolved
// by the separation pass; wideCoupleInverted already satisfies the invariants.
const OVERLAP_FIXTURES = [
  crossBranchMarriage, wideCoupleAdjacentCousin, wideCoupleInverted,
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

describe('computeTreeLayout — overlap resolution (#115)', () => {
  for (const build of OVERLAP_FIXTURES) {
    const f = build();
    it(`${f.name}: no symbol overlap and no crossed descent lines`, () => {
      const moved = computeTreeLayout(f.doc, f.rootUnionId);
      const pos = finalPositions(f.doc, moved);
      expect(noSymbolOverlap(pos, f.doc).violations).toEqual([]);
      expect(minSiblingSpacing(pos, f.doc).violations).toEqual([]);
      expect(noCrossedDescentLines(pos, f.doc).violations).toEqual([]);
      expect(subtreeNonCollision(pos, f.doc).violations).toEqual([]);
    });
  }
});

describe('computeTreeLayout — generation robustness', () => {
  it('undefinedGenerationChild: siblings share a row despite a missing generation', () => {
    const f = undefinedGenerationChild();
    const moved = computeTreeLayout(f.doc, f.rootUnionId);
    const pos = finalPositions(f.doc, moved);
    expect(generationRowAlignment(pos, f.doc).violations).toEqual([]);
  });
});

describe('computeTreeLayout — cross-branch centering', () => {
  it('crossBranchMarriage: the movable couple centres its child; the pinned-in-law couple yields to no-overlap', () => {
    const f = crossBranchMarriage();
    const pos = finalPositions(f.doc, computeTreeLayout(f.doc, f.rootUnionId));
    const x = (id: string): number => pos[id].x;
    // couple2 (s2 x s2mate, both movable) centres kidB exactly.
    expect(x('kidB')).toBeCloseTo((x('s2') + x('s2mate')) / 2, 1);
    // kidA is clamped off couple1's midpoint (the pinned in-law over-constrains it),
    // but stays clear of kidB — no-overlap wins over exact centring.
    expect(Math.abs(x('kidA') - x('kidB'))).toBeGreaterThanOrEqual(80 - 0.5);
  });

  it('wideCoupleOppositeCousin: no overlap and no crossed descent lines (mirror of #115)', () => {
    const f = wideCoupleOppositeCousin();
    const pos = finalPositions(f.doc, computeTreeLayout(f.doc, f.rootUnionId));
    expect(noSymbolOverlap(pos, f.doc).violations).toEqual([]);
    expect(minSiblingSpacing(pos, f.doc).violations).toEqual([]);
    expect(noCrossedDescentLines(pos, f.doc).violations).toEqual([]);
    expect(subtreeNonCollision(pos, f.doc).violations).toEqual([]);
  });
});
