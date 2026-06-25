import { describe, it, expect } from 'vitest';
import { serializeDocument, deserializeDocument } from './jsonIO';
import { createDefaultDocument, createDefaultIndividual } from '../stores/pedigreeStore';
import type { PedigreeDocument } from '../types/pedigree';

describe('deserializeDocument', () => {
  it('defaults investigations to [] for individuals saved before the field existed', () => {
    const doc = createDefaultDocument();
    const individual = createDefaultIndividual();
    doc.individuals[individual.id] = individual;

    // Simulate a legacy document: strip the investigations field from the JSON.
    // serializeDocument wraps the doc in { app, formatVersion, document }, so
    // we navigate through the envelope to reach the individuals map.
    const parsed = JSON.parse(serializeDocument(doc));
    delete parsed.document.individuals[individual.id].investigations;

    const loaded = deserializeDocument(JSON.stringify(parsed));
    expect(loaded.individuals[individual.id].investigations).toEqual([]);
  });

  it('round-trips investigations that are present', () => {
    const doc = createDefaultDocument();
    const individual = createDefaultIndividual({
      investigations: [{ label: 'BRCA1', description: 'Pathogenic variant' }],
    });
    doc.individuals[individual.id] = individual;

    const loaded = deserializeDocument(serializeDocument(doc));
    expect(loaded.individuals[individual.id].investigations).toEqual([
      { label: 'BRCA1', description: 'Pathogenic variant' },
    ]);
  });

  it('migrates legacy string investigations to { label, description }', () => {
    const doc = createDefaultDocument();
    const individual = createDefaultIndividual();
    doc.individuals[individual.id] = individual;

    // Simulate a document saved with the old single-string investigations form.
    const parsed = JSON.parse(serializeDocument(doc));
    parsed.document.individuals[individual.id].investigations = ['BRCA1 +'];

    const loaded = deserializeDocument(JSON.stringify(parsed));
    expect(loaded.individuals[individual.id].investigations).toEqual([
      { label: 'BRCA1 +', description: '' },
    ]);
  });
});

/** A minimal but valid document fixture, including one text annotation. */
function makeDocument(): PedigreeDocument {
  return {
    metadata: {
      id: 'doc-1',
      title: 'Test',
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:00.000Z',
      version: '1.0.0',
    },
    individuals: {},
    partnerships: {},
    parentChildLinks: {},
    twinGroups: {},
    textAnnotations: {
      'anno-1': {
        id: 'anno-1',
        text: 'Pedigree Title',
        position: { x: 40, y: 20 },
        fontSize: 18,
      },
    },
    generationOrder: [],
    legendConfig: { entries: [], position: { x: 50, y: 50 } },
  };
}

describe('jsonIO text annotation round-trip', () => {
  it('preserves text annotations through serialize -> deserialize', () => {
    const doc = makeDocument();
    const restored = deserializeDocument(serializeDocument(doc));

    expect(restored.textAnnotations).toEqual(doc.textAnnotations);
  });

  it('defaults textAnnotations to {} when loading a document that lacks it', () => {
    // Simulate an older document saved before text annotations existed.
    const legacy = {
      app: 'PedigreeEditor',
      formatVersion: '2.0',
      document: {
        metadata: {
          id: 'doc-1',
          title: 'Legacy',
          createdAt: '2026-06-25T00:00:00.000Z',
          updatedAt: '2026-06-25T00:00:00.000Z',
          version: '1.0.0',
        },
        individuals: {},
        partnerships: {},
        parentChildLinks: {},
        twinGroups: {},
        generationOrder: [],
        legendConfig: { entries: [], position: { x: 50, y: 50 } },
      },
    };

    const restored = deserializeDocument(JSON.stringify(legacy));

    expect(restored.textAnnotations).toEqual({});
  });
});
