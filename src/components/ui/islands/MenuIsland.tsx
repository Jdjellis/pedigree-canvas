import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { DocumentDetails } from '../DocumentDetails';
import { Island } from './Island';
import styles from './MenuIsland.module.css';

const PLACEHOLDER_TITLE = 'Untitled Pedigree';


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
 *   Import, Export, Legend, Document details, Command palette).
 * - An editable document title (click-to-edit inline input).
 * - A "Saved locally" save-status indicator, updated on a 15-second tick.
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
  // Gates the input's onBlur=commit. Cancelling (Escape) sets this false so the
  // blur fired by React unmounting the focused input does NOT write the
  // cancelled draft. A genuine blur (clicking away) leaves it true, so
  // click-to-edit still commits as intended.
  const commitOnBlurRef = useRef(true);

  // Focus and select the input when edit mode is entered.
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const startEditingTitle = (): void => {
    commitOnBlurRef.current = true;
    setTitleDraft(title);
    setIsEditingTitle(true);
  };

  const commitTitle = (): void => {
    // Disarm the blur-commit: the unmount that follows fires onBlur again, and
    // we must not double-commit.
    commitOnBlurRef.current = false;
    updateMetadata({ title: titleDraft.trim() });
    setIsEditingTitle(false);
  };

  const cancelTitle = (): void => {
    // Disarm the blur-commit BEFORE unmounting so the unmount-driven blur does
    // not write the cancelled draft to the store.
    commitOnBlurRef.current = false;
    setTitleDraft(title);
    setIsEditingTitle(false);
  };

  const handleTitleBlur = (): void => {
    if (commitOnBlurRef.current) commitTitle();
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Index of the currently keyboard-focused menu item (-1 = none).
   * Drives roving focus: we imperatively call `.focus()` on the matched
   * element from `handleMenuKeyDown`.
   */
  const focusedItemIndexRef = useRef(-1);

  /**
   * Closes the dropdown and resets keyboard-focus tracking.
   *
   * @param returnFocus - When `true`, return focus to the ☰ button.
   */
  const closeMenu = useCallback((returnFocus = false): void => {
    setMenuOpen(false);
    focusedItemIndexRef.current = -1;
    if (returnFocus) {
      menuButtonRef.current?.focus();
    }
  }, []);

  // Close menu on outside click or Escape; restore focus to the ☰ button.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMenu(true);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  /**
   * Handles keyboard navigation (ArrowDown / ArrowUp / Enter / Space) inside
   * the dropdown `role="menu"` container. Uses roving focus — `.focus()` is
   * called directly on the target DOM element (imperative, not via state).
   */
  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!menuRef.current) return;

      const items = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
      );
      if (items.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = (focusedItemIndexRef.current + 1) % items.length;
        focusedItemIndexRef.current = next;
        items[next]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev =
          focusedItemIndexRef.current <= 0
            ? items.length - 1
            : focusedItemIndexRef.current - 1;
        focusedItemIndexRef.current = prev;
        items[prev]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const idx = focusedItemIndexRef.current;
        if (idx >= 0 && idx < items.length) {
          items[idx].click();
        }
      }
    },
    []
  );

  // ── Document-details popover ─────────────────────────────────────────────
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openDetails = (): void => {
    closeMenu(false);
    setDetailsOpen(true);
  };

  // ── "Saved locally" relative-time tick ──────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const saveStatus = formatRelativeSave(lastSavedAt, now);

  // ── Menu-item handlers ───────────────────────────────────────────────────
  const handleMenuNew = (): void => {
    closeMenu(false);
    actions.newDocument();
  };

  const handleMenuOpen = (): void => {
    closeMenu(false);
    void actions.openDocument();
  };

  const handleMenuImport = (): void => {
    closeMenu(false);
    actions.importPed();
  };

  const handleMenuExport = (): void => {
    closeMenu(false);
    actions.exportDocument();
  };

  const handleMenuLegend = (): void => {
    closeMenu(false);
    actions.openLegend();
  };

  /** Opens the ⌘K command palette and closes the dropdown. */
  const handleMenuCommandPalette = (): void => {
    closeMenu(false);
    useUIStore.getState().toggleCommandPalette();
  };

  return (
    <Island aria-label="Document menu" className={styles.root}>
      {/* ☰ Menu button */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          ref={menuButtonRef}
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
          <div
            role="menu"
            className={styles.dropdown}
            aria-label="Document actions"
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuNew}
              tabIndex={-1}
            >
              New
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuOpen}
              tabIndex={-1}
            >
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuImport}
              tabIndex={-1}
            >
              Import
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuExport}
              tabIndex={-1}
            >
              Export
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleMenuLegend}
              tabIndex={-1}
            >
              Legend
            </button>
            <div className={styles.menuSeparator} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={openDetails}
              tabIndex={-1}
            >
              Document details
            </button>
            <div className={styles.menuSeparator} role="separator" />
            <button
              type="button"
              role="menuitem"
              className={clsx(styles.menuItem, styles.menuItemWithHint)}
              onClick={handleMenuCommandPalette}
              tabIndex={-1}
            >
              <span>Command palette…</span>
              <kbd className={styles.menuItemKbd}>⌘K</kbd>
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
            onBlur={handleTitleBlur}
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

    </Island>
  );
}
