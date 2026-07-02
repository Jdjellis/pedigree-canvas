import { useEditorActions } from '../../../commands/useEditorActions';
import { useUIStore } from '../../../stores/uiStore';
import { Island } from './Island';
import styles from './islands.module.css';

/**
 * Top-right floating island containing primary document actions.
 *
 * Renders two controls:
 * - **Export** — a primary CTA that opens the export modal via `exportDocument`.
 * - **Toggle properties panel** — an icon button that shows/hides the
 *   properties panel; reflects open state via `aria-pressed`.
 *
 * Zustand subscriptions are safe here because ActionsIsland renders in the
 * react-dom tree (not inside a react-konva Stage).
 *
 * Hidden entirely in zen mode (a focus mode strips the top-right chrome). In
 * view (read-only) mode it stays but sheds the properties-panel toggle — Export
 * remains, since a read-only pedigree is exactly what you'd share/export
 * (mirroring Excalidraw keeping Share in view mode).
 *
 * @example
 * ```tsx
 * <ActionsIsland />
 * ```
 */
export function ActionsIsland(): React.JSX.Element | null {
  const { exportDocument } = useEditorActions();
  const propertiesPanelOpen = useUIStore((s) => s.propertiesPanelOpen);
  const zenMode = useUIStore((s) => s.zenMode);
  const editingLocked = useUIStore((s) => s.editingLocked);

  const handleToggleProperties = (): void => {
    useUIStore.getState().togglePropertiesPanel();
  };

  if (zenMode) return null;

  return (
    <Island aria-label="Actions">
      <button
        type="button"
        className={`${styles.button} ${styles.textButton} ${styles.primary}`}
        onClick={exportDocument}
        aria-label="Export"
        title="Export document"
      >
        Export
      </button>

      {/* The properties panel is an editing surface and is suppressed in view
          mode, so its toggle is tucked away there too. */}
      {!editingLocked && (
        <button
          type="button"
          className={`${styles.button} ${propertiesPanelOpen ? styles.buttonActive : ''}`}
          onClick={handleToggleProperties}
          aria-pressed={propertiesPanelOpen}
          aria-label="Toggle properties panel"
          title="Toggle properties panel"
        >
          &#x25A5;
        </button>
      )}
    </Island>
  );
}
