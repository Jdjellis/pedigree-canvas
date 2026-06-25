import { useEffect, useRef, useState } from 'react';
import { usePedigreeStore, createDefaultIndividual } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { loadFromFile } from '../../io/jsonIO';
import { generateId } from '../../utils/idGenerator';
import { computeAnnotationDropPosition } from '../../utils/annotationPlacement';
import {
  ZOOM_STEP,
  ANNOTATION_DEFAULT_FONT_SIZE,
  ANNOTATION_PLACEHOLDER_TEXT,
} from '../../utils/constants';
import { DocumentDetails } from './DocumentDetails';
import styles from './Toolbar.module.css';
import clsx from 'clsx';

const PLACEHOLDER_TITLE = 'Untitled Pedigree';
/** localStorage flag marking the one-time local-only notice as dismissed. */
const LOCAL_NOTICE_DISMISSED_KEY = 'pedigree-editor-local-notice-dismissed';

/**
 * Formats a "Saved locally" suffix as a coarse relative time. Kept intentionally
 * simple — the indicator is reassurance, not a precise clock.
 */
function formatRelativeSave(timestamp: number | null, now: number): string {
  // No autosave has fired yet this session — the document is trivially in its
  // saved (empty/restored) state, so reassure rather than imply pending work.
  if (timestamp === null) return 'Saved locally';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'Saved locally';
  if (seconds < 60) return `Saved locally · ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Saved locally · ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Saved locally · ${hours}h ago`;
}

/**
 * The top application toolbar: document title (click-to-edit), document-details
 * popover, document/edit/view actions, and the local-first "Saved locally"
 * status. Renders the one-time local-only-data notice within its own subtree.
 */
