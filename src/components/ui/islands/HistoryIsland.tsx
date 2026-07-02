import { useEditorActions } from '../../../commands/useEditorActions';
import { useUIStore } from '../../../stores/uiStore';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Floating history island containing Undo and Redo controls.
 *
 * Actions are sourced from `useEditorActions` which delegates to
 * `usePedigreeStore.temporal` — no store is read reactively here since these
 * buttons are always available (enabling/disabling based on history depth is
 * a future enhancement).
 *
 * Hidden in view (read-only) mode: with editing locked there is nothing to
 * undo or redo, and it's part of the edit chrome a read-only canvas sheds.
 *
 * @example
 * ```tsx
 * <HistoryIsland />
 * ```
 */
export function HistoryIsland(): React.JSX.Element | null {
  const { undo, redo } = useEditorActions();
  const editingLocked = useUIStore((s) => s.editingLocked);

  if (editingLocked) return null;

  return (
    <Island aria-label="History">
      <button
        type="button"
        className={styles.button}
        onClick={undo}
        title="Undo (Cmd+Z)"
        aria-label="Undo"
      >
        &#x21A9;
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={redo}
        title="Redo (Cmd+Shift+Z)"
        aria-label="Redo"
      >
        &#x21AA;
      </button>
    </Island>
  );
}
