# Floating-Island UI Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-width top toolbar + docked properties panel with an Excalidraw-style floating-island UI over a full-bleed canvas, plus a ⌘K command palette, in a calm clinical voice.

**Architecture:** A full-bleed canvas with `position: absolute` control *islands* at the screen corners/center. All discrete actions live in one typed **command registry** (`src/commands/`) that both the islands and the ⌘K palette consume, so there is exactly one source of truth for "what actions exist." Islands and overlays are plain react-dom components (Zustand subscriptions are safe there); imperative store actions are called via `getState()`.

**Tech Stack:** React + Vite + TypeScript, react-konva (canvas), Zustand (+ zundo for undo/redo), Radix UI (Dialog for modals), Vitest + @testing-library/react + jsdom (tests), CSS Modules.

## Global Constraints

- TypeScript: **never** use `any`; type every function signature; JSDoc on public interfaces. (Repo + user convention.)
- **Konva/Zustand gotcha:** never subscribe to Zustand stores *inside* react-konva components — keep subscriptions in `CanvasContainer` (react-dom). Islands/overlays/palette are react-dom and may subscribe normally. Use `useXStore.getState()` for imperative actions in handlers/command `run`.
- **Never** `import ... from 'konva'` directly (dupes React → "Invalid hook call").
- Reuse existing CSS variables from `src/index.css` (violet accent + surfaces already aligned). No hand-drawn font in working chrome; hand-drawn style only in the onboarding layer.
- Conventional commits (`feat:`/`refactor:`/`test:`/`docs:`); one logical change per commit; run `npm run lint` + `npm test` before each commit.
- Local-first: no backend/sharing. Work is browser-local.
- Spec: `docs/superpowers/specs/2026-06-25-floating-island-ui-design.md` (authoritative).

---

## File Structure

**New**
- `vitest.config.ts` — jsdom test env + setup.
- `src/test/setup.ts` — `@testing-library/jest-dom` matchers.
- `src/commands/types.ts` — `Command`, `CommandContext` types.
- `src/commands/registry.ts` — `buildCommands(actions, ctx)` → `Command[]`; `getCommand(id)`.
- `src/commands/useEditorActions.ts` — hook returning the imperative action callbacks (New/Open/Import/Export/AddPerson/zoom/undo/…); the single home for logic currently inline in `Toolbar.tsx`.
- `src/commands/filterCommands.ts` — pure fuzzy/substring filter used by the palette.
- `src/components/ui/islands/Island.tsx` + `Island.module.css` — shared island chrome wrapper.
- `src/components/ui/islands/MenuIsland.tsx` — top-left: ☰ menu + title + saved status.
- `src/components/ui/islands/ToolIsland.tsx` — top-center: Select / Hand / Add Person.
- `src/components/ui/islands/ActionsIsland.tsx` — top-right: Export + properties toggle.
- `src/components/ui/islands/ZoomIsland.tsx` — bottom-left: − / % / + / Fit.
- `src/components/ui/islands/HistoryIsland.tsx` — bottom-left: undo / redo.
- `src/components/ui/islands/HelpIsland.tsx` — bottom-right: ? → shortcuts overlay.
- `src/components/ui/islands/islands.module.css` — shared positioning slots.
- `src/components/ui/CommandPalette.tsx` + `CommandPalette.module.css` — ⌘K UI.
- `src/components/ui/ShortcutsOverlay.tsx` + `.module.css` — `?` help dialog.
- `src/components/canvas/OnboardingHints.tsx` + `.module.css` — empty-state arrows/labels/links (built around existing `EmptyStateHint`).

**Modified**
- `src/stores/uiStore.ts` — add `commandPaletteOpen` + `setCommandPaletteOpen`/`toggleCommandPalette`, `togglePropertiesPanel`, and `'shortcuts'` to `ActiveModal`.
- `src/App.tsx` + `src/App.module.css` — full-bleed canvas; mount islands + palette + overlay; PropertiesPanel floats.
- `src/components/ui/PropertiesPanel.module.css` — floating island styling.
- `src/hooks/useKeyboardShortcuts.ts` — add ⌘K (palette) + `V`/`H`/`P` tool hotkeys + `?` shortcuts overlay.
- `package.json` — add `"test": "vitest run"` and `"test:watch": "vitest"`.

**Deleted**
- `src/components/ui/Toolbar.tsx` + `Toolbar.module.css` — replaced by islands (after handlers extracted).

---

## Phase 1 — Layout foundation (full-bleed canvas + islands)

