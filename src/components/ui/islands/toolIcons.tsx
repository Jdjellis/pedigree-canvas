/**
 * Inline SVG glyphs for the pedigree-shape sex icons used by {@link DefaultSexControl}.
 * Kept in their own module to satisfy the `react-refresh/only-export-components`
 * rule (a file may export components or non-components, not both).
 */

/** Outlined square — the pedigree symbol for a male individual. */
export function SquareIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <rect x="1.5" y="1.5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Outlined circle — the pedigree symbol for a female individual. */
export function CircleIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Outlined diamond — the pedigree symbol for unknown sex. */
export function DiamondIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="4.5" y="4.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45 9 9)" />
    </svg>
  );
}
