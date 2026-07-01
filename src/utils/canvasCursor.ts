/**
 * Clear any inline `cursor` style the app set imperatively on the Konva layer
 * canvases (e.g. the `pointer` a symbol's mouseenter applies), so the
 * container's tool cursor takes over again.
 *
 * Konva captures the pointer during a drag, and full-screen overlays (the link
 * popup) swallow the pointer-leave that would normally reset a hover cursor —
 * both leave a stale inline cursor stuck on the canvas until the pointer next
 * enters and leaves a symbol. Calling this when such a gesture ends fixes it.
 *
 * `root` is injectable for tests; defaults to the live document.
 */
export function clearCanvasCursor(root: ParentNode = document): void {
  root.querySelectorAll('canvas').forEach((c) => {
    (c as HTMLElement).style.cursor = '';
  });
}
