# Pedigree Canvas — Claude Instructions

## Architecture gotchas

These are non-obvious and have each cost real debugging time. Read before
touching canvas rendering, stores, or export.

- **react-konva + Zustand subscriptions silently fail.** react-konva uses a
  custom React reconciler (not react-dom), so a `useStore(selector)` subscription
  *inside* a Konva component updates the store but never repaints the canvas.
  Lift **all** Zustand subscriptions up to `CanvasContainer.tsx` (react-dom
  context) and pass data down as props. Use `useXStore.getState()` for
  imperative reads/writes inside event handlers only.

- **Never `import ... from 'konva'` directly.** It pulls in a second React copy
  and crashes with "Invalid hook call". Use the `react-konva` exports; intercept
  raw events in the capture phase instead of reaching for the Konva global.

- **`svgExport.ts` is a parallel renderer, not a wrapper.** It re-implements the
  canvas drawing for vector export, so any change to a symbol, label, legend, or
  layout must be made in **both** the Konva component and `svgExport.ts` or they
  drift. Because Konva can't render under jsdom, `svgExport` is also the real
  unit-test surface for rendering logic.

- **react-konva can't render under vitest/jsdom** (no canvas → `Stage` throws).
  Extract canvas logic into store-operating modules (e.g. `symbolDrag.ts`) and
  unit-test those, not the components.

## Feature flags

Toggles for experimental / discoverability affordances live in a single module,
`src/config/featureFlags.ts`, exporting a mutable `featureFlags` object. It's the
one source of truth so a feature can be turned on/off in one place instead of
threading props through the tree.

- **Reading a flag:** import `featureFlags` and branch on it at render/use time —
  e.g. `{featureFlags.altHint && <TwinBadge />}`. Read it live (don't snapshot it
  into module scope) so a change takes effect on the next render.
- **Adding a flag:** add the field to the `FeatureFlags` interface *and* the
  `featureFlags` object with a JSDoc note on what it gates and its default.
- **Testing a flag:** the object is intentionally mutable — set
  `featureFlags.myFlag = true` in a test and **reset it in `afterEach`** (module
  state leaks across tests otherwise). See `RadialMenu.altBadge.test.tsx` and
  `InlineGenderPicker.twin.test.tsx`.
- It's a plain object, not Zustand — components don't re-render when you mutate
  it at runtime. It's for build-time defaults (and per-test overrides), not live
  in-app toggling. Wire it to a store / query param / settings UI if that's
  needed later.

Current flags: `altHint` (the radial menu's ⌥ discovery badge — off) and
`twinsInGenderPopup` (MZ/DZ twin icons in the inline gender popup — on).

## Clinical Standards Reference

All pedigree symbol decisions must be checked against the authoritative Bennett/NSGC nomenclature:

- **Reference doc**: [`docs/bennett-pedigree-standards.md`](docs/bennett-pedigree-standards.md)
- **Sources**: Bennett et al. 1995 (original), 2008 (update), 2022 (sex/gender revision, PMID 36106433)

When implementing or reviewing any symbol shape, fill, relationship line, annotation, or layout rule, read that file first.
