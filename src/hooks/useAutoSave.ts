import { useEffect } from 'react';
import { usePedigreeStore, createSeededDocument } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import type { PedigreeDocument } from '../types/pedigree';

const STORAGE_KEY = 'pedigree-editor-autosave';
const DEBOUNCE_MS = 2000;

/**
 * Parse and migrate a raw autosave payload from localStorage.
 *
 * @param raw - The raw JSON string (or null when nothing is stored).
 * @returns The migrated document, or null when absent/corrupt/invalid.
 */
export function parseSavedDocument(raw: string | null): PedigreeDocument | null {
  if (!raw) return null;
  try {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !('individuals' in doc)) return null;
    if (!doc.legendConfig) {
      doc.legendConfig = { entries: [], position: { x: 50, y: 50 } };
    }
    for (const entry of doc.legendConfig.entries) {
      if (entry.conditionNames && !entry.name) {
        entry.name = entry.conditionNames.default;
        delete entry.conditionNames;
      }
    }
    for (const ind of Object.values(doc.individuals)) {
      const individual = ind as Record<string, unknown>;
      if (!individual.conditionIds) individual.conditionIds = [];
    }
    return doc as PedigreeDocument;
  } catch {
    return null;
  }
}

/**
 * Auto-saves the pedigree document to localStorage on changes.
 * Debounced to avoid excessive writes during rapid edits (e.g. dragging).
 *
 * On mount, restores the document from localStorage if one exists.
 * When nothing valid is stored, seeds a fresh document with one starting person.
 */
export function useAutoSave() {
  // Restore on mount
  useEffect(() => {
    const doc = parseSavedDocument(localStorage.getItem(STORAGE_KEY));
    if (doc) {
      usePedigreeStore.getState().setDocument(doc);
    } else {
      // Genuinely fresh start (nothing valid to restore): seed a first person at
      // canvas origin. CanvasContainer centres the viewport on it once the stage
      // is measured — robust regardless of mount timing (the stage element does
      // not exist yet at this point, so a position computed here would be wrong).
      const sex = useUIStore.getState().defaultSex;
      usePedigreeStore.getState().setDocument(createSeededDocument(sex));
    }
  }, []);

  // Subscribe to store changes and auto-save
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = usePedigreeStore.subscribe((state) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state.document));
          // Surface a last-saved signal so the toolbar can show "Saved locally".
          useUIStore.getState().setLastSavedAt(Date.now());
        } catch {
          // localStorage full or unavailable — ignore
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
}
