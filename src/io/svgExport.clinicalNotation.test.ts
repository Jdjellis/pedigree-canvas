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
  };
  doc.parentChildLinks.l2 = {
    id: 'l2',
    type: RelationshipType.ParentChild,
    parentPartnershipId: 'u1',
    childId: 'c2',
  };
  return doc;
}

describe('SVG export — adoption notation', () => {
  it('draws brackets and a DASHED descent for an adopted-IN child', () => {
    const doc = makeFamily();
    doc.individuals.c1 = { ...doc.individuals.c1, adopted: true };
    doc.parentChildLinks.l1 = { ...doc.parentChildLinks.l1, isAdoptive: true };

    const svg = buildPedigreeSvg(doc, 'Adopted in');

    // Brackets around the adopted symbol (left + right polylines).
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Adoptive line of descent is dashed.
    expect(svg).toContain(`stroke-dasharray="${DASH_PATTERN.join(' ')}"`);
  });

  it('draws brackets and a SOLID descent for an adopted-OUT child', () => {
    const doc = makeFamily();
    doc.individuals.c1 = { ...doc.individuals.c1, adopted: true };
    doc.parentChildLinks.l1 = { ...doc.parentChildLinks.l1, isAdoptive: false };

    const svg = buildPedigreeSvg(doc, 'Adopted out');

    // Brackets are still drawn (brackets = "was adopted", any direction).
    expect((svg.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Biological line of descent is solid → no dash array in the export.
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('does not draw brackets when nobody is adopted', () => {
    const svg = buildPedigreeSvg(makeFamily(), 'No adoption');
    expect(svg).not.toContain('<polyline');
  });
});

describe('SVG export — multi-parentage (#64)', () => {
  /**
   * Attach a SECOND parent couple (a biological couple) to `c1`, alongside its
   * existing couple — the both-families adoption case (Bennett Fig. 3): one
   * descent line solid (biological), one dashed (adoptive).
   */
  function makeTwoParentSets(): PedigreeDocument {
    const doc = makeFamily();
    // Mark the FIRST couple as the adoptive one (dashed) and bracket the child.
    doc.individuals.c1 = { ...doc.individuals.c1, adopted: true };
    doc.parentChildLinks.l1 = { ...doc.parentChildLinks.l1, isAdoptive: true };
    // Second (biological) couple, placed clear to the right, with a solid edge.
    doc.individuals.bioDad = createDefaultIndividual({ id: 'bioDad', generation: 0, position: { x: 300, y: 0 } });
    doc.individuals.bioMum = createDefaultIndividual({ id: 'bioMum', generation: 0, position: { x: 420, y: 0 } });
    doc.partnerships.u2 = {
      id: 'u2',
      type: RelationshipType.Partnership,
      partner1Id: 'bioDad',
      partner2Id: 'bioMum',
      childrenIds: ['c1'],
    };
    doc.parentChildLinks.l3 = {
      id: 'l3',
      type: RelationshipType.ParentChild,
      parentPartnershipId: 'u2',
      childId: 'c1',
      isAdoptive: false,
    };
    return doc;
  }

  it('draws a descent line from EACH parent couple to the same child', () => {
    const svg = buildPedigreeSvg(makeTwoParentSets(), 'Both families');
    // A child drop lands on c1's x (40). Both couples route a drop down to it,
    // so the child-x drop segment appears at least twice.
    const dropsToChild = (svg.match(/x1="40"/g) ?? []).length;
    expect(dropsToChild).toBeGreaterThanOrEqual(2);
  });

  it('renders the adoptive edge dashed and the biological edge solid together', () => {
    const svg = buildPedigreeSvg(makeTwoParentSets(), 'Both families');
    // Adoptive couple → at least one dashed segment.
    expect(svg).toContain(`stroke-dasharray="${DASH_PATTERN.join(' ')}"`);
    // Biological couple → a solid segment coexists (there are undashed lines).
    const dashed = (svg.match(/stroke-dasharray/g) ?? []).length;
    const allLines = (svg.match(/<line /g) ?? []).length;
    expect(allLines).toBeGreaterThan(dashed);
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
