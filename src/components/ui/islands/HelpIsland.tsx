import { useUIStore } from '../../../stores/uiStore';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Floating help island. Renders a single `?` button that opens the
 * Help & About panel (`HelpOverlay`).
 *
 * @example
 * ```tsx
 * <HelpIsland />
 * ```
 */
export function HelpIsland(): React.JSX.Element {
  const handleHelpClick = (): void => {
    useUIStore.getState().openModal('help');
  };

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
