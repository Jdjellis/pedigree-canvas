import { useMemo } from 'react';
import { usePedigreeStore, createDefaultIndividual } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';
import { generateId } from '../utils/idGenerator';
import { computeAnnotationDropPosition } from '../utils/annotationPlacement';
import {
  ZOOM_STEP,
  ANNOTATION_DEFAULT_FONT_SIZE,
  ANNOTATION_PLACEHOLDER_TEXT,
} from '../utils/constants';
import { openDocumentAction, deleteSelectedAction } from './editorActions';

/**
 * All imperative editor actions available to any surface (islands, ⌘K palette,
 * keyboard shortcuts). This is the single source of truth — do not duplicate
 * action bodies elsewhere.
 */
export interface EditorActions {
  /** Prompt to confirm, then reset the document, clear selection and view. */
  newDocument: () => void;
  /** Open a JSON file from disk and load it as the current document. */
  openDocument: () => Promise<void>;
  /** Open the PED-format import modal. */
  importPed: () => void;
  /** Open the export modal. */
  exportDocument: () => void;
  /** Open the legend editor modal. */
  openLegend: () => void;
  /**
   * Add a new individual placed at the visible-canvas centre and select it.
   * Placement uses `screenToCanvas` with stage-local coordinates (0,0 = top-left
   * of the `.konvajs-content` element), matching the project's Konva/Zustand
   * coordinate convention.
   *
   * Delegates to `addPersonAt` using the computed canvas centre.
   */
  addPerson: () => void;
  /**
   * Add a new individual at the given CANVAS-space position, select it, and
   * revert the active tool to `'select'`. Coordinates are rounded to integers
   * before placement.
   *
   * @param position - Canvas-space {x, y} coordinates (already converted from
   *   screen/stage-local space by the caller, e.g. via `screenToCanvas`).
   */
  addPersonAt: (position: { x: number; y: number }) => void;
  /**
   * Add a free-text annotation in clear space below the existing pedigree
   * (falling back to the visible-canvas centre when empty) and open it
   * straight into inline edit mode.
   */
  addText: () => void;
  /** Delete every currently-selected node, then clear the selection. */
  deleteSelected: () => void;
  /** Undo the last pedigree document change. */
  undo: () => void;
  /** Redo the last undone pedigree document change. */
  redo: () => void;
  /** Zoom in toward the viewport centre. */
  zoomIn: () => void;
  /** Zoom out from the viewport centre. */
  zoomOut: () => void;
  /** Reset scale to 100% and pan to origin. */
  resetView: () => void;
  /** Activate the select pointer tool. */
  selectTool: () => void;
  /** Activate the pan (hand) tool. */
  handTool: () => void;
  /** Activate the add-male (square) placement tool. */
  maleTool: () => void;
  /** Activate the add-female (circle) placement tool. */
  femaleTool: () => void;
  /** Activate the add-unknown-sex (diamond) placement tool. */
  unknownTool: () => void;
  /** Activate the partnership-line tool. */
  partnershipTool: () => void;
  /** Activate the text placement tool. */
  textTool: () => void;
  /** Activate the eraser tool. */
  eraserTool: () => void;
  /** Toggle whether placement tools stay active after use. */
  toggleToolLock: () => void;
}

/**
 * Returns the full set of imperative editor actions for use in floating
 * islands, the ⌘K command palette, or any other React surface that needs to
 * trigger document or viewport mutations.
 *
 * The `openDocument` and `deleteSelected` actions delegate to module-level
 * functions in `editorActions.ts` so that `useKeyboardShortcuts` can share
 * the same bodies without duplicating logic.
 *
 * All store reads inside callbacks use `getState()` to avoid stale closures.
 */
