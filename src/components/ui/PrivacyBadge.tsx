import { ShieldCheck } from 'lucide-react';
import styles from './PrivacyBadge.module.css';

/**
 * Non-interactive badge indicating local-first data privacy.
 *
 * Renders a shield-check icon in the bottom-right chrome. A native tooltip
 * on hover explains that pedigree data never leaves the browser.
 */
export function PrivacyBadge(): React.JSX.Element {
  return (
    <span
      className={styles.badge}
      aria-label="Privacy information"
      title="None of your data leaves your device"
    >
      <ShieldCheck size={20} aria-hidden="true" />
    </span>
  );
}
