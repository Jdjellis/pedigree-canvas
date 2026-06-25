# Written investigations in the key — design

**Issue:** [#21 — Add written investigations (genetic tests) to the key](https://github.com/Jdjellis/pedigree/issues/21)
**Date:** 2026-06-25
**Status:** Approved, ready for implementation plan

## Problem

User feedback: _"A way to add written investigations (genetic tests etc) into the key."_

A genetic-counselling pedigree needs to record what investigations (genetic tests,
karyotypes, microarrays, etc.) were performed on individuals, and to surface those
investigations in the diagram's key so the page is self-explanatory.

## Decision: free text, not a structured result model

An earlier draft proposed a structured `GeneticTest` model (gene + result enum +
date). We rejected it as over-engineered for v1:

- Real investigations are heterogeneous — `CMA: 22q11.2 deletion`,
  `Karyotype 46,XY`, `BRCA panel — no pathogenic variant`, `Fragile X: 45 repeats`.
  A `gene + result-enum` shape can express only a fraction of them.
- The original feedback literally says **written** investigations.
- A structured model's only real payoff (auto-rendering `+ / – / ?`) is something
  the user can just type.

The structured model remains a reasonable *future* issue if computable results are
ever needed (e.g. "show all BRCA+ relatives"). That is YAGNI today.

### Core requirement (from the user)

Every investigation written on an individual must be captured in the key. Concretely:

1. Investigation free text is added **directly on the individual**.
2. The editor offers **autocomplete** from investigations already used on any other
   individual in the chart.
3. The key is the **set** (distinct, alphabetically ordered) of all investigation
   text across every individual, under a dedicated **"Investigations"** subheading.

This makes the free text the single unit: it is both the symbol annotation and the
key entry, so the two can never drift. The key is a *projection* of the individuals,
not a separately maintained list.

## Architecture

The data lives in one place — `Individual.investigations` — and the key is derived
from it. One pure helper produces the derived set, and both the editor's autocomplete
and the key render from that helper.

```
Individual.investigations: string[]
        │
        ├─ SymbolLabel ───────────► lines rendered below each symbol
        │
        └─ collectInvestigations(individuals): string[]   (distinct, sorted)
                   │
                   ├─ PropertiesPanel <datalist> ► autocomplete suggestions
                   └─ LegendLayer ──────────────► "Investigations" key subheading
```

## Components

### 1. Data model — `src/types/pedigree.ts`

- Add `investigations: string[]` to `Individual`.
- **Remove** the dormant, now-superseded `GeneticTest` interface and the
  `geneticTests` field. They were never wired to UI, rendering, or persistence
  beyond initialization, and leaving them alongside `investigations` would mislead
  future readers.

A plain `string[]` is deliberate: dedup-by-value is exactly the "set" semantics the
user described, with no ids to juggle.

### 2. Derivation helper — `src/utils/investigations.ts` (new)

```ts
/** Distinct investigations across all individuals, alphabetically sorted. */
export function collectInvestigations(individuals: Individual[]): string[]
```

- Flattens every individual's `investigations`, trims, drops empties, dedups
  case-sensitively by value, sorts alphabetically (locale-aware `localeCompare`).
- Pure and side-effect free — the single source for both the autocomplete and the key.

### 3. Per-symbol annotation — `src/components/canvas/symbols/SymbolLabel.tsx`

- Append each of `individual.investigations` as its own line to the existing text
  stack, after the conditions lines. Same font/colour/spacing as existing label lines.

### 4. Editor — `src/components/ui/PropertiesPanel.tsx`

- New **"Investigations"** section mirroring the Conditions section:
  - List current `investigations` with a remove button each.
  - A free-text add input bound to a native `<datalist>` whose options come from
    `collectInvestigations(allIndividuals)`, so the user can pick an existing
    investigation or type a new one.
  - Writes back via the existing `updateIndividual` store action (the same pattern
    conditions use). Empty/whitespace-only input is ignored; duplicates on the same
    individual are not added twice.

### 5. Key — `src/components/canvas/LegendLayer.tsx`

- Below the existing condition key rows, render an **"Investigations"** subheading
  followed by one text line per entry of `collectInvestigations(individuals)`.
- The whole subsection is hidden when the derived set is empty.
- The legend already receives data as props from `CanvasContainer` (per the
  react-konva + Zustand rule); the derived investigations set is passed in the same
  way, computed in `CanvasContainer`.

### 6. Persistence & export

- **JSON IO** (`src/io/jsonIO.ts`): `investigations` serializes automatically as part
  of `Individual`. Extend the existing import normalization loop (around line 109,
  beside the `conditionIds` default) to default `investigations` to `[]` for documents
  saved before this change.
- **Store factory** (`src/stores/pedigreeStore.ts`): `createDefaultIndividual` sets
  `investigations: []`; remove the `geneticTests: []` line.
- **SVG/PNG export** (`src/io/svgExport.ts`): the export is a **separate
  model-driven vector renderer** that manually mirrors the Konva components, not a
  capture of them. So investigations must be added in two more places here:
  `buildLabelLines` (mirrors `SymbolLabel`) appends investigation lines, and
  `renderLegend` (mirrors `LegendLayer`) grows the key box with the "Investigations"
  subheading and rows. These functions are pure and string-producing, so they are the
  primary automated-test surface (the live Konva components are verified via the dev
  preview, matching the repo's existing testing approach — `svgExport.test.ts` is the
  only component-level test because react-konva does not render under jsdom).
- **PED IO** (`src/io/pedIO.ts`): remove the two `geneticTests: []` initializers. PED
  has no field for free-text investigations, so they are not exported — the existing
  "PED import is lossy" notice already covers annotations/conditions and now covers
  investigations too.

## Error handling & edge cases

- Whitespace-only or empty investigation text is rejected at the editor input.
- Duplicate investigations across individuals collapse to one key row (set semantics).
- Very long investigation strings follow the same truncation/wrapping behaviour as
  existing label and key text (`ellipsis` / fixed width in `LegendLayer`).
- Documents predating this feature load without `investigations` → normalized to `[]`.

## Testing (TDD)

Write tests before implementation. react-konva does not render under jsdom, so the
Konva components (`SymbolLabel`, `LegendLayer`, `PropertiesPanel`) are **not** unit
tested — they are verified via the dev preview. Automated coverage runs through pure
functions and the SVG export, matching the repo's existing `svgExport.test.ts`:

- `collectInvestigations`: dedup, alphabetical order, trims/drops empties, empty input
  → `[]`, single vs multiple individuals.
- `buildPedigreeSvg` (exercises `buildLabelLines` + `renderLegend`): an individual's
  investigation text appears in the exported SVG; the key contains an "Investigations"
  subheading with the distinct sorted set; no subheading when there are none.
- `deserializeDocument`: a document whose individuals lack `investigations` loads with
  `investigations: []`.
- **Manual/preview verification** (documented in the plan, not automated): symbol
  shows investigation lines, editor add/remove + datalist autocomplete, key subheading
  on the live canvas.

## Scope guard (YAGNI — explicitly out of scope for v1)

- No result enums and no `+ / – / ?` glyph mapping.
- No structured gene/variant/date fields.
- No carrier center-dot glyph.
- No label/description pairs in the key — the investigation text is the key entry.
- No manual key editing — the key is derived, not edited.
