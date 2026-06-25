import { describe, it, expect } from 'vitest';
import { collectInvestigations, formatInvestigation } from './investigations';
import { createDefaultIndividual } from '../stores/pedigreeStore';

describe('collectInvestigations', () => {
  it('returns an empty array when no individual has investigations', () => {
    const a = createDefaultIndividual();
    const b = createDefaultIndividual();
    expect(collectInvestigations([a, b])).toEqual([]);
  });

  it('returns the distinct set across individuals, sorted by label then description', () => {
    const a = createDefaultIndividual({
      investigations: [
        { label: 'BRCA1', description: 'Pathogenic variant' },
        { label: 'Karyotype', description: '46,XY' },
      ],
    });
    const b = createDefaultIndividual({
      investigations: [
        { label: 'BRCA1', description: 'Pathogenic variant' },
        { label: 'CMA', description: '22q11.2 deletion' },
      ],
    });
    expect(collectInvestigations([a, b])).toEqual([
      { label: 'BRCA1', description: 'Pathogenic variant' },
      { label: 'CMA', description: '22q11.2 deletion' },
      { label: 'Karyotype', description: '46,XY' },
    ]);
  });

  it('treats the same label with different descriptions as distinct entries', () => {
    const a = createDefaultIndividual({
      investigations: [{ label: 'BRCA1', description: 'Pathogenic variant' }],
    });
    const b = createDefaultIndividual({
      investigations: [{ label: 'BRCA1', description: 'No variant detected' }],
    });
    expect(collectInvestigations([a, b])).toEqual([
      { label: 'BRCA1', description: 'No variant detected' },
      { label: 'BRCA1', description: 'Pathogenic variant' },
    ]);
  });

  it('trims surrounding whitespace and drops entries without a label', () => {
    const a = createDefaultIndividual({
      investigations: [
        { label: '  BRCA1  ', description: '  Pathogenic variant  ' },
        { label: '   ', description: 'orphan result' },
      ],
    });
    expect(collectInvestigations([a])).toEqual([
      { label: 'BRCA1', description: 'Pathogenic variant' },
    ]);
  });

  it('treats trimmed duplicates as the same entry', () => {
    const a = createDefaultIndividual({
      investigations: [{ label: 'BRCA1', description: 'Pathogenic variant' }],
    });
    const b = createDefaultIndividual({
      investigations: [{ label: 'BRCA1  ', description: '  Pathogenic variant' }],
    });
    expect(collectInvestigations([a, b])).toEqual([
      { label: 'BRCA1', description: 'Pathogenic variant' },
    ]);
  });
});

describe('formatInvestigation', () => {
  it('reads "label = description" when a description is present', () => {
    expect(
      formatInvestigation({ label: 'BRCA1', description: 'Pathogenic variant' }),
    ).toBe('BRCA1 = Pathogenic variant');
  });

  it('reads just the label when there is no description', () => {
    expect(formatInvestigation({ label: 'Karyotype', description: '' })).toBe(
      'Karyotype',
    );
  });
});
