/**
 * Coverage for the `reformatPedigree` editor action: it re-tidies the whole
 * document via the store's `reformatDocument`, and — like every mutating
 * command reachable from ⌘K — no-ops while editing is locked (view mode).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorActions } from './useEditorActions';
import { usePedigreeStore, createDefaultDocument } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { wideMultiFounderChart } from '../utils/__fixtures__/pedigrees';
import type { LayoutDoc } from '../utils/treeLayout';
import type { PedigreeDocument } from '../types/pedigree';

/** Wrap a layout-only fixture doc into a full `PedigreeDocument`. */
function toDocument(layout: LayoutDoc): PedigreeDocument {
  return {
    ...createDefaultDocument(),
    individuals: layout.individuals,
    partnerships: layout.partnerships,
    parentChildLinks: layout.parentChildLinks,
    twinGroups: layout.twinGroups ?? {},
  };
}

beforeEach(() => {
  usePedigreeStore.getState().setDocument(toDocument(wideMultiFounderChart().doc));
  usePedigreeStore.temporal.getState().clear();
  useUIStore.setState({ editingLocked: false });
});

describe('useEditorActions.reformatPedigree', () => {
  it('re-tidies the document (delegates to reformatDocument)', () => {
    const before = usePedigreeStore.getState().document.individuals;
    const { result } = renderHook(() => useEditorActions());

    result.current.reformatPedigree();

    expect(usePedigreeStore.getState().document.individuals).not.toEqual(before);
  });

  it('does nothing while editing is locked (view mode)', () => {
    useUIStore.setState({ editingLocked: true });
    const before = usePedigreeStore.getState().document.individuals;
    const { result } = renderHook(() => useEditorActions());

    result.current.reformatPedigree();

    expect(usePedigreeStore.getState().document.individuals).toBe(before);
  });
});
