import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useViewportStore } from '../../stores/viewportStore';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { placeTextAt } from './toolPlacement';
import { GridLayer } from './GridLayer';
import { ConnectionsLayer } from '../connections/ConnectionsLayer';
import { PedigreeSymbol } from './symbols/PedigreeSymbol';
import { DragLinkLayer } from './DragLinkLayer';
import { LegendLayer } from './LegendLayer';
import { TextAnnotationLayer } from './TextAnnotationLayer';
import { BoundsLayer } from './BoundsLayer';
import { computeBounds } from '../../utils/boundsCalculation';
import { collectInvestigations } from '../../utils/investigations';
import type { ActiveQuarter } from './symbols/ConditionOverlay';
import type { Individual } from '../../types/pedigree';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_WHEEL_SENSITIVITY,
  WHEEL_LINE_HEIGHT,
  SYMBOL_SIZE,
} from '../../utils/constants';
import {
  marqueeRect,
  idsIntersectingMarquee,
  type NodeBox,
} from './marqueeSelection';
import { useRadialHover } from '../../hooks/useRadialHover';
import styles from './CanvasContainer.module.css';

export interface CanvasContainerHandle {
  getStage: () => Konva.Stage | null;
}

export const CanvasContainer = forwardRef<CanvasContainerHandle>(
  (_props, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    // Guards the one-time "centre the view on content" pass (see effect below).
    const didInitialCenterRef = useRef(false);

    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);
    // True while the spacebar is held — turns the canvas into a "pan anywhere"
    // mode (symbol dragging is suspended so a left-drag pans over symbols too).
    const [isSpaceHeld, setIsSpaceHeld] = useState(false);
    // True while a middle-mouse pan gesture is in progress.
    const [isMiddlePanning, setIsMiddlePanning] = useState(false);
    // Marquee drag in canvas space (select tool only); null when not dragging.
    const [marquee, setMarquee] = useState<
      { start: { x: number; y: number }; current: { x: number; y: number } } | null
    >(null);
    // Mirror of the marquee in a ref so marquee-up can read the final rect and
    // run the selection mutation OUTSIDE any setState updater (mutating a store
    // inside setMarquee's updater is a setState-in-render violation).
    const marqueeRef = useRef<
      { start: { x: number; y: number }; current: { x: number; y: number } } | null
    >(null);
    // Set true when a marquee drag (not a zero-distance click) just committed,
    // so the Stage `click` Konva synthesizes on pointerup does not immediately
    // clearSelection() the marquee's result. Consumed (reset) by handleStageClick.
    const didMarqueeRef = useRef(false);
    // True while the eraser is held down for a drag-erase swath.
    const [isErasing, setIsErasing] = useState(false);

    const scale = useViewportStore((s) => s.scale);
    const position = useViewportStore((s) => s.position);
    const setPosition = useViewportStore((s) => s.setPosition);

    const activeTool = useUIStore((s) => s.activeTool);
    const clearSelection = useUIStore((s) => s.clearSelection);
    const selectedIds = useUIStore((s) => s.selectedIds);
    const hoveredId = useUIStore((s) => s.hoveredId);
    const editingAnnotationId = useUIStore((s) => s.editingAnnotationId);
    const selectedConnection = useUIStore((s) => s.selectedConnection);
    const dragLink = useUIStore((s) => s.dragLink);
    const updateDragLinkCursor = useUIStore((s) => s.updateDragLinkCursor);
    const endDragLink = useUIStore((s) => s.endDragLink);
    const editingLocked = useUIStore((s) => s.editingLocked);

    // Lift store subscriptions to react-dom context so Konva layers re-render
    const individuals = usePedigreeStore((s) => s.document.individuals);
    const partnerships = usePedigreeStore((s) => s.document.partnerships);
    const parentChildLinks = usePedigreeStore((s) => s.document.parentChildLinks);
    const twinGroups = usePedigreeStore((s) => s.document.twinGroups);
    const textAnnotations = usePedigreeStore((s) => s.document.textAnnotations);
    const legendConfig = usePedigreeStore((s) => s.document.legendConfig);
    const moveLegend = usePedigreeStore((s) => s.moveLegend);

    useImperativeHandle(ref, () => ({
      getStage: () => stageRef.current,
    }));

    // --------------- Resize Observer ---------------
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setDimensions({ width, height });
        }
      });

      observer.observe(container);

      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });

      return () => {
        observer.disconnect();
      };
    }, []);

    // --------------- Proximity-driven radial add-menu (hover with hysteresis) ---------------
    useRadialHover(isSpaceHeld || activeTool === 'hand');

    // --------------- Centre the view on content once the stage is measured ---------------
    // The seed document places its first person at canvas origin (0,0). The
    // viewport can't be centred on it until the stage has real dimensions, which
    // happens after the ResizeObserver fires — so do it here, once, when both
    // dimensions and content are available. Also frames a restored document on
    // load (the viewport itself is not persisted).
    useEffect(() => {
      if (didInitialCenterRef.current) return;
      if (dimensions.width === 0 || dimensions.height === 0) return;
      const people = Object.values(individuals);
      if (people.length === 0) return;

      const xs = people.map((p) => p.position.x);
      const ys = people.map((p) => p.position.y);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

      const { scale: currentScale, setPosition: setViewportPosition } =
        useViewportStore.getState();
      setViewportPosition({
        x: dimensions.width / 2 - centerX * currentScale,
        // Place content at the top third of the canvas so the onboarding caption
        // has comfortable space to read beneath the person.
        y: dimensions.height * 0.33 - centerY * currentScale,
      });
      didInitialCenterRef.current = true;
    }, [dimensions.width, dimensions.height, individuals]);

    // --------------- Spacebar: hold to pan from anywhere ---------------
    useEffect(() => {
      const isTypingTarget = (t: EventTarget | null): boolean => {
        const el = t as HTMLElement | null;
        return (
          !!el &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' ||
            el.isContentEditable)
        );
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
        e.preventDefault(); // avoid page scroll / focused-button activation
        setIsSpaceHeld(true);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') setIsSpaceHeld(false);
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      };
    }, []);

    // --------------- Middle-mouse drag: pan from anywhere ---------------
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let last: { x: number; y: number } | null = null;

      // Intercept the middle button in the capture phase, before Konva's
      // listeners (bound on the descendant content element) can start a drag —
      // so middle-drag always pans rather than moving a symbol. A physical
      // middle press fires both pointerdown and mousedown; we stop both.
      const onDown = (e: MouseEvent) => {
        if (e.button !== 1) return;
        e.preventDefault(); // suppress middle-click autoscroll
        e.stopPropagation();
        if (last) return; // already started by the paired pointer/mouse event
        last = { x: e.clientX, y: e.clientY };
        setIsMiddlePanning(true);
      };
      const onMove = (e: MouseEvent) => {
        if (!last) return;
        useViewportStore
          .getState()
          .panBy({ x: e.clientX - last.x, y: e.clientY - last.y });
        last = { x: e.clientX, y: e.clientY };
      };
      const onUp = () => {
        if (!last) return;
        last = null;
        setIsMiddlePanning(false);
      };

      container.addEventListener('mousedown', onDown, true);
      container.addEventListener('pointerdown', onDown as EventListener, true);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        container.removeEventListener('mousedown', onDown, true);
        container.removeEventListener('pointerdown', onDown as EventListener, true);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, []);

    // --------------- Eraser drag: safety-net stop when mouse releases off-canvas ---------------
    useEffect(() => {
      const stop = () => setIsErasing(false);
      window.addEventListener('mouseup', stop);
      return () => window.removeEventListener('mouseup', stop);
    }, []);

    // --------------- Cursor feedback for pan modes ---------------
    useEffect(() => {
      const el = stageRef.current?.container();
      if (!el) return;
      const panning = isDragging || isMiddlePanning;
      el.style.cursor = panning ? 'grabbing' : isSpaceHeld ? 'grab' : '';
      // While panning, clear any inline cursor the symbols set on the canvases
      // so the container's grab/grabbing cursor is what shows.
      if (panning || isSpaceHeld) {
        el.querySelectorAll('canvas').forEach((c) => {
          (c as HTMLElement).style.cursor = '';
        });
      }
    }, [isDragging, isMiddlePanning, isSpaceHeld]);

    // --------------- Wheel: pan, or zoom with Ctrl/Cmd (and trackpad pinch) ---------------
    const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const evt = e.evt;

      // Normalize line-mode wheels (classic mouse wheels) to pixel-equivalents.
      const lineFactor = evt.deltaMode === 1 ? WHEEL_LINE_HEIGHT : 1;
      let dx = evt.deltaX * lineFactor;
      let dy = evt.deltaY * lineFactor;

      // Ctrl/Cmd + wheel — and trackpad pinch, which browsers deliver as a wheel
      // event with ctrlKey set — zoom toward the cursor.
      if (evt.ctrlKey || evt.metaKey) {
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const { scale, zoomToPoint } = useViewportStore.getState();
        const newScale = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, scale * Math.exp(-dy * ZOOM_WHEEL_SENSITIVITY))
        );
        zoomToPoint(pointer, newScale);
        return;
      }

      // Plain wheel / two-finger scroll pans. Shift maps a vertical-only mouse
      // wheel to horizontal panning.
      if (evt.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      useViewportStore.getState().panBy({ x: -dx, y: -dy });
    }, []);

    // --------------- Stage Drag (Pan) ---------------
    const handleDragStart = useCallback(() => {
      setIsDragging(true);
    }, []);

    const handleDragEnd = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        setIsDragging(false);
        const stage = e.target;
        if (stage !== stageRef.current) return;
        setPosition({ x: stage.x(), y: stage.y() });
      },
      [setPosition]
    );

    const handleDragMove = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        const stage = e.target;
        if (stage !== stageRef.current) return;
        setPosition({ x: stage.x(), y: stage.y() });
      },
      [setPosition]
    );

    // --------------- Click on Empty Canvas ---------------
    const handleStageClick = useCallback(
      (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (didMarqueeRef.current) {
          didMarqueeRef.current = false;
          return;
        }
        const clickedOnEmpty = e.target === e.target.getStage();
        if (!clickedOnEmpty) return;

        // Read activeTool via getState() to avoid stale-closure issues —
        // consistent with the existing pattern in this file (no Zustand hook
        // subscriptions inside react-konva handlers).
        const currentTool = useUIStore.getState().activeTool;

        if (currentTool === 'text') {
          if (useUIStore.getState().editingLocked) return;
          const stage = stageRef.current;
          if (!stage) return;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const canvasPos = useViewportStore.getState().screenToCanvas(pointer);
          placeTextAt(canvasPos);
        } else if (currentTool === 'select') {
          useUIStore.getState().hideRadialMenu();
          clearSelection();
        }
      },
      [clearSelection],
    );

    const handleStageMouseMove = useCallback(
      (_e: KonvaEventObject<MouseEvent>) => {
        if (!dragLink.active) return;
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const { screenToCanvas } = useViewportStore.getState();
        const canvasPos = screenToCanvas(pointer);
        updateDragLinkCursor(canvasPos);
      },
      [dragLink.active, updateDragLinkCursor],
    );

    const handleStageMouseUp = useCallback(() => {
      if (dragLink.active) {
        endDragLink();
      }
    }, [dragLink.active, endDragLink]);

    const handleMarqueeDown = useCallback(
      (e: KonvaEventObject<MouseEvent>) => {
        didMarqueeRef.current = false;
        if (useUIStore.getState().activeTool !== 'select') return;
        if (e.target !== e.target.getStage()) return; // only on empty canvas
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const pos = useViewportStore.getState().screenToCanvas(pointer);
        marqueeRef.current = { start: pos, current: pos };
        setMarquee(marqueeRef.current);
      },
      [],
    );

    const handleMarqueeMove = useCallback(() => {
      if (!marqueeRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const pos = useViewportStore.getState().screenToCanvas(pointer);
      marqueeRef.current = { start: marqueeRef.current.start, current: pos };
      setMarquee(marqueeRef.current);
    }, []);

    const handleMarqueeUp = useCallback(() => {
      const prev = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      if (!prev) return;
      didMarqueeRef.current =
        prev.start.x !== prev.current.x || prev.start.y !== prev.current.y;
      const rect = marqueeRect(prev.start, prev.current);
      // Build node boxes in canvas space. Individual `position` is the symbol
      // CENTRE, so expand by half SYMBOL_SIZE.
      const half = SYMBOL_SIZE / 2;
      const boxes: NodeBox[] = Object.values(
        usePedigreeStore.getState().document.individuals,
      ).map((ind) => ({
        id: ind.id,
        x: ind.position.x - half,
        y: ind.position.y - half,
        width: SYMBOL_SIZE,
        height: SYMBOL_SIZE,
      }));
      const ids = idsIntersectingMarquee(rect, boxes);
      const ui = useUIStore.getState();
      if (ids.length > 0) ui.selectMultiple(ids);
      else ui.clearSelection();
    }, []);

    // Pan by dragging only when the hand tool is active or space is held. In
    // every other tool, dragging empty canvas is free for marquee / placement.
    const isDraggable = activeTool === 'hand' || isSpaceHeld;

    const individualsList = Object.values(individuals);

    const bounds = useMemo(() => computeBounds(individualsList), [individualsList]);

    const investigations = useMemo(
      () => collectInvestigations(individualsList),
      [individualsList],
    );

    const individualNumbers = useMemo(() => {
      const numbers = new Map<string, number>();
      const genGroups = new Map<number, Individual[]>();
      for (const ind of individualsList) {
        const gen = ind.generation ?? 0;
        if (!genGroups.has(gen)) genGroups.set(gen, []);
        genGroups.get(gen)!.push(ind);
      }
      for (const [, group] of genGroups) {
        group.sort((a, b) => a.position.x - b.position.x);
        group.forEach((ind, idx) => {
          numbers.set(ind.id, idx + 1);
        });
      }
      return numbers;
    }, [individualsList]);

    const getActiveQuarters = useCallback(
      (individual: Individual): ActiveQuarter[] => {
        if (!legendConfig || !individual.conditionIds) return [];
        return legendConfig.entries
          .filter((entry) => individual.conditionIds.includes(entry.id))
          .map((entry) => ({
            quarter: entry.quarter,
            fillColor: entry.fillColor,
            fillPattern: entry.fillPattern,
          }));
      },
      [legendConfig],
    );

    return (
      <div
        ref={containerRef}
        className={styles.container}
        data-tool={activeTool}
        data-dragging={isDragging}
      >
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Stage
            ref={stageRef}
            width={dimensions.width}
            height={dimensions.height}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={isDraggable}
            onWheel={handleWheel}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onMouseDown={(e) => {
              handleMarqueeDown(e);
              if (useUIStore.getState().activeTool === 'eraser') setIsErasing(true);
            }}
            onMouseMove={(e) => {
              handleStageMouseMove(e);
              handleMarqueeMove();
            }}
            onMouseUp={() => {
              handleStageMouseUp();
              handleMarqueeUp();
              setIsErasing(false);
            }}
          >
            <Layer>
              <BoundsLayer bounds={bounds} individuals={individualsList} />
            </Layer>

            <GridLayer
              width={dimensions.width}
              height={dimensions.height}
              scale={scale}
              position={position}
            />

            <ConnectionsLayer
              partnerships={partnerships}
              parentChildLinks={parentChildLinks}
              twinGroups={twinGroups}
              individuals={individuals}
              selectedConnection={selectedConnection}
            />

            <Layer>
              {individualsList.map((individual) => (
                <PedigreeSymbol
                  key={individual.id}
                  individual={individual}
                  isSelected={selectedIds.has(individual.id)}
                  isHovered={hoveredId === individual.id}
                  activeQuarters={getActiveQuarters(individual)}
                  individualNumber={individualNumbers.get(individual.id)}
                  panMode={isSpaceHeld || activeTool === 'hand'}
                  eraseOnHover={isErasing}
                  editingLocked={editingLocked}
                />
              ))}
            </Layer>

            <Layer>
              <TextAnnotationLayer
                annotations={textAnnotations}
                selectedIds={selectedIds}
                editingId={editingAnnotationId}
                editingLocked={editingLocked}
              />
            </Layer>

            <Layer name="selection" listening={false}>
              {marquee && (
                <Rect
                  {...marqueeRect(marquee.start, marquee.current)}
                  fill="rgba(105, 101, 219, 0.12)"
                  stroke="#6965db"
                  strokeWidth={1}
                />
              )}
            </Layer>

            <Layer>
              <DragLinkLayer
                active={dragLink.active}
                sourceId={dragLink.sourceId}
                cursorPos={dragLink.cursorPos}
                individuals={individuals}
              />
            </Layer>

            <Layer>
              <LegendLayer
                legendConfig={legendConfig}
                investigations={investigations}
                onMove={moveLegend}
                bounds={bounds}
                editingLocked={editingLocked}
              />
            </Layer>
          </Stage>
        )}
      </div>
    );
  }
);

CanvasContainer.displayName = 'CanvasContainer';
