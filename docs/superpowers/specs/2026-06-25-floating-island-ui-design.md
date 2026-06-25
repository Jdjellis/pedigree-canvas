# Floating-Island UI Revamp — Design

**Issue:** [#10 — Full Excalidraw-style floating-island UI overhaul](https://github.com/Jdjellis/pedigree/issues/10)
**Date:** 2026-06-25
**Status:** Approved design. This pass is design-only; implementation is broken into phases (see §9) and executed autonomously into a single PR to `main`.

## Purpose

Replace the current full-width top toolbar + docked properties panel with an
Excalidraw-style **floating-island** UI: a full-bleed canvas with discrete,
rounded, softly-shadowed control islands overlaid at the screen corners and
center, plus a **⌘K command palette** for keyboard-driven action. The goal is
the Excalidraw onboarding/working *feel* the user values, expressed in a **calm
clinical voice** (restrained color, crisp type, no hand-drawn whimsy in working
chrome) appropriate for genetic counselors.

## Direction decisions (locked during brainstorming)

- **Scope of this pass:** design only. Produce this spec, then phase + build.
- **Execution:** full autonomy — build all phases, self-review + visually verify
  each, deliver one PR to `main` with per-phase commits. Return to the user only
  at the end, or earlier only for a genuine product decision the spec can't
  answer.
- **Visual voice:** adopt Excalidraw's island *structure* (islands, soft
  shadows, rounded chrome) with a professional/clinical tone. Hand-drawn accents
  appear **only** in the empty-state onboarding hints, never in working chrome.
- **Top-right:** a primary **Export** button (Excalidraw's "Share" slot, which
  has no equivalent — Pedigree is deliberately browser-local) plus the
  **properties-panel toggle**.
- **Document identity:** the editable **title** and **"Saved locally"** status
  move into the top-left **Menu island** (Excalidraw's scene-name location).
- **Tool island:** minimal and clinical — **Select · Hand · Add Person** — not a
  per-gender split. A contextual gender sub-picker is *reserved* for a later
  phase (designed-for, not built now).
- **Command palette:** **in scope**, fully designed here (§4).

## 1. Layout map

```
┌─────────────────────────────────────────────────────────────────┐
│ [☰ Menu]            ┌── Tool Island ──┐         [Export] [▥ Panel]│
│  title+saved        │ ▙ Select  ✋ Hand │                          │
│                     │   ＋ Add Person  │                          │
│                     └──────────────────┘                          │
│                                                                   │
│                          ✕  PEDIGREE          ← (empty state only)│
│                    "Saved only in this browser…"                  │
│                       Open · Import · Help                        │
│                                                                   │
│ ┌── zoom ──┐ ┌─ history ─┐                          ┌─ help ─┐    │
│ │ − 100% + │ │  ↩   ↪    │                          │   ?    │    │
│ └──────────┘ └───────────┘                          └────────┘    │
└─────────────────────────────────────────────────────────────────┘
        (⌘K opens the command palette, centered, over everything)
```

Every island is `position: absolute` over a **full-bleed canvas**. The canvas
no longer reflows when panels open or close.

## 2. Islands & contents

| Island | Position | Contents |
|---|---|---|
| **Menu** | top-left | ☰ button → dropdown: New, Open, Import, Export, Legend, Document details, (Preferences later). Editable **title** + **"Saved locally"** status sit beside/below the ☰. |
| **Tools** | top-center | Select · Hand · Add Person (+ reserved gender sub-picker, later phase). Hotkeys `V` / `H` / `P`. |
| **Actions** | top-right | **Export** primary button + **Properties panel toggle** (▥). |
| **Zoom** | bottom-left | − / % / + / Fit. |
| **History** | bottom-left (right of zoom) | Undo ↩ / Redo ↪. |
| **Help** | bottom-right | ? → keyboard-shortcuts overlay. |
| **Properties** | right, floating | The existing panel, now an island floating **over** the canvas, toggled from top-right. |

## 3. Add-node journeys (UX model)

Two distinct, intentionally-coexisting journeys (canvas-tool convention):

- **Manual placement** — the **Add Person** tool. Pick it, click the canvas, a
  default node drops; refine attributes in the properties panel. Intent: *"put a
  standalone person here."*
- **Relational building** — the existing **radial menu** on a node:
  *add partner / add child / add parent*. Intent: *"add someone related to this
  person."* This is the **primary** pedigree-building flow (counselors build
  outward from a proband), and is preserved as-is.

