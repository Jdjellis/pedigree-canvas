import { useUIStore } from '../../../stores/uiStore';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Floating help island. Renders a single `?` button that opens the
 * Help & About panel (`HelpOverlay`).
 *
 * Hidden in zen mode — it's peripheral chrome that zen strips (Excalidraw
 * replaces this corner with "Exit zen mode"). It stays in view mode.
 *
 * @example
 * ```tsx
 * <HelpIsland />
 * ```
 */
export function HelpIsland(): React.JSX.Element | null {
  const zenMode = useUIStore((s) => s.zenMode);

  const handleHelpClick = (): void => {
    useUIStore.getState().openModal('help');
  };

  if (zenMode) return null;

  return (
    <Island aria-label="Help">
      <button
        type="button"
        className={styles.button}
        onClick={handleHelpClick}
        title="Help & About"
        aria-label="Help & About"
      >
        ?
      </button>
    </Island>
  );
}
