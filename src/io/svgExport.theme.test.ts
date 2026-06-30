import { describe, it, expect, afterEach } from 'vitest';
import { buildPedigreeSvg } from './svgExport';
import { useUIStore } from '../stores/uiStore';
import { SYMBOL_COLOR, SYMBOL_FILL } from '../utils/constants';
import { GenderIdentity, VitalStatus } from '../types/enums';
import type { PedigreeDocument, Individual } from '../types/pedigree';

/**
 * Clinical guarantee: a document export is always the print-standard *light*
 * pedigree, regardless of the on-screen comfort theme. A counselor switching to
 * the dim/warm theme for eye comfort must never email a dimmed or warm-tinted
 * pedigree. `buildPedigreeSvg` takes no theme argument by design; these tests
 * lock that the active `uiStore` theme cannot leak into the output.
 */

function oneManDoc(): PedigreeDocument {
  const man: Individual = {
    id: 'p1',
    genderIdentity: GenderIdentity.Man,
    vitalStatus: VitalStatus.Alive,
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 100, y: 100 },
    annotations: [],
  };
  return {
    metadata: {
      id: 'd',
      title: 'T',
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
      version: '1.0.0',
    },
    individuals: { p1: man },
    partnerships: {},
    parentChildLinks: {},
    twinGroups: {},
    textAnnotations: {},
    generationOrder: [],
    legendConfig: { entries: [], position: { x: 0, y: 0 } },
  };
}

afterEach(() => {
  useUIStore.getState().setTheme('light');
});

describe('export is theme-independent', () => {
  it('renders open symbols on the light constants even under the dim theme', () => {
    useUIStore.getState().setTheme('dim');

    const svg = buildPedigreeSvg(oneManDoc(), 'Test');

    // The unaffected man's square uses the light document fill + dark stroke,
    // not the dimmed canvas surface palette.
    expect(svg).toContain(`fill="${SYMBOL_FILL}"`);
    expect(svg).toContain(`stroke="${SYMBOL_COLOR}"`);
    expect(SYMBOL_FILL).toBe('#ffffff');
  });

  it('produces byte-identical output across themes', () => {
    useUIStore.getState().setTheme('light');
    const light = buildPedigreeSvg(oneManDoc(), 'Test');

    useUIStore.getState().setTheme('warm');
    const warm = buildPedigreeSvg(oneManDoc(), 'Test');

    useUIStore.getState().setTheme('dim');
    const dim = buildPedigreeSvg(oneManDoc(), 'Test');

    expect(warm).toBe(light);
    expect(dim).toBe(light);
  });
});
