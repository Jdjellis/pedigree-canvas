import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';

/**
 * Mirrors the active theme from `uiStore` onto `document.documentElement`'s
 * `data-theme` attribute, which the `[data-theme='…']` blocks in `index.css`
 * key off to re-tint the chrome and canvas background.
 *
 * Lives in the react-dom tree (called from `App`), so the Zustand subscription
 * is safe — unlike inside Konva components.
 *
 * @example
 * ```tsx
 * function App() {
 *   useApplyTheme();
 *   // …
 * }
 * ```
 */
export function useApplyTheme(): void {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
