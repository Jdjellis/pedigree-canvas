import { describe, it, expect } from 'vitest';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import {
  ALL_FIXTURES,
  threeUnionHub,
  marriedTwinInterleaved,
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
// Known gaps surfaced while reviewing #137 PR1. These fixtures reproduce two
// topologies the layered engine does NOT yet handle. They are *characterization*
// tests: each pins the CURRENT (incorrect) output so the suite stays honest and
// green while documenting the defect executably. When the engine is fixed, the
// asserted `.ok` values below will flip and these tests will fail — that is the
// signal to rewrite them to assert correctness and fold the fixtures into
// REFORMAT_FIXTURES / ALL_FIXTURES.
// ---------------------------------------------------------------------------
describe('reformatLayout — known gaps (review of #137 PR1)', () => {
  it('threeUnionHub: a hub with 3 same-row unions strands its 3rd spouse (HARD noNodeBetweenPartners not met)', () => {
    const { doc } = threeUnionHub();
    const pos = reformatted(doc);
    // BUG: the hard guarantee should hold (`.ok === true`). It does not for a hub
    // with more than two same-row unions — `orderChainMembers` walks the partner
    // graph as a path and can keep only two spouses adjacent, so the third union
    // (`hub × s3`) renders `s2` strictly between its partners.
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(false);
    // Same root cause also strands the 3rd spouse beyond partnerSpacing, so even
    // the geometry suite fails here (minPartnerSpacing) — not just the special
    // between-partners invariant.
    expect(checkAllInvariants(pos, doc).ok).toBe(false);
  });

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
});