export function useEditorActions(): EditorActions {
  const newDocument = (): void => {
    if (
      window.confirm('Create a new pedigree? Unsaved changes will be lost.')
    ) {
      usePedigreeStore.getState().resetDocument();
      useUIStore.getState().clearSelection();
      useViewportStore.getState().resetView();
    }
  };

  const openDocument = (): Promise<void> => openDocumentAction();

  const importPed = (): void => {
    useUIStore.getState().openModal('import');
  };

  const exportDocument = (): void => {
    useUIStore.getState().openModal('export');
  };

  const openLegend = (): void => {
    useUIStore.getState().openModal('legendEditor');
  };

  const addPersonAt = (position: { x: number; y: number }): void => {
    const individual = createDefaultIndividual({
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y),
      },
    });
    usePedigreeStore.getState().addIndividual(individual);
    useUIStore.getState().select(individual.id);
    useUIStore.getState().setActiveTool('select');
  };

  const addPerson = (): void => {
    // Place new individual at center of visible canvas area.
    // screenToCanvas expects stage-local coords (0,0 = top-left of stage element).
    const { screenToCanvas } = useViewportStore.getState();
    const canvasEl = document.querySelector('.konvajs-content');
    let stageCenter = { x: 300, y: 300 };
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      stageCenter = { x: rect.width / 2, y: rect.height / 2 };
    }
    const canvasCenter = screenToCanvas(stageCenter);
    addPersonAt(canvasCenter);
  };

  const addText = (): void => {
    // Drop the annotation in clear space below the existing pedigree so it does
    // not land on top of a symbol. When the document is empty, fall back to the
    // centre of the visible canvas area (same stage-local → canvas conversion
    // as adding an individual).
    const { screenToCanvas } = useViewportStore.getState();
    const { document: doc } = usePedigreeStore.getState();
    const canvasEl = document.querySelector('.konvajs-content');
    let stageCenter = { x: 300, y: 300 };
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      stageCenter = { x: rect.width / 2, y: rect.height / 2 };
    }
    const fallback = screenToCanvas(stageCenter);
    const position = computeAnnotationDropPosition(
      Object.values(doc.individuals),
      Object.values(doc.textAnnotations),
      fallback
    );

    const annotation = {
      id: generateId(),
      text: ANNOTATION_PLACEHOLDER_TEXT,
      position,
      fontSize: ANNOTATION_DEFAULT_FONT_SIZE,
    };
    usePedigreeStore.getState().addTextAnnotation(annotation);
    // Open straight into inline edit mode (text pre-selected for replacement).
    useUIStore.getState().startEditingAnnotation(annotation.id);
  };

  const deleteSelected = (): void => deleteSelectedAction();

  const undo = (): void => {
    usePedigreeStore.temporal.getState().undo();
  };

  const redo = (): void => {
    usePedigreeStore.temporal.getState().redo();
  };

  const zoomIn = (): void => {
    const { scale, zoomToPoint } = useViewportStore.getState();
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomToPoint(center, scale * ZOOM_STEP);
  };

  const zoomOut = (): void => {
    const { scale, zoomToPoint } = useViewportStore.getState();
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomToPoint(center, scale / ZOOM_STEP);
  };

  const resetView = (): void => {
    useViewportStore.getState().resetView();
  };

  const selectTool = (): void => {
    useUIStore.getState().setActiveTool('select');
  };

  const handTool = (): void => {
    useUIStore.getState().setActiveTool('hand');
  };

  const maleTool = (): void => {
    useUIStore.getState().setActiveTool('male');
  };

  const femaleTool = (): void => {
    useUIStore.getState().setActiveTool('female');
  };

  const unknownTool = (): void => {
    useUIStore.getState().setActiveTool('unknown');
  };

  const partnershipTool = (): void => {
    useUIStore.getState().setActiveTool('partnership');
  };

  const textTool = (): void => {
    useUIStore.getState().setActiveTool('text');
  };

  const eraserTool = (): void => {
    useUIStore.getState().setActiveTool('eraser');
  };

  const toggleToolLock = (): void => {
    useUIStore.getState().toggleToolLocked();
  };

  // Empty deps: every callback reads store state via getState() at call time,
  // so none of them close over stale values — the object identity can be
  // stable for the lifetime of the component.
  return useMemo(
    () => ({
      newDocument,
      openDocument,
      importPed,
      exportDocument,
      openLegend,
      addPerson,
      addPersonAt,
      addText,
      deleteSelected,
      undo,
      redo,
      zoomIn,
      zoomOut,
      resetView,
      selectTool,
      handTool,
      maleTool,
      femaleTool,
      unknownTool,
      partnershipTool,
      textTool,
      eraserTool,
      toggleToolLock,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}
