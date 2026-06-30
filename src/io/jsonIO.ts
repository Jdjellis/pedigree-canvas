import type { PedigreeDocument, Individual, Investigation, ParentChildRelationship } from '../types/pedigree';
import { RelationshipType } from '../types/enums';
import { generateId } from '../utils/idGenerator';

// ---------------------------------------------------------------------------
// Legacy migration helpers
// ---------------------------------------------------------------------------

/**
 * SUNSET (pre-launch shim — delete before launch, see #66): a one-off upgrade of
 * legacy adoption data to the per-edge model. We have no external users; this only
 * upgrades our own localStorage + saved files, which self-heal on first load+save.
 * Do NOT grow this into a versioned migration chain.
 *
 * Mutates `doc` in place and returns it. Idempotent.
 *
 * - Legacy `link.isAdopted === true` or `link.type === 'adoption'` ⇒ `isAdoptive: true`.
 * - Legacy `individual.adopted === true` ⇒ that person's parent link(s) become
 *   adoptive (the old properties-panel checkbox only ever meant adopted-IN/dashed).
 * - Drops the dead `partnership.isAdoptive` field.
 */
export function migrateAdoption(doc: PedigreeDocument): PedigreeDocument {
  const links = Object.values(doc.parentChildLinks ?? {});

  for (const link of links) {
    const legacy = link as ParentChildRelationship & { isAdopted?: boolean };
    if (legacy.isAdopted === true || (legacy.type as RelationshipType) === RelationshipType.Adoption) {
      legacy.isAdoptive = true;
    }
    delete legacy.isAdopted;
    legacy.type = RelationshipType.ParentChild;
  }

  for (const ind of Object.values(doc.individuals ?? {})) {
    if (ind.adopted !== true) continue;
    for (const link of links) {
      // Legacy `Individual.adopted` predates per-edge styling and only ever meant
      // adopted-IN. Upgrade ONLY links the old format left unset (`undefined`) —
      // never overwrite an explicit biological edge (`false` = adopted-out), or we
      // would revert adopted-out to adopted-in on every load.
      if (link.childId === ind.id && link.isAdoptive === undefined) link.isAdoptive = true;
    }
  }

  for (const partnership of Object.values(doc.partnerships ?? {})) {
    delete (partnership as { isAdoptive?: boolean }).isAdoptive;
  }

  return doc;
}

// ---------------------------------------------------------------------------
// File format wrapper
// ---------------------------------------------------------------------------

/**
 * Current file-envelope tag. Files exported before the rename to Pedigree
 * Canvas carried `'PedigreeEditor'`; that tag is still accepted on read so
 * existing saved files keep opening.
 */
const APP_TAG = 'PedigreeCanvas';
const ACCEPTED_APP_TAGS: readonly string[] = [APP_TAG, 'PedigreeEditor'];

interface PedigreeFileFormat {
  app: typeof APP_TAG;
  formatVersion: '1.0' | '2.0';
  document: PedigreeDocument;
}

// ---------------------------------------------------------------------------
// Serialization / Deserialization
// ---------------------------------------------------------------------------

/**
 * Serialise a PedigreeDocument to a pretty-printed JSON string wrapped in the
 * standard `.pedigree.json` envelope.
 */
export function serializeDocument(doc: PedigreeDocument): string {
  const wrapper: PedigreeFileFormat = {
    app: APP_TAG,
    formatVersion: '2.0',
    document: doc,
  };
  return JSON.stringify(wrapper, null, 2);
}

/**
 * Parse a `.pedigree.json` string back into a PedigreeDocument.
 *
 * Validates that the required top-level fields exist on the document and throws
 * a descriptive Error when something is missing.
 */
