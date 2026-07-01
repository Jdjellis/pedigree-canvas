# Bennett / NSGC Pedigree Nomenclature Standards

**Authoritative sources:**
- Bennett RL et al. (1995) *J Genet Couns* 4(4):267–279 — original standards
- Bennett RL et al. (2008) *J Genet Couns* 17(5):424–433 (PMID 18792771, DOI 10.1007/s10897-008-9169-9) — first update
- Bennett RL et al. (2022) *J Genet Couns* 31(6):1238–1248 (PMID 36106433, DOI 10.1002/jgc4.1621) — sex/gender focused revision
- NSGC Practice Resources: https://www.nsgc.org/Policy-Research-and-Publications/Practice-Guidelines

> **Local copy of the 2022 source PDF** (offline reference for the symbol/line figures, esp. Figure 3): [`references/bennett-2022-nsgc-standardized-pedigree-nomenclature.pdf`](references/bennett-2022-nsgc-standardized-pedigree-nomenclature.pdf).

---

## 1. Individual Symbols (Shapes)

Symbol shape encodes **gender identity** (2022 revision — not sex assigned at birth):

| Shape | Gender identity | App enum |
|-------|----------------|----------|
| Square □ | Man | `GenderIdentity.Man` |
| Circle ○ | Woman | `GenderIdentity.Woman` |
| Diamond ◇ | Non-binary, unknown, or unspecified | `GenderIdentity.NonBinary` / `GenderIdentity.Unknown` |
| Triangle △ | Pregnancy loss (not carried to term) | `isPregnancy && pregnancyOutcome !== null` |

**Key 2022 NSGC distinction**: the symbol represents **gender identity**, not sex. For cisgender individuals the symbol implicitly indicates sex assigned at birth (SAAB) and no annotation is needed. For transgender or intersex individuals, SAAB is annotated separately below the symbol.

---

## 2. Sex Assigned at Birth (SAAB) Annotation

Only annotated when **clinically relevant and different from implied SAAB** (i.e., transgender or intersex individuals):

| Abbreviation | Meaning | App enum |
|---|---|---|
| AMAB | Assigned Male At Birth | `SexAssignedAtBirth.AMAB` |
| AFAB | Assigned Female At Birth | `SexAssignedAtBirth.AFAB` |
| UAAB | Unassigned/Uncertain At Birth | `SexAssignedAtBirth.UAAB` |

Annotated in parentheses below the symbol, e.g. `(AFAB)`. Cisgender individuals omit this annotation entirely.

---

## 3. Fill / Shading — Affected & Carrier Status

### Affected status

| Fill | Meaning |
|------|---------|
| Open (unfilled) | Unaffected — no known expression of the condition |
| Solid black (full fill) | Affected — expresses the condition being documented |
| Quarter fill (top-left / top-right / bottom-left / bottom-right) | Affected with one of multiple documented conditions; each quarter maps to one legend entry |
| Half-filled (left half) | Carrier — **obligate/inferred carrier** (not genetically confirmed) |
| Dot in centre | Carrier — **confirmed carrier** (genetically tested); typically used for X-linked female carriers |

### 2022 carrier-notation clarification

The 2022 revision explicitly distinguishes:
- **Half-filled symbol** → obligate or inferred carrier (reasoning from pedigree structure alone)
- **Dot in centre** → confirmed carrier (laboratory-confirmed, genetically tested)

### App implementation: quarter-based multi-condition shading

The app uses a **legend-driven quarter system** (`QuarterPosition` × `LegendEntry`). Each condition maps to a quarter position, fill colour, and fill pattern (`solid`, `diagonalLines`, `dots`, `crosshatch`, `horizontalStripes`, `verticalStripes`). A legend at the foot of the pedigree labels each entry.

> **Gap**: The app has no dedicated `carrierStatus` field. A carrier should currently be modelled as a condition with a specific quarter fill and legend entry, or a future `isCarrier` boolean could trigger a half-fill or dot overlay.

---

## 4. Vital Status

| Status | Visual | App enum |
|--------|--------|----------|
| Alive | Normal symbol | `VitalStatus.Alive` |
| Deceased | Diagonal slash through symbol (lower-left → upper-right) | `VitalStatus.Deceased` |
| Stillborn | **Sex-specific symbol** (□/○/◇) + deceased slash + "SB" label + gestational age. **Not a triangle** — the triangle is reserved for earlier pregnancy loss (§5). | `VitalStatus.Stillborn` (+ `Individual.gestationalAge`) |

---

## 5. Pregnancy Outcomes (Triangle Symbols)

Pregnancies **not carried to term** render as a small **triangle** symbol:

| Outcome | Abbreviation | Convention |
|---------|-------------|-----------|
| Spontaneous abortion / miscarriage | SAB | Open triangle; gestational age noted if known |
| Termination of pregnancy (elective) | TOP | Open triangle; filled if affected fetus |
| Ectopic pregnancy | ECT | Triangle + "ECT" annotation |

