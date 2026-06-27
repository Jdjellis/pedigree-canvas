import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useEditorActions } from '../../commands/useEditorActions';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { shouldShowOnboarding, ONBOARDED_STORAGE_KEY } from './onboarding';
import styles from './OnboardingHints.module.css';

/**
 * Excalidraw-style first-run onboarding layer.
 *
 * Rendered while the document has zero or one individual (the seeded person)
 * and the user has not yet added a relative. Once a second person is added the
 * `pedigree-onboarded` localStorage flag is set and onboarding never returns.
 *
 * A one-time radial auto-preview fires ~600 ms after mount so new users
 * immediately discover the hover-to-add-relatives mechanism.
 *
 * The root element is `pointer-events: none` so it never blocks canvas
 * interaction. Only the quick-link buttons carry `pointer-events: auto`.
 *
 * Hand-drawn / whimsical styling is scoped to `OnboardingHints.module.css`
 * and does NOT bleed into any other component.
 *
 * @returns The onboarding overlay, or `null` when onboarding is complete.
 */
export function OnboardingHints(): ReactElement | null {
  const individualCount = usePedigreeStore(
    (s) => Object.keys(s.document.individuals).length
  );

  const [onboarded] = useState(() => localStorage.getItem(ONBOARDED_STORAGE_KEY) === '1');

  // Mark onboarded once the first relative is added, so it never returns.
  useEffect(() => {
    if (individualCount >= 2) localStorage.setItem(ONBOARDED_STORAGE_KEY, '1');
  }, [individualCount]);

  // One-time radial auto-preview: open the radial menu on the seed person
  // ~600 ms after mount so new users discover the hover-to-add-relatives flow.
  const previewedRef = useRef(false);
  useEffect(() => {
    if (previewedRef.current) return;
    const ids = Object.keys(usePedigreeStore.getState().document.individuals);
    if (ids.length !== 1) return;
    previewedRef.current = true;
    const seedId = ids[0];
    const seed = usePedigreeStore.getState().document.individuals[seedId];
    const screen = useViewportStore.getState().canvasToScreen(seed.position);
    const t = setTimeout(() => useUIStore.getState().showRadialMenu(seedId, screen), 600);
    return () => clearTimeout(t);
  }, []);

  const { openDocument, importPed } = useEditorActions();

  const handleHelp = (): void => {
    useUIStore.getState().openModal('shortcuts');
  };

  if (!shouldShowOnboarding(individualCount, onboarded)) {
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
          This is your first person. Hover it to add relatives — parent, partner,
          child, or sibling.
        </p>
        <p className={styles.cue}>
          Set the sex of new people with the ▢ ● ◇ control next to Select.
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
