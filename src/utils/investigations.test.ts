import { describe, it, expect } from 'vitest';
import { collectInvestigations } from './investigations';
import { createDefaultIndividual } from '../stores/pedigreeStore';

describe('collectInvestigations', () => {
  it('returns an empty array when no individual has investigations', () => {
    const a = createDefaultIndividual();
    const b = createDefaultIndividual();
    expect(collectInvestigations([a, b])).toEqual([]);
  });

  it('returns the distinct set across individuals, sorted alphabetically', () => {
    const a = createDefaultIndividual({ investigations: ['BRCA1 +', 'Karyotype 46,XY'] });
    const b = createDefaultIndividual({ investigations: ['BRCA1 +', 'CMA: 22q11.2 deletion'] });
    expect(collectInvestigations([a, b])).toEqual([
      'BRCA1 +',
      'CMA: 22q11.2 deletion',
      'Karyotype 46,XY',
    ]);
  });

  it('trims surrounding whitespace and drops empty/whitespace-only entries', () => {
    const a = createDefaultIndividual({ investigations: ['  BRCA1 +  ', '   ', ''] });
    expect(collectInvestigations([a])).toEqual(['BRCA1 +']);
  });

  it('treats trimmed duplicates as the same entry', () => {
    const a = createDefaultIndividual({ investigations: ['BRCA1 +'] });
    const b = createDefaultIndividual({ investigations: ['BRCA1 +  '] });
    expect(collectInvestigations([a, b])).toEqual(['BRCA1 +']);
  });
});