The main tool island stays at three modes. Gender is one clinical attribute
among many (affected status, deceased, carrier…), so it is set in properties /
via the reserved sub-picker, not split into the toolbar.

## 4. Command palette (⌘K)

A keyboard-first launcher for every discrete action in the app, and the third
add-node/command journey alongside the islands and radial menu.

### Interaction

- **Open:** `⌘K` (macOS) / `Ctrl+K` (Windows/Linux). Also reachable from the
  Menu island ("Command palette… ⌘K").
- **Close:** `Esc`, click-outside, or after running a command.
- **Layout:** a centered floating panel (island chrome, slightly elevated
  shadow + dimmed backdrop) near the upper third of the screen — a search input
  at top, a scrollable filtered command list below, each row showing
  `icon · title · shortcut hint`.
- **Search:** case-insensitive fuzzy/substring match over each command's
  `title` + `keywords`. Empty query shows all available commands grouped by
  category (Document, Edit, View, Tools).
- **Keyboard nav:** `↑`/`↓` move the highlight (wraps), `Enter` runs the
  highlighted command, `Esc` closes. The input keeps focus throughout; the
  highlighted row scrolls into view.
- **Context awareness:** commands expose an `isAvailable(ctx)` predicate.
  Selection-dependent commands (Delete selected, Add partner/child/parent) are
  hidden or disabled when nothing is selected. The palette reads the same
  context the islands read.

### Command registry (single source of truth)

A new `src/commands/` module defines a typed `Command` descriptor and a registry
the **palette and the islands both consume**, so "what actions exist" lives in
exactly one place:

```ts
interface CommandContext {
  selectedIds: ReadonlySet<string>;
  // plus any other state predicates need (e.g. canUndo/canRedo)
}

interface Command {
  id: string;                       // stable, e.g. 'document.export'
  title: string;                    // 'Export…'
  category: 'document' | 'edit' | 'view' | 'tools';
  keywords?: string[];              // extra search terms
  shortcut?: string;                // display only, e.g. '⌘O'
  isAvailable?: (ctx: CommandContext) => boolean;
  run: () => void;                  // calls store actions via getState()
}
```

`run` handlers call the existing store actions through `useXStore.getState()`
(the established pattern for imperative actions), so there is no new state layer.
Island buttons become thin wrappers that look a command up by `id` and call its
`run`, guaranteeing the palette and the islands never drift.

### Initial command set

- **Document:** New, Open (`⌘O`), Import, Export, Legend, Document details,
  Command palette (self).
- **Edit:** Undo (`⌘Z`), Redo (`⌘⇧Z`), Delete selected *(selection-only)*,
  Add Person.
- **View:** Zoom in, Zoom out, Fit / Reset view, Toggle properties panel,
  Keyboard shortcuts.
- **Tools:** Select tool (`V`), Hand tool (`H`), Add Person tool (`P`).

(Relationship commands — add partner/child/parent — may be added when a node is
selected, mirroring the radial menu, once that wiring is confirmed reusable.)

## 5. Empty-state onboarding

Shown only when the document has **zero individuals** (extends today's
`EmptyStateHint`):

- Centered **Pedigree logo/wordmark** + the existing "saved only in this
  browser" reassurance text.
- Quick links: **Open · Import · Help** (with shortcut hints).
- **Hand-pointing hint arrows** with labels pointing at the real islands:
  *"Menu, export, settings"* → top-left; *"Pick a tool & add your first
  person"* → tool island; *"Zoom & history"* → bottom-left; *"Shortcuts &
  help"* → bottom-right.
- The entire onboarding layer disappears once the first individual exists.

The hand-drawn arrow/label style is the **only** place whimsy appears.

## 6. Behavior changes

