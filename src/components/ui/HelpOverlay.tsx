import * as Dialog from '@radix-ui/react-dialog';
import { useUIStore } from '../../stores/uiStore';
import styles from './HelpOverlay.module.css';

/** Feedback destination — opens the tester's own mail client. */
const FEEDBACK_HREF = 'mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback';

/**
 * Help & About modal — orients early users with a quick-start, a link to the
 * keyboard-shortcuts overlay, the clinical disclaimer, a feedback link, and the
 * app version.
 *
 * Driven by `useUIStore` — opens when `activeModal === 'help'` and closes
 * (Esc / click-outside / × button) via `closeModal()`.
 *
 * Mount once at the top of the component tree (App.tsx).
 *
 * @example
 * ```tsx
 * <HelpOverlay />
 * ```
 */
export function HelpOverlay(): React.JSX.Element {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);

  const open = activeModal === 'help';

  /**
   * Radix calls `onOpenChange(false)` for both Esc and backdrop clicks,
   * which routes back through the store so open state is always canonical.
   */
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      closeModal();
    }
  };

  const handleViewShortcuts = (): void => {
    openModal('shortcuts');
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panel} aria-describedby={undefined}>
          {/* Visible heading — also satisfies Radix's title requirement */}
          <Dialog.Title asChild>
            <header className={styles.header}>
              <h2 className={styles.title}>Help &amp; About</h2>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label="Close help"
                >
                  ×
                </button>
              </Dialog.Close>
            </header>
          </Dialog.Title>

          {/* Visually hidden description satisfies the Radix a11y warning */}
          <Dialog.Description className={styles.srOnly}>
            Quick-start, keyboard shortcuts, clinical disclaimer, feedback, and
            version information for Pedigree Canvas.
          </Dialog.Description>

          <div className={styles.body}>
            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>How to build your first pedigree</h3>
              <ol className={styles.steps}>
                <li>Hover near a person to add relatives.</li>
                <li>Use ▢ ● ◇ to set a person&apos;s sex.</li>
                <li>
                  Hold <kbd className={styles.kbd}>Alt</kbd> and drag from one
                  person to another to link them, then pick the relationship type.
                </li>
                <li>
                  Press <kbd className={styles.kbd}>⌘K</kbd> for all commands.
                </li>
                <li>Open, import, and export from the top-left menu.</li>
              </ol>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Keyboard shortcuts</h3>
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleViewShortcuts}
              >
                View all keyboard shortcuts
              </button>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Disclaimer</h3>
              <p className={styles.disclaimer}>
                Pedigree Canvas is a drawing and documentation tool. It does not
                provide medical advice, diagnosis, or risk assessment, and does
                not replace professional clinical judgement or genetic
                counselling. Always verify symbols, relationships, and
                annotations against your own records and current clinical
                standards before relying on a pedigree.
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionLabel}>Feedback</h3>
              <a className={styles.feedbackLink} href={FEEDBACK_HREF}>
                Send feedback
              </a>
            </section>

            <footer className={styles.footer}>
              <span className={styles.version}>Pedigree Canvas v{__APP_VERSION__}</span>
              {' — '}your data stays on your device.
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
