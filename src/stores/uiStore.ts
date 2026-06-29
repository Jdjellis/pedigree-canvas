import { create } from 'zustand';
import type { DefaultSex } from '../utils/sex';
import { ONBOARDED_STORAGE_KEY } from '../components/canvas/onboarding';
import * as safeStorage from '../utils/safeStorage';

/**
 * The currently active canvas tool. `select`/`hand` are modal helpers
 * (pointer/marquee and pan); `text` places a text annotation at the click point;
 * `eraser` deletes nodes/connections under the pointer. People are added only
 * via the radial menu, so there are no person-placement tools.
 */
export type ActiveTool = 'select' | 'hand' | 'text' | 'eraser';
/** The modal dialog currently open, or `null` when no modal is shown. */
export type ActiveModal = 'import' | 'export' | 'settings' | 'legendEditor' | 'shortcuts' | null;

/** What kind of connection an id in {@link ConnectionSelection} refers to. */
export type ConnectionKind = 'partnership' | 'parentChild' | 'twin';

/**
 * A single, typed connection selection (mutually exclusive with the individual
 * `selectedIds` selection). `id` is a partnership id, a `ParentChildRelationship`
 * id, or a twin-group id, per `kind`.
 */
export interface ConnectionSelection {
  kind: ConnectionKind;
  id: string;
}

interface UIState {
  selectedIds: Set<string>;
  /**
   * The currently selected connection (line of descent / partnership / twin
   * connector), or `null`. Mutually exclusive with `selectedIds`: selecting a
   * connection clears the individual selection and vice versa.
   */
  selectedConnection: ConnectionSelection | null;
  hoveredId: string | null;

  radialMenu: {
    visible: boolean;
    targetId: string | null;
    /** Canvas-space anchor position. Converted to screen coords at render time so pan/zoom/drag tracks correctly. */
    canvasPosition: { x: number; y: number };
    pinned: boolean;
  };

  dragLink: {
    active: boolean;
    sourceId: string | null;
    targetId: string | null;
    cursorPos: { x: number; y: number };
  };

  linkPopup: {
    visible: boolean;
    sourceId: string | null;
    targetId: string | null;
    screenPosition: { x: number; y: number };
  };

  propertiesPanelOpen: boolean;
  activeModal: ActiveModal;
  activeTool: ActiveTool;
  /** The sex applied to singly-added people (seed + radial +Partner/+Child/+Sibling). */
  defaultSex: DefaultSex;

  /** When true, the pedigree is read-only: no structural or property edits. */
  editingLocked: boolean;

  /** Whether the ⌘K command palette is open. */
  commandPaletteOpen: boolean;

  /**
   * Id of the text annotation currently being edited in the inline overlay,
   * or `null` when no annotation is in edit mode. Drives the `<textarea>`
   * overlay and hides the on-canvas Konva text while editing.
   */
  editingAnnotationId: string | null;

  /**
   * Timestamp (ms since epoch) of the most recent successful autosave to
   * localStorage, or `null` if nothing has been saved yet this session.
   * Drives the "Saved locally" indicator in the toolbar.
   */
  lastSavedAt: number | null;

  /**
   * Whether this browser actually persists writes across sessions. `false` when
   * `localStorage` is blocked (e.g. Edge/Chrome enterprise "block site data"
   * policy or private browsing) — in that case the document lives only in memory
   * for the session and the toolbar must warn instead of claiming "Saved locally".
   * Probed once at startup; storage availability does not change mid-session.
   */
  storagePersistent: boolean;

  select: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (id: string) => void;
  setHovered: (id: string | null) => void;
  showRadialMenu: (
    targetId: string,
    canvasPos: { x: number; y: number }
  ) => void;
  hideRadialMenu: () => void;
  /** Pin the radial menu open so it survives the pointer leaving the hot-zone. */
  pinRadialMenu: () => void;
  /** Release a pinned radial menu (it then follows hover rules again). */
  unpinRadialMenu: () => void;
  startDragLink: (sourceId: string) => void;
  updateDragLinkCursor: (pos: { x: number; y: number }) => void;
  setDragLinkTarget: (targetId: string | null) => void;
  endDragLink: () => void;
  showLinkPopup: (sourceId: string, targetId: string, screenPos: { x: number; y: number }) => void;
  hideLinkPopup: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  /** Set the default sex used for singly-added people. */
  setDefaultSex: (sex: DefaultSex) => void;
  /** Toggle whether the pedigree is locked against editing. */
  toggleEditingLocked: () => void;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;
  setPropertiesPanelOpen: (open: boolean) => void;
  /** Toggles `propertiesPanelOpen` between true and false. */
  togglePropertiesPanel: () => void;
  /** Opens or closes the ⌘K command palette. */
  setCommandPaletteOpen: (open: boolean) => void;
  /** Toggles `commandPaletteOpen` between true and false. */
  toggleCommandPalette: () => void;
  setLastSavedAt: (timestamp: number) => void;
  /** Enter inline edit mode for the given annotation id. */
  startEditingAnnotation: (id: string) => void;
  /** Leave inline annotation edit mode. */
  stopEditingAnnotation: () => void;
  /** Select a single connection; clears any individual selection, opens the panel. */
  selectConnection: (sel: ConnectionSelection) => void;
  /** Clear the connection selection (leaves the panel open/closed as-is). */
  clearConnectionSelection: () => void;
  /** Whether first-run onboarding has been completed (persisted in localStorage). */
  onboarded: boolean;
  /** Mark onboarding as complete — updates store and persists to localStorage. */
  setOnboarded: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  selectedIds: new Set<string>(),
  selectedConnection: null,
  hoveredId: null,

