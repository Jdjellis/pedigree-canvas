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

## Clinical Standards Reference

All pedigree symbol decisions must be checked against the authoritative Bennett/NSGC nomenclature:

- **Reference doc**: [`docs/bennett-pedigree-standards.md`](docs/bennett-pedigree-standards.md)
- **Sources**: Bennett et al. 1995 (original), 2008 (update), 2022 (sex/gender revision, PMID 36106433)

When implementing or reviewing any symbol shape, fill, relationship line, annotation, or layout rule, read that file first.
