# Inline gender picker — decouple gender from creation

**Date:** 2026-06-29
**Issue:** [#57](https://github.com/Jdjellis/pedigree/issues/57) — *let user choose child type after creation, not at creation*. Slice of the broader tool-model rethink in [#37](https://github.com/Jdjellis/pedigree/issues/37) (closed).
**Goal:** Replace the persistent toolbar "default sex" mode with a per-creation inline picker. Every single free-gender person is created immediately as a neutral shape, then its gender identity is chosen from a small icon picker anchored on the new node — by click or keystroke — without a trip to the Properties panel.

---

## Context & problem

Today, the gender of a newly added person is fixed **at creation** by a persistent toolbar control, `DefaultSexControl` (Male / Female / Unknown). That value, `uiStore.defaultSex`, feeds **three** unrelated creation paths:

| Path | File | Today |
|---|---|---|
| Radial Partner / Child / Sibling / Twin | `RadialMenu.tsx` | `createRelativeIndividual(defaultSex, …)` |
| "New pedigree" re-seed | `useEditorActions.ts` `newDocument` → `createSeededDocument(sex, …)` | reads `defaultSex` |
| First-run seed (empty storage only) | `useAutoSave.ts` → `createSeededDocument(sex)` | reads `defaultSex` |

*(There is no "click-to-place a person" path — the empty-canvas click handler only places text or clears selection. The two seed paths above are the only non-radial single-person creators.)*

This is a **global mode**, and modes leak across these entry points: a user forgets which sex is "armed" and silently creates the wrong symbol. It is the source of the unintuitive feel. Two further problems:

1. **Latent inconsistency** — the radial's *"existing parents"* branches (`RadialMenu.tsx:193`, `:247`) ignore `defaultSex` entirely and use `createDefaultIndividual` (→ Unknown), while the *"new union"* branches honour it. So a sibling added to a person *with* parents already ignores the toolbar today.
2. **#57** wants type chosen *after* creation, re-rendered in place — incompatible with committing type up front.

### Clinical grounding (verified against the standard)

Per `docs/bennett-pedigree-standards.md` (NSGC/Bennett 2022, PMID 36106433): **symbol shape encodes gender identity** (square = Man, circle = Woman, diamond = Non-binary / Unknown), *not* sex assigned at birth. SAAB is a *separate* annotation (AMAB/AFAB), shown only for transgender/intersex individuals. The app's `GenderIdentity` enum and the Properties panel's "Gender Identity" icon grid are already correct — **no misuse to fix.** The picker in this spec chooses `genderIdentity` and is conceptually identical to the panel control.

---

## Locked decisions

1. **Create-then-pick everywhere** a single free-gender person is made: radial Partner/Child/Sibling, plus both seed paths (the first-run auto-seed and the "New pedigree" re-seed).
2. **Neutral default = `GenderIdentity.Unknown`** before the pick. No sticky/last-used (it would reintroduce a hidden mode; an explicit Unknown diamond is honest, a silently-inherited wrong shape is a false clinical assertion).
3. **Picker = 4 gender shapes** (Man / Woman / Non-binary / Unknown), reusing the existing `GenderIconButtons`. Twins stay on the Alt-radial; pregnancy/loss stays in the Properties panel — both out of scope here.
4. **Pop-on-seed:** the picker also opens for the seeded first person (note: the seed is *not* auto-flagged proband — it's just the first individual). The first-run auto-seed appears only when nothing valid is restorable, so its picker doubles as a self-documenting onboarding moment rather than a recurring ambush; the "New pedigree" re-seed is an explicit user gesture, so popping the picker there is plainly wanted too.
5. **Single-step undo:** the gender pick amends the creation's history entry instead of adding its own, so one undo removes the whole node. Implemented by pausing zundo's `temporal` around the pick mutation (see §4).
6. **Parent is unchanged** — still spawns a fixed Man+Woman couple (structural, no picker).

> **Deliberate override (owner-approved 2026-06-29).** This supersedes the "Default-sex control" section (§2) of `2026-06-27-tool-model-onboarding-design.md`. The single-tool-plus-persistent-default decision recorded there is intentionally reverted in favour of *no default at all*. That earlier spec has been annotated to point here.

---

## Detailed design

### 1. New component — `InlineGenderPicker`

A small **HTML overlay** (react-dom), *not* a Konva node — same rendering class as `RadialMenu`, for the same reason (sidesteps the canvas testing constraint, and obeys the project rule of lifting Zustand subscriptions out of the Konva tree).

- **Location & subscriptions:** rendered in `App.tsx` inside `.canvasArea`, immediately after `<RadialMenu />` (both are react-dom HTML overlays, siblings of `<CanvasContainer />`). Subscribes to the viewport primitives (`scale`, `position.x`, `position.y`) so it tracks pan/zoom, and to the target individual in `document` so it tracks the node if respacing nudges it after insert.
- **Position:** anchored directly **above** the node — `x = node.position.x · scale + viewportX`, `y = node.position.y · scale + viewportY − (pickerHeight + gap)`. (`RadialMenu` centres on the node; this offsets upward.)
- **Contents:** renders `GenderIconButtons` (`value` = the node's current `genderIdentity`, `onChange` = commit, see §4). Zero new symbol artwork.
- **Visibility:** shown when `uiStore.genderPicker.targetId` is set and the target exists; suppressed when `editingLocked` (mirrors the radial gate).
- **Picker > radial (sequencing):** `RadialMenu`'s visibility gate gains `&& !genderPicker.targetId`, so the radial never renders while a picker is open. The picker takes precedence; the radial (re)appears once the pick resolves. This is the single rule that prevents the first-run proband collision (see §3) and any hover-opens-radial-under-picker case — no per-node bookkeeping needed.

#### Keyboard & dismissal

While the picker is visible it installs a `window` keydown listener (mirroring the radial's Escape/Alt pattern) that **stops propagation** so global shortcuts don't double-fire:

| Key | Action |
|---|---|
| `M` | Man → commit + close |
| `F` | Woman → commit + close |
| `N` | Non-binary → commit + close |
| `U` | Unknown → commit + close (explicit) |
| `Enter` / `Esc` | close, keeping current shape |
| click-away | close, keeping current shape |

`M`/`F`/`N`/`U` are confirmed **collision-free** against `useKeyboardShortcuts` (which uses only `k`, `z`, `s`, `o`, `e`, `v`, `h`, `t`, `l`, `?`, `1`/`2`/`3`, Esc, Delete/Backspace). Opening a picker for a new node (or starting any other add action) commits-and-closes any already-open picker first.

### 2. State — `uiStore`

- **Add** `genderPicker: { targetId: string | null }` plus `showGenderPicker(id)` / `hideGenderPicker()` — mirrors the existing `radialMenu: { visible, targetId }` shape.
- **Remove** `defaultSex` and `setDefaultSex` (and the `DefaultSex` import).

### 3. Wiring the three creation paths

Each path stops consulting `defaultSex`. It creates the node as `GenderIdentity.Unknown`, selects it, and opens the picker:

```
create node (genderIdentity: Unknown) → select(id) → showGenderPicker(id)
```

- **`RadialMenu.tsx`** — `handleAddPartner`, `handleAddChild`, `handleAddSibling`: replace `createRelativeIndividual(defaultSex, …)` with `createDefaultIndividual({ genderIdentity: GenderIdentity.Unknown, … })`, then `showGenderPicker(newId)` after the existing `select(newId)`. The *"existing parents"* branches already create as Unknown — they simply gain the `showGenderPicker` call, which **also resolves the latent inconsistency** noted above. `handleAddTwin` must still drop its `createRelativeIndividual(defaultSex, …)` call (that helper and `defaultSex` are being deleted) and create the twin as Unknown — but it gains **no** picker (twins are out of scope this round; deferred to [#71](https://github.com/Jdjellis/pedigree/issues/71)). Net: twins become consistently Unknown, instead of today's mix (Unknown for the in-family branch, `defaultSex` for the parentless branch).
- **`useEditorActions.ts` — `newDocument`** — drop the `defaultSex` read; `createSeededDocument` returns a doc whose single individual is the seed; after `setDocument`, read that seed's id and `showGenderPicker(seedId)`.
- **`useAutoSave.ts` / first-run seed** — `createSeededDocument` no longer takes a sex (seed created as Unknown). After the seed mounts and the viewport centres on it, open the picker for the seed id (first-run only, by construction).
- **`OnboardingHints.tsx` — sequencing.** Today onboarding calls `showRadialMenu(seedId)` on first run to guide the user. With the picker rule in §1, that radial call is now *gated behind the picker*: on first run the proband's gender picker shows first; once it resolves (pick or dismiss), the onboarding radial appears to nudge "add a relation." Concretely, the picker rule already suppresses the radial while the picker is open, so onboarding's existing `showRadialMenu(seedId)` call simply has no visible effect until the picker closes — giving the desired *pick gender → then add relations* order with minimal change. Verify the two don't compete for the same screen space during the brief transition.

`handleAddParent` is untouched.

### 4. Single-step undo (the pending-creation amendment)

**Constraint:** this store tracks **one history entry per `set()`** (`temporal` from zundo, `partialize: { document }`, `limit: 100`, no `handleSet`/`groupBy`). Its existing "one undo reverts both" trick works only because the insert and its respacing happen inside a *single* `set`. Create and pick are **separated in time by user interaction**, so by default they are two `set`s → two undo entries.

**Mechanism:** the **creation** is a normal tracked `set` (the one entry we keep). The **gender pick** is applied as an *untracked amendment* by wrapping it in zundo's public pause/resume. This reuses the pattern already proven in `src/components/canvas/symbols/symbolDrag.ts` (`beginSymbolDrag` pauses, `commitSymbolDrag` resumes) for collapsing a multi-step drag into one undo entry — so it is **not** a novel use of the API, and `symbolDrag.ts` is the reference to copy from:

```ts
const temporal = usePedigreeStore.temporal;          // zundo temporal store
function commitGenderPick(targetId: string, gender: GenderIdentity | null) {
  if (gender) {
    temporal.getState().pause();
    usePedigreeStore.getState().updateIndividual(targetId, { genderIdentity: gender });
    temporal.getState().resume();
  }
  useUIStore.getState().hideGenderPicker();
}
```

Trace (S0 = before create):

- create (tracked): past gains **S0**, current = S1 (Unknown node).
- pick (paused → untracked): current = S2 (node + gender); past still ends at **S0**.
- **Undo → S0** (node gone). **Redo → S2** (node + gender restored together). One step each way.
- **Dismiss without picking:** no amendment; current stays S1, past ends at S0 → one undo → S0.

This keeps the picker's *dismiss-keeps-Unknown* rule falling out naturally (an empty amendment). `commitGenderPick` lives in `src/components/ui/commitGenderPick.ts` (a small store-operating module beside `radialActions.ts`, which similarly bridges UI → store), so it is unit-testable without rendering Konva.

**Seed pick (implemented uniformly):** the seed/first-person pick is routed through the same `commitGenderPick` as every other pick (no special case) — the pause/resume simply amends the `setDocument` seed entry rather than a per-node creation entry, so the gender lands without adding a second history step. An earlier draft of this spec proposed a "proband exception" (a plain tracked edit for the seed); that was dropped during implementation in favour of one uniform path, matching the implementation plan. Net effect: one undo after seeding + picking reverts the seed together with its gender (the seed has always been undoable; this feature does not change that). Whether the seed should be undoable into a blank canvas at all is pre-existing behaviour, out of scope.

### 5. Deletions / simplifications (the cleanup payoff)

| Removed / simplified | Note |
|---|---|
| `src/components/ui/islands/DefaultSexControl.tsx` + `.test.tsx` | toolbar control gone |
| `DefaultSexControl` usage in `islands/ToolIsland.tsx` | remove render |
| sex glyphs in `islands/toolIcons.tsx` | remove if unused elsewhere |
| `uiStore.defaultSex` / `setDefaultSex` | replaced by `genderPicker` |
| `utils/sex.ts` — `genderForSex`, `DefaultSex` type | translation layer collapses |
| `components/ui/radialActions.ts` — `createRelativeIndividual` | callers use `createDefaultIndividual` directly |
| `RadialMenu.defaultSex.test.tsx` | behaviour removed |
| `pedigreeStore.ts:152` `genderForSex(sex)` in seed builder | seed builds Unknown directly |

Net: the feature **deletes more than it adds** — the picker reuses `GenderIconButtons`, while an entire `defaultSex → genderForSex → createRelativeIndividual` chain plus a toolbar control come out.

---

## Files impacted

| File | Change |
|---|---|
| `src/components/ui/InlineGenderPicker.tsx` (new) + `.module.css` (new) | the overlay picker |
| `src/components/ui/InlineGenderPicker.test.tsx` (new) | keyboard / dismiss / selection |
| `src/components/ui/commitGenderPick.ts` (new) + test | the pause/resume amendment, unit-tested |
| `src/stores/uiStore.ts` | add `genderPicker` + actions; remove `defaultSex`/`setDefaultSex` |
| `src/App.tsx` | render `<InlineGenderPicker />` after `<RadialMenu />` |
| `src/components/ui/RadialMenu.tsx` | 3 handlers create Unknown + `showGenderPicker`; `handleAddTwin` drops `createRelativeIndividual` (Unknown, no picker); add `&& !genderPicker.targetId` to the visibility gate |
| `src/components/canvas/OnboardingHints.tsx` | first-run radial is gated behind the proband picker (no code change beyond verifying the transition; see §3) |
| `src/commands/useEditorActions.ts` | `newDocument` re-seed: drop `defaultSex`; seed Unknown; open picker on the new seed |
| `src/hooks/useAutoSave.ts` | first-run seed Unknown; open picker on the seed |
| `src/stores/pedigreeStore.ts` | seed builder drops `genderForSex`; (no temporal config change) |
| `src/components/ui/islands/ToolIsland.tsx`, `toolIcons.tsx` | remove default-sex control + glyphs |
| `src/utils/sex.ts`, `src/components/ui/radialActions.ts` | delete dead translation layer |
| deleted tests | `DefaultSexControl.test.tsx`, `RadialMenu.defaultSex.test.tsx` |

---

## Testing strategy

The picker and commit logic are react-dom / store-level, so both are **jsdom-testable** (unlike Konva); `GenderIconButtons` already has a test.

- **`InlineGenderPicker`** — renders for a target; `M`/`F`/`N`/`U` commit the right `genderIdentity` and close; `Esc`/`Enter`/click-away close keeping current; hidden when `editingLocked`; keydown does not leak to global shortcuts.
- **`commitGenderPick`** (store-level) — pick amends in place (node count unchanged, gender set); **undo after pick removes the node**; **undo after dismiss removes the node**; **redo restores node + gender together**; pick of `null` (dismiss) leaves Unknown and adds no history entry.
- **Creation paths** — radial Partner/Child/Sibling and both seed paths (`newDocument`, first-run seed) each create Unknown and set `genderPicker.targetId`; the *existing-parents* sibling/child branch now also opens the picker (regression guard for the latent inconsistency).
- **`svgExport` untouched** — symbol rendering is unchanged (shape still derives from `genderIdentity`), so the parallel SVG renderer needs no mirror work.

---

## Risks & edge cases

- **Undo layer coupling.** §4 uses zundo's `temporal.pause()/resume()` — the same pattern already shipping in `symbolDrag.ts`. Risk is contained to `commitGenderPick` and covered by undo/redo tests. *(Owner reviewed and approved keeping single-step, 2026-06-29.)*
- **Intervening edit before pick.** If the user creates a node and performs another *tracked* edit (e.g. drags it) *before* picking, the untracked amendment attaches to the post-edit state; undo then unwinds that edit + the gender together. Unusual (picker is focused/expected to resolve first); accepted, noted.
- **Autosave during pending pick.** The node lives in `document` as Unknown during the open picker, so a debounced autosave may persist Unknown; a reload mid-pick yields an honest Unknown node with the picker gone. No data loss.
- **Proband picker vs. `OnboardingHints` / radial — resolved.** On first run, onboarding opens the radial on the seed *and* the picker wants the same node. Resolved by the §1 picker-precedence rule (`RadialMenu` hidden while a picker is open): the proband picker shows first, the radial/onboarding nudge follows once it resolves. Remaining build-time check is purely visual — confirm no awkward flash during the transition.

---

## Out of scope

- Pregnancy/loss outcomes (SAB/TOP/ECT/SB) in the picker — stays in the Properties panel.
- Twins in the picker — MZ/DZ stay on the Alt-radial (deferred to [#71](https://github.com/Jdjellis/pedigree/issues/71); to be done after this work *and* the parallel multi-select property-editing feature land).
- Same-sex parents — `Parent` stays a fixed Man+Woman couple.
- Sticky/last-used default — explicitly rejected; revisit only if dogfooding shows same-sex runs are painful.
- First-run onboarding redesign (#37) beyond opening the proband picker.
