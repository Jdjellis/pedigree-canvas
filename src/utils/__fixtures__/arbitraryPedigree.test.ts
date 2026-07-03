import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { arbitraryLayoutDoc, SUPPORTED_SPACE, FULL_SPACE } from './arbitraryPedigree';
import type { LayoutDoc } from '../treeLayout';

/** Assert a generated doc has no dangling references and consistent generations. */
function assertStructurallyValid(doc: LayoutDoc): void {
  const has = (id: string | undefined): boolean => !!id && id in doc.individuals;
  for (const u of Object.values(doc.partnerships)) {
    if (u.partner1Id && !has(u.partner1Id)) throw new Error(`dangling partner1 ${u.partner1Id}`);
    if (u.partner2Id && !has(u.partner2Id)) throw new Error(`dangling partner2 ${u.partner2Id}`);
    for (const c of u.childrenIds) if (!has(c)) throw new Error(`dangling child ${c}`);
  }
  for (const l of Object.values(doc.parentChildLinks)) {
    if (!has(l.childId)) throw new Error(`link to missing child ${l.childId}`);
    if (!(l.parentPartnershipId in doc.partnerships)) {
      throw new Error(`link to missing union ${l.parentPartnershipId}`);
    }
    // A child sits exactly one generation below its (equal-generation) parents.
    const u = doc.partnerships[l.parentPartnershipId];
    const parentGens = [u.partner1Id, u.partner2Id]
      .filter((p): p is string => has(p))
      .map((p) => doc.individuals[p].generation as number);
    const childGen = doc.individuals[l.childId].generation as number;
    for (const pg of parentGens) {
      if (childGen !== pg + 1) throw new Error(`child gen ${childGen} not parentGen+1 (${pg})`);
    }
  }
  for (const t of Object.values(doc.twinGroups ?? {})) {
    if (t.individualIds.length < 2) throw new Error(`twin group ${t.id} < 2 members`);
    for (const m of t.individualIds) if (!has(m)) throw new Error(`twin group refs missing ${m}`);
  }
}

describe('arbitraryLayoutDoc', () => {
  it('always produces a structurally valid doc (SUPPORTED_SPACE)', () => {
    fc.assert(
      fc.property(arbitraryLayoutDoc(SUPPORTED_SPACE), (doc) => { assertStructurallyValid(doc); }),
      { numRuns: 300 },
    );
  });

  it('always produces a structurally valid doc (FULL_SPACE)', () => {
    fc.assert(
      fc.property(arbitraryLayoutDoc(FULL_SPACE), (doc) => { assertStructurallyValid(doc); }),
      { numRuns: 300 },
    );
  });
});
