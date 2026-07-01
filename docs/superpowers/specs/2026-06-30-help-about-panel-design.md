# Help / About panel — design

**Issue:** #88 — feat: in-app Help/About panel (quick-start, shortcuts, disclaimer, feedback)
**Date:** 2026-06-30
**Status:** Approved

## Problem

Early users (genetic counsellors testing the app) need a single in-app place to
orient themselves: how to build a first pedigree, what the keyboard shortcuts
are, the clinical disclaimer, and a way to send feedback. Today the `HelpIsland`
`?` button only opens the keyboard-shortcuts overlay — there is no orientation
or "about" surface, and no clinical disclaimer exists anywhere in the app.

This is the in-app panel that keeps a dedicated docs site (#87) unnecessary for
early users.

## Decision summary

- **Surface:** a `help` modal — a new `HelpOverlay` built exactly like the
  existing `ShortcutsOverlay` (Radix `Dialog`, driven by `uiStore.activeModal`).
  The app has no router; a modal matches every existing pattern. Content is
  organised into discrete sections so it can graduate to a standalone page later
  if it outgrows a modal.
- **Scope included in this PR:** quick-start, keyboard-shortcuts reuse, clinical
  disclaimer, feedback `mailto:` link, and app version/About (the version-wiring
  prerequisite from #84).
- **Out of scope (clean seams left):** the analytics half of #80, the dedicated
  docs site #87, and the git tag + CHANGELOG of #84.

## Components

### 1. Store & entry points

- **`src/stores/uiStore.ts`** — add `'help'` to the `ActiveModal` union:
  `'import' | 'export' | 'settings' | 'legendEditor' | 'shortcuts' | 'help' | null`.
- **`src/components/ui/islands/HelpIsland.tsx`** — `handleHelpClick` opens
  `'help'` instead of `'shortcuts'`. Relabel the button title/aria to
  "Help & About" (keep the `?` glyph).
- **`src/components/canvas/OnboardingHints.tsx`** — its "Help" quick-link
  (`handleHelp`, currently `openModal('shortcuts')`) repoints to `'help'` for
  coherence with the new entry point.
- The `?` **keyboard** shortcut (in `useKeyboardShortcuts.ts`) keeps opening the
  shortcuts overlay directly — power users keep their fast path. No change there.

### 2. `HelpOverlay.tsx` (+ `HelpOverlay.module.css`)

Mirrors `ShortcutsOverlay`: `Dialog.Root` open when `activeModal === 'help'`,
`onOpenChange(false)` routes through `closeModal()`. Mounted once in `App.tsx`
alongside the other modals. Sections, in order:

1. **Quick-start — "How to build your first pedigree":** a short ordered list
   grounded in real interactions, copy kept consistent with `OnboardingHints`:
   - Hover near a person to add relatives.
   - Use ▢ ● ◇ to set a person's sex.
   - Hold **Alt** and drag from one person to another to link them, then pick the
     relationship type.
   - Press **⌘K** for all commands.
   - Open, import, and export from the top-left menu.
2. **Keyboard shortcuts:** a "View all keyboard shortcuts" button that calls
   `openModal('shortcuts')` — literal reuse of `ShortcutsOverlay`, zero data
   duplication. (Alternative considered and deferred: extract `SHORTCUT_GROUPS`
   into a shared `shortcuts.ts` and embed inline.)
3. **Clinical disclaimer** (authored; follows the project's CDSS boundary
   language — no diagnostic, treatment, or prognostic claims):

   > Pedigree Canvas is a drawing and documentation tool. It does not provide
   > medical advice, diagnosis, or risk assessment, and does not replace
   > professional clinical judgement or genetic counselling. Always verify
   > symbols, relationships, and annotations against your own records and current
   > clinical standards before relying on a pedigree.

4. **Feedback:** a "Send feedback" link —
   `mailto:josh.ellis@clintech.dev?subject=Pedigree%20Canvas%20feedback`.
   Zero infrastructure; opens the tester's own mail client.
5. **About footer:** "Pedigree Canvas v{version}" plus a short reassurance that
   data stays local (consistent with the `PrivacyBadge` positioning).

### 3. Version wiring (#84 prerequisite)

- **`vite.config.ts`** — read `package.json` version and inject via
  `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`.
- **Ambient type** — `declare const __APP_VERSION__: string;` in a `.d.ts`
  (e.g. `src/vite-env.d.ts`).
- **`package.json`** — bump `0.0.0 → 0.1.0` so the About box shows a real number.
  Git tag + CHANGELOG remain #84's responsibility.

## Data flow

`HelpIsland` / `OnboardingHints` button → `uiStore.openModal('help')` →
`activeModal === 'help'` → `HelpOverlay` renders. "View all keyboard shortcuts"
→ `openModal('shortcuts')` (replaces the active modal). Close (Esc / backdrop /
×) → `closeModal()` → `activeModal = null`. Version string read at build time
from the injected `__APP_VERSION__` global.

## Error handling / edge cases

- Only one modal open at a time — switching from `help` to `shortcuts` replaces
  the active modal, consistent with existing single-`activeModal` behaviour.
- `mailto:` is a plain anchor; no failure path beyond the OS having no mail
  client (acceptable, standard behaviour).
- `__APP_VERSION__` is build-time-defined, so it is always a string in the
  bundle; tests stub/expect it via the vite define (or a fallback in jsdom).

## Testing

All react-dom / jsdom-friendly (not Konva):

- **`HelpOverlay.test.tsx`** — renders when `activeModal === 'help'`; asserts the
  quick-start heading, the disclaimer text, the `mailto:` href, and the version
  string are present; "View all keyboard shortcuts" switches `activeModal` to
  `'shortcuts'`; Esc / close routes through `closeModal()`.
- **`HelpIsland.test.tsx`** — update: clicking the button opens `'help'`.

## Out of scope

- Analytics / instrumentation (#80) — only the feedback link lands here.
- Dedicated docs site (#87) — deferred post-launch.
- Git tag `v0.1.0` and CHANGELOG entry (#84) — only the version-injection
  plumbing lands here.
