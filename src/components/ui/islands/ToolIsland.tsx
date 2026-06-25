import clsx from 'clsx';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Floating tool-selection island containing the three canvas interaction tools:
 * Select, Hand (pan), and Add Person.
 *
 * Reads `activeTool` reactively from `useUIStore` — safe here because this
 * component lives in the react-dom tree (not inside react-konva).
 *
 * @example
 * ```tsx
 * <ToolIsland />
 * ```
 */
export function ToolIsland(): React.JSX.Element {
  const activeTool = useUIStore((s) => s.activeTool);
  const { selectTool, handTool, addPersonTool, addText } = useEditorActions();

  return (
    <Island aria-label="Tools">
      <button
        type="button"
        className={clsx(
          styles.button,
          styles.textButton,
          activeTool === 'select' && styles.buttonActive
        )}
        onClick={selectTool}
        title="Select tool (V)"
        aria-label="Select"
        aria-pressed={activeTool === 'select'}
      >
        Select
      </button>

      <button
        type="button"
        className={clsx(
          styles.button,
          activeTool === 'pan' && styles.buttonActive
        )}
        onClick={handTool}
        title="Hand tool — pan the canvas (H)"
        aria-label="Hand"
        aria-pressed={activeTool === 'pan'}
      >
        ✋
      </button>

      <button
        type="button"
        className={clsx(
          styles.button,
          styles.textButton,
          activeTool === 'addIndividual' && styles.buttonActive
        )}
        onClick={addPersonTool}
        title="Add individual (P)"
        aria-label="Add Person"
        aria-pressed={activeTool === 'addIndividual'}
      >
        ＋ Person
      </button>

      <button
        type="button"
        className={clsx(styles.button, styles.textButton)}
        onClick={addText}
        title="Add a free-text annotation (title, caption, note)"
        aria-label="Add Text"
      >
        ＋ Text
      </button>
    </Island>
  );
}