- **Canvas → full-bleed.** `App.tsx` layout flattens: the flex row that
  currently shrinks the canvas is removed; the canvas fills the viewport and
  islands overlay it absolutely.
- **Properties panel → floating + toggleable.** No longer reflows the canvas;
  opens over it from the top-right toggle. Still auto-opens on selection
  (behavior preserved; toggle adds explicit show/hide).
- **Top bar removed.** `Toolbar.tsx` is decomposed into the Menu, Tools, and
  Actions islands.

## 7. Visual language (clinical voice)

Reuse the existing CSS variables (violet accent + surfaces already aligned in
prior commits). Island chrome: white/surface background, existing `--radius`
rounding, soft shadow, hairline border. No hand-drawn font in working chrome.
The hand-drawn arrows are confined to the onboarding layer.

## 8. Architecture / files

- `App.tsx` / `App.module.css` — flatten layout to a full-bleed canvas with
  absolute island slots.
- **New** `src/components/ui/islands/` — `MenuIsland`, `ToolIsland`,
  `ActionsIsland`, `ZoomIsland`, `HistoryIsland`, `HelpIsland`, split out of
  `Toolbar.tsx` (currently 400+ lines doing too much; the bar ceases to exist).
- **New** shared `Island.module.css` (or shared tokens) for consistent chrome.
- **New** `src/commands/` — `Command`/`CommandContext` types + the command
  registry; consumed by both the islands and the palette.
- **New** `src/components/ui/CommandPalette.tsx` (+ module CSS) — the ⌘K UI.
- `PropertiesPanel` — restyle as a floating island; add toggle wiring in
  `uiStore` (a `propertiesPanelOpen` toggle action; the flag already exists).
- `EmptyStateHint` — extend into the onboarding layer with hint arrows + quick
  links.
- **New** `ShortcutsOverlay` — the `?` help dialog (lists existing
  `useKeyboardShortcuts` bindings).
- `useKeyboardShortcuts` — add `⌘K` (open palette) and tool hotkeys `V`/`H`/`P`.

### Konva/Zustand constraint (project gotcha)

Any new canvas-affecting state must respect the project rule: Zustand
subscriptions inside react-konva components silently fail. Subscriptions stay
lifted to `CanvasContainer` (react-dom); islands, the palette, and overlays are
plain react-dom components and may subscribe normally. Command `run` handlers
use `getState()` for imperative store actions.

## 9. Phasing

Each phase is an independently-verifiable slice, committed separately, all
landing in one PR.

1. **Layout foundation** — full-bleed canvas + island scaffold; relocate
   existing controls into islands (no new features). Lowest risk, highest
   visual payoff (~80% of the Excalidraw feel). Introduces `Island.module.css`.
2. **Command registry + ⌘K palette** — extract action handlers into
   `src/commands/`, rewire islands to consume the registry, build the palette.
   Done after Phase 1 so the islands and palette share one command source.
3. **Empty-state onboarding** — logo, hint arrows, quick links.
4. **Menu + Actions polish** — dropdown menu, title/save relocation, Export CTA.
5. **Help / shortcuts overlay** (`?`), incl. tool hotkeys `V`/`H`/`P`.
6. **Reserved/optional** — gender sub-picker; expanded keyboard affordances.
   Built only if cheap after the above; otherwise documented as follow-up.

## 10. Testing

- Component tests per island: renders the correct actions/labels; toggle wiring
  (e.g. properties panel open/close); empty-state shows/hides on individual
  count.
- Command registry tests: each command's `isAvailable` predicate; palette
  filtering (query → expected command ids); keyboard nav (highlight move, Enter
  runs, Esc closes).
- Manual preview-verify pass per phase: islands position correctly at all four
  corners + center, canvas stays full-bleed (does not resize when panels
  toggle), onboarding appears at zero individuals and clears after the first,
  ⌘K opens/filters/runs/closes.

## Out of scope

- Live collaboration / sharing (Pedigree is intentionally browser-local).
- Backend or persistence changes.
- New clinical data model or symbol changes.
- Reworking the radial-menu relationship flow (preserved as-is).
