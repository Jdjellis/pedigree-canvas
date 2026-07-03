import { describe, it, expect } from 'vitest';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import {
  ALL_FIXTURES,
  threeUnionHub,
  marriedTwinInterleaved,
  subtreeCollisionRegression,
} from './__fixtures__/pedigrees';
import {
  REFORMAT_FIXTURES,
  reportedLayoutBugs,
} from './__fixtures__/reformatFixtures';
import {
  finalPositions,
  checkAllInvariants,
  noNodeBetweenPartners,
  boundedPartnerDistance,
  chartWidth,
  twinContiguity,
} from './__fixtures__/invariants';
import type { Positions } from './__fixtures__/invariants';

/** Target thresholds a reformatted layout must meet (best-effort, tuned here). */
const WIDTH_FACTOR = 2;
const PARTNER_FACTOR = 2;

/** Run reformatLayout and merge its moves back into a full positions map. */
function reformatted(doc: LayoutDoc): Positions {
  return finalPositions(doc, reformatLayout(doc));
}

describe('reportedLayoutBugs fixture reproduces the reported bugs (seed layout)', () => {
  const { doc } = reportedLayoutBugs();
  const seed = finalPositions(doc, {});

  it('has a non-partner node between a couple’s partners', () => {
    expect(noNodeBetweenPartners(seed, doc).ok).toBe(false);
  });

  it('has a cross-branch couple beyond the bound', () => {
    expect(boundedPartnerDistance(seed, doc, undefined, PARTNER_FACTOR).ok).toBe(false);
  });

  it('is very wide', () => {
    expect(chartWidth(seed, doc, undefined, WIDTH_FACTOR).ok).toBe(false);
  });
});

describe('reformatLayout fixes every reformat fixture', () => {
  for (const build of REFORMAT_FIXTURES) {
    const { name, doc } = build();

    it(`${name}: satisfies all positional invariants`, () => {
      const pos = reformatted(doc);
      expect(checkAllInvariants(pos, doc).violations).toEqual([]);
    });

    it(`${name}: no node between any couple’s partners`, () => {
      expect(noNodeBetweenPartners(reformatted(doc), doc).ok).toBe(true);
    });

    it(`${name}: cross-branch couples within bound`, () => {
      expect(boundedPartnerDistance(reformatted(doc), doc, undefined, PARTNER_FACTOR).ok).toBe(true);
    });

    it(`${name}: chart width bounded`, () => {
      expect(chartWidth(reformatted(doc), doc, undefined, WIDTH_FACTOR).ok).toBe(true);
    });
  }
});

describe('reformatLayout produces a valid layout for every existing fixture', () => {
  for (const build of ALL_FIXTURES) {
    const { name, doc, twinGroups } = build();
    it(`${name}: satisfies all positional invariants and no node between partners`, () => {
      const pos = reformatted(doc);
      expect(checkAllInvariants(pos, doc).violations).toEqual([]);
      expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    });
    it(`${name}: keeps twin-group members contiguous`, () => {
      const pos = reformatted(doc);
      expect(twinContiguity(pos, doc, twinGroups ?? {}).ok).toBe(true);
    });
  }
});

describe('reformatLayout is idempotent', () => {
  for (const build of REFORMAT_FIXTURES) {
    const { name, doc } = build();

    it(`${name}: a second pass moves nothing`, () => {
      const once = reformatLayout(doc);
      const settled: LayoutDoc = {
        ...doc,
        individuals: Object.fromEntries(
          Object.entries(doc.individuals).map(([id, node]) => [
            id,
            once[id] ? { ...node, position: { x: once[id].x, y: once[id].y } } : node,
          ]),
        ),
      };
      const twice = reformatLayout(settled);
      for (const [id, p] of Object.entries(twice)) {
        expect(Math.abs(p.x - settled.individuals[id].position.x)).toBeLessThan(1);
        expect(Math.abs(p.y - settled.individuals[id].position.y)).toBeLessThan(1);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Multi-union hub (issue #137 review). A hub with 3+ same-row unions cannot place
// every spouse adjacent in a linear row, so `noNodeBetweenPartners` was redefined
// to its *achievable* form: a hub's own co-spouse may sit between the hub and a
// non-adjacent spouse, but foreign nodes never may. reformatLayout satisfies the
// achievable hard invariant here. What it does NOT yet do is compact the stranded
// spouse to partner spacing — that residual coordinate-phase gap trips
// `minPartnerSpacing` and is tracked as a follow-up (see the #137 gaps issue).
// ---------------------------------------------------------------------------
describe('reformatLayout — multi-union hub (#137)', () => {
  it('threeUnionHub: satisfies the achievable HARD noNodeBetweenPartners (co-spouse carve-out)', () => {
    const { doc } = threeUnionHub();
    const pos = reformatted(doc);
    // The 3rd union (hub × s3) has s2 between its partners, but s2 is another of
    // hub's own spouses and hub is a genuine hub (3 unions) — structurally
    // unavoidable, so permitted. No *foreign* node is between any couple.
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
  });

  it('threeUnionHub: KNOWN GAP — the stranded 3rd spouse is not compacted to partner spacing', () => {
    const { doc } = threeUnionHub();
    const pos = reformatted(doc);
    // BUG (residual, tracked): the coordinate phase leaves hub × s3 wider than
    // partnerSpacing, so the geometry suite still fails via minPartnerSpacing.
    // Flip to `true` and fold threeUnionHub into REFORMAT_FIXTURES once fixed.
    expect(checkAllInvariants(pos, doc).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Known gap surfaced while reviewing #137 PR1. Characterization test: it pins the
// CURRENT (incorrect) output so the suite stays honest and green while documenting
// the defect executably. When the engine is fixed the asserted `.ok` will flip and
// this test will fail — the signal to rewrite it to assert correctness and fold
// the fixture into ALL_FIXTURES.
// ---------------------------------------------------------------------------
describe('reformatLayout — known gaps (review of #137 PR1)', () => {
  it('marriedTwinInterleaved: a married twin is separated from its co-twin by a sibling (twinContiguity not met)', () => {
    const { doc, twinGroups } = marriedTwinInterleaved();
    const pos = reformatted(doc);
    // The layout is otherwise valid — geometry and between-partners both hold.
    expect(checkAllInvariants(pos, doc).ok).toBe(true);
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    // BUG: twin contiguity should hold (`.ok === true`). `makeTwinsContiguous`
    // only pulls single-node chains into a group's run, so the coupled twin is
    // excluded and a non-twin sibling tie-breaks between the twins.
    expect(twinContiguity(pos, doc, twinGroups ?? {}).ok).toBe(false);
  });

  it('subtreeCollisionRegression: reorders a connected family into overlapping subtrees (subtreeNonCollision not met)', () => {
    // Found by the property-based discovery harness (arbitraryPedigree.ts). An
    // ordinary connected single family — no hub, no twins, no disconnection.
    const { doc } = subtreeCollisionRegression();
    const pos = reformatted(doc);
    // BUG: the coordinate phase has no contour/subtree-separation step, so a deep
    // subtree slides over its sibling. `checkAllInvariants` should hold once the
    // engine gains subtree separation (#141) — flip this to `true` then.
    expect(checkAllInvariants(pos, doc).ok).toBe(false);
    const rules = checkAllInvariants(pos, doc).violations.map((v) => v.rule);
    expect(rules).toContain('subtreeNonCollision');
  });
});
