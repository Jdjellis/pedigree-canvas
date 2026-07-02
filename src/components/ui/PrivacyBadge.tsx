import { useState, useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import styles from './PrivacyBadge.module.css';

/**
 * Clickable privacy badge indicating local-first data storage.
 *
 * Renders a shield-check icon in the bottom-right chrome. Hovering shows a
 * native tooltip; clicking opens an inline popover with more detail.
 * Dismissed by clicking outside, pressing Escape, or clicking the badge again.
 *
 * Hidden in zen mode — it's peripheral chrome that the focus mode strips. It
 * stays in view mode.
 */
export function PrivacyBadge(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zenMode = useUIStore((s) => s.zenMode);

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

  if (zenMode) return null;

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {open && (
        <div className={styles.popover} role="status" aria-live="polite">
          <p className={styles.heading}>Your data stays on your device.</p>
          <p className={styles.body}>
            Nothing is ever sent to a server — all pedigree data is stored
            locally in your browser only.
          </p>
          <p className={styles.disclaimer}>
            For documentation and educational use. Not a medical device and not
            for diagnostic decisions — verify every pedigree against the source
            record.
          </p>
        </div>
      )}
      <button
        type="button"
        className={styles.badge}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Privacy information"
        aria-expanded={open}
      >
        <ShieldCheck size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
