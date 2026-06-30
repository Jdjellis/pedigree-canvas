import { useEffect } from 'react';
import { usePedigreeStore, createSeededDocument } from '../stores/pedigreeStore';
import { useUIStore } from '../stores/uiStore';
import * as safeStorage from '../utils/safeStorage';
import type { PedigreeDocument } from '../types/pedigree';
import { migrateAdoption } from '../io/jsonIO';

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
    return migrateAdoption(doc as PedigreeDocument);
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
    const doc = parseSavedDocument(safeStorage.getItem(STORAGE_KEY));
    if (doc) {
      usePedigreeStore.getState().setDocument(doc);
    } else {
      // Genuinely fresh start: seed an Unknown first person at canvas origin and
      // pop the gender picker on it (first-run only). CanvasContainer centres the
      // viewport on it once the stage is measured.
      const doc = createSeededDocument();
      usePedigreeStore.getState().setDocument(doc);
      const seedId = Object.keys(doc.individuals)[0];
      if (seedId) useUIStore.getState().showGenderPicker(seedId);
    }
  }, []);

  // Subscribe to store changes and auto-save
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = usePedigreeStore.subscribe((state) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const persisted = safeStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(state.document),
        );
        // Only claim "Saved locally" when the write actually persisted. When
        // storage is blocked the document is kept in memory for the session but
        // would not survive a reload, so we must not signal a durable save.
        if (persisted) {
          useUIStore.getState().setLastSavedAt(Date.now());
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
}
