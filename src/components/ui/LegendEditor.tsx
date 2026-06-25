import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import type {
  LegendEntry,
  QuarterPosition,
  FillPatternType,
} from '../../types/pedigree';
import { generateId } from '../../utils/idGenerator';
import {
  COLOR_OPTIONS,
  PATTERN_OPTIONS,
  QUARTER_OPTIONS,
} from './legendOptions';
import styles from './LegendEditor.module.css';

export function LegendEditor() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const legendConfig = usePedigreeStore((s) => s.document.legendConfig);
  const addLegendEntry = usePedigreeStore((s) => s.addLegendEntry);
  const updateLegendEntry = usePedigreeStore((s) => s.updateLegendEntry);
  const removeLegendEntry = usePedigreeStore((s) => s.removeLegendEntry);

  if (activeModal !== 'legendEditor') return null;

  const handleAdd = () => {
    // Conditions may share a quarter (they are differentiated by colour /
    // pattern), so there is no longer a per-quarter cap. New conditions default
    // to the top-right quarter; the user can move them afterwards.
    addLegendEntry({
      id: generateId(),
      quarter: 'topRight',
      fillColor: '#1a1a1a',
      fillPattern: 'solid',
      name: 'New Condition',
    });
  };

  return (
    <div className={styles.backdrop} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Legend / Key</h2>
          <button className={styles.closeButton} onClick={closeModal}>
            &times;
          </button>
        </div>

        <div className={styles.body}>
          {legendConfig.entries.length === 0 && (
            <p className={styles.emptyMessage}>
              No conditions defined. Add conditions to shade symbol quarters.
              Multiple conditions can share a quarter — distinguish them by
              colour and pattern.
            </p>
          )}

          {legendConfig.entries.map((entry) => (
            <LegendEntryRow
              key={entry.id}
              entry={entry}
              onUpdate={(patch) => updateLegendEntry(entry.id, patch)}
              onRemove={() => removeLegendEntry(entry.id)}
            />
          ))}

          <button className={styles.addButton} onClick={handleAdd}>
            + Add Condition
          </button>
        </div>
      </div>
    </div>
  );
}

interface LegendEntryRowProps {
  entry: LegendEntry;
  onUpdate: (patch: Partial<LegendEntry>) => void;
  onRemove: () => void;
}

function LegendEntryRow({ entry, onUpdate, onRemove }: LegendEntryRowProps) {
  return (
    <div className={styles.entryRow}>
      <div className={styles.entryFields}>
        <div className={styles.field}>
          <label className={styles.label}>Condition Name</label>
          <input
            className={styles.input}
            value={entry.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Breast cancer"
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>Quarter</label>
            <select
              className={styles.select}
              value={entry.quarter}
              onChange={(e) =>
                onUpdate({ quarter: e.target.value as QuarterPosition })
              }
            >
              {QUARTER_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Color</label>
            <select
              className={styles.select}
              value={entry.fillColor}
              onChange={(e) => onUpdate({ fillColor: e.target.value })}
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Pattern</label>
            <select
              className={styles.select}
              value={entry.fillPattern}
              onChange={(e) =>
                onUpdate({ fillPattern: e.target.value as FillPatternType })
              }
            >
              {PATTERN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Applies To</label>
          <select
            className={styles.select}
            value={entry.applicableTo ?? 'both'}
            onChange={(e) =>
              onUpdate({
                applicableTo: e.target.value === 'both' ? undefined : (e.target.value as 'man' | 'woman'),
              })
            }
          >
            <option value="both">Both genders</option>
            <option value="man">Male only</option>
            <option value="woman">Female only</option>
          </select>
        </div>
      </div>

      <button
        className={styles.removeButton}
        onClick={onRemove}
        title="Remove condition"
      >
        &times;
      </button>
    </div>
  );
}
