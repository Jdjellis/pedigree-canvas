import { describe, it, expect } from 'vitest';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import {
  ALL_FIXTURES,
  threeUnionHub,
  marriedTwinInterleaved,
  subtreeCollisionRegression,
  consanguineousSibCouple,
  crossBranchChainCrossing,
  cousinCoupleSubtreeCollision,
  hubThreeUnionCrossing,
  twinAsHubSibUnion,
} from './__fixtures__/pedigrees';
import {
  REFORMAT_FIXTURES,
  reportedLayoutBugs,
} from './__fixtures__/reformatFixtures';
import {
  finalPositions,
  checkAllInvariants,
  noNodeBetweenPartners,
  noCrossedDescentLines,
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
// Multi-union hub (issue #141). A hub with 3+ same-row unions cannot place every
// spouse adjacent at exact partner spacing on a line (a point has two neighbours),
// so BOTH hard invariants are defined in their *achievable* form: a hub's own
// co-spouse may sit between the hub and a non-adjacent spouse
// (`noNodeBetweenPartners`), and a hub union may be up to (degree − 1) ×
// partnerSpacing — the tight linear-packing bound (`minPartnerSpacing`).
// reformatLayout meets both, so threeUnionHub now satisfies checkAllInvariants and
// has graduated into REFORMAT_FIXTURES. This regression pin documents the form.
// ---------------------------------------------------------------------------
describe('reformatLayout — multi-union hub (#141)', () => {
  it('threeUnionHub: meets the achievable hard invariants and full geometry', () => {
    const { doc } = threeUnionHub();
    const pos = reformatted(doc);
    // hub × s3 sits at 2 × partnerSpacing (co-spouse s2 between them) — the tight
    // minimum for a 3-union hub — which the achievable-form minPartnerSpacing
    // permits, so the whole geometry suite is now green.
    expect(checkAllInvariants(pos, doc).ok).toBe(true);
    // No FOREIGN node between any couple; only a hub's own co-spouse is permitted.
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression pins for gaps found while reviewing #137 PR1 — both now FIXED (#141)
// and folded into ALL_FIXTURES (where the loop above asserts every positional
// invariant, no node between partners, and twin contiguity). These tests pin each
// fix against its own fixture so it cannot silently regress.
// ---------------------------------------------------------------------------
describe('reformatLayout — regression pins (review of #137 PR1)', () => {
  // This fixture is the ONLY regression guard for the latent #144 retidy
  // root-selection bug (retidy rooted computeTreeLayout at a two-partner union, so
  // a single-parent-apex family was re-tidied from a deeper childless couple). The
  // twin-contiguity assertion below fails if that root fix is reverted. A
  // twin-INDEPENDENT regression is not achievable: without the twin constraint the
  // invariant suite does not pin sibling order, so the wrong root still yields a
  // valid (if worse) layout — verified against plain single-parent-apex families,
  // which pass identically pre- and post-fix. So this fixture must stay twin-shaped
  // AND single-parent-apex to keep guarding both the makeTwinsContiguous fix and
  // the retidy root fix.
  it('marriedTwinInterleaved: a coupled twin stays contiguous with its co-twin (twin + retidy-root fixes)', () => {
    const { doc, twinGroups } = marriedTwinInterleaved();
    const pos = reformatted(doc);
    // makeTwinsContiguous now counts a couple chain as its twin member's slot, and
    // retidy roots at the single-parent apex union — so the coupled twin sits beside
    // its co-twin with the spouse to the outside: no sibling between the twins, and
    // no node between the couple's partners.
    expect(checkAllInvariants(pos, doc).ok).toBe(true);
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    expect(twinContiguity(pos, doc, twinGroups ?? {}).ok).toBe(true);
  });

  // subtreeCollisionRegression: the coordinate phase re-tidies each plain branching
  // family with computeTreeLayout's contour separation, so its cousin subtrees no
  // longer overlap. Pins the #141 subtree fix so it cannot silently break.
  it('subtreeCollisionRegression: cousin subtrees no longer overlap (subtree fix)', () => {
    const { doc } = subtreeCollisionRegression();
    const pos = reformatted(doc);
    expect(checkAllInvariants(pos, doc).ok).toBe(true);
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-branch coordinate phase (issue #141, residual 1a). A component whose
// only non-plain feature is a single cross-branch couple keeps its aligned
// linear layout while that layout satisfies the hard invariants; otherwise the
// component is split at the cross union, each blood side re-tidied as a plain
// family, and the sides composed at the couple (retidyCrossBranchComponent).
// These pins hold both halves of that behaviour: the two harvested fixtures
// fail on the pre-phase engine (crossed descent lines / overlapping cousin
// sibships), and every cross-branch fixture must stay idempotent — the phase
// iterates internally to the engine's fixed point, which a single pass of the
// old engine did not reach. Deliberately NOT in REFORMAT_FIXTURES: a deep
// corrective layout may legitimately exceed the boundedPartnerDistance /
// chartWidth factors those fixtures pin (both best-effort bounds, not part of
// the property gate).
// ---------------------------------------------------------------------------
describe('reformatLayout — cross-branch coordinate phase (#141 residual 1a)', () => {
  for (const build of [consanguineousSibCouple, crossBranchChainCrossing, cousinCoupleSubtreeCollision]) {
    const { name, doc } = build();

    it(`${name}: satisfies the hard invariants and couple adjacency`, () => {
      const pos = reformatted(doc);
      expect(checkAllInvariants(pos, doc).violations).toEqual([]);
      expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    });

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
// OPEN residual 1b (issues #149 / #150) — failing-first fixtures. The layered
// engine models each generation as a 1-D total order (a node has ≤2 neighbours),
// so a 3+-union hub or a twin that is also a hub cannot seat all of its required
// adjacencies. Both fixtures were shrunk from the discovery harness (FULL_SPACE,
// seed 1) and are deliberately absent from ALL_FIXTURES / REFORMAT_FIXTURES
// because they do NOT yet pass.
//
// Each shape gets two tests:
//   1. a characterization pin (green) asserting the SPECIFIC invariant currently
//      violated — a precise, reproducible record of the bug;
//   2. an `it.fails` oracle asserting the desired end state. It passes today
//      because its body throws; once the engine is fixed it will pass for real,
//      flipping the `it.fails` red and forcing the fixer to drop the marker and
//      graduate the fixture. See docs/auto-layout.md §5 and CLAUDE.md (widen the
//      SUPPORTED_SPACE caps and re-arm the property gate on close).
// ---------------------------------------------------------------------------
describe('reformatLayout — residual 1b (open, #149 / #150)', () => {
  it('hubThreeUnionCrossing: a 3-union hub currently crosses descent lines (#149)', () => {
    const { doc } = hubThreeUnionCrossing();
    const pos = reformatted(doc);
    expect(noCrossedDescentLines(pos, doc).ok).toBe(false);
  });

  it.fails('hubThreeUnionCrossing: SHOULD satisfy all positional invariants once fixed (#149)', () => {
    const { doc } = hubThreeUnionCrossing();
    const pos = reformatted(doc);
    expect(checkAllInvariants(pos, doc).violations).toEqual([]);
  });

  it('twinAsHubSibUnion: a twin married to its sibling currently breaks twin contiguity (#150)', () => {
    const { doc, twinGroups } = twinAsHubSibUnion();
    const pos = reformatted(doc);
    expect(twinContiguity(pos, doc, twinGroups ?? {}).ok).toBe(false);
  });

  it.fails('twinAsHubSibUnion: SHOULD keep twin-group members contiguous once fixed (#150)', () => {
    const { doc, twinGroups } = twinAsHubSibUnion();
    const pos = reformatted(doc);
    expect(twinContiguity(pos, doc, twinGroups ?? {}).ok).toBe(true);
  });
});
