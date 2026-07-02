import { describe, it, expect } from 'vitest';
import { ALL_FIXTURES } from './pedigrees';

describe('pedigree fixtures', () => {
  it('every fixture builds a valid doc with an existing root union', () => {
    for (const build of ALL_FIXTURES) {
      const f = build();
      expect(f.name).toBeTruthy();
      expect(f.doc.partnerships[f.rootUnionId], `${f.name}: rootUnionId exists`).toBeDefined();
      // Every parent-child link points at a real union and a real individual.
      for (const l of Object.values(f.doc.parentChildLinks)) {
        expect(f.doc.partnerships[l.parentPartnershipId], `${f.name}: link union`).toBeDefined();
        expect(f.doc.individuals[l.childId], `${f.name}: link child`).toBeDefined();
      }
      // Every union partner id (when set) is a real individual.
      for (const u of Object.values(f.doc.partnerships)) {
        for (const pid of [u.partner1Id, u.partner2Id]) {
          if (pid) expect(f.doc.individuals[pid], `${f.name}: partner ${pid}`).toBeDefined();
        }
      }
    }
  });
});
