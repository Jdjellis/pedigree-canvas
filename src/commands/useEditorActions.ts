import { useMemo } from 'react';
import { usePedigreeStore, createSeededDocument } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';
import { generateId } from '../utils/idGenerator';
import { computeAnnotationDropPosition } from '../utils/annotationPlacement';
import { computeContentExtent } from '../utils/boundsCalculation';
import {
  ZOOM_STEP,
  ANNOTATION_DEFAULT_FONT_SIZE,
  ANNOTATION_PLACEHOLDER_TEXT,
} from '../utils/constants';
import { openDocumentAction, deleteSelectedAction } from './editorActions';
import { getVisibleCanvasCenter } from '../utils/canvasCenter';

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
  /**
   * Zoom and pan so the whole pedigree (symbols, labels, and text annotations)
   * fits centred in the viewport. Falls back to {@link resetView} when the
   * document is empty or the canvas has not been measured yet.
   */
  fitView: () => void;
  /** Activate the select pointer tool. */
  selectTool: () => void;
  /** Activate the pan (hand) tool. */
  handTool: () => void;
  /** Activate the text placement tool. */
  textTool: () => void;
  /** Activate the eraser tool. */
  eraserTool: () => void;
  /** Toggle whether the pedigree is locked against editing. */
  toggleEditingLock: () => void;
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
    const hasContent =
      Object.keys(usePedigreeStore.getState().document.individuals).length > 1;
    if (hasContent && !window.confirm('Start a new pedigree? Your current one will be cleared.')) {
      return;
    }
    useUIStore.getState().setOnboarded();
    useViewportStore.getState().resetView();
    const sex = useUIStore.getState().defaultSex;
    usePedigreeStore.getState().setDocument(
      createSeededDocument(sex, getVisibleCanvasCenter()),
    );
    useUIStore.getState().clearSelection();
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

  const addText = (): void => {
    // Drop the annotation in clear space below the existing pedigree so it does
    // not land on top of a symbol. When the document is empty, fall back to the
    // centre of the visible canvas area.
    const { document: doc } = usePedigreeStore.getState();
    const fallback = getVisibleCanvasCenter();
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

  const fitView = (): void => {
    const { document: doc } = usePedigreeStore.getState();
    const extent = computeContentExtent(
      Object.values(doc.individuals),
      Object.values(doc.textAnnotations),
    );
    // Measure the actual stage element (same stage-local convention as the
    // placement actions) so the content is centred in the visible canvas.
    const canvasEl = document.querySelector('.konvajs-content');
    const rect = canvasEl?.getBoundingClientRect();
    if (!extent || !rect || rect.width === 0 || rect.height === 0) {
      useViewportStore.getState().resetView();
      return;
    }
    useViewportStore.getState().fitToContent(extent, rect.width, rect.height);
  };

  const selectTool = (): void => {
    useUIStore.getState().setActiveTool('select');
  };

  const handTool = (): void => {
    useUIStore.getState().setActiveTool('hand');
  };

  const textTool = (): void => {
    useUIStore.getState().setActiveTool('text');
  };

  const eraserTool = (): void => {
    useUIStore.getState().setActiveTool('eraser');
  };

  const toggleEditingLock = (): void => {
    useUIStore.getState().toggleEditingLocked();
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
      addText,
      deleteSelected,
      undo,
      redo,
      zoomIn,
      zoomOut,
      resetView,
      fitView,
      selectTool,
      handTool,
      textTool,
      eraserTool,
      toggleEditingLock,
    }),
    []
  );
}
