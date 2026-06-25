import { describe, it, expect } from 'vitest';
import { buildPedigreeSvg } from './svgExport';
import type { PedigreeDocument, Individual } from '../types/pedigree';
import {
  GenderIdentity,
  VitalStatus,
  RelationshipType,
} from '../types/enums';

/**
 * Build a small but representative fixture pedigree:
 *   - A man (proband, square) partnered with a woman (circle).
 *   - One deceased non-binary child (diamond) with a condition (quarter shading,
 *     diagonal-lines pattern) hanging off the partnership.
 * Exercises symbols of every base shape, a condition pattern + clipPath, a
 * deceased slash, a proband arrow, connection + sibship lines, labels,
 * generation numerals, and the legend box.
 */
function makeFixture(): PedigreeDocument {
  const father: Individual = {
    id: 'father',
    genderIdentity: GenderIdentity.Man,
    vitalStatus: VitalStatus.Alive,
    displayName: 'John',
    age: 60,
    conditionIds: [],
    conditions: [],
    investigations: ['BRCA1 +', 'CMA: 22q11.2 deletion'],
    isProband: true,
    isPregnancy: false,
    position: { x: 100, y: 100 },
    generation: 0,
    annotations: [],
  };

  const mother: Individual = {
    id: 'mother',
    genderIdentity: GenderIdentity.Woman,
    vitalStatus: VitalStatus.Alive,
    displayName: 'Jane',
    age: 58,
    conditionIds: [],
    conditions: [],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 220, y: 100 },
    generation: 0,
    annotations: [],
  };

  const child: Individual = {
    id: 'child',
    genderIdentity: GenderIdentity.NonBinary,
    vitalStatus: VitalStatus.Deceased,
    displayName: 'Alex',
    age: 30,
    conditionIds: ['cond-1'],
    conditions: [{ id: 'cond-1', name: 'Condition A', ageOfOnset: 25 }],
    investigations: [],
    isProband: false,
    isPregnancy: false,
    position: { x: 160, y: 250 },
    generation: 1,
    annotations: [],
  };

  return {
    metadata: {
      id: 'doc-1',
      title: 'Test Pedigree',
      createdAt: '2026-06-25T00:00:00.000Z',
      updatedAt: '2026-06-25T00:00:00.000Z',
      version: '1.0.0',
    },
    individuals: { father, mother, child },
    partnerships: {
      'pship-1': {
        id: 'pship-1',
        type: RelationshipType.Partnership,
        partner1Id: 'father',
        partner2Id: 'mother',
        childrenIds: ['child'],
      },
    },
    parentChildLinks: {
      'pc-1': {
        id: 'pc-1',
        type: RelationshipType.ParentChild,
        parentPartnershipId: 'pship-1',
        childId: 'child',
        isAdopted: false,
      },
    },
    twinGroups: {},
    generationOrder: [['father', 'mother'], ['child']],
    legendConfig: {
      entries: [
        {
          id: 'cond-1',
          quarter: 'topLeft',
          fillColor: '#e63946',
          fillPattern: 'diagonalLines',
          name: 'Condition A',
        },
      ],
      position: { x: 50, y: 50 },
    },
  };
}

describe('buildPedigreeSvg', () => {
  it('produces a true vector SVG with no embedded raster image', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');

    // Real vector primitives.
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<circle'); // woman + diamond clip / legend swatch
    expect(svg).toContain('<rect'); // man square + background
    expect(svg).toContain('<polygon'); // diamond symbol + arrowhead
    expect(svg).toContain('<line'); // connection / sibship lines + slash
    expect(svg).toContain('<text'); // labels / numerals / legend

    // Condition shading uses real SVG pattern + clip, not raster.
    expect(svg).toContain('<pattern');
    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#clip-child)"');

    // Crucially: NOT a wrapped bitmap.
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('data:image');
  });

  it('renders proband arrow, deceased slash, labels, and legend key', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');

    // Proband marker.
    expect(svg).toContain('>P</text>');
    // Deceased label form and slash overshoot line are present.
    expect(svg).toContain('d. 30');
    // Label text content escaped + present.
    expect(svg).toContain('John');
    expect(svg).toContain('Jane');
    expect(svg).toContain('Alex');
    expect(svg).toContain('Condition A (dx 25)');
    // Legend "Key" box.
    expect(svg).toContain('>Key</text>');
    // Legend rows read "icon = description" (issue #18).
    expect(svg).toContain('>= Condition A</text>');
    // Generation numerals (Roman).
    expect(svg).toContain('>I</text>');
    expect(svg).toContain('>II</text>');
  });

  it('escapes XML-special characters in the title and labels', () => {
    const doc = makeFixture();
    doc.individuals.father.displayName = 'A & B <test>';
    const svg = buildPedigreeSvg(doc, 'Title & <x>');

    expect(svg).toContain('<title>Title &amp; &lt;x&gt;</title>');
    expect(svg).toContain('A &amp; B &lt;test&gt;');
    expect(svg).not.toContain('A & B <test>');
  });

  it('is deterministic for a given document (stable for snapshots)', () => {
    const a = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    const b = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(a).toEqual(b);
  });

  it('falls back to a default viewBox for an empty document', () => {
    const doc = makeFixture();
    doc.individuals = {};
    doc.partnerships = {};
    doc.parentChildLinks = {};
    doc.legendConfig.entries = [];
    const svg = buildPedigreeSvg(doc, 'Empty');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).not.toContain('<image');
  });

  it('renders investigation lines beside the symbol', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('BRCA1 +');
    expect(svg).toContain('CMA: 22q11.2 deletion');
  });

  it('renders an Investigations subheading listing the distinct sorted set', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('Investigations');
    // Alphabetical: BRCA1 + before CMA: ...
    expect(svg.indexOf('BRCA1 +')).toBeLessThan(svg.indexOf('CMA: 22q11.2 deletion'));
  });
});
