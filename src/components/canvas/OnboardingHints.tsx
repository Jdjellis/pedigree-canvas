import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useEditorActions } from '../../commands/useEditorActions';
import { useUIStore } from '../../stores/uiStore';
import { shouldShowOnboarding } from './onboarding';
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

  const onboarded = useUIStore((s) => s.onboarded);

  // Mark onboarded once the first relative is added, so it never returns.
  useEffect(() => {
    if (individualCount >= 2) useUIStore.getState().setOnboarded();
  }, [individualCount]);

  // One-time radial auto-preview: open the radial menu on the seed person
  // ~600 ms after mount so new users discover the hover-to-add-relatives flow.
  const previewedRef = useRef(false);
  useEffect(() => {
    if (previewedRef.current) return;
    const ids = Object.keys(usePedigreeStore.getState().document.individuals);
    if (ids.length !== 1) return;
    const seedId = ids[0];
    const t = setTimeout(() => {
      const ui = useUIStore.getState();
      // Don't clobber a menu the user is already interacting with, or when locked.
      if (ui.radialMenu.visible || ui.editingLocked) return;
      const seed = usePedigreeStore.getState().document.individuals[seedId];
      if (!seed) return;
      ui.showRadialMenu(seedId, seed.position);
      // Pin so the proximity controller doesn't dismiss it when the pointer
      // drifts away — the radial stays until the user adds a relative (which
      // calls hideRadialMenu), presses Escape, or clicks empty canvas.
      ui.pinRadialMenu();
      // Mark only after actually firing, so StrictMode's mount→cleanup→remount
      // (which clears the first timer) still leaves the second timer to run.
      previewedRef.current = true;
    }, 600);
    return () => clearTimeout(t);
  }, [individualCount]);

  const { openDocument, importPed } = useEditorActions();

  const handleHelp = (): void => {
    useUIStore.getState().openModal('help');
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

      {/* ── Caption anchored just below the seed person ── */}
      <div className={styles.caption}>
        <h1 className={styles.wordmark}>Pedigree Canvas</h1>
        <p className={styles.reassurance}>Your work is saved only in this browser.</p>
        <p className={styles.cue}>
          Hover to add relatives — use ▢ ● ◇ to set their sex.
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
