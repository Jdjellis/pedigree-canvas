import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  FilePlus,
  FolderOpen,
  FileInput,
  FileOutput,
  List,
  Info,
  Command,
  HelpCircle,
} from 'lucide-react';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { DocumentDetails } from '../DocumentDetails';
import { SegmentedControl } from '../SegmentedControl';
import { THEME_ORDER, THEME_LABELS, type ThemeId } from '../../../theme/themes';
import { Island } from './Island';
import styles from './MenuIsland.module.css';

const THEME_OPTIONS: { value: ThemeId; label: string }[] = THEME_ORDER.map(
  (id) => ({ value: id, label: THEME_LABELS[id] }),
);

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

interface MenuItemButtonProps {
  /** Leading lucide icon (rendered decorative — excluded from the a11y name). */
  icon: React.ReactNode;
  label: string;
  /**
   * Display string for the keyboard shortcut hint (e.g. `⌘O`). Rendered as a
   * decorative badge and mirrored onto `aria-keyshortcuts`, so the item's
   * accessible name stays the bare label.
   */
  shortcut?: string;
  onClick: () => void;
}

/**
 * A single row in the ☰ document dropdown: `[icon] label … [shortcut]`.
 *
 * The icon and the visible shortcut badge are `aria-hidden`; the shortcut is
 * re-exposed via `aria-keyshortcuts` so assistive tech announces it without it
 * leaking into the accessible name (which stays the plain label — keyboard
 * roving-focus and name-based queries depend on that).
 */
function MenuItemButton({
  icon,
  label,
  shortcut,
  onClick,
}: MenuItemButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={onClick}
      tabIndex={-1}
      aria-keyshortcuts={shortcut}
    >
      <span className={styles.menuItemIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.menuItemLabel}>{label}</span>
      {shortcut && (
        <kbd className={styles.menuItemKbd} aria-hidden="true">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/**
 * The top-left "menu island" for the floating-island canvas UI.
 *
 * Renders:
 * - A ☰ hamburger button that opens a dropdown of document actions (New, Open,
 *   Import, Export, Legend, Document details, Command palette, Keyboard
 *   shortcuts), each with a leading icon and — where one exists — a
 *   right-aligned keyboard-shortcut hint.
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
  const storagePersistent = useUIStore((s) => s.storagePersistent);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

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
  // When storage is blocked the document lives only in memory for this session,
  // so warn rather than claim a durable save. Storage availability is fixed for
  // the session, so this is a static branch, not a per-tick computation.
  const saveStatusText = storagePersistent
    ? formatRelativeSave(lastSavedAt, now)
    : '⚠ Not saved — export to keep a copy';
  const saveStatusTitle = storagePersistent
    ? 'Your work lives only in this browser. Export → JSON to keep a permanent copy.'
    : 'This browser is blocking local storage, so your work will be lost when you ' +
      'close this tab. Use Export → JSON to keep a permanent copy.';

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

  /** Opens the keyboard-shortcuts overlay and closes the dropdown. */
  const handleMenuHelp = (): void => {
    closeMenu(false);
    useUIStore.getState().openModal('shortcuts');
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
            <MenuItemButton
              icon={<FilePlus size={16} />}
              label="New"
              onClick={handleMenuNew}
            />
            <MenuItemButton
              icon={<FolderOpen size={16} />}
              label="Open"
              shortcut="⌘O"
              onClick={handleMenuOpen}
            />
            <MenuItemButton
              icon={<FileInput size={16} />}
              label="Import"
              onClick={handleMenuImport}
            />
            <MenuItemButton
              icon={<FileOutput size={16} />}
              label="Export"
              shortcut="⌘E"
              onClick={handleMenuExport}
            />
            <MenuItemButton
              icon={<List size={16} />}
              label="Legend"
              onClick={handleMenuLegend}
            />
            <div className={styles.menuSeparator} role="separator" />
            <MenuItemButton
              icon={<Info size={16} />}
              label="Document details"
              onClick={openDetails}
            />
            <div className={styles.menuSeparator} role="separator" />
            {/* Theme picker. Not a menuitem (operated by click), and left open
                after a change so the user can preview Light / Warm / Dim. */}
            <div className={styles.themeSection}>
              <span className={styles.themeLabel}>Theme</span>
              <SegmentedControl
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
                ariaLabel="Editor theme"
              />
            </div>
            <div className={styles.menuSeparator} role="separator" />
            <MenuItemButton
              icon={<Command size={16} />}
              label="Command palette…"
              shortcut="⌘K"
              onClick={handleMenuCommandPalette}
            />
            <MenuItemButton
              icon={<HelpCircle size={16} />}
              label="Keyboard shortcuts"
              shortcut="?"
              onClick={handleMenuHelp}
            />
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
          className={clsx(
            styles.saveStatus,
            !storagePersistent && styles.saveStatusWarning,
          )}
          title={saveStatusTitle}
        >
          {saveStatusText}
        </span>
      </div>

    </Island>
  );
}
