import { describe, expect, test } from 'vitest';
import { parseSavedDocument } from './useAutoSave';

describe('parseSavedDocument', () => {
  test('returns null for missing or corrupt data', () => {
    expect(parseSavedDocument(null)).toBeNull();
    expect(parseSavedDocument('not json')).toBeNull();
    expect(parseSavedDocument('{"foo":1}')).toBeNull();
  });

  test('returns the document for a valid payload (with legend migration)', () => {
    const raw = JSON.stringify({ individuals: {}, partnerships: {} });
    const doc = parseSavedDocument(raw);
    expect(doc).not.toBeNull();
    expect(doc!.legendConfig).toEqual({ entries: [], position: { x: 50, y: 50 } });
  });

  test('backfills missing investigations to an empty array for legacy documents', () => {
    // Documents autosaved before the `investigations` field existed lack it;
    // restoring them must not leave `investigations` undefined (a symbol label
    // and the SVG export both iterate it and would otherwise throw).
    const raw = JSON.stringify({
      individuals: { a: { id: 'a', sex: 'unknown', conditions: [] } },
      partnerships: {},
    });
    const doc = parseSavedDocument(raw);
    expect(doc).not.toBeNull();
    expect(doc!.individuals['a'].investigations).toEqual([]);
  });

  test('preserves existing investigations while backfilling absent ones', () => {
    const raw = JSON.stringify({
      individuals: {
        legacy: { id: 'legacy', sex: 'unknown', conditions: [] },
        modern: {
          id: 'modern',
          sex: 'unknown',
          conditions: [],
          investigations: [{ label: 'BRCA1', description: 'Pathogenic' }],
        },
      },
      partnerships: {},
    });
    const doc = parseSavedDocument(raw);
    expect(doc!.individuals['legacy'].investigations).toEqual([]);
    expect(doc!.individuals['modern'].investigations).toEqual([
      { label: 'BRCA1', description: 'Pathogenic' },
    ]);
  });
});
