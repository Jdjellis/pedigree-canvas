import { describe, it, expect } from 'vitest';
import { buildPedigreeSvg } from './svgExport';
import type { PedigreeDocument, Individual } from '../types/pedigree';
import {
  GenderIdentity,
  VitalStatus,
  RelationshipType,
} from '../types/enums';
import { PARENTLESS_SIBSHIP_RISE } from '../utils/constants';

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
    investigations: [
      { label: 'BRCA1', description: 'Pathogenic variant' },
      { label: 'Karyotype', description: '46,XY' },
    ],
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
    textAnnotations: {},
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

  it('ranks the topmost generation as I even when its raw value is negative', () => {
    // Simulate adding a parent generation above founders: founders stay at
    // generation 0 and the new parents get generation -1 (see RadialMenu). The
    // topmost (minimum) generation must still render as "I".
    const doc = makeFixture();
    const grandfather: Individual = {
      ...doc.individuals.father,
      id: 'grandfather',
      displayName: 'George',
      isProband: false,
      position: { x: 100, y: -50 },
      generation: -1,
    };
    doc.individuals = { ...doc.individuals, grandfather };

    const svg = buildPedigreeSvg(doc, 'Test Pedigree');

    // Three generations (-1, 0, 1) read I, II, III top-to-bottom.
    expect(svg).toContain('>I</text>');
    expect(svg).toContain('>II</text>');
    expect(svg).toContain('>III</text>');
  });

  it('ranks the topmost generation as I even when raw generations are all > 0', () => {
    const doc = makeFixture();
    doc.individuals.father.generation = 2;
    doc.individuals.mother.generation = 2;
    doc.individuals.child.generation = 3;

    const svg = buildPedigreeSvg(doc, 'Test Pedigree');

    // Min-relative: generation 2 -> I, generation 3 -> II.
    expect(svg).toContain('>I</text>');
    expect(svg).toContain('>II</text>');
    // Absolute numbering would have produced III for generation 2; it must not.
    expect(svg).not.toContain('>III</text>');
  });

  it('renders free-text annotations as positioned <text> at their font size', () => {
    const doc = makeFixture();
    doc.textAnnotations = {
      'anno-1': {
        id: 'anno-1',
        text: 'Family Pedigree',
        position: { x: 80, y: 40 },
        fontSize: 24,
      },
    };

    const svg = buildPedigreeSvg(doc, 'Test Pedigree');

    expect(svg).toContain('Family Pedigree');
    expect(svg).toContain('font-size="24"');
    expect(svg).toContain('class="annotations"');
  });

  it('escapes XML-special characters in annotations and renders multi-line text', () => {
    const doc = makeFixture();
    doc.textAnnotations = {
      'anno-1': {
        id: 'anno-1',
        text: 'A & B\n<line two>',
        position: { x: 0, y: 0 },
        fontSize: 16,
      },
    };

    const svg = buildPedigreeSvg(doc, 'Test Pedigree');

    expect(svg).toContain('A &amp; B');
    expect(svg).toContain('&lt;line two&gt;');
    expect(svg).not.toContain('A & B');
    // Each line becomes its own <tspan>.
    expect(svg).toContain('<tspan');
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

  it('renders the investigation label beside the symbol', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('>BRCA1</text>');
    expect(svg).toContain('>Karyotype</text>');
  });

  it('renders investigations in the key as "label = description" rows, sorted by label', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).toContain('BRCA1 = Pathogenic variant');
    expect(svg).toContain('Karyotype = 46,XY');
    // Alphabetical by label: BRCA1 before Karyotype.
    expect(svg.indexOf('BRCA1 = Pathogenic variant')).toBeLessThan(
      svg.indexOf('Karyotype = 46,XY'),
    );
  });

  it('does not render an "Investigations" heading in the key', () => {
    const svg = buildPedigreeSvg(makeFixture(), 'Test Pedigree');
    expect(svg).not.toContain('>Investigations</text>');
  });
});

function minimalDoc(
  individuals: Record<string, Individual>,
  partnerships: PedigreeDocument['partnerships'],
  parentChildLinks: PedigreeDocument['parentChildLinks'],
): PedigreeDocument {
  return {
    metadata: { id: 'd', title: 'T', createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z', version: '1.0.0' },
    individuals, partnerships, parentChildLinks,
    twinGroups: {}, textAnnotations: {},
    generationOrder: [], legendConfig: { entries: [], position: { x: 0, y: 0 } },
  };
}

function person(id: string, x: number, y: number): Individual {
  return {
    id, genderIdentity: GenderIdentity.Unknown, vitalStatus: VitalStatus.Alive,
    conditionIds: [], conditions: [], investigations: [],
    isProband: false, isPregnancy: false, position: { x, y }, annotations: [],
  };
}

describe('parentless sibship rendering', () => {
  it('draws a bar above the siblings and a drop to each, with no parent descent', () => {
    const a = person('a', 100, 300);
    const b = person('b', 200, 300);
    const doc = minimalDoc(
      { a, b },
      { u1: { id: 'u1', type: RelationshipType.Partnership, childrenIds: ['a', 'b'] } },
      {
        l1: { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'a', isAdopted: false },
        l2: { id: 'l2', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'b', isAdopted: false },
      },
    );
    const svg = buildPedigreeSvg(doc);
    const barY = 300 - PARENTLESS_SIBSHIP_RISE; // 225

    expect(svg).toContain(`<line x1="100" y1="${barY}" x2="200" y2="${barY}"`); // bar
    expect(svg).toContain(`<line x1="100" y1="${barY}" x2="100" y2="300"`); // drop to a
    expect(svg).toContain(`<line x1="200" y1="${barY}" x2="200" y2="300"`); // drop to b
    // No descent line rises above the bar.
    expect(svg).not.toContain(`y2="${barY - 1}"`);
  });
});

describe('single-parent union rendering', () => {
  it('drops a straight vertical line from the lone parent to the child', () => {
    const parent = person('p', 100, 100);
    const child = person('c', 100, 250);
    const doc = minimalDoc(
      { p: parent, c: child },
      { u1: { id: 'u1', type: RelationshipType.Partnership, partner1Id: 'p', childrenIds: ['c'] } },
      { l1: { id: 'l1', type: RelationshipType.ParentChild, parentPartnershipId: 'u1', childId: 'c', isAdopted: false } },
    );
    const svg = buildPedigreeSvg(doc);
    const midY = 100 + (250 - 100) / 2; // 175

    // Two collinear segments at x=100 forming one straight descent.
    expect(svg).toContain(`<line x1="100" y1="100" x2="100" y2="${midY}"`);
    expect(svg).toContain(`<line x1="100" y1="${midY}" x2="100" y2="250"`);
  });
});