export function deserializeDocument(json: string): PedigreeDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: the file does not contain valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid file: expected a JSON object at the top level.');
  }

  // Accept both the wrapped format and a raw PedigreeDocument.
  const record = parsed as Record<string, unknown>;
  const doc: unknown =
    typeof record.app === 'string' &&
    ACCEPTED_APP_TAGS.includes(record.app) &&
    record.document != null
      ? record.document
      : record;

  if (typeof doc !== 'object' || doc === null) {
    throw new Error('Invalid file: the document payload is not an object.');
  }

  const d = doc as Record<string, unknown>;

  // Validate required top-level keys
  const requiredKeys: (keyof PedigreeDocument)[] = [
    'metadata',
    'individuals',
    'partnerships',
    'parentChildLinks',
    'twinGroups',
    'generationOrder',
  ];

  for (const key of requiredKeys) {
    if (!(key in d)) {
      throw new Error(
        `Invalid pedigree document: missing required field "${key}".`,
      );
    }
  }

  // Validate metadata sub-fields
  if (typeof d.metadata !== 'object' || d.metadata === null) {
    throw new Error(
      'Invalid pedigree document: "metadata" must be an object.',
    );
  }

  const meta = d.metadata as Record<string, unknown>;
  const requiredMetaKeys = ['id', 'title', 'createdAt', 'updatedAt', 'version'];
  for (const key of requiredMetaKeys) {
    if (!(key in meta)) {
      throw new Error(
        `Invalid pedigree document: metadata is missing required field "${key}".`,
      );
    }
  }

  const result = doc as PedigreeDocument;

  // Migrate: ensure legendConfig exists
  if (!result.legendConfig) {
    result.legendConfig = { entries: [], position: { x: 50, y: 50 } };
  }

  // Migrate: ensure textAnnotations exists. Documents saved before free-text
  // annotations were introduced lack this field; default it to an empty map so
  // they load cleanly. (Intentionally not part of `requiredKeys` for this reason.)
  if (!result.textAnnotations) {
    result.textAnnotations = {};
  }

  // Migrate: convert old affectedStatus to conditionIds
  let migrationEntryId: string | null = null;
  for (const ind of Object.values(result.individuals)) {
    const individual = ind as Individual & { affectedStatus?: string };

    // Ensure conditionIds exists
    if (!individual.conditionIds) {
      individual.conditionIds = [];
    }

    // Ensure investigations exists (added after some documents were saved) and
    // migrate the legacy single-string form to the { label, description } shape.
    if (!individual.investigations) {
      individual.investigations = [];
    } else {
      const legacyInvestigations = individual.investigations as unknown as (
        | string
        | Investigation
      )[];
      individual.investigations = legacyInvestigations.map((inv) =>
        typeof inv === 'string' ? { label: inv, description: '' } : inv,
      );
    }

    // If old affectedStatus === 'affected', create a default legend entry and map
    if (individual.affectedStatus === 'affected') {
      if (!migrationEntryId) {
        migrationEntryId = generateId();
        result.legendConfig.entries.push({
          id: migrationEntryId,
          quarter: 'topRight',
          fillColor: '#1a1a1a',
          fillPattern: 'solid',
          name: result.metadata.referenceCondition || 'Affected',
        });
      }
      individual.conditionIds.push(migrationEntryId);
    }

    // Remove old field
    delete individual.affectedStatus;
  }

  // Migrate old conditionNames to name
  for (const entry of result.legendConfig.entries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy migration
    const e = entry as any;
    if (e.conditionNames && !e.name) {
      e.name = e.conditionNames.default;
      delete e.conditionNames;
    }
  }

  return migrateAdoption(result);
}

// ---------------------------------------------------------------------------
// File System helpers (browser)
// ---------------------------------------------------------------------------

/** Feature-detect the File System Access API. */
function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * Save a PedigreeDocument to disk.
 *
 * Uses the File System Access API when available (Chromium-based browsers) and
 * falls back to creating a temporary `<a download>` link.
 */
export async function saveToFile(doc: PedigreeDocument): Promise<void> {
  const json = serializeDocument(doc);
  const filename = `${doc.metadata.title || 'pedigree'}.pedigree.json`;

  if (hasFileSystemAccess()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- File System Access API not in lib.dom.d.ts
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Pedigree JSON file',
            accept: { 'application/json': ['.pedigree.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (err: unknown) {
      // If the user cancelled the picker, re-throw so callers can react.
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // For any other error fall through to the legacy path.
    }
  }

  // Fallback: <a download> approach
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Open a `.pedigree.json` (or plain `.json`) file and return the parsed
 * PedigreeDocument.
 *
 * Uses the File System Access API when available and falls back to a hidden
 * `<input type="file">` element.
 */
export async function loadFromFile(): Promise<PedigreeDocument> {
  let text: string;

  if (hasFileSystemAccess()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- File System Access API not in lib.dom.d.ts
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Pedigree JSON files',
            accept: {
              'application/json': ['.pedigree.json', '.json'],
            },
          },
        ],
        multiple: false,
      });
      const file: File = await handle.getFile();
      text = await file.text();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Fall through to the legacy path on other errors.
      text = await loadViaInput();
    }
  } else {
    text = await loadViaInput();
  }

  return deserializeDocument(text);
}

// ---------------------------------------------------------------------------
// Legacy file-input helper
// ---------------------------------------------------------------------------

function loadViaInput(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pedigree.json,.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        reject(new Error('No file selected.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        cleanup();
        reject(new Error('Failed to read the selected file.'));
      };
      reader.readAsText(file);
    });

    // Some browsers fire no event when the user cancels the dialog.
    // We use a focus listener as a heuristic to detect cancellation.
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          reject(new Error('File selection cancelled.'));
        }
      }, 300);
    };

    function cleanup() {
      window.removeEventListener('focus', handleFocus);
      document.body.removeChild(input);
    }

    document.body.appendChild(input);
    window.addEventListener('focus', handleFocus);
    input.click();
  });
}