App enums: `PregnancyOutcome.SAB`, `.TOP`, `.ECT`.

> **Stillbirth is *not* a triangle.** A stillbirth (SB) is a later-gestation loss
> where the sex is usually known, so per Bennett/NSGC it is drawn with the
> sex-specific symbol and a deceased slash — see §4 (`VitalStatus.Stillborn`).
> The triangle here is reserved for pregnancies where the fetus was not carried
> to term (SAB/TOP/ECT). Modelling a stillbirth as a triangle is a common
> conflation but is contrary to the standard.

Ongoing / live pregnancy: diamond symbol (sex unknown) or sex-specific symbol when known, with gestational age annotated (e.g. "GA: 22 wk").

> **In the app:** the person properties panel has a **Pregnancy** section — tick
> "Pregnancy not carried to term", choose the outcome (SAB / TOP / ECT), and
> optionally record a gestational age. The outcome abbreviation and "GA: … wk"
> are rendered beneath the triangle; a TOP with an affected fetus is shaded via
> the usual condition mechanism.

---

## 6. Relationship Lines

| Line type | Visual description | App enum |
|-----------|-------------------|----------|
| Partnership (mating) | Single horizontal line between partners | `RelationshipType.Partnership` |
| Consanguinity | **Double** horizontal line between partners who are biologically related | `RelationshipType.Consanguinity` |
| Separation / divorce | Single line with a **slash** through it | `RelationshipType.Separation` |
| Line of descent | Vertical line dropping from centre of mating line | — (computed from partnership) |
| Sibship line | Horizontal line from which siblings drop vertically | — (computed from partnership children) |
| Parent-child | Vertical from sibship line down to child's symbol | `RelationshipType.ParentChild` |
| Adoption | **Brackets** enclose the adoptee for *all* adoptions; line of descent is **dashed** from adoptive parents and **solid** from biological parents (no arrow — see §9) | `Individual.adopted` + `ParentChildRelationship.isAdoptive` |
| Infertility / no offspring | A short vertical stub hangs from the mating-line midpoint, ended by a **single** cross-bar ("no children by choice or reason unknown") or **two** parallel cross-bars (infertility, with an optional cause annotated below) | `PartnershipRelationship.childlessStatus` (`'noChildren'` \| `'infertility'`) + `childlessReason` |

---

## 7. Proband and Consultand

| Role | Visual | App field |
|------|--------|-----------|
| **Proband** | Arrow (→) pointing to lower-left corner of symbol; labelled "P" | `Individual.isProband` |
| **Consultand** | Arrow pointing to lower-left corner; labelled "C" | `Individual.isConsultand` |

- **Proband**: the first affected family member to come to medical attention — the index case.
- **Consultand**: the person seeking genetic counselling; may or may not be the proband.
- Only one proband per pedigree (by convention). Multiple consultands are possible.

---

## 8. Twin Notation

| Type | Visual | App enum |
|------|--------|----------|
| Monozygotic (identical) | Two lines meeting at a **single point** on the sibship line, joined by a horizontal bar at the junction | `TwinType.Monozygotic` |
| Dizygotic (fraternal) | Two lines from **separate points** on the sibship line; no bar | `TwinType.Dizygotic` |
| Unknown zygosity | Like MZ (single point) but with a "?" | `TwinType.Unknown` |

---

## 9. Adoption Notation

Per **Bennett et al. 2022, Figure 3 ("Pedigree line definitions"), p.1242** — verbatim legend:

> "Brackets used for all adoptions. Adoptive and biological parents denoted by dashed and solid lines of descent, respectively."

The figure gives three labelled examples — *Adopted Out*, *Adopted In*, and *Adopted By Relative* — all of which enclose the adoptee in **square brackets** and differ **only in the line-of-descent style**:

- **Brackets** (solid square brackets) enclose the adopted individual in *every* adoption case. The brackets are a property of the **person** ("was adopted") and are drawn even when no parents are charted.
- **Line of descent** encodes the nature of *each* parent relationship, per edge:
  - **Dashed** line → **adoptive** parents (non-biological).
  - **Solid** line → **biological** parents.
- **There is no arrow.** "Adopted in" vs "adopted out" is *not* a separate symbol — it is emergent from which parents are charted and the line style of that edge:
  - **Adopted in** = brackets + a **dashed** descent line to the (adoptive) parents shown.
  - **Adopted out** = brackets + a **solid** descent line to the (biological) parents shown.
- **Both families at once** (the most information-complete case): the same bracketed individual carries a **dashed** edge to the adoptive couple *and* a **solid** edge to the biological couple — simultaneously adopted-in to one family and adopted-out of another, with no extra notation.

