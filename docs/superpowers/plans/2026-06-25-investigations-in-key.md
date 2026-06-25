# Written Investigations in the Key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user record free-text investigations (genetic tests etc.) on individuals, render them beside each symbol, and auto-collect them into a distinct, alphabetised "Investigations" subheading in the key.

**Architecture:** Investigations live in one place — `Individual.investigations: string[]`. A single pure helper, `collectInvestigations`, projects the chart-wide distinct sorted set; both the editor's autocomplete and the key render from it. The live canvas (react-konva) and the SVG export are two parallel renderers, so symbol lines and the key subheading are added to both.

**Tech Stack:** React + Vite + TypeScript, react-konva (HTML5 canvas), Zustand stores, Vitest + Testing Library.

## Global Constraints

- TypeScript: never use `any`; type-annotate every function signature; JSDoc public functions.
- react-konva + Zustand: all store subscriptions live in `CanvasContainer.tsx` and pass data as props to Konva components. Use `useStore.getState()` only inside event handlers. Never `import ... from 'konva'` directly.
- Conventional commits, one logical change per commit. Run tests before each commit.
- react-konva does not render under jsdom — Konva components are verified via the dev preview, not unit tests. Automated tests target pure functions and the SVG export (the repo's existing `svgExport.test.ts` pattern).
- Investigation set semantics: distinct by exact string value, trimmed, empties dropped, sorted with `localeCompare`.

**Spec:** `docs/superpowers/specs/2026-06-25-investigations-in-key-design.md`

---

### Task 1: `collectInvestigations` helper + test script

**Files:**
- Create: `src/utils/investigations.ts`
- Create: `src/utils/investigations.test.ts`
- Modify: `package.json` (add a `test` script)

**Interfaces:**
- Produces: `collectInvestigations(individuals: Individual[]): string[]` — distinct, trimmed, non-empty, `localeCompare`-sorted union of every individual's `investigations`.

- [ ] **Step 1: Add a `test` script so Vitest is runnable by name**

In `package.json`, inside `"scripts"`, add a `test` entry after `"lint"`:

```json
    "lint": "eslint .",
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/investigations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectInvestigations } from './investigations';
import { createDefaultIndividual } from '../stores/pedigreeStore';

describe('collectInvestigations', () => {
  it('returns an empty array when no individual has investigations', () => {
    const a = createDefaultIndividual();
    const b = createDefaultIndividual();
    expect(collectInvestigations([a, b])).toEqual([]);
  });

  it('returns the distinct set across individuals, sorted alphabetically', () => {
    const a = createDefaultIndividual({ investigations: ['BRCA1 +', 'Karyotype 46,XY'] });
    const b = createDefaultIndividual({ investigations: ['BRCA1 +', 'CMA: 22q11.2 deletion'] });
    expect(collectInvestigations([a, b])).toEqual([
      'BRCA1 +',
      'CMA: 22q11.2 deletion',
      'Karyotype 46,XY',
    ]);
  });

  it('trims surrounding whitespace and drops empty/whitespace-only entries', () => {
    const a = createDefaultIndividual({ investigations: ['  BRCA1 +  ', '   ', ''] });
    expect(collectInvestigations([a])).toEqual(['BRCA1 +']);
  });

  it('treats trimmed duplicates as the same entry', () => {
    const a = createDefaultIndividual({ investigations: ['BRCA1 +'] });
    const b = createDefaultIndividual({ investigations: ['BRCA1 +  '] });
    expect(collectInvestigations([a, b])).toEqual(['BRCA1 +']);
  });
});
```

> Note: this test references `investigations` on the individual and `createDefaultIndividual` defaulting it. Those land in Task 2. This task's own run (Step 4) will fail to compile until Task 2 — that is expected; the helper logic itself is what we are writing here. If you prefer a green run now, the test still drives the helper's shape.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/utils/investigations.test.ts`
Expected: FAIL — `collectInvestigations` is not defined (and/or `investigations` not yet on the type).

- [ ] **Step 4: Implement the helper**

Create `src/utils/investigations.ts`:

```ts
import type { Individual } from '../types/pedigree';

/**
 * Collect the distinct set of free-text investigations recorded across every
 * individual in the chart, trimmed, with empties removed, sorted alphabetically.
 *
 * This single projection feeds both the editor autocomplete and the legend's
 * "Investigations" subheading, so the key can never drift from the symbols.
 *
 * @param individuals - all individuals in the document.
 * @returns distinct, trimmed, non-empty investigation strings, sorted by `localeCompare`.
 */
export function collectInvestigations(individuals: Individual[]): string[] {
  const set = new Set<string>();
  for (const individual of individuals) {
    for (const raw of individual.investigations ?? []) {
      const value = raw.trim();
      if (value) set.add(value);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 5: Commit (defer the run to Task 2, which adds the field)**

This task's test depends on the `investigations` field added in Task 2; they form one green checkpoint. Commit the helper and script now:

```bash
git add src/utils/investigations.ts src/utils/investigations.test.ts package.json
git commit -m "feat: add collectInvestigations helper and test script"
```

---

### Task 2: Data model, store, and persistence

**Files:**
- Modify: `src/types/pedigree.ts` (add `investigations`, remove `GeneticTest` + `geneticTests`)
- Modify: `src/stores/pedigreeStore.ts:46` (default `investigations: []`, drop `geneticTests: []`)
- Modify: `src/io/jsonIO.ts` (normalise missing `investigations` to `[]`)
- Modify: `src/io/pedIO.ts:300,336` (drop `geneticTests: []`)
- Modify: `src/io/svgExport.test.ts:28,44,60` (drop `geneticTests: []` from fixtures)
- Test: `src/io/jsonIO.test.ts` (new) — backward-compat normalisation

**Interfaces:**
- Produces: `Individual.investigations: string[]` (required field, defaulted to `[]` by `createDefaultIndividual` and by import normalisation).

- [ ] **Step 1: Write the failing normalisation test**

Create `src/io/jsonIO.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeDocument, deserializeDocument } from './jsonIO';
import { createDefaultDocument, createDefaultIndividual } from '../stores/pedigreeStore';

describe('deserializeDocument', () => {
  it('defaults investigations to [] for individuals saved before the field existed', () => {
    const doc = createDefaultDocument();
    const individual = createDefaultIndividual();
    doc.individuals[individual.id] = individual;

    // Simulate a legacy document: strip the investigations field from the JSON.
    const parsed = JSON.parse(serializeDocument(doc));
    delete parsed.individuals[individual.id].investigations;

    const loaded = deserializeDocument(JSON.stringify(parsed));
    expect(loaded.individuals[individual.id].investigations).toEqual([]);
  });

  it('round-trips investigations that are present', () => {
    const doc = createDefaultDocument();
    const individual = createDefaultIndividual({ investigations: ['BRCA1 +'] });
    doc.individuals[individual.id] = individual;

    const loaded = deserializeDocument(serializeDocument(doc));
    expect(loaded.individuals[individual.id].investigations).toEqual(['BRCA1 +']);
  });
});
```

> Confirm `createDefaultDocument` is exported from `src/stores/pedigreeStore.ts`. If it has a different name, use the actual factory that builds an empty `PedigreeDocument` (grep `export function createDefault`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/io/jsonIO.test.ts`
Expected: FAIL — `investigations` is `undefined` after loading the legacy document.

- [ ] **Step 3: Update the type**

In `src/types/pedigree.ts`, delete the `GeneticTest` interface (lines 50-55):

```ts
export interface GeneticTest {
  id: string;
  gene: string;
  result: 'positive' | 'negative' | 'vus' | 'pending' | 'unknown';
  variant?: string;
}
```

In `interface Individual`, remove the `geneticTests: GeneticTest[];` line under `// Clinical`, and add `investigations` under the `// Annotations` group:

```ts
  // Clinical
  vitalStatus: VitalStatus;
  causeOfDeath?: string;
  conditionIds: string[];
  conditions: Condition[];

  // ... (unchanged fields) ...

  // Annotations
  investigations: string[];
  annotations: Annotation[];
  notes?: string;
```

- [ ] **Step 4: Update the store factory**

In `src/stores/pedigreeStore.ts`, in `createDefaultIndividual`, replace the `geneticTests: []` line with `investigations: []`:

```ts
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
```

- [ ] **Step 5: Normalise legacy imports**

In `src/io/jsonIO.ts`, inside the individuals loop (right after the `conditionIds` default, ~line 112), add:

```ts
    // Ensure conditionIds exists
    if (!individual.conditionIds) {
      individual.conditionIds = [];
    }

    // Ensure investigations exists (added after some documents were saved)
    if (!individual.investigations) {
      individual.investigations = [];
    }
```

- [ ] **Step 6: Drop the dead field from the remaining initializers**

In `src/io/pedIO.ts`, remove both `geneticTests: [],` lines (around 300 and 336).
In `src/io/svgExport.test.ts`, remove the three `geneticTests: [],` lines (around 28, 44, 60).

- [ ] **Step 7: Run tests + typecheck to verify green**

Run: `npx vitest run`
Expected: PASS — including `investigations.test.ts` from Task 1 and the new `jsonIO.test.ts`.
Run: `npx tsc -b`
Expected: no errors (no lingering `geneticTests` references).

- [ ] **Step 8: Commit**

```bash
git add src/types/pedigree.ts src/stores/pedigreeStore.ts src/io/jsonIO.ts src/io/jsonIO.test.ts src/io/pedIO.ts src/io/svgExport.test.ts
git commit -m "feat: add Individual.investigations field; remove dormant geneticTests"
```

---

### Task 3: SVG export — symbol lines + Investigations key subheading

**Files:**
- Modify: `src/io/svgExport.ts` (`buildLabelLines`, `renderLegend` + its call site)
- Test: `src/io/svgExport.test.ts`

**Interfaces:**
- Consumes: `collectInvestigations` (Task 1), `Individual.investigations` (Task 2).
- Produces: exported SVG includes per-symbol investigation lines and, when any exist, an "Investigations" subheading followed by the distinct sorted set.

- [ ] **Step 1: Write the failing tests**

In `src/io/svgExport.test.ts`, first give the fixture some investigations. Find where the proband individual is built in `makeFixture` and add an `investigations` field to one individual, e.g.:

```ts
    investigations: ['BRCA1 +', 'CMA: 22q11.2 deletion'],
```

Then add to the `describe('buildPedigreeSvg', ...)` block:

```ts
  it('renders investigation lines beside the symbol', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('BRCA1 +');
    expect(svg).toContain('CMA: 22q11.2 deletion');
  });

  it('renders an Investigations subheading listing the distinct sorted set', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('Investigations');
    // Alphabetical: BRCA1 + before CMA: ...
    expect(svg.indexOf('BRCA1 +')).toBeLessThan(svg.indexOf('CMA: 22q11.2 deletion'));
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/io/svgExport.test.ts`
Expected: FAIL — "Investigations" not found; investigation text absent.

- [ ] **Step 3: Append investigations to `buildLabelLines`**

In `src/io/svgExport.ts`, in `buildLabelLines`, after the conditions loop and before `return lines;`:

```ts
  for (const condition of individual.conditions) {
    if (condition.ageOfOnset != null) {
      lines.push(`${condition.name} (dx ${condition.ageOfOnset})`);
    } else {
      lines.push(condition.name);
    }
  }

  for (const investigation of individual.investigations) {
    const value = investigation.trim();
    if (value) lines.push(value);
  }

  return lines;
```

- [ ] **Step 4: Extend `renderLegend` to take investigations and draw the subheading**

In `src/io/svgExport.ts`, add an import of the helper near the top:

```ts
import { collectInvestigations } from '../utils/investigations';
```

Change the `renderLegend` signature and body. Replace the opening guard and the `contentHeight` computation, and append the subheading after the entries loop. Full replacement for `renderLegend`:

```ts
/** Render the legend "Key" box, matching `LegendLayer.tsx`. */
function renderLegend(
  entries: LegendEntry[],
  investigations: string[],
  legendX: number,
  legendY: number,
): { markup: string; right: number; bottom: number } {
  if (entries.length === 0 && investigations.length === 0) {
    return { markup: '', right: legendX, bottom: legendY };
  }

  const hasBothGender = entries.some((e) => !e.applicableTo);
  const swatchWidth = hasBothGender ? LEGEND_SWATCH_SIZE * 2 + 4 : LEGEND_SWATCH_SIZE;
  const contentWidth = LEGEND_PADDING * 2 + swatchWidth + 8 + LEGEND_LABEL_WIDTH;

  // Investigations add a subheading row plus one row per entry.
  const investigationRows = investigations.length > 0 ? investigations.length + 1 : 0;
  const contentHeight =
    LEGEND_PADDING * 2 +
    LEGEND_TITLE_HEIGHT +
    entries.length * LEGEND_ROW_HEIGHT +
    investigationRows * LEGEND_ROW_HEIGHT;

  const parts: string[] = [];

  // Background.
  parts.push(
    `<rect x="0" y="0" width="${num(contentWidth)}" height="${num(
      contentHeight,
    )}" fill="#ffffff" stroke="${SYMBOL_COLOR}" stroke-width="1" rx="4" ry="4" />`,
  );

  // Title.
  parts.push(
    `<text x="${LEGEND_PADDING}" y="${LEGEND_PADDING + 14}" font-size="14" font-family="${escapeXml(
      LABEL_FONT_FAMILY,
    )}" font-weight="bold" fill="${SYMBOL_COLOR}">Key</text>`,
  );

  // Condition entries.
  entries.forEach((entry, idx) => {
    const rowY = LEGEND_PADDING + LEGEND_TITLE_HEIGHT + idx * LEGEND_ROW_HEIGHT;
    const showBoth = !entry.applicableTo;
    const showSquare = entry.applicableTo === 'man' || showBoth;
    const showCircle = entry.applicableTo === 'woman' || showBoth;

    if (showSquare) {
      parts.push(renderLegendSwatch(LEGEND_PADDING, rowY, GenderIdentity.Man, entry));
    }
    if (showCircle) {
      const sx = showBoth ? LEGEND_PADDING + LEGEND_SWATCH_SIZE + 4 : LEGEND_PADDING;
      parts.push(renderLegendSwatch(sx, rowY, GenderIdentity.Woman, entry));
    }

    parts.push(
      `<text x="${LEGEND_PADDING + swatchWidth + 8}" y="${num(
        rowY + 4 + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" fill="${SYMBOL_COLOR}">${escapeXml(`= ${entry.name}`)}</text>`,
    );
  });

  // Investigations subheading + rows.
  if (investigations.length > 0) {
    const baseY = LEGEND_PADDING + LEGEND_TITLE_HEIGHT + entries.length * LEGEND_ROW_HEIGHT;
    parts.push(
      `<text x="${LEGEND_PADDING}" y="${num(
        baseY + 12,
      )}" font-size="12" font-family="${escapeXml(
        LABEL_FONT_FAMILY,
      )}" font-weight="bold" fill="${SYMBOL_COLOR}">Investigations</text>`,
    );
    investigations.forEach((text, idx) => {
      const rowY = baseY + (idx + 1) * LEGEND_ROW_HEIGHT;
      parts.push(
        `<text x="${LEGEND_PADDING}" y="${num(
          rowY + 12,
        )}" font-size="12" font-family="${escapeXml(
          LABEL_FONT_FAMILY,
        )}" fill="${SYMBOL_COLOR}">${escapeXml(text)}</text>`,
      );
    });
  }

  const markup = `<g transform="translate(${num(legendX)}, ${num(legendY)})">${parts.join(
    '',
  )}</g>`;

  return {
    markup,
    right: legendX + contentWidth,
    bottom: legendY + contentHeight,
  };
}
```

- [ ] **Step 5: Update the `renderLegend` call site**

In `buildPedigreeSvg` (~line 858), pass the derived set:

```ts
  const legend = renderLegend(
    entries,
    collectInvestigations(individuals),
    legendX,
    legendY,
  );
```

> `individuals` is already in scope at the call site (it is iterated just below for the viewBox). If it is named differently there, use that array of `Individual`.

- [ ] **Step 6: Run to verify green**

Run: `npx vitest run src/io/svgExport.test.ts`
Expected: PASS — both new tests plus the existing export tests.

- [ ] **Step 7: Commit**

```bash
git add src/io/svgExport.ts src/io/svgExport.test.ts
git commit -m "feat: render investigations in SVG export symbols and key"
```

---

### Task 4: Live canvas — symbol annotation lines

**Files:**
- Modify: `src/components/canvas/symbols/SymbolLabel.tsx`

**Interfaces:**
- Consumes: `Individual.investigations` (Task 2).
- Produces: investigation lines appended to the on-canvas label stack below the symbol.

- [ ] **Step 1: Append investigations to the label lines**

In `src/components/canvas/symbols/SymbolLabel.tsx`, in the `useMemo` that builds `result`, after the conditions loop and before `return result;`:

```ts
      // Subsequent lines: conditions with age of onset
      for (const condition of individual.conditions) {
        if (condition.ageOfOnset != null) {
          result.push(`${condition.name} (dx ${condition.ageOfOnset})`);
        } else {
          result.push(condition.name);
        }
      }

      // Free-text investigations (genetic tests etc.)
      for (const investigation of individual.investigations) {
        const value = investigation.trim();
        if (value) result.push(value);
      }

      return result;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Verify in the dev preview**

Start the dev server (`preview_start` / `npm run dev`). Add an individual, open its properties — for now investigations can be set by temporarily editing state, or defer visual confirmation until Task 6 wires the editor. Confirm an individual with `investigations: ['BRCA1 +']` shows that line below the symbol. Capture a screenshot.

> If the editor (Task 6) is not yet built, this step's visual check can be confirmed jointly at the end of Task 6. The code change here is independently correct and committable.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/symbols/SymbolLabel.tsx
git commit -m "feat: show investigation lines beside the symbol on canvas"
```

---

### Task 5: Live canvas — Investigations key subheading

**Files:**
- Modify: `src/components/canvas/LegendLayer.tsx` (accept `investigations` prop, render subheading)
- Modify: `src/components/canvas/CanvasContainer.tsx` (derive set, pass prop)

**Interfaces:**
- Consumes: `collectInvestigations` (Task 1), `LegendLayer` props.
- Produces: `LegendLayer` renders an "Investigations" subheading + rows; visible whenever entries OR investigations exist.

- [ ] **Step 1: Extend `LegendLayer` props and render the subheading**

In `src/components/canvas/LegendLayer.tsx`:

Add `investigations` to the props interface:

```ts
interface LegendLayerProps {
  legendConfig: LegendConfig;
  investigations: string[];
  onMove: (position: Position) => void;
  bounds?: CanvasBounds | null;
}
```

Update the component signature and the early-return guard:

```ts
export const LegendLayer: React.FC<LegendLayerProps> = React.memo(
  ({ legendConfig, investigations, onMove, bounds }) => {
    if (legendConfig.entries.length === 0 && investigations.length === 0) return null;
```

Update `contentHeight` to reserve space for the subheading + rows:

```ts
    const investigationRows = investigations.length > 0 ? investigations.length + 1 : 0;
    const contentHeight =
      PADDING * 2 +
      TITLE_HEIGHT +
      legendConfig.entries.length * ROW_HEIGHT +
      investigationRows * ROW_HEIGHT;
```

After the `{legendConfig.entries.map(...)}` block and before the closing `</Group>`, add the subheading + rows:

```ts
        {investigations.length > 0 && (
          <>
            <Text
              x={PADDING}
              y={PADDING + TITLE_HEIGHT + legendConfig.entries.length * ROW_HEIGHT + 4}
              text="Investigations"
              fontSize={12}
              fontFamily={LABEL_FONT_FAMILY}
              fontStyle="bold"
              fill={SYMBOL_COLOR}
            />
            {investigations.map((text, idx) => (
              <Text
                key={text}
                x={PADDING}
                y={
                  PADDING +
                  TITLE_HEIGHT +
                  legendConfig.entries.length * ROW_HEIGHT +
                  (idx + 1) * ROW_HEIGHT +
                  4
                }
                text={text}
                fontSize={12}
                fontFamily={LABEL_FONT_FAMILY}
                fill={SYMBOL_COLOR}
                width={contentWidth - PADDING * 2}
                ellipsis
                wrap="none"
              />
            ))}
          </>
        )}
```

- [ ] **Step 2: Derive and pass the set in `CanvasContainer`**

In `src/components/canvas/CanvasContainer.tsx`, add the import:

```ts
import { collectInvestigations } from '../../utils/investigations';
```

Near the other derived memos (e.g. beside `bounds`, ~line 279), add:

```ts
    const investigations = useMemo(
      () => collectInvestigations(individualsList),
      [individualsList],
    );
```

Update the `<LegendLayer>` JSX (~line 382):

```tsx
              <LegendLayer
                legendConfig={legendConfig}
                investigations={investigations}
                onMove={moveLegend}
                bounds={bounds}
              />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Verify in the dev preview**

With an individual carrying `investigations`, confirm the key shows an "Investigations" subheading listing the distinct sorted set below the condition rows, and that the box grew to fit. Capture a screenshot. Confirm the key still renders when there are conditions but no investigations (no stray subheading).

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/LegendLayer.tsx src/components/canvas/CanvasContainer.tsx
git commit -m "feat: show Investigations subheading in the on-canvas key"
```

---

### Task 6: Properties panel — investigations editor with autocomplete

**Files:**
- Modify: `src/components/ui/PropertiesPanel.tsx`
- Modify: `src/components/ui/PropertiesPanel.module.css` (only if a new class is needed; reuse existing `conditionItem` / `removeButton` / `input` / `field` / `section` / `sectionTitle`)

**Interfaces:**
- Consumes: `collectInvestigations` (Task 1), `individual.investigations`, the existing `update` helper and `individuals` record already in the component.
- Produces: an "Investigations" section that adds/removes free-text entries and offers chart-wide autocomplete via a native `<datalist>`.

- [ ] **Step 1: Add import + local state for the add input**

In `src/components/ui/PropertiesPanel.tsx`, add the helper import:

```ts
import { collectInvestigations } from '../../utils/investigations';
```

Add state near the other `useState` hooks (~line 33):

```ts
  const [investigationText, setInvestigationText] = useState('');
```

Add an add handler near `submitNote` (~line 58):

```ts
  const submitInvestigation = useCallback(() => {
    if (!individual) return;
    const value = investigationText.trim();
    if (!value) return;
    if (individual.investigations.includes(value)) {
      setInvestigationText('');
      return;
    }
    update({ investigations: [...individual.investigations, value] });
    setInvestigationText('');
  }, [individual, investigationText, update]);
```

- [ ] **Step 2: Derive the chart-wide options**

After `const individual = ... ;` is known to be non-null (after the early `return` guard at ~line 68), add:

```ts
  const investigationOptions = collectInvestigations(Object.values(individuals));
```

- [ ] **Step 3: Render the Investigations section**

Add a new section in the JSX, after the "Conditions" section's closing `</div>` and its following `<div className={styles.divider} />`:

```tsx
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Investigations</div>

        <div className={styles.field}>
          {individual.investigations.map((investigation, idx) => (
            <div key={investigation} className={styles.conditionItem}>
              <span className={styles.conditionName}>{investigation}</span>
              <button
                className={styles.removeButton}
                onClick={() =>
                  update({
                    investigations: individual.investigations.filter((_, i) => i !== idx),
                  })
                }
              >
                &times;
              </button>
            </div>
          ))}

          <input
            className={styles.input}
            list="investigation-options"
            value={investigationText}
            placeholder="e.g. BRCA1 +"
            onChange={(e) => setInvestigationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitInvestigation();
              if (e.key === 'Escape') setInvestigationText('');
            }}
            onBlur={submitInvestigation}
          />
          <datalist id="investigation-options">
            {investigationOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={styles.divider} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Verify the full flow in the dev preview**

Confirm end-to-end: select an individual → type `BRCA1 +` in Investigations → Enter → it appears in the list, beside the symbol (Task 4), and in the key (Task 5). Select a second individual → the add input's datalist suggests `BRCA1 +`. Pick it → both individuals show it; the key still lists it once. Remove it from both → it disappears from the key. Capture screenshots of the editor and the canvas.

- [ ] **Step 6: Run the full suite + commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add src/components/ui/PropertiesPanel.tsx src/components/ui/PropertiesPanel.module.css
git commit -m "feat: add investigations editor with chart-wide autocomplete"
```

---

## Self-Review

**Spec coverage:**
- Free-text `investigations: string[]` on Individual → Task 2. ✅
- Remove dormant `GeneticTest`/`geneticTests` → Task 2. ✅
- `collectInvestigations` pure helper (distinct, sorted) → Task 1. ✅
- Per-symbol annotation on canvas → Task 4; in SVG export → Task 3. ✅
- Editor with add/remove + datalist autocomplete from chart-wide set → Task 6. ✅
- Key "Investigations" subheading on canvas → Task 5; in SVG export → Task 3. ✅
- Persistence: JSON serialise (automatic) + import normalisation → Task 2; PED initializer cleanup → Task 2. ✅
- Tests: helper, SVG export render, jsonIO backward-compat → Tasks 1-3; Konva verified via preview → Tasks 4-6. ✅
- Scope guard (no enums/dates/glyphs/manual key editing) → respected throughout. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✅

**Type consistency:** `collectInvestigations(individuals: Individual[]): string[]` used identically in Tasks 3, 5, 6. `renderLegend(entries, investigations, legendX, legendY)` signature matches its call site (Task 3 Steps 4-5). `LegendLayerProps.investigations: string[]` matches the prop passed in `CanvasContainer` (Task 5). `investigations: []` defaulted in `createDefaultIndividual` (Task 2) matches the field type. ✅
