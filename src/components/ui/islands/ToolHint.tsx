import type { ReactNode } from 'react';
import { useUIStore, type ActiveTool } from '../../../stores/uiStore';
import styles from './ToolHint.module.css';

/**
 * Per-tool hint text shown directly under the toolbar. Only tools that benefit
 * from an explicit nudge appear here; every other tool maps to `undefined` and
 * renders nothing.
 *
 * Keep these terse and action-oriented — they sit in the user's eyeline while a
 * tool is active, so they double as lightweight onboarding.
 */
const HINTS: Partial<Record<ActiveTool, ReactNode>> = {
  select: (
    <>
      To move the canvas, hold <kbd>Scroll wheel</kbd> or <kbd>Space</kbd> while
      dragging, or use the hand tool
    </>
  ),
};

/**
 * Contextual hint rendered beneath the {@link ToolIsland}. Subscribes to the
 * active tool and shows the matching {@link HINTS} entry, or nothing when the
 * active tool has no hint.
 *
 * Lives in the react-dom tree (not inside react-konva), so subscribing to the
 * UI store here is safe.
 */
export function ToolHint(): React.JSX.Element | null {
  const activeTool = useUIStore((s) => s.activeTool);
  const hint = HINTS[activeTool];
  if (!hint) return null;

  return (
    <div className={styles.hint} role="note">
      {hint}
    </div>
  );
}
