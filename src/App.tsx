import { useCallback, useRef } from 'react';
import {
  CanvasContainer,
  type CanvasContainerHandle,
} from './components/canvas/CanvasContainer';
import { EmptyStateHint } from './components/canvas/EmptyStateHint';
import { Toolbar } from './components/ui/Toolbar';
import { PropertiesPanel } from './components/ui/PropertiesPanel';
import { RadialMenu } from './components/ui/RadialMenu';
import { ImportExportModal } from './components/ui/ImportExportModal';
import { LegendEditor } from './components/ui/LegendEditor';
import { LinkTypePopup } from './components/ui/LinkTypePopup';
import { RelationshipPopup } from './components/ui/RelationshipPopup';
import { LegendOverlay } from './components/ui/LegendOverlay';
import { AnnotationEditor } from './components/ui/AnnotationEditor';
import { useUIStore } from './stores/uiStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAutoSave } from './hooks/useAutoSave';
import styles from './App.module.css';

function App() {
  const canvasRef = useRef<CanvasContainerHandle>(null);
  const propertiesPanelOpen = useUIStore((s) => s.propertiesPanelOpen);

  useKeyboardShortcuts();
  useAutoSave();

  const getStage = useCallback(() => {
    return canvasRef.current?.getStage() ?? null;
  }, []);

  return (
    <div className={styles.app}>
      <Toolbar />
      <div className={styles.main}>
        <div className={styles.canvasArea}>
          <CanvasContainer ref={canvasRef} />
          <EmptyStateHint />
          <RadialMenu />
          <LegendOverlay />
          <AnnotationEditor />
        </div>
        {propertiesPanelOpen && <PropertiesPanel />}
      </div>
      <ImportExportModal getStage={getStage} />
      <LegendEditor />
      <LinkTypePopup />
      <RelationshipPopup />
    </div>
  );
}

export default App;
