import { useState, useEffect, useRef } from 'react';
import styles from './PrivacyBadge.module.css';

function LockIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="6"
        width="10"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Floating badge indicating local-first data privacy.
 *
 * Renders a small lock button in the bottom-right chrome. Clicking it opens
 * an inline popover explaining that pedigree data never leaves the browser.
 * Dismissed by clicking outside, pressing Escape, or clicking the badge again.
 */
export function PrivacyBadge(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent): void => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {open && (
        <div className={styles.popover} role="status" aria-live="polite">
          <p className={styles.heading}>Your data stays on your device.</p>
          <p className={styles.body}>
            Nothing is ever sent to a server — all pedigree data is stored
            locally in your browser only.
          </p>
        </div>
      )}
      <button
        type="button"
        className={styles.badge}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Privacy information"
        aria-expanded={open}
        title="Privacy information"
      >
        <LockIcon />
      </button>
    </div>
  );
}
