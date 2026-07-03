# Impeccable design backlog

Deferred design items surfaced during `/impeccable` sessions. Not blockers —
parked here so they aren't lost. Promote to GitHub issues when ready.

## Typography — a single characterful "brand touch" (deferred)

**Raised:** 2026-07-03, during the palette/typeface review.
**Status:** deferred (user wants to consider it later).

**Context.** The product-register type system (one system sans doing headings /
labels / body / data, plus Caveat for on-canvas annotations) is the *correct*
default for a tool UI — it is not a slop tell, and we are intentionally keeping
it. See [[DESIGN.md]] §3 "The Size-and-Weight Rule".

**The opportunity.** Right now nothing in the *chrome* carries a deliberate
typographic identity — the UI face is the OS system sans, and Caveat is locked to
the canvas. The brand could earn **one** intentional typographic moment (most
naturally the "Pedigree Canvas" wordmark) so the product has a recognisable
signature beyond system-ui + Caveat, without violating the one-UI-typeface rule.

**Guardrails when we pick this up.**
- Exactly one moment, not a second UI typeface sprayed around (that would break
  the Size-and-Weight Rule).
- No `background-clip:text` gradient — that ban is being fixed in this same pass
  (critique P1). The characterful touch must be a solid colour.
- Must survive the system-sans fallback (Inter is not bundled — the honesty-gap
  fix is happening now).
- Stay on-voice: "precise · calm · approachable," not decorative.

**Likely command when we take it on:** `/impeccable typeset` (scoped to the
wordmark), possibly bundling one display/label face if we decide to load one.
