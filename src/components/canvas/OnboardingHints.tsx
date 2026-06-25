import type { ReactElement } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useEditorActions } from '../../commands/useEditorActions';
import { useUIStore } from '../../stores/uiStore';
import styles from './OnboardingHints.module.css';

/**
 * Excalidraw-style first-run onboarding layer.
 *
 * Rendered ONLY when the pedigree contains zero individuals. Once the first
 * person is added, this component returns `null` and the canvas is clear.
 *
 * The root element is `pointer-events: none` so it never blocks canvas
 * interaction. Only the quick-link buttons carry `pointer-events: auto`.
 *
 * Hand-drawn / whimsical styling is scoped to `OnboardingHints.module.css`
 * and does NOT bleed into any other component.
 *
 * @returns The onboarding overlay, or `null` when at least one individual exists.
 */
export function OnboardingHints(): ReactElement | null {
  const individualCount = usePedigreeStore(
    (s) => Object.keys(s.document.individuals).length
  );

  const { openDocument, importPed } = useEditorActions();

  const handleHelp = (): void => {
    useUIStore.getState().openModal('shortcuts');
  };

  if (individualCount > 0) {
    return null;
  }

  return (
    <div className={styles.layer}>
      {/* ── Decorative hand-drawn arrows pointing at the island slots ── */}
      {/* Top-left arrow → MenuIsland */}
      <div className={`${styles.arrowHint} ${styles.arrowTopLeft}`} aria-hidden="true">
        <svg
          className={styles.arrowSvg}
          viewBox="0 0 80 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M72 50 C60 45, 30 30, 10 10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="4 2"
          />
          <path
            d="M10 10 L16 18 M10 10 L20 12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.arrowLabel}>Menu, export, settings</span>
      </div>

      {/* Top-center arrow → ToolIsland */}
      <div className={`${styles.arrowHint} ${styles.arrowTopCenter}`} aria-hidden="true">
        <svg
          className={styles.arrowSvg}
          viewBox="0 0 60 70"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M30 62 C28 45, 26 25, 28 8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="4 2"
          />
          <path
            d="M28 8 L20 16 M28 8 L36 16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.arrowLabel}>Pick a tool &amp; add your first person</span>
      </div>

      {/* Bottom-left arrow → ZoomIsland + HistoryIsland */}
      <div className={`${styles.arrowHint} ${styles.arrowBottomLeft}`} aria-hidden="true">
        <svg
          className={styles.arrowSvg}
          viewBox="0 0 80 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M72 10 C60 15, 30 30, 10 50"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="4 2"
          />
          <path
            d="M10 50 L16 42 M10 50 L20 48"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.arrowLabel}>Zoom &amp; history</span>
      </div>

      {/* Bottom-right arrow → HelpIsland */}
      <div className={`${styles.arrowHint} ${styles.arrowBottomRight}`} aria-hidden="true">
        <svg
          className={styles.arrowSvg}
          viewBox="0 0 80 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 10 C20 15, 50 30, 70 50"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="4 2"
          />
          <path
            d="M70 50 L64 42 M70 50 L60 48"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className={styles.arrowLabel}>Shortcuts &amp; help</span>
      </div>

      {/* ── Centered content block ── */}
      <div className={styles.center}>
        <h1 className={styles.wordmark}>Pedigree</h1>

        <p className={styles.reassurance}>
          Your work is saved only in this browser.
        </p>

        <p className={styles.cue}>
          Click <strong>+ Person</strong> (top center) to add your first person.
        </p>

        {/* Quick links — pointer-events: auto so they're clickable */}
        <div className={styles.quickLinks}>
          <button
            type="button"
            className={styles.quickLinkBtn}
            onClick={openDocument}
          >
            Open
          </button>
          <button
            type="button"
            className={styles.quickLinkBtn}
            onClick={importPed}
          >
            Import
          </button>
          <button
            type="button"
            className={styles.quickLinkBtn}
            onClick={handleHelp}
          >
            Help
          </button>
        </div>

        <p className={styles.shortcutHint}>
          <kbd className={styles.kbd}>⌘K</kbd> for all commands
        </p>
      </div>
    </div>
  );
}
