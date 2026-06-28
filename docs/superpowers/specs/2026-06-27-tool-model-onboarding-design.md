# Tool model & first-run onboarding rethink

- **Issue:** #37 — UX: rethink tool model & first-run onboarding
- **Date:** 2026-06-27
- **Status:** Approved design, ready for implementation planning

## Context & problem

The toolbar recently grew from a single "Add person" tool to **three** person tools
(male / female / unknown) plus a **partnership** tool, alongside text, eraser, hand,
and select. This added power but created first-run friction:

- A new user faces a high-decision first action (which of three person tools?).
- The real family-building mechanism — hovering a person to open a **radial menu**
  (add parent / partner / child / sibling) — is never taught and is invisible until
  discovered. Onboarding says "pick a person tool," then the user places one symbol
  and hits a wall.
- The proband (the whole anchor of a pedigree) has no special status in the flow;
  `isProband` defaults to `false` and is only ever set manually.

## Core reframe

Move from **"blank document you populate"** to **"seeded document you grow."**
A pedigree always begins as a single person; people are added only by growing
outward from existing people via the radial menu. This removes the "place a person"
step entirely — there is no longer a placement interaction to mis-teach.

## Goals

- Remove first-action friction: no tool choice required to begin.
- Make the radial menu a reliable, discoverable, **sole** mechanism for adding people.
- Guarantee the load-bearing "hover → add family" move is discovered on first run.
- Keep the toolbar lean and give every remaining control a clear purpose.

## Non-goals

- Proband designation remains the existing manual action in the Properties panel.
  Onboarding does **not** teach or nudge proband selection.
- The separate "smaller toolbar bugs" round (stale `P` shortcut, eraser cursor,
  select-tool nav hint, text-box sizing, fit-to-content) is out of scope here.
- No change to import/export, the data file format, or the connection renderers.

## Detailed design

### 1. Tool model

Remove the **male**, **female**, **unknown**, and **partnership** tools. The toolbar
becomes, left to right:

```
[ Lock ] | [ Hand ] | [ Select ] [ add as: ▢ ● ◇ ] [ Text ] [ Eraser ]
```

`ActiveTool` shrinks to:

```ts
export type ActiveTool = 'select' | 'hand' | 'text' | 'eraser';
```

A separate UI setting holds the default sex (see §2); it is **not** an `ActiveTool`.

**Why removing partnership is safe:** with placement tools gone, every person
descends from the seed via the radial menu, so the graph is always connected — there
are never two free-floating individuals to link. A second/subsequent partner
(remarriage, multiple matings) is still reachable by invoking **+ Partner** again on
the same person, which already creates a fresh partnership each time.

### 2. Default-sex control

An always-visible segmented control sits beside **Select**, labelled "add as", with
three options rendered as pedigree glyphs: square (male), circle (female), diamond
(unknown). It is the always-visible "B" placement from the design review (chosen over
a nested popover so the current default is legible at a glance).

```ts
/** The sex applied to singly-added people. Defaults to 'unknown'. */
defaultSex: 'male' | 'female' | 'unknown';
setDefaultSex: (sex: 'male' | 'female' | 'unknown') => void;
```

It governs the sex of every **singly-added** person:

- the seeded first person (§3),
- radial **+ Partner**, **+ Child**, **+ Sibling**.

Mapping to the data model's `GenderIdentity`:
`'male' → Man`, `'female' → Woman`, `'unknown' → Unknown`.

**+ Parents is unaffected** — it always creates a fixed father (square) + mother
(circle) pair, per standard nomenclature. Default is **`unknown`**.

### 3. Seed the first person

When someone **starts new**, the document is seeded with exactly one person:

- sex = current `defaultSex` (i.e. unknown by default),
- positioned at canvas centre,
- **not** marked proband (`isProband: false`).

"Starts new" means either path:

1. **Fresh load** — on mount, after autosave restore determines there is no valid
   saved document to restore.
2. **Explicit "New"** — any action that resets to an empty document also seeds.

The seed must **not** fire when:

- a valid autosaved document is restored, or
- the user has deliberately deleted everyone and that empty state was saved
  (restoring an empty-but-present document is not "starting new").

Concretely, seeding hangs off the "no document restored" branch in `useAutoSave`
(and the shared reset path), not off "document has zero individuals" at render time —
so an intentionally-emptied document stays empty.

### 4. Radial menu as the sole add mechanism

The radial menu (add parent / partner / child / sibling, with existing
enable/disable rules) becomes the only way to add people. Its trigger is reworked
from "hover the symbol's exact pixels, auto-dismiss on mouse drift" to:

- **Hover-preview:** moving the cursor anywhere within a generous, **invisible**
  hot-zone around a person previews the menu immediately (no click, no need to land
  on the symbol). Leaving the zone hides the preview.
- **Click-to-pin:** clicking the person **pins** the menu sticky so it stays open
  while working. **Esc** or a click outside releases the pin.
- No visible boundary is drawn (the dashed ring in the mockup was a demo aid only).

State: the radial-menu UI state gains a `pinned: boolean`. Preview visibility =
`hovering-zone || pinned`. The current `RADIAL_MENU_DISMISS_DISTANCE` auto-dismiss is
replaced by zone-leave (when not pinned) and explicit release (when pinned).

