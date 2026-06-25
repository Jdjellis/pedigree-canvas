import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '../../stores/uiStore';
import styles from './ShortcutsOverlay.module.css';

// ---------------------------------------------------------------------------
// Static data — mirrors the bindings in useKeyboardShortcuts.ts.
// ---------------------------------------------------------------------------

interface ShortcutRow {
  /** Human-readable description of the action. */
  description: string;
  /** One or more key labels to render as <kbd> chips. */
  keys: string[];
}

interface ShortcutGroup {
  /** Section heading. */
  label: string;
  /** Ordered list of shortcut rows. */
  rows: ShortcutRow[];
}

/** All keyboard shortcuts shown in the overlay, grouped by category. */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'General',
    rows: [
      { description: 'Command palette', keys: ['⌘K'] },
      { description: 'Open file', keys: ['⌘O'] },
      { description: 'Save file', keys: ['⌘S'] },
      { description: 'Export', keys: ['⌘E'] },
      { description: 'Keyboard shortcuts (this panel)', keys: ['?'] },
    ],
  },
  {
    label: 'Edit',
    rows: [
      { description: 'Undo', keys: ['⌘Z'] },
      { description: 'Redo', keys: ['⌘⇧Z'] },
      { description: 'Delete selected', keys: ['⌫'] },
    ],
  },
  {
    label: 'Tools',
    rows: [
      { description: 'Select tool', keys: ['V'] },
      { description: 'Hand (pan) tool', keys: ['H'] },
      { description: 'Add person', keys: ['P'] },
    ],
  },
  {
    label: 'Navigation',
    rows: [
      { description: 'Pan canvas', keys: ['Scroll'] },
      { description: 'Zoom in / out', keys: ['Ctrl+Scroll'] },
      { description: 'Dismiss / close', keys: ['Esc'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal overlay listing all keyboard shortcuts, grouped by category.
 *
 * Driven by `useUIStore` — opens when `activeModal === 'shortcuts'` and
 * closes (Esc / click-outside / × button) via `closeModal()`.
 *
 * Mount once at the top of the component tree (App.tsx).
 *
 * @example
 * ```tsx
 * <ShortcutsOverlay />
 * ```
 */
export function ShortcutsOverlay(): React.JSX.Element {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);

  const open = activeModal === 'shortcuts';

  /**
   * Radix calls `onOpenChange(false)` for both Esc and backdrop clicks,
   * which routes back through the store so open state is always canonical.
   */
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      closeModal();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panel} aria-describedby={undefined}>
          {/* Visible heading — also satisfies Radix's title requirement */}
          <Dialog.Title asChild>
            <header className={styles.header}>
              <h2 className={styles.title}>Keyboard shortcuts</h2>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label="Close keyboard shortcuts"
                >
                  ×
                </button>
              </Dialog.Close>
            </header>
          </Dialog.Title>

          {/* Visually hidden description satisfies the Radix a11y warning */}
          <Dialog.Description className={styles.srOnly}>
            A reference list of all keyboard shortcuts available in the pedigree editor.
          </Dialog.Description>

          <div className={styles.body}>
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.label} className={styles.group}>
                <h3 className={styles.groupLabel}>{group.label}</h3>
                {group.rows.map((row) => (
                  <div key={row.description} className={styles.row}>
                    <span className={styles.description}>{row.description}</span>
                    <span className={styles.keys}>
                      {row.keys.map((key) => (
                        <kbd key={key} className={styles.kbd}>
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            ))}

            <p className={styles.note}>
              Zoom and fit — use the bottom-left controls
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