Relocate every existing control into islands with no new user-facing features. Highest visual payoff, lowest risk.

### Task 1.1: Test infrastructure

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 2: Add setup file**

```ts
// src/test/setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Add test scripts** to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify the existing suite still runs**

Run: `npm test`
Expected: `svgExport.test.ts` passes under the new config.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts package.json
git commit -m "test: add vitest jsdom config + setup"
```

### Task 1.2: Shared island chrome

**Files:**
- Create: `src/components/ui/islands/Island.tsx`, `src/components/ui/islands/Island.module.css`
- Test: `src/components/ui/islands/Island.test.tsx`

**Interfaces:**
- Produces: `Island` — `(props: { children: React.ReactNode; className?: string; 'aria-label'?: string }) => JSX.Element`. Renders a `<div role="toolbar">` (or `<section>` when not a toolbar) with island chrome (surface bg, `--radius`, soft shadow, hairline border). Use `clsx` to merge `className`.

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { Island } from './Island';

test('renders children inside an island container', () => {
  render(<Island aria-label="Tools"><button>Hi</button></Island>);
  expect(screen.getByRole('button', { name: 'Hi' })).toBeInTheDocument();
  expect(screen.getByLabelText('Tools')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run → FAIL** (`Island` not defined). Run: `npm test -- Island`
- [ ] **Step 3: Implement** `Island.tsx` (typed props, JSDoc, `clsx(styles.island, className)`) + `Island.module.css` chrome:

```css
.island {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  pointer-events: auto;
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: add shared Island chrome component`.

### Task 1.3: Editor actions hook + store additions

Extract the imperative logic currently inline in `Toolbar.tsx` into one hook, and add the store toggles the islands need. This is the DRY home the command registry will later formalize.

**Files:**
- Create: `src/commands/useEditorActions.ts`
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`

**Interfaces:**
- Produces: `useEditorActions(): EditorActions` where

```ts
interface EditorActions {
  newDocument: () => void;       // confirm + resetDocument + clearSelection + resetView
  openDocument: () => Promise<void>;
  importPed: () => void;         // openModal('import')
  exportDocument: () => void;    // openModal('export')
  openLegend: () => void;        // openModal('legendEditor')
  addPerson: () => void;         // place at visible-canvas center, select it
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  selectTool: () => void;        // setActiveTool('select')
  handTool: () => void;          // setActiveTool('pan')
  addPersonTool: () => void;     // setActiveTool('addIndividual')
}
```

- Produces (uiStore): `togglePropertiesPanel: () => void`, `commandPaletteOpen: boolean`, `setCommandPaletteOpen: (open: boolean) => void`, `toggleCommandPalette: () => void`; `ActiveModal` gains `'shortcuts'`.

- [ ] **Step 1: Write failing store test**

```ts
import { useUIStore } from './uiStore';

test('togglePropertiesPanel flips the flag', () => {
  useUIStore.setState({ propertiesPanelOpen: false });
  useUIStore.getState().togglePropertiesPanel();
  expect(useUIStore.getState().propertiesPanelOpen).toBe(true);
});

test('toggleCommandPalette flips palette state', () => {
  useUIStore.setState({ commandPaletteOpen: false });
  useUIStore.getState().toggleCommandPalette();
  expect(useUIStore.getState().commandPaletteOpen).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.** Run: `npm test -- uiStore`
- [ ] **Step 3: Implement** store additions (new state fields + actions) and the `useEditorActions` hook. Move the bodies of `handleNew/handleOpen/handleAddIndividual/handleDelete/handleUndo/handleRedo/handleZoomIn/handleZoomOut` from `Toolbar.tsx` verbatim into the hook, calling stores via `getState()`/selectors. Preserve the `screenToCanvas` center-placement logic (see CLAUDE.md memory) exactly.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `refactor: extract editor actions into useEditorActions hook`.

### Task 1.4: ToolIsland

**Files:** Create `ToolIsland.tsx`; Test `ToolIsland.test.tsx`.

**Interfaces:** Consumes `useEditorActions`, `useUIStore` (`activeTool`). Produces `<ToolIsland />`. Buttons: Select (active when `activeTool==='select'`), Hand (`pan`), Add Person (`addIndividual` → also runs `addPerson`/enters placement). Each button has `title` + `aria-label`.

- [ ] **Step 1: Failing test** — renders 3 buttons (Select/Hand/Add Person); clicking Select calls `setActiveTool('select')` (spy via `useUIStore.getState`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** using `Island` + existing `styles.button`/`buttonActive` patterns from `Toolbar.module.css` (copy needed rules into a local `islands.module.css`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: add ToolIsland (select/hand/add-person)`.

### Task 1.5: ZoomIsland + HistoryIsland

**Files:** Create `ZoomIsland.tsx`, `HistoryIsland.tsx`; Test both.

**Interfaces:** ZoomIsland consumes `useViewportStore` (`scale`) + `useEditorActions` (zoomIn/zoomOut/resetView); shows `Math.round(scale*100)%`. HistoryIsland consumes `useEditorActions` (undo/redo).

- [ ] **Step 1: Failing tests** — ZoomIsland shows "100%" at scale 1; clicking + calls zoomIn. HistoryIsland renders undo/redo buttons.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** both with `Island`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: add Zoom and History islands`.

### Task 1.6: MenuIsland

**Files:** Create `MenuIsland.tsx`; Test `MenuIsland.test.tsx`.

**Interfaces:** Consumes `usePedigreeStore` (document metadata.title, updateMetadata), `useEditorActions`. Renders: ☰ button toggling a dropdown (reuse the popover pattern from `DocumentDetails.tsx`) listing New/Open/Import/Export/Legend/Document details; the editable **title** (click-to-edit input, port the title logic from `Toolbar.tsx` lines ~59-103) and the **"Saved locally"** status (port `formatRelativeSave` + the 15s tick + `lastSavedAt`). Move the one-time local-only notice here too.

- [ ] **Step 1: Failing test** — renders the title text; clicking it shows an input; ☰ opens a menu containing "Export".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Port title-edit + save-status + notice logic from `Toolbar.tsx` (do not rewrite — move). Menu items call `useEditorActions`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: add MenuIsland with title + saved status + document menu`.

### Task 1.7: ActionsIsland

**Files:** Create `ActionsIsland.tsx`; Test.

**Interfaces:** Consumes `useEditorActions` (exportDocument), `useUIStore` (`propertiesPanelOpen`, `togglePropertiesPanel`). Renders primary **Export** button + **panel toggle** button (aria-pressed = propertiesPanelOpen).

- [ ] **Step 1: Failing test** — Export button calls exportDocument; toggle calls togglePropertiesPanel.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: add ActionsIsland (export + panel toggle)`.

### Task 1.8: HelpIsland (button only; overlay in Phase 5)

**Files:** Create `HelpIsland.tsx`; Test.

**Interfaces:** Consumes `useUIStore.openModal`. Renders a `?` button that calls `openModal('shortcuts')` (overlay component arrives in Phase 5; until then the modal simply renders nothing — verify no crash).

- [ ] Steps 1-4: failing test (renders `?` button, click calls openModal('shortcuts')) → implement → pass.
- [ ] **Step 5: Commit** `feat: add HelpIsland button`.

### Task 1.9: Full-bleed App layout + delete Toolbar

**Files:** Modify `App.tsx`, `App.module.css`, `PropertiesPanel.module.css`; Delete `Toolbar.tsx`, `Toolbar.module.css`.

- [ ] **Step 1:** Rewrite `App.module.css` so `.app` is a single full-viewport relative container; `.canvasArea` fills it; add absolute slot classes (`.slotTopLeft`, `.slotTopCenter`, `.slotTopRight`, `.slotBottomLeft`, `.slotBottomRight`) with sensible insets (e.g. 12-16px) and `pointer-events: none` on slots, `auto` on islands. The center tool island and top-center share the top row.
- [ ] **Step 2:** Rewrite `App.tsx`: render `<CanvasContainer/>` full-bleed, then the islands in their slots, `<RadialMenu/>`, `<LegendOverlay/>`, `<EmptyStateHint/>`, and `{propertiesPanelOpen && <PropertiesPanel/>}` as a floating element. Remove `<Toolbar/>`.
- [ ] **Step 3:** `PropertiesPanel.module.css` — change `.panel` from a docked flex child to `position: absolute; top/right/bottom` floating island (island chrome, max-height with scroll). Confirm it overlays rather than reflows.
- [ ] **Step 4:** Delete `Toolbar.tsx` + `Toolbar.module.css`. Run `npm run lint` to catch dangling imports.
- [ ] **Step 5: Verify build + visual** — `npm run build` passes; then dev-server preview check (see Phase 1 verification). 
- [ ] **Step 6: Commit** `feat: full-bleed canvas with floating islands; remove top toolbar`.

### Phase 1 verification (visual, by the executor/reviewer)
Run the dev server and confirm via screenshots + console: islands sit at the four corners + top-center; canvas is full-bleed and does **not** resize when the properties panel toggles; zoom %, undo/redo, add-person, title edit, and the document menu all still work; no console errors. Fix issues before moving on.

---

## Phase 2 — Command registry + ⌘K palette

### Task 2.1: Formalize the command registry

**Files:** Create `src/commands/types.ts`, `src/commands/registry.ts`; Test `src/commands/registry.test.ts`. Modify islands to look up commands by id.

**Interfaces:**

```ts
// types.ts
export interface CommandContext {
  selectedIds: ReadonlySet<string>;
}
export interface Command {
  id: string;
  title: string;
  category: 'document' | 'edit' | 'view' | 'tools';
  keywords?: string[];
  shortcut?: string;
  isAvailable?: (ctx: CommandContext) => boolean;
  run: () => void;
}
// registry.ts
export function buildCommands(actions: EditorActions): Command[];
export function getCommand(commands: Command[], id: string): Command | undefined;
```

`buildCommands` maps each `EditorActions` callback to a `Command` with the ids/titles/categories/shortcuts from spec §4 ("Initial command set"). `deleteSelected` and any relationship commands set `isAvailable: (ctx) => ctx.selectedIds.size > 0`.

- [ ] **Step 1: Failing tests**

```ts
const actions = makeNoopActions();           // all jest.fn()
const cmds = buildCommands(actions);
test('exposes an export command', () => {
  expect(getCommand(cmds, 'document.export')).toBeDefined();
});
test('delete is unavailable with empty selection', () => {
  const del = getCommand(cmds, 'edit.deleteSelected')!;
  expect(del.isAvailable!({ selectedIds: new Set() })).toBe(false);
  expect(del.isAvailable!({ selectedIds: new Set(['a']) })).toBe(true);
});
test('running export calls the action', () => {
  getCommand(cmds, 'document.export')!.run();
  expect(actions.exportDocument).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** types + registry. **Step 4: PASS.**
- [ ] **Step 5: Refactor islands** (ToolIsland/ActionsIsland/MenuIsland/Zoom/History) to build commands once (e.g. a small `useCommands()` wrapping `buildCommands(useEditorActions())`) and invoke `getCommand(...).run()`. Re-run `npm test` (island tests still green).
- [ ] **Step 6: Commit** `refactor: introduce command registry shared by islands`.

### Task 2.2: Palette filter (pure)

**Files:** Create `src/commands/filterCommands.ts`; Test `filterCommands.test.ts`.

**Interfaces:** `filterCommands(query: string, commands: Command[], ctx: CommandContext): Command[]` — drops commands failing `isAvailable(ctx)`; empty query returns all available (registry order); non-empty does case-insensitive substring match over `title` + `keywords`; results ranked title-prefix-match first.

- [ ] **Step 1: Failing tests** — empty query returns all available; query `'exp'` returns the export command; unavailable commands excluded; case-insensitive.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat: add command palette filter`.

### Task 2.3: CommandPalette UI + ⌘K wiring

**Files:** Create `CommandPalette.tsx` + `.module.css`; Modify `App.tsx`, `useKeyboardShortcuts.ts`. Test `CommandPalette.test.tsx`.

**Interfaces:** Consumes `useUIStore` (`commandPaletteOpen`, `setCommandPaletteOpen`, `selectedIds`), `useCommands`, `filterCommands`. Built on `@radix-ui/react-dialog` (focus trap + backdrop). Local state: `query`, `highlightIndex`. Keyboard: ↑/↓ move highlight (wrap), Enter runs highlighted `run()` then closes, Esc closes (Radix handles). Running a command sets `commandPaletteOpen=false`.

- [ ] **Step 1: Failing tests**

```tsx
// open palette, type 'export', press Enter → exportDocument called, palette closed
// ArrowDown moves highlight; Escape closes
```

(Render with `commandPaletteOpen: true`; stub actions.)

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** component + add `⌘K`/`Ctrl+K` handler to `useKeyboardShortcuts` (toggle palette) + mount `<CommandPalette/>` in `App.tsx`. **Step 4: PASS.**
- [ ] **Step 5: Verify visual** — ⌘K opens centered palette, typing filters, Enter runs + closes, Esc closes, focus returns to canvas.
- [ ] **Step 6: Commit** `feat: add ⌘K command palette`.

---

## Phase 3 — Empty-state onboarding

### Task 3.1: Onboarding hints layer

**Files:** Create `OnboardingHints.tsx` + `.module.css`; Modify `App.tsx` (or fold into existing `EmptyStateHint`). Test.

**Interfaces:** Consumes `usePedigreeStore` individuals (count). Renders only when count === 0: centered wordmark + "saved only in this browser" text + quick links (Open/Import/Help calling `useEditorActions`/openModal) + four hand-drawn arrow+label SVGs pointing at the island slots. Hand-drawn style (font/stroke) is scoped to this component's CSS module only.

- [ ] **Step 1: Failing tests** — with 0 individuals renders the wordmark + "Open" link; with ≥1 individual renders nothing.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (inline SVG arrows; quick links wired). **Step 4: PASS.**
- [ ] **Step 5: Verify visual** — arrows point at the right islands; layer clears after adding the first person.
- [ ] **Step 6: Commit** `feat: add empty-state onboarding hints`.

---

## Phase 4 — Menu + Actions polish

### Task 4.1: Dropdown menu + Export CTA polish

**Files:** Modify `MenuIsland.tsx`/css, `ActionsIsland.tsx`/css.

- [ ] **Step 1:** Promote the ☰ dropdown to a keyboard-accessible menu (arrow-key nav, Esc, click-outside; reuse Radix or the existing popover with `role="menu"`/`menuitem`). Add a "Command palette… ⌘K" item that calls `toggleCommandPalette`.
- [ ] **Step 2:** Style the Export button as the primary CTA (accent fill) per spec §2; ensure title + saved status read clearly in the menu island.
- [ ] **Step 3:** Test menu item runs the right action; `npm test`.
- [ ] **Step 4: Verify visual.** **Step 5: Commit** `feat: polish menu dropdown + primary export CTA`.

---

## Phase 5 — Help / shortcuts overlay + tool hotkeys

### Task 5.1: ShortcutsOverlay + hotkeys

**Files:** Create `ShortcutsOverlay.tsx` + `.module.css`; Modify `App.tsx`, `useKeyboardShortcuts.ts`. Test.

**Interfaces:** `ShortcutsOverlay` renders on `activeModal === 'shortcuts'` (Radix Dialog), listing the bindings (a static array mirroring `useKeyboardShortcuts`): ⌘K palette, ⌘Z/⌘⇧Z undo/redo, ⌘O open, V/H/P tools, Del delete, +/−/Fit zoom. Add `V`/`H`/`P` tool hotkeys and `?` (open shortcuts) to `useKeyboardShortcuts` — guarded so they don't fire while typing in an input/textarea.

- [ ] **Step 1: Failing tests** — overlay lists "Command palette"; pressing `V` (not in an input) sets activeTool to 'select'.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (input-focus guard via `event.target` tag check). **Step 4: PASS.**
- [ ] **Step 5: Verify visual.** **Step 6: Commit** `feat: add shortcuts overlay + tool hotkeys`.

---

## Phase 6 — Reserved (optional)

Gender sub-picker (contextual row when "Add Person" tool active) and expanded keyboard affordances. **Build only if cheap after Phases 1-5 pass**; otherwise leave a short follow-up note in the PR description and `docs/superpowers/specs/...` is unchanged. No tasks specified — scope on arrival.

---

## Final integration

- [ ] Run full `npm test` + `npm run lint` + `npm run build` — all green.
- [ ] Full preview smoke test: empty state → add people via tool + radial → edit properties (panel floats) → ⌘K runs commands → export → undo/redo → zoom/fit → shortcuts overlay. Screenshot key states.
- [ ] Open one PR to `main` summarizing phases, with screenshots and the Phase 6 follow-up note.

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 layout → Tasks 1.2-1.9; §2 islands → 1.4-1.8; §3 add-node journeys → existing radial preserved + ToolIsland 1.4; §4 palette → Tasks 2.1-2.3; §5 onboarding → 3.1; §6 behavior (full-bleed, floating panel, toolbar removed) → 1.9; §7 visual voice → Island chrome 1.2 + onboarding 3.1; §8 architecture/files → file structure above; §9 phasing → phases 1-6; §10 testing → per-task tests + phase verifications. No gaps.
- **Placeholder scan:** none (Phase 6 is deliberately scoped-on-arrival per spec's "optional" framing, not a hidden TODO).
- **Type consistency:** `EditorActions` (1.3) consumed by `buildCommands` (2.1); `Command`/`CommandContext` (2.1) consumed by `filterCommands` (2.2) and `CommandPalette` (2.3); `togglePropertiesPanel`/`toggleCommandPalette` defined in 1.3, used in 1.7/2.3 — consistent.
