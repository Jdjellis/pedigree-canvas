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
 */
export function ToolIsland(): React.JSX.Element {
  const activeTool = useUIStore((s) => s.activeTool);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const actions = useEditorActions();

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
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Text"
        shortcut="2"
        icon={<Type size={19} />}
        active={activeTool === 'text'}
        onClick={actions.textTool}
        disabled={editingLocked}
      />
      <ToolButton
        label="Eraser"
        shortcut="3"
        icon={<Eraser size={19} />}
        active={activeTool === 'eraser'}
        onClick={actions.eraserTool}
        disabled={editingLocked}
      />
    </Island>
  );
}
