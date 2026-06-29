# Properties Panel UX Redesign

**Date:** 2026-06-29  
**Goal:** Replace high-friction dropdown controls with direct-click equivalents throughout the Properties Panel, reducing the interaction cost of common data-entry tasks for genetic counselors.

---

## Scope

Surgical upgrades to `PropertiesPanel.tsx` and `PropertiesPanel.module.css`. No structural changes to sections, no section collapsing, no changes to the data model or stores.

---

## Changes

### 1. Gender Identity — Icon Button Grid

**Current:** `<select>` dropdown (4 options).  
**New:** 2×2 grid of icon buttons.

Each button contains:
- The SVG pedigree symbol for that identity (square → Man, circle → Woman, diamond → Non-binary, small square with `?` → Unknown)
- A short text label below the symbol

The active selection renders with a primary-color ring. Clicking the already-active button is a no-op (identity stays set; Unknown serves as the fallback/reset state).

SAAB (`<select>`) directly below is unchanged.

### 2. Vital Status — Segmented Control

**Current:** `<select>` dropdown (Alive / Deceased / Stillborn).  
**New:** Full-width 3-button segmented control. Text labels only (no icons). Active button is filled with the primary color; inactive buttons share a bordered group style.

The conditional "Cause of Death" text input continues to appear below the control when Deceased is selected — no behaviour change.

### 3. Pedigree Role — Segmented Control

**Current:** `<select>` dropdown (None / Proband / Consultand).  
**New:** Same full-width 3-button segmented control treatment as Vital Status.

### 4. Add Condition Form — Color Swatches

**Current:** `<select>` listing color names (Black, Red, Blue…).  
**New:** A horizontal row of clickable filled-circle swatches. Active swatch shows a white inner ring + outer border so it reads clearly on any color. No text labels — the color is self-evident.

### 5. Add Condition Form — Quarter Selector Grid

**Current:** `<select>` with text options (Top-Left, Top-Right, Bottom-Left, Bottom-Right).  
**New:** A 2×2 grid of small buttons, spatially arranged to match the four quadrants of the pedigree symbol. Active quarter is highlighted. Gives the counselor immediate spatial feedback about where the condition will appear on the symbol.

---

## Affected Files

| File | Change |
|---|---|
| `src/components/ui/PropertiesPanel.tsx` | Replace 5 controls as described above |
| `src/components/ui/PropertiesPanel.module.css` | Add styles for icon button grid, segmented control, swatch row, quarter grid |

---

## Out of Scope

- Section collapsing / progressive disclosure
- Changes to SAAB field
- Changes to Investigations, Clinical Notes, or Notes sections
- Any store / type / data model changes
