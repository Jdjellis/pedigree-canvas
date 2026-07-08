# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Consanguinity is now independent of relationship status (issue #153). The
  relationship properties panel splits the old three-way Partnership /
  Separated / Consanguineous toggle into a **Status** control (Partnership ·
  Separated) plus a separate **Consanguineous** checkbox, so a union can be
  both separated *and* consanguineous — drawn as a double relationship line
  with the separation slash. Stored as `PartnershipRelationship.consanguineous`
  (boolean) alongside `type`; the canvas and SVG export render the combined
  symbol. Documents saved under the old `type: 'consanguinity'` enum migrate
  automatically on load to `{ type: 'partnership', consanguineous: true }`,
  preserving any degree-of-relationship annotation.

### Added
- Individual-level childlessness: a person can be marked infertile or childless
  (no partner drawn) from their properties panel, drawn as a stub below the
  symbol ended by a double or single cross-bar — identical to the partnership
  marker, per NSGC/Bennett. Suppressed once the person has children. The
  symbol's label stack (name, investigations, and the childless cause) is pushed
  below the cross-bars so nothing overlaps the marks.
- Help/shortcuts hint that a relationship line can be clicked to edit it
  (relationship type, consanguinity, infertility), so those line-level editors
  are discoverable.
- Infertility and “no children by choice” markers on a partnership: a stub
  below the relationship line ended by a double cross-bar (infertility, with an
  optional cause) or a single bar (no children), per NSGC/Bennett. Editable in
  the connection properties panel (issue #107).
- Gestational-age field for a stillbirth, shown in the person properties panel
  when the vital status is Stillborn (issue #106).
- MIT `LICENSE`.
- SEO, Open Graph, and Twitter card metadata plus JSON-LD `SoftwareApplication`
  structured data.
- App favicon (`public/favicon.svg`) and a rasterised 1200×630 social card
  (`public/og-image.png`), replacing the default Vite icon (issue #78).
- Clinical-use disclaimer in the README and in the in-app privacy popover.
- Public marketing landing page served at the site root (`/`): a self-contained
  static page with a hand-drawn hero pedigree, the Bennett/NSGC symbol legend,
  feature cards, and an above-the-fold local-first privacy line. It carries the
  `SoftwareApplication` structured data and is the SEO-primary surface.
- Discoverability for crawlers: `public/sitemap.xml` (listing `/` and `/app/`),
  `public/robots.txt` with a `Sitemap:` line, and an updated `llms.txt` that
  distinguishes the overview page from the editor.
- An “About Pedigree Canvas” link in the in-app Help & About overlay, opening the
  landing page at `/`.

### Changed
- The canvas editor now lives at `/app/` instead of the site root, freeing `/`
  for the marketing landing page. The editor page has its own title and
  self-canonicals to `/app/` (no duplicate structured data), and the build is now
  a two-page Vite build. Autosaved pedigrees are unaffected — browser storage is
  scoped to the origin, not the path.
- The “no children by choice” partnership marker now also carries an optional
  free-text cause/description (e.g. “vasectomy”), matching the infertility
  marker’s cause field and rendered below the bar.
- Stillbirth is now drawn to standard: the sex-specific symbol with a deceased
  slash plus an “SB” label and gestational age — never a triangle. The unused
  `PregnancyOutcome.SB` (which would have rendered a triangle) was removed; the
  triangle is reserved for earlier pregnancy loss (SAB/TOP/ECT), per Bennett/NSGC
  (issue #106).

### Fixed
- Changing a childless status (on an individual or a partnership) no longer
  shows the previously entered cause under the wrong status. The cause is now
  tracked per status: switching between "no children" and "infertility" hides
  the other status's cause, and switching back — or re-selecting a status after
  "None" — restores the text you typed, so an accidental status change never
  discards it.
- The eraser tool no longer deletes the last remaining individual, which left an
  empty canvas with no way to add a new person. Erasing stops at the final
  individual, matching the existing guard on keyboard delete (issue #103).
- Erasing a person no longer leaves a stranded connector. A union left with no
  partners and a single child (e.g. after erasing a sole parent) is now pruned
  instead of rendering a descent stub hanging above a lone symbol; a bare sibship
  bar is still kept for two or more orphaned siblings (issue #104).
- **Add Child** on an individual who belongs to more than one union no longer
  silently attaches the child to whichever union happened to be first in
  iteration order. When 2+ unions exist, a union picker now prompts for which
  union the child belongs to (issue #97).

## [0.1.0] — Unreleased

First public release candidate. **Pedigree Canvas** — a local-first clinical
pedigree drawing tool with NSGC 2022 standardised symbols, relationship lines
(partnerships, consanguinity, twins, adoption, sibships), condition shading with
a configurable legend, test-result annotations, and export to PDF, PNG, SVG,
`.ped`, and JSON.