export function Toolbar() {
  const resetDocument = usePedigreeStore((s) => s.resetDocument);
  const setDocument = usePedigreeStore((s) => s.setDocument);
  const addIndividual = usePedigreeStore((s) => s.addIndividual);
  const addTextAnnotation = usePedigreeStore((s) => s.addTextAnnotation);
  const removeIndividual = usePedigreeStore((s) => s.removeIndividual);
  const removeTextAnnotation = usePedigreeStore((s) => s.removeTextAnnotation);
  const updateMetadata = usePedigreeStore((s) => s.updateMetadata);
  const doc = usePedigreeStore((s) => s.document);
  const metadata = doc.metadata;
  const title = metadata.title;

  const selectedIds = useUIStore((s) => s.selectedIds);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const select = useUIStore((s) => s.select);
  const startEditingAnnotation = useUIStore((s) => s.startEditingAnnotation);
  const openModal = useUIStore((s) => s.openModal);
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const lastSavedAt = useUIStore((s) => s.lastSavedAt);

  const scale = useViewportStore((s) => s.scale);
  const zoomToPoint = useViewportStore((s) => s.zoomToPoint);
  const resetView = useViewportStore((s) => s.resetView);

  // --- Title click-to-edit ---
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Keep the draft in sync when the title changes externally (e.g. Open/New)
  // while not actively editing.
  useEffect(() => {
    if (!isEditingTitle) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitleDraft(title);
    }
  }, [title, isEditingTitle]);

  const startEditingTitle = (): void => {
    setTitleDraft(title);
    setIsEditingTitle(true);
  };

  const commitTitle = (): void => {
    updateMetadata({ title: titleDraft.trim() });
    setIsEditingTitle(false);
  };

  const cancelTitle = (): void => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitle();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelTitle();
    }
  };

  // --- Document details popover ---
  const [detailsOpen, setDetailsOpen] = useState(false);

  // --- "Saved locally" relative-time tick ---
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(intervalId);
  }, []);
  const saveStatus = formatRelativeSave(lastSavedAt, now);

  // --- One-time local-only-data notice ---
  const [noticeDismissed, setNoticeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_NOTICE_DISMISSED_KEY) === 'true';
    } catch {
      // localStorage unavailable — treat as already dismissed to avoid nagging.
      return true;
    }
  });

  const dismissNotice = (): void => {
    setNoticeDismissed(true);
    try {
      localStorage.setItem(LOCAL_NOTICE_DISMISSED_KEY, 'true');
    } catch {
      // localStorage unavailable — state still updated for this session.
    }
  };

  const handleNew = () => {
    if (
      window.confirm(
        'Create a new pedigree? Unsaved changes will be lost.'
      )
    ) {
      resetDocument();
      clearSelection();
      resetView();
    }
  };

  const handleOpen = async () => {
    try {
      const loaded = await loadFromFile();
      setDocument(loaded);
      clearSelection();
      resetView();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silently ignore cancelled file pickers
      if (err instanceof Error && err.message.includes('cancelled')) return;
      alert(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddIndividual = () => {
    // Place new individual at center of visible canvas area
    const { screenToCanvas } = useViewportStore.getState();
    const canvasEl = document.querySelector('.konvajs-content');
    // screenToCanvas expects stage-local coords (0,0 = top-left of stage)
    let stageCenter = { x: 300, y: 300 };
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      stageCenter = { x: rect.width / 2, y: rect.height / 2 };
    }
    const canvasCenter = screenToCanvas(stageCenter);

    const individual = createDefaultIndividual({
      position: {
        x: Math.round(canvasCenter.x),
        y: Math.round(canvasCenter.y),
      },
    });
    addIndividual(individual);
    select(individual.id);
  };

  const handleAddText = () => {
    // Drop the annotation in clear space below the existing pedigree so it does
    // not land on top of a symbol. When the document is empty, fall back to the
    // centre of the visible canvas area (same stage-local → canvas conversion
    // as adding an individual).
    const { screenToCanvas } = useViewportStore.getState();
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
      fallback,
    );

    const annotation = {
      id: generateId(),
      text: ANNOTATION_PLACEHOLDER_TEXT,
      position,
      fontSize: ANNOTATION_DEFAULT_FONT_SIZE,
    };
    addTextAnnotation(annotation);
    // Open straight into inline edit mode (text pre-selected for replacement).
    startEditingAnnotation(annotation.id);
  };

  const handleDelete = () => {
    const annotations = doc.textAnnotations;
    for (const id of selectedIds) {
      if (annotations[id]) {
        removeTextAnnotation(id);
      } else {
        removeIndividual(id);
      }
    }
    clearSelection();
  };

  const handleUndo = () => {
    usePedigreeStore.temporal.getState().undo();
  };

  const handleRedo = () => {
    usePedigreeStore.temporal.getState().redo();
  };

  const handleZoomIn = () => {
    // Zoom toward center of viewport
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomToPoint(center, scale * ZOOM_STEP);
  };

  const handleZoomOut = () => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    zoomToPoint(center, scale / ZOOM_STEP);
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.documentInfo}>
        <div className={styles.titleRow}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              className={styles.titleInput}
              type="text"
              value={titleDraft}
              placeholder={PLACEHOLDER_TITLE}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              aria-label="Document title"
            />
          ) : (
            <button
              type="button"
              className={clsx(styles.title, !title && styles.titlePlaceholder)}
              onClick={startEditingTitle}
              title="Click to rename this pedigree"
            >
              {title || PLACEHOLDER_TITLE}
            </button>
          )}

          <div className={styles.detailsAnchor}>
            <button
              type="button"
              className={clsx(styles.button, styles.detailsButton)}
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-haspopup="dialog"
              title="Document details (author, institution, reference condition)"
            >
              &#9432;
            </button>
            {detailsOpen && (
              <DocumentDetails
                metadata={metadata}
                onChange={updateMetadata}
                onClose={() => setDetailsOpen(false)}
              />
            )}
          </div>
        </div>

        <span
          className={styles.saveStatus}
          title="Your work lives only in this browser. Export → JSON to keep a permanent copy."
        >
          {saveStatus}
        </span>
      </div>

      {!noticeDismissed && (
        <div className={styles.localNotice} role="status">
          <span className={styles.localNoticeText}>
            Your work is saved only in this browser. Export → JSON to keep a
            permanent copy.
          </span>
          <button
            type="button"
            className={styles.localNoticeDismiss}
            onClick={dismissNotice}
            title="Dismiss"
            aria-label="Dismiss local-storage notice"
          >
            &times;
          </button>
        </div>
      )}

      <div className={styles.separator} />

      <div className={styles.group}>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={handleNew}
          title="New Pedigree"
        >
          New
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={handleOpen}
          title="Open JSON (Cmd+O)"
        >
          Open
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={() => openModal('import')}
          title="Import PED format"
        >
          Import
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={() => openModal('export')}
          title="Export"
        >
          Export
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={() => openModal('legendEditor')}
          title="Configure legend / key"
        >
          Legend
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button
          className={styles.button}
          onClick={handleUndo}
          title="Undo (Cmd+Z)"
        >
          &#x21A9;
        </button>
        <button
          className={styles.button}
          onClick={handleRedo}
          title="Redo (Cmd+Shift+Z)"
        >
          &#x21AA;
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button
          className={clsx(
            styles.button,
            styles.textButton,
            activeTool === 'select' && styles.buttonActive
          )}
          onClick={() => setActiveTool('select')}
          title="Select tool"
        >
          Select
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={handleAddIndividual}
          title="Add Individual"
        >
          + Person
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={handleAddText}
          title="Add a free-text annotation (title, caption, note)"
        >
          + Text
        </button>
      </div>

      <div className={styles.separator} />

      <button
        className={clsx(styles.button, styles.textButton)}
        onClick={handleDelete}
        disabled={selectedIds.size === 0}
        title="Delete Selected"
        style={{ opacity: selectedIds.size === 0 ? 0.4 : 1 }}
      >
        Delete
      </button>

      <div className={styles.spacer} />

      <div className={styles.group}>
        <button
          className={styles.button}
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          &minus;
        </button>
        <span className={styles.zoomDisplay}>
          {Math.round(scale * 100)}%
        </span>
        <button
          className={styles.button}
          onClick={handleZoomIn}
          title="Zoom In"
        >
          +
        </button>
        <button
          className={clsx(styles.button, styles.textButton)}
          onClick={resetView}
          title="Reset View"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
