import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import {
  usePedigreeStore,
  createDefaultDocument,
  createDefaultIndividual,
} from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import { GenderIdentity } from '../types/enums';

const STORAGE_KEY = 'pedigree-editor-autosave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    usePedigreeStore.getState().resetDocument();
    useUIStore.getState().setLastSavedAt(0);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('restore on mount', () => {
    it('loads a saved document from localStorage', () => {
      const saved = createDefaultDocument();
      saved.metadata.title = 'Restored';
      const ind = createDefaultIndividual();
      saved.individuals[ind.id] = ind;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

      renderHook(() => useAutoSave());

      expect(usePedigreeStore.getState().document.metadata.title).toBe('Restored');
      expect(usePedigreeStore.getState().document.individuals[ind.id]).toBeDefined();
    });

    it('backfills a missing legendConfig on legacy documents', () => {
      const legacy = createDefaultDocument() as unknown as Record<string, unknown>;
      delete legacy.legendConfig;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

      renderHook(() => useAutoSave());

      expect(usePedigreeStore.getState().document.legendConfig).toEqual({
        entries: [],
        position: { x: 50, y: 50 },
      });
    });

    it('backfills conditionIds on individuals that predate the field', () => {
      const doc = createDefaultDocument();
      const ind = createDefaultIndividual();
      doc.individuals[ind.id] = ind;
      const raw = JSON.parse(JSON.stringify(doc));
      delete raw.individuals[ind.id].conditionIds;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

      renderHook(() => useAutoSave());

      expect(
        usePedigreeStore.getState().document.individuals[ind.id].conditionIds,
      ).toEqual([]);
    });

    it('seeds a fresh person when localStorage contains corrupt JSON', () => {
      // Corrupt JSON is unparseable — no valid document to restore, so the hook
      // seeds a single starting person instead of leaving the canvas empty.
      localStorage.setItem(STORAGE_KEY, '{not valid json');

      renderHook(() => useAutoSave());

      const people = Object.values(usePedigreeStore.getState().document.individuals);
      expect(people).toHaveLength(1);
      expect(people[0].isProband).toBe(false);
      expect(people[0].genderIdentity).toBe(GenderIdentity.Unknown); // defaultSex is 'unknown'
    });

    it('seeds a fresh person when the stored payload is not a document', () => {
      // A valid JSON object that lacks the `individuals` key is not a document —
      // the hook seeds a single starting person rather than leaving the canvas empty.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));

      renderHook(() => useAutoSave());

      const people = Object.values(usePedigreeStore.getState().document.individuals);
      expect(people).toHaveLength(1);
      expect(people[0].isProband).toBe(false);
      expect(people[0].genderIdentity).toBe(GenderIdentity.Unknown); // defaultSex is 'unknown'
    });
  });

  describe('debounced save', () => {
    it('writes to localStorage after the debounce window and records lastSavedAt', () => {
      renderHook(() => useAutoSave());

      const ind = createDefaultIndividual();
      act(() => {
        usePedigreeStore.getState().addIndividual(ind);
      });

      // Nothing written before the debounce elapses.
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.individuals[ind.id]).toBeDefined();
      expect(useUIStore.getState().lastSavedAt).toBeGreaterThan(0);
    });

    it('coalesces rapid edits into a single write', () => {
      renderHook(() => useAutoSave());

      // Spy on the prototype of whatever localStorage actually is — Storage.prototype
      // in CI (native jsdom) or MemoryStorage.prototype locally (shim). This is
      // more portable than targeting either concrete type directly.
      const setSpy = vi.spyOn(
        Object.getPrototypeOf(localStorage) as Storage,
        'setItem',
      );

      act(() => {
        usePedigreeStore.getState().addIndividual(createDefaultIndividual());
        vi.advanceTimersByTime(500);
        usePedigreeStore.getState().addIndividual(createDefaultIndividual());
        vi.advanceTimersByTime(500);
        usePedigreeStore.getState().addIndividual(createDefaultIndividual());
      });

      // Still within the debounce of the latest edit — no write yet.
      expect(setSpy).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(setSpy).toHaveBeenCalledTimes(1);
      setSpy.mockRestore();
    });

    it('stops saving after unmount', () => {
      const { unmount } = renderHook(() => useAutoSave());
      unmount();

      const setSpy = vi.spyOn(
        Object.getPrototypeOf(localStorage) as Storage,
        'setItem',
      );
      act(() => {
        usePedigreeStore.getState().addIndividual(createDefaultIndividual());
        vi.advanceTimersByTime(2000);
      });

      expect(setSpy).not.toHaveBeenCalled();
      setSpy.mockRestore();
    });
  });
});
