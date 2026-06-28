import { create } from 'zustand';
import type { DefaultSex } from '../utils/sex';

/**
 * The currently active canvas tool. `select`/`hand` are modal helpers
 * (pointer/marquee and pan); `text` places a text annotation at the click point;
 * `eraser` deletes nodes/connections under the pointer. People are added only
 * via the radial menu, so there are no person-placement tools.
 */
export type ActiveTool = 'select' | 'hand' | 'text' | 'eraser';
/** The modal dialog currently open, or `null` when no modal is shown. */
export type ActiveModal = 'import' | 'export' | 'settings' | 'legendEditor' | 'shortcuts' | null;

interface UIState {
  selectedIds: Set<string>;
  hoveredId: string | null;

  radialMenu: {
    visible: boolean;
    targetId: string | null;
    screenPosition: { x: number; y: number };
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

  relationshipPopup: {
    visible: boolean;
    partnershipId: string | null;
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

  select: (id: string) => void;
  selectMultiple: (ids: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (id: string) => void;
  setHovered: (id: string | null) => void;
  showRadialMenu: (
    targetId: string,
    screenPos: { x: number; y: number }
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
  showRelationshipPopup: (
    partnershipId: string,
    screenPos: { x: number; y: number }
  ) => void;
  hideRelationshipPopup: () => void;
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
}

export const useUIStore = create<UIState>()((set) => ({
  selectedIds: new Set<string>(),
  hoveredId: null,

  radialMenu: {
    visible: false,
    targetId: null,
    screenPosition: { x: 0, y: 0 },
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

  relationshipPopup: {
    visible: false,
    partnershipId: null,
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

  select: (id) =>
    set((state) => ({
      selectedIds: new Set([id]),
      propertiesPanelOpen: true,
      // Leave annotation edit mode unless we're re-selecting the same one.
      editingAnnotationId:
        state.editingAnnotationId === id ? state.editingAnnotationId : null,
    })),

  selectMultiple: (ids) =>
    set({
      selectedIds: new Set(ids),
      propertiesPanelOpen: ids.length > 0,
      editingAnnotationId: null,
    }),

  clearSelection: () =>
    set({
      selectedIds: new Set(),
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
        propertiesPanelOpen: next.size > 0,
      };
    }),

  setHovered: (id) => set({ hoveredId: id }),

  showRadialMenu: (targetId, screenPosition) =>
    set({
      radialMenu: { visible: true, targetId, screenPosition, pinned: false },
    }),

  hideRadialMenu: () =>
    set({
      radialMenu: {
        visible: false,
        targetId: null,
        screenPosition: { x: 0, y: 0 },
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

  showRelationshipPopup: (partnershipId, screenPosition) =>
    set({
      relationshipPopup: { visible: true, partnershipId, screenPosition },
    }),

  hideRelationshipPopup: () =>
    set({
      relationshipPopup: {
        visible: false,
        partnershipId: null,
        screenPosition: { x: 0, y: 0 },
      },
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
      propertiesPanelOpen: true,
    }),

  stopEditingAnnotation: () => set({ editingAnnotationId: null }),
}));
