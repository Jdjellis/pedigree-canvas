import { useCallback, useRef } from 'react';
import {
  CanvasContainer,
  type CanvasContainerHandle,
} from './components/canvas/CanvasContainer';
import { OnboardingHints } from './components/canvas/OnboardingHints';
import { PropertiesPanel } from './components/ui/PropertiesPanel';
import { RadialMenu } from './components/ui/RadialMenu';
import { InlineGenderPicker } from './components/ui/InlineGenderPicker';
import { ImportExportModal } from './components/ui/ImportExportModal';
import { LegendEditor } from './components/ui/LegendEditor';
import { LinkTypePopup } from './components/ui/LinkTypePopup';
import { LegendOverlay } from './components/ui/LegendOverlay';
import { AnnotationEditor } from './components/ui/AnnotationEditor';
import { CommandPalette } from './components/ui/CommandPalette';
import { ShortcutsOverlay } from './components/ui/ShortcutsOverlay';
import { HelpOverlay } from './components/ui/HelpOverlay';
import { MenuIsland } from './components/ui/islands/MenuIsland';
import { ToolIsland } from './components/ui/islands/ToolIsland';
import { ToolHint } from './components/ui/islands/ToolHint';
import { ActionsIsland } from './components/ui/islands/ActionsIsland';
import { ZoomIsland } from './components/ui/islands/ZoomIsland';
import { HistoryIsland } from './components/ui/islands/HistoryIsland';
import { HelpIsland } from './components/ui/islands/HelpIsland';
import { PrivacyBadge } from './components/ui/PrivacyBadge';
import { useUIStore } from './stores/uiStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import { useApplyTheme } from './hooks/useApplyTheme';
import styles from './App.module.css';

function App() {
  const canvasRef = useRef<CanvasContainerHandle>(null);
  const propertiesPanelOpen = useUIStore((s) => s.propertiesPanelOpen);

  useKeyboardShortcuts();
  useAutoSave();
  useApplyTheme();

  const getStage = useCallback(() => {
    return canvasRef.current?.getStage() ?? null;
  }, []);

  return (
    <div className={styles.app}>
      {/* Full-bleed canvas layer */}
      <div className={styles.canvasArea}>
        <CanvasContainer ref={canvasRef} />
        <OnboardingHints />
        <RadialMenu />
        <InlineGenderPicker />
        <LegendOverlay />
        <AnnotationEditor />
      </div>

      {/* Floating island slots */}
      <div className={styles.slotTopLeft}>
        <MenuIsland />
      </div>

      <div className={styles.slotTopCenter}>
        <ToolIsland />
        <ToolHint />
      </div>

      <div className={styles.slotTopRight}>
        <ActionsIsland />
      </div>

      <div className={styles.slotBottomLeft}>
        <ZoomIsland />
        <HistoryIsland />
      </div>

      <div className={styles.slotBottomRight}>
        <PrivacyBadge />
        <HelpIsland />
      </div>

      {/* Floating properties panel — overlays the canvas, does not reflow it */}
      {propertiesPanelOpen && <PropertiesPanel />}

      {/* Modal/overlay components */}
      <ImportExportModal getStage={getStage} />
      <LegendEditor />
      <LinkTypePopup />
      <CommandPalette />
      <ShortcutsOverlay />
      <HelpOverlay />
    </div>
  );
}

export default App;
