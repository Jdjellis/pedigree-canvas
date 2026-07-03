import { useEffect } from 'react';
import { Wand2, X } from 'lucide-react';
import { usePedigreeStore } from '../../../stores/pedigreeStore';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { shouldSuggestReformat } from '../../../utils/reformatSuggestion';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * "Reformat to tidy" suggestion nudge, shown under the Actions island.
 *
 * The per-edit layout engine (`computeTreeLayout`) is order-preserving, so it
 * cannot clear a foreign node wedged between a couple (the classic cross-branch /
 * multi-union-hub tangle). Only the whole-document {@link reformatLayout} can — but
 * because that reorders rows and would blow away a manual arrangement, we never
 * run it automatically. Instead this closes the *discovery gap*: it watches for
 * the tangle ({@link shouldSuggestReformat}) and offers an opt-in reformat rather
 * than applying one behind the user's back.
 *
 * Visibility is derived from the document, so it disappears the moment the tangle
 * is gone (after a reformat, an undo, or a manual fix). The dismiss (✕) button is a
 * one-shot: it hides the nudge until the layout is tidy again, so repeated edits on
 * a still-tangled chart don't nag, yet a later distinct tangle can resurface it.
 *
 * Hidden in zen mode (chrome-free) and view mode (read-only — reformat is an
 * editing action), mirroring the Reformat control in {@link ActionsIsland}.
 *
 * Zustand subscriptions are safe here: like the other islands it renders in the
 * react-dom tree, not inside a react-konva Stage.
 */
export function ReformatSuggestion(): React.JSX.Element | null {
  // Boolean selector: the component re-renders only when the tangle state flips,
  // not on every position update during a live drag.
  const improvable = usePedigreeStore((s) => shouldSuggestReformat(s.document));
  const dismissed = useUIStore((s) => s.reformatSuggestionDismissed);
  const zenMode = useUIStore((s) => s.zenMode);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const { reformatPedigree } = useEditorActions();

  // Re-arm the one-shot dismissal once the chart is tidy again.
  useEffect(() => {
    if (!improvable && dismissed) {
      useUIStore.getState().setReformatSuggestionDismissed(false);
    }
  }, [improvable, dismissed]);

  if (zenMode || editingLocked || !improvable || dismissed) return null;

  return (
    <Island aria-label="Layout suggestion" className={styles.suggestion}>
      <Wand2 size={16} aria-hidden="true" className={styles.suggestionIcon} />
      <span className={styles.suggestionText}>Layout looks tangled</span>
      <button
        type="button"
        className={`${styles.button} ${styles.textButton} ${styles.primary}`}
        onClick={reformatPedigree}
      >
        Reformat
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() =>
          useUIStore.getState().setReformatSuggestionDismissed(true)
        }
        aria-label="Dismiss layout suggestion"
        title="Dismiss"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </Island>
  );
}
