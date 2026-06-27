# Final Fix Report — Issue #37 Edit-Lock Gaps

## F1 — Lock existing text annotations

**Files changed:**
- `src/components/canvas/TextAnnotationLayer.tsx`
- `src/components/canvas/CanvasContainer.tsx`

**What changed:**

`TextAnnotationLayerProps` gained an `editingLocked: boolean` prop (JSDoc added).
`AnnotationTextProps` gained `editingLocked: boolean` (passed down from the layer).

`AnnotationText`:
- `draggable` changed from unconditional `true` → `draggable={!editingLocked}`.
- `handleDoubleClick` early-returns when `editingLocked` before calling `startEditingAnnotation`.

`CanvasContainer` already subscribed `const editingLocked = useUIStore((s) => s.editingLocked)`.
The `<TextAnnotationLayer>` call now passes `editingLocked={editingLocked}`.

**Thread pattern:** same prop-threading as PedigreeSymbol — subscribed in CanvasContainer (react-dom context), passed as prop into the Konva layer.

---

## F2 — Grey/disable Text & Eraser while locked; gate keyboard switch

**Files changed:**
- `src/components/ui/islands/ToolButton.tsx`
- `src/components/ui/islands/islands.module.css`
- `src/components/ui/islands/ToolIsland.tsx`
- `src/hooks/useKeyboardShortcuts.ts`

**ToolButton:** added `disabled?: boolean` prop (default `false`) with JSDoc. When true:
- native `disabled` attribute on `<button>` blocks clicks.
- `aria-disabled={disabled}` keeps accessibility consistent.
- `styles.toolButtonDisabled` class applied (`.toolButtonDisabled { opacity: 0.4; cursor: not-allowed; }`).

**ToolIsland:** Text and Eraser `ToolButton`s pass `disabled={editingLocked}` and use the plain `actions.textTool`/`actions.eraserTool` onClick (native `disabled` blocks the click). Select, Hand, Lock unaffected.

**useKeyboardShortcuts:** `case '2'/'t'` and `case '3'/'e'` each early-return after `e.preventDefault()` when `useUIStore.getState().editingLocked` is true. `1/v`, `h`, and `l` are unaffected.

---

## F3 — Guard radial pin to select tool

**File changed:** `src/components/canvas/symbols/PedigreeSymbol.tsx`

Changed `if (!ui.editingLocked)` → `if (tool === 'select' && !ui.editingLocked)` in `handleClick`.

Prevents a stuck pinned radial menu when clicking a symbol while the Hand tool is active.

---

## Cheap Cleanups

### LegendLayer editingLocked gate (GATED)

**Files changed:**
- `src/components/canvas/LegendLayer.tsx`
- `src/components/canvas/CanvasContainer.tsx`

`LegendLayerProps` gained `editingLocked?: boolean` (JSDoc, default `false`).
`draggable` changed from `!bounds` → `!bounds && !editingLocked`.
`onDragEnd` guarded similarly.
`CanvasContainer` passes `editingLocked={editingLocked}` to `<LegendLayer>`.

### RADIAL_MENU_HOVER_DELAY removed

`git grep RADIAL_MENU_HOVER_DELAY` confirmed zero source-file importers. Constant removed from `src/utils/constants.ts`.

### RadialMenu Escape handler

`unpinRadialMenu` subscription removed from `RadialMenu.tsx`.
Escape handler calls only `hideRadialMenu()` (already resets `pinned: false`).
`unpinRadialMenu` removed from effect dependency array.

### uiStore.ts double blank line

No double blank line found — already clean. No change needed.

---

## New Tests

### `src/hooks/useKeyboardShortcuts.test.tsx` — "edit-lock gate on text and eraser shortcuts"

6 tests: t/2/e/3 leave activeTool unchanged when locked (RED→GREEN); contrast tests confirm they DO switch when unlocked (GREEN).

### `src/components/ui/islands/ToolIsland.test.tsx` — "edit-lock disables Text and Eraser buttons"

4 tests: Text/Eraser have `disabled` attribute when locked; Select/Hand/Lock remain enabled; clicking Text while locked leaves activeTool unchanged; Text/Eraser not disabled when unlocked.

### Konva gates (F1/F3/Legend) — NOT jsdom-testable

Verified by code inspection only (react-konva requires real canvas context).

---

## Test Run

`npm test`: 313 passed, 1 failed — pre-existing flake `useAutoSave > debounced save > coalesces rapid edits into a single write` (fails on main too; untouched).

`npm run typecheck`: clean (zero errors).
