import { describe, it, expect } from 'vitest';
import {
  serializeDocument,
  deserializeDocument,
  migrateAdoption,
  migrateConsanguinity,
} from './jsonIO';
import { createDefaultDocument, createDefaultIndividual } from '../stores/pedigreeStore';
import type { PedigreeDocument } from '../types/pedigree';
import { RelationshipType } from '../types/enums';

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

/**
 * A minimal but valid document fixture with one text annotation and a simple
 * family (one child + partnership + parent link) so migration tests have
 * concrete links to assert against.
 *
 * Known IDs: individual `'kid-1'`, partnership `'p1'`, link `'link-1'`.
 */
function makeDocument(): PedigreeDocument {
  return {
    metadata: {
      id: 'doc-1',
      title: 'Test',
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:00.000Z',
      version: '1.0.0',
    },
    individuals: {
      'kid-1': createDefaultIndividual({ id: 'kid-1', position: { x: 0, y: 150 } }),
    },
    partnerships: {
      p1: {
        id: 'p1',
        type: RelationshipType.Partnership,
        childrenIds: ['kid-1'],
      },
    },
    parentChildLinks: {
      'link-1': {
        id: 'link-1',
        type: RelationshipType.ParentChild,
        parentPartnershipId: 'p1',
        childId: 'kid-1',
      },
    },
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

describe('deserializeDocument validation', () => {
  it('throws on a non-object JSON payload (null / number / string)', () => {
    for (const payload of ['null', '42', '"a string"']) {
      expect(() => deserializeDocument(payload)).toThrow(
        'Invalid file: expected a JSON object at the top level.',
      );
    }
  });

  it('throws on malformed JSON', () => {
    expect(() => deserializeDocument('{not json')).toThrow(
      'Invalid JSON: the file does not contain valid JSON.',
    );
  });

  it.each([
    'metadata',
    'individuals',
    'partnerships',
    'parentChildLinks',
    'twinGroups',
    'generationOrder',
  ])('throws when required top-level field "%s" is missing', (key) => {
    const doc = makeDocument() as unknown as Record<string, unknown>;
    delete doc[key];
    expect(() => deserializeDocument(JSON.stringify(doc))).toThrow(
      `Invalid pedigree document: missing required field "${key}".`,
    );
  });

  it('throws when metadata is not an object', () => {
    const doc = makeDocument() as unknown as Record<string, unknown>;
    doc.metadata = 'not-an-object';
    expect(() => deserializeDocument(JSON.stringify(doc))).toThrow(
      'Invalid pedigree document: "metadata" must be an object.',
    );
  });

  it.each(['id', 'title', 'createdAt', 'updatedAt', 'version'])(
    'throws when metadata is missing required sub-field "%s"',
    (key) => {
      const doc = makeDocument();
      delete (doc.metadata as unknown as Record<string, unknown>)[key];
      expect(() => deserializeDocument(JSON.stringify(doc))).toThrow(
        `Invalid pedigree document: metadata is missing required field "${key}".`,
      );
    },
  );

  it('unwraps the { app, document } envelope form', () => {
    const doc = makeDocument();
    const wrapped = { app: 'PedigreeCanvas', formatVersion: '2.0', document: doc };
    const loaded = deserializeDocument(JSON.stringify(wrapped));
    expect(loaded.metadata.id).toBe('doc-1');
  });

  it('accepts a bare (unwrapped) document', () => {
    const doc = makeDocument();
    const loaded = deserializeDocument(JSON.stringify(doc));
    expect(loaded.metadata.id).toBe('doc-1');
  });
});

describe('deserializeDocument legacy migrations', () => {
  it('migrates affectedStatus="affected" to a legend entry + conditionIds, and deletes affectedStatus', () => {
    const doc = makeDocument();
    doc.metadata.referenceCondition = 'BRCA';
    // Legacy individual carrying the old affectedStatus field.
    (doc.individuals['kid-1'] as unknown as Record<string, unknown>).affectedStatus =
      'affected';

    const loaded = deserializeDocument(JSON.stringify(doc));

    // A single legend entry was created from the reference condition.
    expect(loaded.legendConfig!.entries).toHaveLength(1);
    const entry = loaded.legendConfig!.entries[0];
    expect(entry.name).toBe('BRCA');
    expect(entry.quarter).toBe('topRight');

    // Its id was pushed onto the individual's conditionIds.
    expect(loaded.individuals['kid-1'].conditionIds).toContain(entry.id);

    // The old field is gone.
    expect(
      'affectedStatus' in
        (loaded.individuals['kid-1'] as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it('defaults the legend entry name to "Affected" when no referenceCondition is set', () => {
    const doc = makeDocument();
    (doc.individuals['kid-1'] as unknown as Record<string, unknown>).affectedStatus =
      'affected';

    const loaded = deserializeDocument(JSON.stringify(doc));

    expect(loaded.legendConfig!.entries[0].name).toBe('Affected');
  });

  it('reuses a single migration legend entry across multiple affected individuals', () => {
    const doc = makeDocument();
    doc.individuals['kid-2'] = createDefaultIndividual({ id: 'kid-2' });
    (doc.individuals['kid-1'] as unknown as Record<string, unknown>).affectedStatus =
      'affected';
    (doc.individuals['kid-2'] as unknown as Record<string, unknown>).affectedStatus =
      'affected';

    const loaded = deserializeDocument(JSON.stringify(doc));

    expect(loaded.legendConfig!.entries).toHaveLength(1);
    const entryId = loaded.legendConfig!.entries[0].id;
    expect(loaded.individuals['kid-1'].conditionIds).toContain(entryId);
    expect(loaded.individuals['kid-2'].conditionIds).toContain(entryId);
  });

  it('migrates a legacy legend entry conditionNames.default to name', () => {
    const doc = makeDocument();
    doc.legendConfig = {
      entries: [
        // Legacy entry shape: conditionNames instead of name.
        {
          id: 'legend-legacy',
          quarter: 'topRight',
          fillColor: '#1a1a1a',
          fillPattern: 'solid',
          conditionNames: { default: 'Diabetes' },
        } as unknown as (typeof doc.legendConfig.entries)[number],
      ],
      position: { x: 50, y: 50 },
    };

    const loaded = deserializeDocument(JSON.stringify(doc));

    const entry = loaded.legendConfig!.entries[0] as unknown as Record<string, unknown>;
    expect(entry.name).toBe('Diabetes');
    expect('conditionNames' in entry).toBe(false);
  });

  it('migrates a legacy consanguinity-typed union to a partnership + consanguineous flag', () => {
    const doc = makeDocument();
    // Legacy union stored under the old mutually-exclusive enum value.
    (doc.partnerships['p1'] as unknown as Record<string, unknown>).type = 'consanguinity';
    (doc.partnerships['p1'] as unknown as Record<string, unknown>).consanguinityDegree =
      '1st cousins';

    const loaded = deserializeDocument(JSON.stringify(doc));

    expect(loaded.partnerships['p1'].type).toBe(RelationshipType.Partnership);
    expect(loaded.partnerships['p1'].consanguineous).toBe(true);
    // The degree is preserved through the migration.
    expect(loaded.partnerships['p1'].consanguinityDegree).toBe('1st cousins');
  });
});

describe('migrateConsanguinity', () => {
  it('upgrades a legacy consanguinity union, preserving other fields', () => {
    const doc = makeDocument();
    (doc.partnerships['p1'] as unknown as Record<string, unknown>).type = 'consanguinity';

    migrateConsanguinity(doc);

    const p = doc.partnerships['p1'];
    expect(p.type).toBe(RelationshipType.Partnership);
    expect(p.consanguineous).toBe(true);
    expect(p.childrenIds).toEqual(['kid-1']);
  });

  it('leaves partnership and separation unions untouched', () => {
    const doc = makeDocument();
    doc.partnerships['sep'] = {
      id: 'sep',
      type: RelationshipType.Separation,
      childrenIds: [],
    };

    migrateConsanguinity(doc);

    expect(doc.partnerships['p1'].type).toBe(RelationshipType.Partnership);
    expect(doc.partnerships['p1'].consanguineous).toBeUndefined();
    expect(doc.partnerships['sep'].type).toBe(RelationshipType.Separation);
    expect(doc.partnerships['sep'].consanguineous).toBeUndefined();
  });

  it('is idempotent', () => {
    const doc = makeDocument();
    (doc.partnerships['p1'] as unknown as Record<string, unknown>).type = 'consanguinity';

    const once = JSON.stringify(migrateConsanguinity(doc));
    const twice = JSON.stringify(migrateConsanguinity(doc));
    expect(once).toBe(twice);
  });
});

describe('migrateAdoption', () => {
  it('maps legacy link.isAdopted and type=Adoption to isAdoptive', () => {
    const doc = makeDocument();
    // Legacy adoptive link expressed the old two ways.
    (doc.parentChildLinks as Record<string, unknown>).legacy = {
      id: 'legacy',
      type: 'adoption',
      parentPartnershipId: 'p1',
      childId: 'kid',
      isAdopted: true,
    };

    migrateAdoption(doc);

    const link = doc.parentChildLinks.legacy as unknown as Record<string, unknown>;
    expect(link.isAdoptive).toBe(true);
    expect(link.type).toBe(RelationshipType.ParentChild);
    expect('isAdopted' in link).toBe(false);
  });

  it('dashes the parent link of a legacy individual.adopted person (adopted-in)', () => {
    const doc = makeDocument();
    const kidId = Object.keys(doc.individuals)[0]; // 'kid-1'
    doc.individuals[kidId] = { ...doc.individuals[kidId], adopted: true };

    migrateAdoption(doc);

    // 'link-1' is the known parent-child link for 'kid-1' in makeDocument()
    expect(doc.parentChildLinks['link-1'].isAdoptive).toBe(true);
  });

  it('is idempotent', () => {
    const doc = makeDocument();
    const once = JSON.stringify(migrateAdoption(doc));
    const twice = JSON.stringify(migrateAdoption(doc));
    expect(twice).toBe(once);
  });

  it('preserves an explicit biological edge (adopted-out) across multiple loads', () => {
    // Regression for the unguarded step-2 bug: a person marked adopted:true
    // whose parent link is explicitly isAdoptive:false (= adopted-out) must NOT
    // be flipped back to adopted-in on load. This test would fail without the
    // `&& link.isAdoptive === undefined` guard.
    const doc = makeDocument();
    // 'kid-1' has parent link 'link-1' in makeDocument().
    doc.individuals['kid-1'] = { ...doc.individuals['kid-1'], adopted: true };
    doc.parentChildLinks['link-1'] = { ...doc.parentChildLinks['link-1'], isAdoptive: false };

    migrateAdoption(doc);
    expect(doc.parentChildLinks['link-1'].isAdoptive).toBe(false);

    // Run again to confirm true idempotency for the adopted-out case.
    migrateAdoption(doc);
    expect(doc.parentChildLinks['link-1'].isAdoptive).toBe(false);
  });

  it('migrates a link with only type="adoption" (no isAdopted field) to isAdoptive', () => {
    // Exercises the `type === Adoption` branch of the OR in isolation —
    // a link that used only the old type field and had no isAdopted property.
    const doc = makeDocument();
    (doc.parentChildLinks as Record<string, unknown>)['type-only'] = {
      id: 'type-only',
      type: 'adoption',
      parentPartnershipId: 'p1',
      childId: 'other-kid',
    };

    migrateAdoption(doc);

    const link = doc.parentChildLinks['type-only'] as unknown as Record<string, unknown>;
    expect(link.isAdoptive).toBe(true);
    expect(link.type).toBe(RelationshipType.ParentChild);
    expect('isAdopted' in link).toBe(false);
  });
});