  radialMenu: {
    visible: false,
    targetId: null,
    canvasPosition: { x: 0, y: 0 },
    pinned: false,
  },

  dragLink: {
    active: false,
    sourceId: null,
    targetId: null,
    cursorPos: { x: 0, y: 0 },
  },

  linkPopup: {
    visible: false,
    sourceId: null,
    targetId: null,
    screenPosition: { x: 0, y: 0 },
  },

  propertiesPanelOpen: false,
  activeModal: null,
  activeTool: 'select',
  defaultSex: 'unknown',
  editingLocked: false,
  commandPaletteOpen: false,
  editingAnnotationId: null,
  lastSavedAt: null,
  storagePersistent: safeStorage.isPersistent(),

  select: (id) =>
    set((state) => ({
      selectedIds: new Set([id]),
      selectedConnection: null,
      propertiesPanelOpen: true,
      // Leave annotation edit mode unless we're re-selecting the same one.
      editingAnnotationId:
        state.editingAnnotationId === id ? state.editingAnnotationId : null,
    })),

  selectMultiple: (ids) =>
    set({
      selectedIds: new Set(ids),
      selectedConnection: null,
      propertiesPanelOpen: ids.length > 0,
      editingAnnotationId: null,
    }),

  clearSelection: () =>
    set({
      selectedIds: new Set(),
      selectedConnection: null,
      propertiesPanelOpen: false,
      editingAnnotationId: null,
    }),

  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return {
        selectedIds: next,
        selectedConnection: null,
        propertiesPanelOpen: next.size > 0,
      };
    }),

  setHovered: (id) => set({ hoveredId: id }),

  showRadialMenu: (targetId, canvasPosition) =>
    set({
      radialMenu: { visible: true, targetId, canvasPosition, pinned: false },
    }),

  hideRadialMenu: () =>
    set({
      radialMenu: {
        visible: false,
        targetId: null,
        canvasPosition: { x: 0, y: 0 },
        pinned: false,
      },
    }),

  pinRadialMenu: () =>
    set((state) => ({ radialMenu: { ...state.radialMenu, pinned: true } })),

  unpinRadialMenu: () =>
    set((state) => ({ radialMenu: { ...state.radialMenu, pinned: false } })),

  startDragLink: (sourceId) =>
    set({
      dragLink: { active: true, sourceId, targetId: null, cursorPos: { x: 0, y: 0 } },
    }),

  updateDragLinkCursor: (pos) =>
    set((state) => ({
      dragLink: { ...state.dragLink, cursorPos: pos },
    })),

  setDragLinkTarget: (targetId) =>
    set((state) => ({
      dragLink: { ...state.dragLink, targetId },
    })),

  endDragLink: () =>
    set({
      dragLink: { active: false, sourceId: null, targetId: null, cursorPos: { x: 0, y: 0 } },
    }),

  showLinkPopup: (sourceId, targetId, screenPosition) =>
    set({
      linkPopup: { visible: true, sourceId, targetId, screenPosition },
      dragLink: { active: false, sourceId: null, targetId: null, cursorPos: { x: 0, y: 0 } },
    }),

  hideLinkPopup: () =>
    set({
      linkPopup: { visible: false, sourceId: null, targetId: null, screenPosition: { x: 0, y: 0 } },
    }),

  setActiveTool: (activeTool) => set({ activeTool }),

  setDefaultSex: (defaultSex) => set({ defaultSex }),

  toggleEditingLocked: () =>
    set((state) => ({ editingLocked: !state.editingLocked })),

  openModal: (activeModal) => set({ activeModal }),

  closeModal: () => set({ activeModal: null }),

  setPropertiesPanelOpen: (open) => set({ propertiesPanelOpen: open }),

  togglePropertiesPanel: () =>
    set((state) => ({ propertiesPanelOpen: !state.propertiesPanelOpen })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),

  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),

  startEditingAnnotation: (id) =>
    set({
      editingAnnotationId: id,
      selectedIds: new Set([id]),
      selectedConnection: null,
      propertiesPanelOpen: true,
    }),

  stopEditingAnnotation: () => set({ editingAnnotationId: null }),

  selectConnection: (sel) =>
    set({
      selectedConnection: sel,
      selectedIds: new Set<string>(),
      propertiesPanelOpen: true,
      editingAnnotationId: null,
    }),

  clearConnectionSelection: () => set({ selectedConnection: null }),

  onboarded: safeStorage.getItem(ONBOARDED_STORAGE_KEY) === '1',

  setOnboarded: () => {
    safeStorage.setItem(ONBOARDED_STORAGE_KEY, '1');
    set({ onboarded: true });
  },
}));
