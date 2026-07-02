import { Eye } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import styles from './ViewModeBadge.module.css';

/**
 * Persistent "View only" badge shown whenever the canvas is in View
 * (read-only) mode. Makes the read-only state unmistakable — without it, a
 * locked canvas looks identical to an editable one until the user tries (and
 * fails) to change something.
 *
 * Clicking it leaves view mode (unlocks editing), so it doubles as the exit
 * affordance. Renders nothing when editing is unlocked. Lives in the react-dom
 * tree, so the Zustand subscription is safe here.
 */
export function ViewModeBadge(): React.JSX.Element | null {
  const editingLocked = useUIStore((s) => s.editingLocked);

  if (!editingLocked) return null;

  return (
    <button
      type="button"
      className={styles.badge}
      onClick={() => useUIStore.getState().toggleEditingLocked()}
      title="This pedigree is read-only. Click to enable editing."
    >
      <Eye size={15} aria-hidden="true" />
      View only
      <span className={styles.hint} aria-hidden="true">
        · click to edit
      </span>
    </button>
  );
}
