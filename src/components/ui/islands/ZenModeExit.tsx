import { useUIStore } from '../../../stores/uiStore';
import styles from './ZenModeExit.module.css';

/**
 * The "Exit zen mode" affordance shown while zen mode is active.
 *
 * Zen strips the peripheral chrome (help, privacy, top-right actions), so this
 * replaces the bottom-right corner — mirroring Excalidraw — giving an explicit,
 * one-click way out that doesn't depend on remembering the `Z` shortcut. The
 * drawing tools and ☰ menu remain, so editing continues uninterrupted.
 *
 * Renders nothing when zen mode is off. Lives in the react-dom tree, so the
 * Zustand subscription is safe here.
 */
export function ZenModeExit(): React.JSX.Element | null {
  const zenMode = useUIStore((s) => s.zenMode);

  if (!zenMode) return null;

  return (
    <button
      type="button"
      className={styles.exitButton}
      onClick={() => useUIStore.getState().setZenMode(false)}
      aria-keyshortcuts="Z"
    >
      Exit zen mode
    </button>
  );
}
