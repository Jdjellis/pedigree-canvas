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
import { resolveCanvasCursor } from './canvasCursor';
import { GridLayer } from './GridLayer';
import { ConnectionsLayer } from '../connections/ConnectionsLayer';
import { PedigreeSymbol } from './symbols/PedigreeSymbol';
import { DragLinkLayer } from './DragLinkLayer';
import { LegendLayer } from './LegendLayer';
import { TextAnnotationLayer } from './TextAnnotationLayer';
import { BoundsLayer } from './BoundsLayer';
import { computeBounds } from '../../utils/boundsCalculation';
import { collectInvestigations } from '../../utils/investigations';
import { childlessMarksActive } from '../../utils/childlessness';
import type { ActiveQuarter } from './symbols/ConditionOverlay';
import type { Individual } from '../../types/pedigree';
import { THEME_CANVAS_PALETTES } from '../../theme/themes';
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
import { nextPanningState } from './stageDrag';
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
    // True while the Alt/Option key is held — arms the "connect two people"
    // gesture, so hovering a person shows the connect crosshair.
    const [isAltHeld, setIsAltHeld] = useState(false);
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
    const hoveredConnection = useUIStore((s) => s.hoveredConnection);
    const dragLink = useUIStore((s) => s.dragLink);
    const updateDragLinkCursor = useUIStore((s) => s.updateDragLinkCursor);
    const endDragLink = useUIStore((s) => s.endDragLink);
    const editingLocked = useUIStore((s) => s.editingLocked);
    const showGrid = useUIStore((s) => s.showGrid);
    // Resolve the active theme's canvas palette here (react-dom), then pass the
    // colours down to the Konva layers as props — react-konva's reconciler does
    // not reliably propagate store subscriptions into canvas children.
    const theme = useUIStore((s) => s.theme);
    const canvasPalette = THEME_CANVAS_PALETTES[theme];

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

    // --------------- Alt/Option: arm the connect gesture (crosshair over people) ---------------
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt' && !e.repeat) setIsAltHeld(true);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setIsAltHeld(false);
      };
      // Alt+Tab (or any focus loss) can swallow the keyup and leave the gesture
      // armed, so clear it whenever the window loses focus.
      const onBlur = () => setIsAltHeld(false);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
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

    // --------------- Alt-drag connect: safety-net cleanup on off-Stage release ---------------
    // A drag-link normally ends via the Stage's mouseup (drop on empty canvas) or
    // a symbol's mouseup (drop on a target). If the release lands OUTSIDE the
    // Stage entirely, no Konva mouseup fires and the link — plus its dashed
    // preview line — would stay armed forever. This window-level handler runs in
    // the bubble phase, after Konva's own mouseup, so it only sees a link that is
    // *still* active (i.e. was never resolved), and tears it down.
    useEffect(() => {
      const onUp = () => {
        const { dragLink, endDragLink } = useUIStore.getState();
        // Only tear down a *drag*-mode link on release. A click-mode link
        // (connect tool) is waiting for its second click and must survive the
        // pointer-up of its first click.
        if (!dragLink.active || dragLink.mode !== 'drag') return;
        endDragLink();
      };
      window.addEventListener('mouseup', onUp);
      return () => window.removeEventListener('mouseup', onUp);
    }, []);

    // --------------- Cursor feedback: pan modes and hover ---------------
    // The stage-container div is the single owner of the canvas cursor. `cursor`
    // is an inherited CSS property and this element sits above every one of
    // Konva's stacked layer canvases, so whatever we set here is what the browser
    // actually shows over the canvas. (Symbol and connection-line hover handlers
    // used to write to an individual <canvas> via `document.querySelector('canvas')`
    // — the invisible bottom layer — so the pointer affordance never appeared. They
    // now only update hover state; the cursor is derived from that state here.)
    useEffect(() => {
      const el = stageRef.current?.container();
      if (!el) return;
      const panning = isDragging || isMiddlePanning;
      // View mode (editingLocked) makes plain drag pan everywhere, so it is a
      // "pan anywhere" ready state just like holding space.
      const grabReady = isSpaceHeld || editingLocked;
      // Connect gesture armed: Alt held over a person, or an alt-drag link already
      // in progress. The latter keeps the crosshair across empty canvas until the
      // drop finishes the gesture.
      const connectArmed = (isAltHeld && hoveredId !== null) || dragLink.active;
      el.style.cursor = resolveCanvasCursor({
        panning,
        spaceHeld: isSpaceHeld,
        editingLocked,
        // A hovered symbol OR a hovered connection line both warrant a pointer.
        hovering: hoveredId !== null || hoveredConnection !== null,
        tool: activeTool,
        connectArmed,
      });
      // While panning (or in a grab-ready pan mode), clear any stale inline cursor
      // on the layer canvases so the container's grab/grabbing cursor is what shows.
      if (panning || grabReady) {
        el.querySelectorAll('canvas').forEach((c) => {
          (c as HTMLElement).style.cursor = '';
        });
      }
    }, [
      isDragging,
      isMiddlePanning,
      isSpaceHeld,
      editingLocked,
      isAltHeld,
      hoveredId,
      hoveredConnection,
      activeTool,
      dragLink.active,
    ]);

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
    // Konva bubbles a child symbol's drag events up to these stage handlers, so
    // both guard on the drag target being the stage itself. Without the guard on
    // dragstart, an alt-drag "connect" gesture (which cancels the symbol drag via
    // stopDrag() and never emits a stage dragend) latches isDragging on and leaves
    // the grab cursor stuck as a hand — issue #91. See ./stageDrag.
    const handleDragStart = useCallback((e: KonvaEventObject<DragEvent>) => {
      setIsDragging((panning) =>
        nextPanningState(panning, {
          phase: 'start',
          targetIsStage: e.target === stageRef.current,
        }),
      );
    }, []);

    const handleDragEnd = useCallback(
      (e: KonvaEventObject<DragEvent>) => {
        const stage = e.target;
        const targetIsStage = stage === stageRef.current;
        setIsDragging((panning) =>
          nextPanningState(panning, { phase: 'end', targetIsStage }),
        );
        if (!targetIsStage) return;
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

        // Clicking empty canvas mid-connect abandons the pending link rather
        // than doing the tool's usual empty-click behaviour.
        if (useUIStore.getState().dragLink.active) {
          useUIStore.getState().endDragLink();
          return;
        }

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
      // A drag-mode link released over empty canvas is cancelled. A click-mode
      // link is left armed — its second click (or an empty-canvas click,
      // handled in handleStageClick) resolves it.
      if (dragLink.active && dragLink.mode === 'drag') {
        endDragLink();
      }
    }, [dragLink.active, dragLink.mode, endDragLink]);

    const handleMarqueeDown = useCallback(
      (e: KonvaEventObject<MouseEvent>) => {
        didMarqueeRef.current = false;
        // In view mode the stage is draggable and plain drag pans, so no marquee.
        if (useUIStore.getState().editingLocked) return;
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

    // Pan by dragging when the hand tool is active, space is held, or the canvas
    // is read-only (view mode) — there, plain drag anywhere pans, mirroring
    // Excalidraw's view mode. In editable tools, dragging empty canvas is free
    // for marquee / placement instead.
    const isDraggable = activeTool === 'hand' || isSpaceHeld || editingLocked;

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

            {showGrid && (
              <GridLayer
                width={dimensions.width}
                height={dimensions.height}
                scale={scale}
                position={position}
                gridColor={canvasPalette.gridColor}
                generationLineColor={canvasPalette.generationLineColor}
              />
            )}

            <ConnectionsLayer
              partnerships={partnerships}
              parentChildLinks={parentChildLinks}
              twinGroups={twinGroups}
              individuals={individuals}
              selectedConnection={selectedConnection}
              hoveredConnection={hoveredConnection}
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
                  isLinkSource={dragLink.active && dragLink.sourceId === individual.id}
                  isLinkTarget={
                    dragLink.active &&
                    dragLink.targetId === individual.id &&
                    dragLink.sourceId !== individual.id
                  }
                  symbolFill={canvasPalette.symbolFill}
                  childlessActive={childlessMarksActive(individual, partnerships)}
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
                  fill="rgba(79, 70, 201, 0.12)"
                  stroke="#4f46c9"
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