**Recommended implementation:** a stage-level proximity check (find the nearest
person within the hot-zone radius of the pointer and preview that person's menu)
centralises the logic and avoids overlapping per-node zones. An invisible Konva
hit-shape per person is the alternative. The plan picks one; behaviour is identical.

Radial add actions read `defaultSex` for + Partner / + Child / + Sibling
(§2). All radial add actions are suppressed when editing is locked (§5).

### 5. Lock = lock editing

The Lock button is repurposed from "keep tool active" (near-useless once placement
tools are gone) to an **edit lock**. The UI flag `toolLocked` is renamed:

```ts
/** When true, the pedigree is read-only: no structural or property edits. */
editingLocked: boolean;
toggleEditingLocked: () => void;
```

When `editingLocked` is true:

- the radial menu does not open (no adds),
- nodes cannot be dragged/moved,
- the eraser and text tools are disabled (greyed in the toolbar),
- delete/backspace and other mutate shortcuts are no-ops,
- the Properties panel is read-only (inspect, not edit),
- selection, hover-inspect, pan, and zoom continue to work.

The Lock button shows an active/engaged state while on. This is the broadest-reach
change: every mutation path must consult `editingLocked`. Default is `false`.

### 6. First-run onboarding (hybrid)

Rework `OnboardingHints`. **Keep** the three corner feature-arrows that orient the
user to the surrounding islands:

- top-left → Menu / export / settings,
- bottom-left → Zoom / history,
- bottom-right → Shortcuts / help.

**Replace** the top-center arrow (old copy: "Pick a tool & add your first person",
now obsolete). In its place:

- the seeded first person gently **pulses** with a single callout:
  *"Your first person — hover to add family"*,
- the radial menu **auto-previews once** (ghosted) so discovery is guaranteed,
- a just-in-time tip points up at the toolbar: *"Set the default sex (▢ ● ◇) before
  adding"*.

Keep the quiet brand wordmark and the "saved only in this browser" reassurance.
Onboarding fades once the first relative is added; the auto-preview is one-time.
No proband teaching.

Unlike today's overlay, onboarding is shown around the **seed person**, not on an
empty canvas — `OnboardingHints` no longer keys off "zero individuals" (there is
always at least one). It keys off a first-run flag (e.g. "no relative added yet").

## Data-model impact

No change to the pedigree document schema. All changes are in UI state (`uiStore`):

- `activeTool` enum narrowed to `select | hand | text | eraser`.
- add `defaultSex` + `setDefaultSex`.
- rename `toolLocked` → `editingLocked`; `toggleToolLocked` → `toggleEditingLocked`.
- radial-menu state gains `pinned`.

## Files impacted

**Modify**
- `src/stores/uiStore.ts` — narrow `ActiveTool`; add `defaultSex`; rename lock flag;
  add radial `pinned`.
- `src/components/ui/islands/toolDefs.tsx` — drop male/female/unknown/partnership;
  keep select/text/eraser.
- `src/components/ui/islands/ToolIsland.tsx` — new toolbar layout; mount the
  default-sex control; Lock reflects `editingLocked`.
- `src/commands/useEditorActions.ts` & `src/commands/registry.ts` — remove
  `maleTool`/`femaleTool`/`unknownTool`/`partnershipTool` actions and their
  shortcuts; reassign number shortcuts for the remaining tools; rename lock action.
- `src/hooks/useKeyboardShortcuts.ts` — drop removed-tool shortcuts.
- `src/components/ui/RadialMenu.tsx` — read `defaultSex`; hover-zone preview +
  click-to-pin; respect `editingLocked`.
- `src/components/canvas/symbols/PedigreeSymbol.tsx` — new hover-zone trigger; drop
  the partnership and placement click branches; respect `editingLocked` for drag.
- `src/components/canvas/CanvasContainer.tsx` — remove the person-placement branch in
  `handleStageClick`; keep text placement; gate mutations on `editingLocked`.
- `src/components/canvas/toolPlacement.ts` — remove `placePersonAt` and
  `genderForTool`; keep `placeTextAt`.
- `src/hooks/useAutoSave.ts` — seed a first person on the "nothing restored" branch.
- `src/components/canvas/OnboardingHints.tsx` (+ `.module.css`) — hybrid onboarding:
  keep corner arrows, replace centre with seed coachmark + one-time auto-preview +
  default-sex tip; key off first-run flag.

**Create**
- A default-sex segmented control component (e.g.
  `src/components/ui/islands/DefaultSexControl.tsx` + styles).

**Delete**
- `src/components/canvas/partnershipTool.ts`.

## Testing strategy

Per the project's react-konva/jsdom constraint, Konva components are not unit-tested;
logic is extracted and unit-tested. Cover:

- **Seed timing** — fresh start seeds exactly one person at default sex, not proband;
  restoring a saved (including empty) document does **not** seed; explicit "New"
  seeds. (Logic-layer test around the seed helper / `useAutoSave` restore branch.)
- **Default-sex → GenderIdentity mapping**, and that radial + Partner/+ Child/
  + Sibling use it while + Parents stays a fixed M+F pair.
- **Edit lock** — with `editingLocked` true, the add/move/delete/erase/text helpers
  are no-ops; with it false they behave as before.
- **Radial pin/preview state machine** — preview = hovering || pinned; Esc/outside
  release; pin survives zone-leave.
- Update existing tests in `registry.test.ts` for the removed actions/shortcuts.

## Risks & mitigations

- **Discoverability of the sole add mechanism** — mitigated by the one-time radial
  auto-preview and the seed callout (onboarding §6).
- **Edit-lock breadth** — many call sites must consult `editingLocked`; mitigated by
  routing mutations through a small set of guarded helpers and unit-testing them.
- **Seed vs. restore ordering** — the seed must run only after restore concludes
  "nothing to restore"; covered by a dedicated test.

## Out of scope (restated)

- Proband designation changes.
- The smaller toolbar-bug round (stale `P`, eraser cursor, text sizing, fit-to-content).
- Any document-format or renderer changes.
