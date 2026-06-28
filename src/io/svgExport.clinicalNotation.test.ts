import { describe, it, expect } from 'vitest';
import { buildPedigreeSvg } from './svgExport';
import {
  createDefaultDocument,
  createDefaultIndividual,
} from '../stores/pedigreeStore';
import { RelationshipType, TwinType } from '../types/enums';
import type { PedigreeDocument } from '../types/pedigree';
import { DASH_PATTERN } from '../utils/constants';

/**
 * A couple (mother + father) with two children, used to exercise adoption,
 * consanguinity, and twin notation in the SVG exporter.
 */
function makeFamily(): PedigreeDocument {
  const doc = createDefaultDocument();
  doc.individuals.dad = createDefaultIndividual({
    id: 'dad',
    generation: 0,
    position: { x: 0, y: 0 },
  });
  doc.individuals.mum = createDefaultIndividual({
    id: 'mum',
    generation: 0,
    position: { x: 120, y: 0 },
  });
  doc.individuals.c1 = createDefaultIndividual({
    id: 'c1',
    generation: 1,
    position: { x: 40, y: 150 },
  });
  doc.individuals.c2 = createDefaultIndividual({
    id: 'c2',
    generation: 1,
    position: { x: 80, y: 150 },
  });
  doc.partnerships.u1 = {
    id: 'u1',
    type: RelationshipType.Partnership,
    partner1Id: 'dad',
    partner2Id: 'mum',
    childrenIds: ['c1', 'c2'],
  };
  doc.parentChildLinks.l1 = {
    id: 'l1',
    type: RelationshipType.ParentChild,
    parentPartnershipId: 'u1',
    childId: 'c1',
    isAdopted: false,
  };
  doc.parentChildLinks.l2 = {
    id: 'l2',
    type: RelationshipType.ParentChild,
    parentPartnershipId: 'u1',
    childId: 'c2',
    isAdopted: false,
  };
  return doc;
}

describe('SVG export — adoption notation', () => {
  it('draws bracket polylines and dashes the descent for an adopted child', () => {
    const doc = makeFamily();
    doc.individuals.c1 = { ...doc.individuals.c1, adopted: true };

    const svg = buildPedigreeSvg(doc, 'Adoption');

    // Two bracket polylines (left + right) around the adopted symbol.
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // The line of descent into the adopted child is dashed.
    expect(svg).toContain(`stroke-dasharray="${DASH_PATTERN.join(' ')}"`);
  });

  it('does not draw brackets when nobody is adopted', () => {
    const svg = buildPedigreeSvg(makeFamily(), 'No adoption');
    expect(svg).not.toContain('<polyline');
  });
});

describe('SVG export — consanguinity degree', () => {
  it('renders the degree annotation above a consanguineous union', () => {
    const doc = makeFamily();
    doc.partnerships.u1 = {
      ...doc.partnerships.u1,
      type: RelationshipType.Consanguinity,
      consanguinityDegree: '1st cousins',
    };

    const svg = buildPedigreeSvg(doc, 'Consanguinity');

    expect(svg).toContain('1st cousins');
  });

  it('omits the annotation when no degree is set', () => {
    const doc = makeFamily();
    doc.partnerships.u1 = {
      ...doc.partnerships.u1,
      type: RelationshipType.Consanguinity,
    };

    const svg = buildPedigreeSvg(doc, 'Consanguinity');

    // The double line is still present (two partnership lines at the union y),
    // but there is no degree text.
    expect(svg).not.toContain('1st cousins');
  });
});

describe('SVG export — twin notation', () => {
  function withTwins(twinType: TwinType): string {
    const doc = makeFamily();
    doc.twinGroups.tg1 = {
      id: 'tg1',
      twinType,
      individualIds: ['c1', 'c2'],
      parentPartnershipId: 'u1',
    };
    return buildPedigreeSvg(doc, 'Twins');
  }

  it('renders a "?" for unknown zygosity', () => {
    expect(withTwins(TwinType.Unknown)).toContain('>?</text>');
  });

  it('does not render a "?" for monozygotic or dizygotic twins', () => {
    expect(withTwins(TwinType.Monozygotic)).not.toContain('>?</text>');
    expect(withTwins(TwinType.Dizygotic)).not.toContain('>?</text>');
  });
});
