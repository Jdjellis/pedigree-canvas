import { Lock, Hand, MousePointer2, Type, Eraser } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { Island } from './Island';
import { ToolButton } from './ToolButton';
import styles from './islands.module.css';

/**
 * Floating tool island: edit-lock and hand helpers, then Select, then Text and
 * Eraser. Reads `activeTool`/`editingLocked` reactively — safe here because
 * this lives in the react-dom tree.
 *
 * Hidden entirely in zen mode (distraction-free canvas) — it's edit chrome.
 * In view (read-only) mode the edit-only tools (Text, Eraser) are tucked away
 * entirely rather than merely disabled, so the toolbar itself reads read-only;
 * only the navigation tools and the view-mode toggle remain.
 */
export function ToolIsland(): React.JSX.Element | null {
  const activeTool = useUIStore((s) => s.activeTool);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const zenMode = useUIStore((s) => s.zenMode);
  const actions = useEditorActions();

  if (zenMode) return null;

  return (
    <Island aria-label="Tools">
      <ToolButton
        label="Lock editing"
        icon={<Lock size={18} />}
        active={editingLocked}
        onClick={actions.toggleEditingLock}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Hand"
        icon={<Hand size={19} />}
        active={activeTool === 'hand'}
        onClick={actions.handTool}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Select"
        shortcut="1"
        icon={<MousePointer2 size={19} />}
        active={activeTool === 'select'}
        onClick={actions.selectTool}
      />
      {!editingLocked && (
        <>
          <span className={styles.toolDivider} aria-hidden="true" />
          <ToolButton
            label="Text"
            shortcut="2"
            icon={<Type size={19} />}
            active={activeTool === 'text'}
            onClick={actions.textTool}
          />
          <ToolButton
            label="Eraser"
            shortcut="3"
            icon={<Eraser size={19} />}
            active={activeTool === 'eraser'}
            onClick={actions.eraserTool}
          />
        </>
      )}
    </Island>
  );
}
