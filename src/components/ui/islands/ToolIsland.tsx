import { Lock, Hand } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useEditorActions } from '../../../commands/useEditorActions';
import { Island } from './Island';
import { ToolButton } from './ToolButton';
import { PLACEMENT_TOOLS, type PlacementToolId } from './toolDefs';
import styles from './islands.module.css';

/**
 * Floating tool-selection island: lock and hand helpers, then the placeable
 * tools (select, male, female, unknown, partnership, text, eraser) with number
 * shortcut badges. Reads `activeTool`/`toolLocked` reactively — safe here
 * because this component lives in the react-dom tree (not inside react-konva).
 */
export function ToolIsland(): React.JSX.Element {
  const activeTool = useUIStore((s) => s.activeTool);
  const toolLocked = useUIStore((s) => s.toolLocked);
  const actions = useEditorActions();

  const activators: Record<PlacementToolId, () => void> = {
    select: actions.selectTool,
    male: actions.maleTool,
    female: actions.femaleTool,
    unknown: actions.unknownTool,
    partnership: actions.partnershipTool,
    text: actions.textTool,
    eraser: actions.eraserTool,
  };

  return (
    <Island aria-label="Tools">
      <ToolButton
        label="Lock"
        icon={<Lock size={18} />}
        active={toolLocked}
        onClick={actions.toggleToolLock}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ToolButton
        label="Hand"
        icon={<Hand size={19} />}
        active={activeTool === 'hand'}
        onClick={actions.handTool}
      />
      {PLACEMENT_TOOLS.map((tool) => (
        <span key={tool.id} style={{ display: 'contents' }}>
          {(tool.id === 'male' || tool.id === 'partnership' || tool.id === 'text') && (
            <span className={styles.toolDivider} aria-hidden="true" />
          )}
          <ToolButton
            label={tool.label}
            shortcut={tool.shortcut}
            icon={tool.icon}
            active={activeTool === tool.id}
            onClick={activators[tool.id]}
          />
        </span>
      ))}
    </Island>
  );
}
