# Pedigree Canvas — Claude Instructions

## Architecture reference

Detailed architecture notes live in
[`docs/architecture-reference.md`](docs/architecture-reference.md). **Read the
relevant section there before touching canvas rendering, stores, export, or
feature toggles.** The critical gotchas at a glance (see the reference for the
full explanation and the fix):

- **react-konva + Zustand subscriptions silently fail** — lift all subscriptions
  to `CanvasContainer.tsx`; use `getState()` for imperative reads in handlers.
- **Never `import ... from 'konva'` directly** — second React copy → "Invalid
  hook call". Use the `react-konva` exports.
- **`svgExport.ts` is a parallel renderer** — mirror any symbol/label/legend/
  layout change there too, or the canvas and vector export drift.
- **react-konva can't render under vitest/jsdom** — extract canvas logic into
  store-operating modules and unit-test those, not the components.
- **Feature flags** live in `src/config/featureFlags.ts` (build-time defaults,
  mutable for per-test overrides) — reset any flag you flip in a test's
  `afterEach`.
- **Auto-spacing** (`computeTreeLayout`) is documented in the "Auto-spacing"
  section of `docs/architecture-reference.md`; `src/utils/__fixtures__/pedigrees.ts`
  + `invariants.ts` are the canonical layout test surface — add a fixture and
  check invariants when changing layout.

## Clinical Standards Reference

All pedigree symbol decisions must be checked against the authoritative Bennett/NSGC nomenclature:

- **Reference doc**: [`docs/bennett-pedigree-standards.md`](docs/bennett-pedigree-standards.md)
- **Sources**: Bennett et al. 1995 (original), 2008 (update), 2022 (sex/gender revision, PMID 36106433)

When implementing or reviewing any symbol shape, fill, relationship line, annotation, or layout rule, read that file first.
