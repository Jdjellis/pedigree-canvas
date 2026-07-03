import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import type { LegendEntry } from '../../types/pedigree';
import { generateId } from '../../utils/idGenerator';
import {
  ConditionColorPicker,
  ConditionQuarterGrid,
  ConditionPatternPicker,
} from './ConditionControls';
import { SegmentedControl } from './SegmentedControl';
import styles from './LegendEditor.module.css';

const APPLIES_TO_OPTIONS: { value: 'both' | 'man' | 'woman'; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'man', label: 'Men' },
  { value: 'woman', label: 'Women' },
];

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
    // pattern), so there is no per-quarter cap. New conditions default to the
    // top-right quarter; the user can move them afterwards.
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
          <button
            className={styles.closeButton}
            onClick={closeModal}
            aria-label="Close"
          >
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
          <label className={styles.label}>Condition name</label>
          <input
            className={styles.input}
            value={entry.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Breast cancer"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Colour</label>
          <ConditionColorPicker
            value={entry.fillColor}
            onChange={(fillColor) => onUpdate({ fillColor })}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Quarter</label>
          <ConditionQuarterGrid
            value={entry.quarter}
            onChange={(quarter) => onUpdate({ quarter })}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Pattern</label>
          <ConditionPatternPicker
            value={entry.fillPattern}
            color={entry.fillColor}
            onChange={(fillPattern) => onUpdate({ fillPattern })}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Applies to</label>
          <SegmentedControl
            ariaLabel="Applies to"
            options={APPLIES_TO_OPTIONS}
            value={entry.applicableTo ?? 'both'}
            onChange={(v) =>
              onUpdate({
                applicableTo: v === 'both' ? undefined : (v as 'man' | 'woman'),
              })
            }
          />
        </div>
      </div>

      <button
        className={styles.removeButton}
        onClick={onRemove}
        title="Remove condition"
        aria-label="Remove condition"
      >
        &times;
      </button>
    </div>
  );
}
