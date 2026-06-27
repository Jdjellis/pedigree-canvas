# Bennett / NSGC Pedigree Nomenclature Standards

**Authoritative sources:**
- Bennett RL et al. (1995) *J Genet Couns* 4(4):267–279 — original standards
- Bennett RL et al. (2008) *J Genet Couns* 17(5):424–433 (PMID 18792771, DOI 10.1007/s10897-008-9169-9) — first update
- Bennett RL et al. (2022) *J Genet Couns* 31(6):1238–1248 (PMID 36106433, DOI 10.1002/jgc4.1621) — sex/gender focused revision
- NSGC Practice Resources: https://www.nsgc.org/Policy-Research-and-Publications/Practice-Guidelines

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
| Stillborn | Symbol + slash + "SB" label | `VitalStatus.Stillborn` |

---

## 5. Pregnancy Outcomes (Triangle Symbols)

Pregnancies not carried to term render as a small **triangle** symbol:

| Outcome | Abbreviation | Convention |
|---------|-------------|-----------|
| Spontaneous abortion / miscarriage | SAB | Open triangle; gestational age noted if known |
| Termination of pregnancy (elective) | TOP | Open triangle; filled if affected fetus |
| Ectopic pregnancy | ECT | Triangle + "ECT" annotation |
| Stillbirth | SB | Treated as `VitalStatus.Stillborn`; symbol with deceased slash |

App enums: `PregnancyOutcome.SAB`, `.TOP`, `.ECT`, `.SB`.

Ongoing / live pregnancy: diamond symbol (sex unknown) or sex-specific symbol when known, with gestational age annotated (e.g. "GA: 22 wk").

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
| Adoption | Dashed brackets or dashed lines around adoptee symbol | `RelationshipType.Adoption` |
| Infertility / no offspring | Two vertical tick-marks through the mating line | *(not yet modelled as a relationship type)* |

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

- **Adopted into family**: Symbol enclosed in **square brackets** (or dashed bracket lines).
- **Adopted out of family**: Symbol with bracket + arrow indicating direction of adoption.

App: `ParentChildRelationship.isAdopted = true` and `RelationshipType.Adoption` for the link.

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
- Parent-child and adoption links
- MZ / DZ / unknown twin groups
- Pregnancy outcomes: SAB, TOP, ECT, SB
- Vital status: alive, deceased, stillborn
- Individual numbering within generations (`generationOrder`)
- Investigations (genetic test label + result)
- Text annotations (free-form canvas text)

### Gaps / Not yet modelled
- **Carrier notation**: No dedicated `isCarrier` or `carrierStatus` field; must be approximated with a condition quarter fill + legend entry.
- **Infertility / no-offspring line**: No `RelationshipType` value for a couple with documented infertility.
- **Adoption-out notation**: `isAdopted` covers adoption-in; adoption-out (placing a child with another family) has no distinct representation.
- **Individual diagnosis uncertainty**: No structured `diagnosisUncertain` flag; convention is to use a notes field.
