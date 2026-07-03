# Product

## Register

product

## Users

Geneticists, genetic counsellors, and clinical-genetics trainees. They reach for
this mid-consultation or when writing up a family history — often under time
pressure, with a patient in front of them or notes to file. Their context is a
browser tab alongside a clinical record system, not a design tool.

The job to be done: **turn a spoken or recorded family history into a
standards-compliant pedigree, then get it out** — into the patient record, a
referral, a teaching slide, or a `.ped` file for downstream software. Accuracy
and legibility matter more than polish; the artifact is a clinical document, and
it has to be defensible against the source record.

## Product Purpose

Pedigree Canvas is a **local-first, in-browser clinical pedigree drawing tool**.
It exists because the alternatives are bad: drawing pedigrees by hand is slow and
inconsistent, and general-purpose diagram tools (Excalidraw, Lucidchart) don't
know Bennett/NSGC nomenclature — the symbols, condition shading, relationship
lines, twins, consanguinity, adoption, and test-result annotations that make a
pedigree clinically valid.

It lets a counsellor build a standardised family pedigree with the correct
symbols and relationships, shade conditions with a configurable legend, annotate
genetic test results, and export to PDF, PNG, SVG, `.ped`, and JSON. Everything
runs client-side and autosaves to the browser — no account, no server, nothing
leaving the machine.

Success looks like: a counsellor produces an accurate, standards-compliant
pedigree faster and more legibly than by hand, trusts that the data never left
their browser, and can hand the export straight into a clinical workflow.

## Brand Personality

**Precise · calm · approachable.** A quiet professional instrument, not a toy and
not a fortress. The interface should feel confident and unhurried: it recedes so
the pedigree is the focus, surfaces the right control at the right moment, and
never shouts.

- **Voice:** plain and clinical-clear. Name things the way a geneticist would
  ("proband", "consanguineous", "MZ twins"), but never jargon for its own sake
  and never cute. Error and help copy is direct and reassuring.
- **Emotional goal:** trust and low friction. The user should feel the tool is
  competent and on their side — approachable enough that a first-timer isn't
  intimidated, rigorous enough that a senior clinician trusts the output.
- **Heritage:** it descends from Excalidraw (floating islands, violet accent, a
  hint of hand-drawn warmth via the Caveat annotation font). Keep the warmth and
  the get-out-of-the-way ergonomics; drop the whiteboard casualness where clinical
  seriousness is required.

## Anti-references

- **Dated enterprise medical software.** Dense EHR/LIMS chrome, tiny gray
  toolbars packed edge to edge, modal soup, 2005-era clinical UI. This tool earns
  trust through calm and clarity, not through looking "serious" by being cluttered.
- **Sterile / cold clinical.** Stark, all-business, intimidating. The audience is
  human and often stressed; warmth (carried by type, spacing, and copy — not
  decoration) is a feature, not a compromise of rigor.
- **Generic SaaS dashboard.** Card grids, gradient hero-metrics, purple-gradient
  buttons, tracked-uppercase eyebrows above every section. This is a focused canvas
  tool, not a marketing dashboard.
- **Playful / gamified.** The Excalidraw lineage invites a *touch* of hand-drawn
  warmth, but stop well short of mascots, emoji, bounce animations, or bright
  candy palettes. It documents clinical reality.

## Design Principles

1. **The pedigree is the hero.** Chrome recedes; the canvas is full-bleed. UI
   appears on demand — radial menu on the symbol, floating islands at the edges,
   properties on selection — rather than framing the workspace permanently.
2. **Standards are non-negotiable.** Bennett/NSGC nomenclature governs every
   symbol, fill, line, and annotation decision. Design never trades clinical
   correctness for aesthetics — e.g. symbol fill is semantic, so there is no
   dark-mode inversion; comfort themes re-tint chrome only.
3. **Local-first, private by default.** Nothing leaves the browser. Communicate
   that trust plainly and visibly rather than assuming the user knows.
4. **Low friction under time pressure.** Common actions are one gesture away,
   keyboard-first, and forgiving — undo/redo, autosave, and non-destructive
   defaults, because the user is thinking about the family, not the tool.
5. **Calm confidence, not clinical coldness.** Legible and unhurried without being
   sterile or playful. Warmth lives in typography, spacing, and copy — never in
   decoration that competes with the pedigree.

## Accessibility & Inclusion

- **Baseline: WCAG 2.1 AA** — contrast, keyboard operability, visible focus, and
  labelled controls throughout the chrome.
- **Color-blind-safe encoding is mandatory, not optional.** Condition shading and
  the legend encode clinical meaning; color must never be the *sole* channel —
  pair it with pattern, position, or label. (~8% of male patients-of-audience are
  red-green color-blind, and so are counsellors.)
- **`prefers-reduced-motion` respected** on every animation, with a crossfade or
  instant fallback. Comfort themes (light / warm / dim) already address visual
  fatigue and blue-light sensitivity for all-day use.