> ⚠️ **Correction (2026-06):** earlier revisions of this doc and issue #56 described adopted-out as "bracket + **arrow**". That is **not** NSGC/Bennett — the 2022 figure distinguishes adoption purely by **dashed (adoptive) vs solid (biological) lines of descent**, with no arrow. (Some non-NSGC tools use an arrow; we follow the verified standard.) Verified against the local source PDF: [`references/bennett-2022-nsgc-standardized-pedigree-nomenclature.pdf`](references/bennett-2022-nsgc-standardized-pedigree-nomenclature.pdf), Figure 3.

App: brackets are driven by `Individual.adopted` (see {@link AdoptionBrackets}). The per-edge dashed/solid line style is carried on the parent-child link as `ParentChildRelationship.isAdoptive` (`true` → adoptive/dashed, `false`/absent → biological/solid).

---

## 10. Generation and Individual Numbering

**Generation labels**: Roman numerals on the left margin, oldest generation at the top (I = oldest, II = next, etc.).

**Individual labels**: Arabic numerals left-to-right within each generation (1, 2, 3…).

**Reference format**: `<generation>-<position>` e.g. `II-3` = third individual in generation II.

App: `generationOrder: string[][]` in `PedigreeDocument` encodes this order. `individualNumber` prop passed to `PedigreeSymbol`.

---

## 11. Sub-symbol Annotations

Standard annotations below (or beside) the individual's symbol:

| Annotation | Convention |
|------------|-----------|
| Name | Full name or initials |
| Age | Current age (integer) or birth year |
| Age at death | `d.52` (died aged 52) |
| Condition | Diagnosis name (matches legend) |
| SAAB | `(AMAB)` / `(AFAB)` for transgender/intersex individuals only |
| Gestational age | `GA: 20 wk` for pregnancies |
| Investigation result | Short identifier, e.g. `BRCA1 +` or `Karyotype: 46,XX` |
| Notes | Free text; typically for complex or uncertain findings |
| `?` | Uncertain diagnosis or unknown status |

App: `displayName`, `age`, `dateOfBirth`, `causeOfDeath`, `investigations[]`, `annotations[]`, `notes`.

---

## 12. Layout Conventions

1. **Top-to-bottom generational flow** — oldest generation at top.
2. **Left-to-right birth order** — within a generation, individuals are ordered by birth date left to right.
3. **Partners at the same vertical level** — both individuals in a couple share the same horizontal plane.
4. **Lines do not cross** — reorder siblings or adjust layout to eliminate crossing lines where possible.
5. **Proband's nuclear family centred** — the proband's parents, siblings, and children are placed centrally.
6. **Legend below or beside the pedigree** — all non-standard fills and patterns must be keyed.
7. **Symbols uniform size** — all individual symbols are the same size (affected individuals are not drawn larger).

---

## 13. Legend

Every pedigree that uses shading, fill patterns, or non-standard notation **must include a legend** that maps each visual element to a condition or status name.

App: `LegendConfig` with `LegendEntry[]` (id, quarter, fillColor, fillPattern, name, applicableTo). Rendered by `LegendLayer`.

---

## 14. Implementation Gap Analysis

### Implemented ✓
- Basic shapes: square, circle, diamond, triangle (for pregnancy loss)
- Deceased slash (`DeceasedSlash`)
- Proband and consultand arrows (`ProbandArrow`)
- Sex assigned at birth as separate annotation (2022-compliant)
- Quarter-based multi-condition shading with fill patterns and legend
- Partnership, consanguinity, separation relationship types
- Consanguinity double line with optional degree-of-relationship annotation (`PartnershipRelationship.consanguinityDegree`)
- Parent-child and adoption links; adopted individuals are drawn in square brackets (`Individual.adopted`, `AdoptionBrackets`), and each line of descent is **dashed for adoptive** parents / **solid for biological** parents via `ParentChildRelationship.isAdoptive` (adopted-in vs adopted-out). Showing both families for one child at once is deferred to multi-parentage (#64).
- MZ / DZ / unknown twin groups (with the `?` rendered for unknown zygosity); created via the "Mark selected as twins" command, zygosity editable in the properties panel
- Pregnancy outcomes: SAB, TOP, ECT (triangle), set via the properties panel's Pregnancy section with an outcome abbreviation + optional gestational age annotation
- Vital status: alive, deceased, stillborn (stillborn drawn with the sex symbol + deceased slash + "SB" + gestational age)
- Childless unions: infertility (double cross-bar + optional cause) and no children by choice (single cross-bar) via `PartnershipRelationship.childlessStatus`
- Individual numbering within generations (`generationOrder`)
- Investigations (genetic test label + result)
- Text annotations (free-form canvas text)

### Gaps / Not yet modelled
- **Carrier notation**: No dedicated `isCarrier` or `carrierStatus` field; must be approximated with a condition quarter fill + legend entry.
- **Individual diagnosis uncertainty**: No structured `diagnosisUncertain` flag; convention is to use a notes field.
