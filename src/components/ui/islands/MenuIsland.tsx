import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { DocumentDetails } from '../DocumentDetails';
import { Island } from './Island';
import styles from './MenuIsland.module.css';

const PLACEHOLDER_TITLE = 'Untitled Pedigree';

/** localStorage key marking the one-time local-only notice as dismissed. */
const LOCAL_NOTICE_DISMISSED_KEY = 'pedigree-editor-local-notice-dismissed';

/**
 * Formats the "Saved locally" status as a coarse human-readable relative time.
 *
 * Returns a plain "Saved locally" string when the save was very recent or has
 * not happened yet, upgrading to "Saved locally · Xs ago" style otherwise.
 * Kept intentionally simple — this is reassurance, not a precise clock.
 *
 * @param timestamp - The ms-epoch timestamp of the last save, or `null` if
 *   nothing has been saved yet this session.
 * @param now - The current ms-epoch timestamp (from a `useState` + interval tick).
 */
function formatRelativeSave(timestamp: number | null, now: number): string {
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
 * The top-left "menu island" for the floating-island canvas UI.
 *
 * Renders:
 * - A ☰ hamburger button that opens a dropdown of document actions (New, Open,
 *   Import, Export, Legend, Document details).
 * - An editable document title (click-to-edit inline input).
 * - A "Saved locally" save-status indicator, updated on a 15-second tick.
 * - A one-time dismissible notice reminding users that data is browser-local.
 *
 * Lives in the react-dom tree, so Zustand subscriptions are safe here.
 *
 * @example
 * ```tsx
 * <MenuIsland />
 * ```
 */
export function MenuIsland(): React.JSX.Element {
  const updateMetadata = usePedigreeStore((s) => s.updateMetadata);
  const metadata = usePedigreeStore((s) => s.document.metadata);
  const title = metadata.title;

  const lastSavedAt = useUIStore((s) => s.lastSavedAt);

  const actions = useEditorActions();

  // ── Title click-to-edit ──────────────────────────────────────────────────
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus and select the input when edit mode is entered.
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const startEditingTitle = (): void => {
    setTitleDraft(title);
    setIsEditingTitle(true);
  };

  const commitTitle = (): void => {
    updateMetadata({ title: titleDraft.trim() });
    setIsEditingTitle(false);
  };

  const cancelTitle = (): void => {
    setTitleDraft(title);
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

  // ── Document menu (☰ dropdown) ───────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  // ── Document-details popover ─────────────────────────────────────────────
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openDetails = (): void => {
    setMenuOpen(false);
    setDetailsOpen(true);
  };

  // ── "Saved locally" relative-time tick ──────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const saveStatus = formatRelativeSave(lastSavedAt, now);

  // ── One-time local-only-data notice ─────────────────────────────────────
  const [noticeDismissed, setNoticeDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_NOTICE_DISMISSED_KEY) === 'true';
    } catch {
      // localStorage unavailable — treat as dismissed to avoid nagging.
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

  // ── Menu-item handlers ───────────────────────────────────────────────────
  const handleMenuNew = (): void => {
    setMenuOpen(false);
    actions.newDocument();
  };

  const handleMenuOpen = (): void => {
    setMenuOpen(false);
    void actions.openDocument();
  };

  const handleMenuImport = (): void => {
    setMenuOpen(false);
    actions.importPed();
  };

  const handleMenuExport = (): void => {
    setMenuOpen(false);
    actions.exportDocument();
  };

  const handleMenuLegend = (): void => {
    setMenuOpen(false);
    actions.openLegend();
  };

  return (
    <Island aria-label="Document menu" className={styles.root}>
      {/* ☰ Menu button */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          className={clsx(styles.menuButton, menuOpen && styles.menuButtonOpen)}
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Open document menu"
          title="Document actions"
        >
          ☰
        </button>

        {menuOpen && (
          <div role="menu" className={styles.dropdown} aria-label="Document actions">
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuNew}
            >
              New
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuOpen}
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuImport}
            >
              Import
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuExport}
            >
              Export
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuLegend}
            >
              Legend
            </button>
            <div className={styles.menuSeparator} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={openDetails}
            >
              Document details
            </button>
          </div>
        )}

        {detailsOpen && (
          <DocumentDetails
            metadata={metadata}
            onChange={updateMetadata}
            onClose={() => setDetailsOpen(false)}
          />
        )}
      </div>

      {/* Title + save-status column */}
      <div className={styles.docColumn}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className={styles.titleInput}
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
            className={clsx(
              styles.titleButton,
              !title && styles.titlePlaceholder
            )}
            onClick={startEditingTitle}
            title="Click to rename this pedigree"
          >
            {title || PLACEHOLDER_TITLE}
          </button>
        )}

        <span
          className={styles.saveStatus}
          title="Your work lives only in this browser. Export → JSON to keep a permanent copy."
        >
          {saveStatus}
        </span>
      </div>

      {/* One-time local-data notice — shown below the island until dismissed */}
      {!noticeDismissed && (
        <div className={styles.notice} role="status">
          <span className={styles.noticeText}>
            Your work is saved only in this browser. Export → JSON to keep a
            permanent copy.
          </span>
          <button
            type="button"
            className={styles.noticeDismiss}
            onClick={dismissNotice}
            title="Dismiss"
            aria-label="Dismiss local-storage notice"
          >
            &times;
          </button>
        </div>
      )}
    </Island>
  );
}
