import { describe, it, expect } from 'vitest';
import { shouldSuggestReformat } from './reformatSuggestion';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import { ALL_FIXTURES, coupleWithSibship } from './__fixtures__/pedigrees';
import {
  REFORMAT_FIXTURES,
  reportedLayoutBugs,
} from './__fixtures__/reformatFixtures';
import { finalPositions, noNodeBetweenPartners } from './__fixtures__/invariants';

/** Apply reformatLayout's moves back onto the doc's individuals. */
function reformatted(doc: LayoutDoc): LayoutDoc {
  const moves = reformatLayout(doc);
  const individuals = { ...doc.individuals };
  for (const [id, pos] of Object.entries(moves)) {
    individuals[id] = { ...individuals[id], position: { x: pos.x, y: pos.y } };
  }
  return { ...doc, individuals };
}

describe('shouldSuggestReformat: trivial documents never nag', () => {
  it('empty document → false', () => {
    const doc: LayoutDoc = {
      individuals: {},
      partnerships: {},
      parentChildLinks: {},
      twinGroups: {},
    };
    expect(shouldSuggestReformat(doc)).toBe(false);
  });

  it('a single person (no couples) → false', () => {
    const doc: LayoutDoc = {
      individuals: {
        a: {
          id: 'a',
          // Minimal individual — only the fields the detector reads.
          position: { x: 0, y: 0 },
        } as never,
      },
      partnerships: {},
      parentChildLinks: {},
      twinGroups: {},
    };
    expect(shouldSuggestReformat(doc)).toBe(false);
  });

  it('a tidy couple + sibship → false', () => {
    expect(shouldSuggestReformat(coupleWithSibship().doc)).toBe(false);
  });
});

describe('shouldSuggestReformat: flags a foreign node between a couple', () => {
  it('the reported bug document (raw seed) → true', () => {
    // reportedLayoutBugs seeds a real chart with a sibling wedged between a
    // cross-branch couple — the canonical case the nudge exists for.
    expect(shouldSuggestReformat(reportedLayoutBugs().doc)).toBe(true);
  });

  it('goes false again once the document is reformatted', () => {
    const doc = reportedLayoutBugs().doc;
    expect(shouldSuggestReformat(doc)).toBe(true);
    expect(shouldSuggestReformat(reformatted(doc))).toBe(false);
  });
});

// The detector is a production copy of the noNodeBetweenPartners invariant (kept
// out of the test-only fixtures module). This cross-check is the anti-drift gate:
// on every fixture, suggesting a reformat must be exactly equivalent to the hard
// invariant failing on the seed positions.
describe('shouldSuggestReformat agrees with the noNodeBetweenPartners invariant', () => {
  for (const build of [...ALL_FIXTURES, ...REFORMAT_FIXTURES]) {
    const { name, doc } = build();
    it(`${name}: matches !noNodeBetweenPartners(seed)`, () => {
      const seed = finalPositions(doc, {});
      expect(shouldSuggestReformat(doc)).toBe(!noNodeBetweenPartners(seed, doc).ok);
    });
  }
});
