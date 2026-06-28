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
});
