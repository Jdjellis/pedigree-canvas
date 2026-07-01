import { useEffect } from 'react';
import { usePedigreeStore } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { useViewportStore } from '../stores/viewportStore';
import {
  RADIAL_HOVER_ENTER_RADIUS,
  RADIAL_HOVER_EXIT_RADIUS,
} from '../utils/constants';

/**
 * Proximity-driven open/close for the radial add-menu, with hysteresis.
 *
 * Rather than binding the menu to a symbol's tiny Konva hit area (which made it
 * open only when directly over the 40px node and close the instant the cursor
 * left — before you could reach a radial option), this tracks the pointer in
 * screen space against every person's screen centre:
 *
 *   - opens the menu when the pointer comes within ENTER radius of a person
 *     (a more generous target than the symbol itself);
 *   - then locks onto that person: once open, proximity no longer retargets the
 *     menu to a nearer symbol, so an adjacent sibling can't steal it while the
 *     pointer travels out to an orbiting option (an option can sit almost on top
 *     of a neighbouring symbol, which used to hand the menu off mid-gesture);
 *   - keeps the menu open until the pointer leaves the larger EXIT radius — so
 *     you can travel out to an orbiting option without it disappearing, after
 *     which a fresh symbol can open its own.
 *
 * Pinned menus ignore proximity entirely (they close only via Escape or an
 * empty-canvas click). The controller is inert while editing is locked, while a
 * non-select tool is active, or while panning.
 *
 * Lives in react-dom context (mounted from CanvasContainer) and reads stores
 * imperatively via getState() so it always sees the latest viewport/document
 * without re-subscribing on every change.
 *
 * @param panMode - True when the hand tool or space-pan is engaged; suppresses
 *   the hover affordance so panning feels uninterrupted.
 */
export function useRadialHover(panMode: boolean): void {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      const ui = useUIStore.getState();
      if (panMode || ui.editingLocked || ui.activeTool !== 'select') return;

      const radialMenu = ui.radialMenu;
      // Pinned menus are sticky — proximity must not steal or dismiss them.
      if (radialMenu.pinned) return;

      // Map the pointer into stage-local space (0,0 = top-left of the canvas),
      // the same space canvasToScreen() returns, so distances line up.
      const content = document.querySelector('.konvajs-content');
      if (!content) return;
      const rect = content.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const { canvasToScreen } = useViewportStore.getState();
      const individuals = usePedigreeStore.getState().document.individuals;

      if (radialMenu.visible) {
        // Lock-on-open: proximity no longer retargets an open menu to a nearer
        // person. Keep it anchored to its target until the pointer clears the
        // EXIT radius (computed from the target's canvas position so pan/drag
        // stays correct); only then does the block below open a fresh menu.
        const anchorScreen = radialMenu.targetId
          ? canvasToScreen(individuals[radialMenu.targetId]?.position ?? radialMenu.canvasPosition)
          : canvasToScreen(radialMenu.canvasPosition);
        const anchorDist = Math.hypot(px - anchorScreen.x, py - anchorScreen.y);
        if (anchorDist > RADIAL_HOVER_EXIT_RADIUS) ui.hideRadialMenu();
        return;
      }

      // Menu closed: open it when the pointer comes within ENTER radius of the
      // nearest person, in screen space.
      let nearestId: string | null = null;
      let nearestCanvasPos: { x: number; y: number } | null = null;
      let nearestDist = Infinity;
      for (const individual of Object.values(individuals)) {
        const screen = canvasToScreen(individual.position);
        const dist = Math.hypot(px - screen.x, py - screen.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = individual.id;
          nearestCanvasPos = individual.position;
        }
      }

      if (nearestId && nearestCanvasPos && nearestDist <= RADIAL_HOVER_ENTER_RADIUS) {
        ui.showRadialMenu(nearestId, nearestCanvasPos);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [panMode]);
}
