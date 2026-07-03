import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore, createDefaultDocument } from './pedigreeStore';
import type { PedigreeDocument } from '../types/pedigree';
import { wideMultiFounderChart } from '../utils/__fixtures__/pedigrees';
import type { LayoutDoc } from '../utils/treeLayout';
import {
  checkAllInvariants,
  noNodeBetweenPartners,
  chartWidth,
  boundedPartnerDistance,
} from '../utils/__fixtures__/invariants';
import type { Positions } from '../utils/__fixtures__/invariants';

/**
 * Wrap a layout-only fixture `LayoutDoc` (individuals + partnerships +
 * links + twins) into a full `PedigreeDocument` the store can hold.
 */
function toDocument(layout: LayoutDoc): PedigreeDocument {
  return {
    ...createDefaultDocument(),
    individuals: layout.individuals,
    partnerships: layout.partnerships,
    parentChildLinks: layout.parentChildLinks,
    twinGroups: layout.twinGroups ?? {},
  };
}

/** Snapshot the current individual positions from the store, keyed by id. */
function storePositions(): Positions {
  const inds = usePedigreeStore.getState().document.individuals;
  const pos: Positions = {};
  for (const [id, ind] of Object.entries(inds)) pos[id] = { ...ind.position };
  return pos;
}

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  usePedigreeStore.temporal.getState().clear();
});

describe('reformatDocument', () => {
  it('re-tidies a wide multi-founder chart into a valid, bounded layout', () => {
    const { doc } = wideMultiFounderChart();
    usePedigreeStore.getState().setDocument(toDocument(doc));

    usePedigreeStore.getState().reformatDocument();

    const pos = storePositions();
    expect(checkAllInvariants(pos, doc).violations).toEqual([]);
    expect(noNodeBetweenPartners(pos, doc).ok).toBe(true);
    expect(chartWidth(pos, doc, undefined, 2).ok).toBe(true);
    expect(boundedPartnerDistance(pos, doc, undefined, 2).ok).toBe(true);
  });

  it('collapses the whole reformat into a single undo step that restores every position', () => {
    const { doc } = wideMultiFounderChart();
    usePedigreeStore.getState().setDocument(toDocument(doc));
    usePedigreeStore.temporal.getState().clear();
    const before = usePedigreeStore.getState().document.individuals;

    usePedigreeStore.getState().reformatDocument();

    // The reformat genuinely moved nodes (otherwise the undo assertion is vacuous).
    expect(usePedigreeStore.getState().document.individuals).not.toEqual(before);
    // Exactly one undo step, not one-per-moved-node.
    expect(usePedigreeStore.temporal.getState().pastStates).toHaveLength(1);

    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.individuals).toEqual(before);
  });

  it('is a no-op on an empty document (no undo step)', () => {
    // resetDocument() in beforeEach left an empty document with cleared history.
    usePedigreeStore.getState().reformatDocument();

    expect(usePedigreeStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('is a no-op when the layout is already tidy (no change → no undo step)', () => {
    const { doc } = wideMultiFounderChart();
    usePedigreeStore.getState().setDocument(toDocument(doc));
    usePedigreeStore.getState().reformatDocument(); // settle the layout
    const settled = usePedigreeStore.getState().document.individuals;
    usePedigreeStore.temporal.getState().clear();

    usePedigreeStore.getState().reformatDocument(); // nothing left to move

    // Same individuals object reference: no `set` fired.
    expect(usePedigreeStore.getState().document.individuals).toBe(settled);
    expect(usePedigreeStore.temporal.getState().pastStates).toHaveLength(0);
  });
});
