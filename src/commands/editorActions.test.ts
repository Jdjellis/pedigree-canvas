/**
 * Tests for the module-level editor action functions in editorActions.ts.
 *
 * These are standalone (non-hook) functions used by both useEditorActions and
 * useKeyboardShortcuts, so they must be independently testable without a
 * React rendering context.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { deleteSelectedAction, openDocumentAction } from './editorActions';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';

// ---------------------------------------------------------------------------
// Mock loadFromFile so openDocumentAction tests don't hit the File System API
// ---------------------------------------------------------------------------

vi.mock('../io/jsonIO', () => ({
  loadFromFile: vi.fn(),
}));

import { loadFromFile } from '../io/jsonIO';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addIndividualToStore(): string {
  const individual = createDefaultIndividual({ position: { x: 0, y: 0 } });
  usePedigreeStore.getState().addIndividual(individual);
  return individual.id;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
  useUIStore.setState({
    selectedIds: new Set<string>(),
    activeTool: 'select',
    propertiesPanelOpen: false,
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// deleteSelectedAction
// ---------------------------------------------------------------------------

describe('deleteSelectedAction', () => {
  test('removes each selected individual from the document', () => {
    const id1 = addIndividualToStore();
    const id2 = addIndividualToStore();
    addIndividualToStore(); // unselected — ensures at least one remains
    useUIStore.getState().selectMultiple([id1, id2]);

    deleteSelectedAction();

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
  });

  test('clears the selection after deletion', () => {
    addIndividualToStore(); // unselected — ensures at least one remains after delete
    const id = addIndividualToStore();
    useUIStore.getState().select(id);

    deleteSelectedAction();

    expect(useUIStore.getState().selectedIds.size).toBe(0);
  });

  test('does not delete the last individual on the canvas', () => {
    const id = addIndividualToStore();
    useUIStore.getState().select(id);

    deleteSelectedAction();

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
    // Selection is left intact so the user can see what was blocked
    expect(useUIStore.getState().selectedIds.has(id)).toBe(true);
  });

  test('does nothing when no individuals are selected', () => {
    const id = addIndividualToStore();

    deleteSelectedAction();

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
    expect(individuals[0].id).toBe(id);
  });

  test('only removes selected individuals, not unselected ones', () => {
    const id1 = addIndividualToStore();
    const id2 = addIndividualToStore();
    useUIStore.getState().select(id1);
    // id2 is NOT selected

    deleteSelectedAction();

    const individuals = Object.values(
      usePedigreeStore.getState().document.individuals
    );
    expect(individuals).toHaveLength(1);
    expect(individuals[0].id).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// openDocumentAction
// ---------------------------------------------------------------------------

describe('openDocumentAction', () => {
  test('loads the document, clears selection, and resets view on success', async () => {
    const mockLoadFromFile = vi.mocked(loadFromFile);
    const fakeDoc = usePedigreeStore.getState().document;
    mockLoadFromFile.mockResolvedValueOnce(fakeDoc);

    const resetViewSpy = vi.spyOn(useViewportStore.getState(), 'resetView');

    // Pre-condition: something selected
    const id = addIndividualToStore();
    useUIStore.getState().select(id);
    expect(useUIStore.getState().selectedIds.size).toBe(1);

    await openDocumentAction();

    expect(useUIStore.getState().selectedIds.size).toBe(0);
    expect(resetViewSpy).toHaveBeenCalledOnce();
  });

  test('silently ignores AbortError (user cancelled picker)', async () => {
    const mockLoadFromFile = vi.mocked(loadFromFile);
    const abortError = new DOMException('Aborted', 'AbortError');
    mockLoadFromFile.mockRejectedValueOnce(abortError);

    // Should not throw and should not call alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await expect(openDocumentAction()).resolves.toBeUndefined();
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  test('silently ignores errors with "cancelled" in the message', async () => {
    const mockLoadFromFile = vi.mocked(loadFromFile);
    mockLoadFromFile.mockRejectedValueOnce(new Error('File picker cancelled'));

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await expect(openDocumentAction()).resolves.toBeUndefined();
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  test('shows an alert for unexpected errors', async () => {
    const mockLoadFromFile = vi.mocked(loadFromFile);
    mockLoadFromFile.mockRejectedValueOnce(new Error('Disk read error'));

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    await openDocumentAction();

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Disk read error')
    );

    alertSpy.mockRestore();
  });
});
