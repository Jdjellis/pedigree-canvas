import { describe, it, expect, beforeEach } from 'vitest';
import { usePedigreeStore } from './pedigreeStore';
import { TwinType } from '../types/enums';
import type { TwinGroup } from '../types/pedigree';

const group: TwinGroup = {
  id: 'tg1',
  twinType: TwinType.Dizygotic,
  individualIds: ['a', 'b'],
  parentPartnershipId: 'u1',
};

beforeEach(() => {
  usePedigreeStore.getState().resetDocument();
});

describe('updateTwinGroup', () => {
  it('patches the zygosity of an existing twin group', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group);

    store.updateTwinGroup('tg1', { twinType: TwinType.Monozygotic });

    expect(usePedigreeStore.getState().document.twinGroups.tg1.twinType).toBe(
      TwinType.Monozygotic,
    );
    // Other fields are preserved.
    expect(usePedigreeStore.getState().document.twinGroups.tg1.individualIds).toEqual([
      'a',
      'b',
    ]);
  });

  it('is a no-op for an unknown id', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group);

    store.updateTwinGroup('missing', { twinType: TwinType.Unknown });

    expect(usePedigreeStore.getState().document.twinGroups.tg1.twinType).toBe(
      TwinType.Dizygotic,
    );
  });

  it('records a single undoable step', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group);
    store.updateTwinGroup('tg1', { twinType: TwinType.Unknown });

    usePedigreeStore.temporal.getState().undo();

    expect(usePedigreeStore.getState().document.twinGroups.tg1.twinType).toBe(
      TwinType.Dizygotic,
    );
  });
});

describe('ungroupTwins', () => {
  it('dissolves every twin group any selected member belongs to', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group); // { a, b }
    store.addTwinGroup({
      id: 'tg2',
      twinType: TwinType.Monozygotic,
      individualIds: ['c', 'd'],
      parentPartnershipId: 'u1',
    });

    // Selection touches both groups (one member of each).
    store.ungroupTwins(['a', 'c']);

    expect(usePedigreeStore.getState().document.twinGroups).toEqual({});
  });

  it('leaves untouched groups intact', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group); // { a, b }
    store.addTwinGroup({
      id: 'tg2',
      twinType: TwinType.Monozygotic,
      individualIds: ['c', 'd'],
      parentPartnershipId: 'u1',
    });

    store.ungroupTwins(['a']);

    const groups = usePedigreeStore.getState().document.twinGroups;
    expect(groups.tg1).toBeUndefined();
    expect(groups.tg2).toBeDefined();
  });

  it('is a no-op (no history entry) when the selection touches no group', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group);
    const before = usePedigreeStore.getState().document;

    store.ungroupTwins(['nobody']);

    expect(usePedigreeStore.getState().document).toBe(before);
  });

  it('records a single undoable step', () => {
    const store = usePedigreeStore.getState();
    store.addTwinGroup(group);

    store.ungroupTwins(['a', 'b']);
    expect(usePedigreeStore.getState().document.twinGroups.tg1).toBeUndefined();

    usePedigreeStore.temporal.getState().undo();
    expect(usePedigreeStore.getState().document.twinGroups.tg1).toBeDefined();
  });
});
