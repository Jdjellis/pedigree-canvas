import { describe, it, expect } from 'vitest';
import {
  THEME_ORDER,
  THEME_LABELS,
  THEME_CANVAS_PALETTES,
  isThemeId,
  type ThemeId,
} from './themes';

/**
 * sRGB relative luminance per WCAG 2.x, in [0, 1]. 0 = black, 1 = white.
 * Used to assert the clinical invariant that every theme keeps a *light*
 * symbol surface, so dark (affected) symbols always read correctly.
 */
function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected a #rrggbb hex colour, got ${hex}`);
  const channel = (n: number): number => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const int = parseInt(m[1], 16);
  const r = channel((int >> 16) & 0xff);
  const g = channel((int >> 8) & 0xff);
  const b = channel(int & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('theme registry', () => {
  it('exposes light, warm, and dim in display order', () => {
    expect(THEME_ORDER).toEqual(['light', 'warm', 'dim']);
  });

  it('has a human label for every theme', () => {
    for (const id of THEME_ORDER) {
      expect(THEME_LABELS[id]).toBeTruthy();
    }
    expect(THEME_LABELS.light).toBe('Light');
    expect(THEME_LABELS.warm).toBe('Warm');
    expect(THEME_LABELS.dim).toBe('Dim');
  });

  it('has a complete canvas palette for every theme', () => {
    for (const id of THEME_ORDER) {
      const palette = THEME_CANVAS_PALETTES[id];
      expect(palette.symbolFill).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.gridColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.generationLineColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("light theme's symbol fill stays pure white (unchanged from before themes)", () => {
    expect(THEME_CANVAS_PALETTES.light.symbolFill).toBe('#ffffff');
  });
});

describe('clinical invariant: comfort themes keep a light symbol surface', () => {
  // Affected = dark-filled symbol; unaffected = open symbol on the surface.
  // If a theme's surface were dark, dark symbols would vanish and the
  // affected/unaffected convention would invert. Every theme must therefore
  // keep the symbol surface clearly light.
  it.each(THEME_ORDER)(
    'theme "%s" has a high-luminance (light) symbol surface',
    (id: ThemeId) => {
      const luminance = relativeLuminance(THEME_CANVAS_PALETTES[id].symbolFill);
      expect(luminance).toBeGreaterThan(0.6);
    },
  );

  it('keeps strong contrast between the dark symbol stroke and every surface', () => {
    // SYMBOL_COLOR is #1a1a1a (near-black); contrast ratio must clear WCAG AA
    // for graphical objects (3:1) with comfortable headroom on every surface.
    const strokeLum = relativeLuminance('#1a1a1a');
    for (const id of THEME_ORDER) {
      const surfaceLum = relativeLuminance(THEME_CANVAS_PALETTES[id].symbolFill);
      const ratio = (surfaceLum + 0.05) / (strokeLum + 0.05);
      expect(ratio).toBeGreaterThan(4.5);
    }
  });
});

describe('isThemeId', () => {
  it('accepts known ids and rejects everything else', () => {
    expect(isThemeId('light')).toBe(true);
    expect(isThemeId('warm')).toBe(true);
    expect(isThemeId('dim')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});
