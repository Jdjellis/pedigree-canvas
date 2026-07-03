import { describe, it, expect } from 'vitest';
import { reformatLayout } from './reformatLayout';
import type { LayoutDoc } from './treeLayout';
import {
  ALL_FIXTURES,
  REFORMAT_FIXTURES,
  reportedLayoutBugs,
} from './__fixtures__/pedigrees';
import {
  finalPositions,
  checkAllInvariants,
  noNodeBetweenPartners,
  boundedPartnerDistance,
  chartWidth,
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
    const { name, doc } = build();
    it(`${name}: satisfies all positional invariants and no node between partners`, () => {
      const pos = reformatted(doc);
      expect(checkAllInvariants(pos, doc).violations).toEqual([]);
      expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
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
