/**
 * Reformat fixtures that depend on the real reported `layout-bugs.json` asset.
 *
 * Kept out of `pedigrees.ts` on purpose: that module is imported by the
 * Playwright e2e spec (`e2e/layout-render-guard.spec.ts`), whose Node ESM loader
 * rejects a bare JSON import. This module is imported only by the vitest
 * `reformatLayout` suite, where Vite handles the JSON import natively.
 */

import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
} from '../../types/pedigree';
import type { Fixture } from './pedigrees';
import { farApartCrossBranchCouple, wideMultiFounderChart } from './pedigrees';
import layoutBugsFile from './layout-bugs.json';

/**
 * The real reported `layout bugs.json` (25 individuals, 6 generations), saved
 * verbatim as an asset and sliced into a `LayoutDoc`. The canonical
 * failing-first case: `4a1d × ddf2` sit 1415 px apart, siblings render between
 * `c912`'s partners, and generation rows span 3.6×–10× their tight width.
 */
export function reportedLayoutBugs(): Fixture {
  const raw = layoutBugsFile as unknown as {
    document: {
      individuals: Record<string, Individual>;
      partnerships: Record<string, PartnershipRelationship>;
      parentChildLinks: Record<string, ParentChildRelationship>;
      twinGroups?: Record<string, TwinGroup>;
    };
  };
  const d = raw.document;
  return {
    name: 'reportedLayoutBugs',
    doc: {
      individuals: d.individuals,
      partnerships: d.partnerships,
      parentChildLinks: d.parentChildLinks,
      twinGroups: d.twinGroups ?? {},
    },
    // A topmost founder union (51df × be28 → 7a36); `reformatLayout` lays out the
    // whole document regardless of the nominal root.
    rootUnionId: 'a63558d9-ee96-4760-b040-6edf734adb73',
  };
}

/**
 * Multi-founder fixtures (issue #137) exercised through `reformatLayout`. Kept
 * separate from `ALL_FIXTURES` because they reproduce cross-document width/hub
 * bugs that only the whole-document reformat engine resolves — the single-family
 * `computeTreeLayout` leaves them wide by design.
 */
export const REFORMAT_FIXTURES: Array<() => Fixture> = [
  reportedLayoutBugs,
  farApartCrossBranchCouple,
  wideMultiFounderChart,
];
