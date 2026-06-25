import { useCallback, useState } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import {
  GenderIdentity,
  SexAssignedAtBirth,
  VitalStatus,
} from '../../types/enums';
import { generateId } from '../../utils/idGenerator';
import {
  detectQuarterClashes,
  freeQuartersFor,
} from '../../utils/quarterClashes';
import {
  COLOR_OPTIONS,
  PATTERN_OPTIONS,
  QUARTER_OPTIONS,
  createConditionEntry,
} from './legendOptions';
import type {
  FillPatternType,
  Individual,
  LegendEntry,
  QuarterPosition,
} from '../../types/pedigree';
import styles from './PropertiesPanel.module.css';

const QUARTER_LABELS: Record<QuarterPosition, string> = {
  topRight: 'Top-Right',
  topLeft: 'Top-Left',
  bottomLeft: 'Bottom-Left',
  bottomRight: 'Bottom-Right',
};

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds);
  const propertiesPanelOpen = useUIStore((s) => s.propertiesPanelOpen);
  const individuals = usePedigreeStore((s) => s.document.individuals);
  const updateIndividual = usePedigreeStore((s) => s.updateIndividual);
  const updateLegendEntry = usePedigreeStore((s) => s.updateLegendEntry);
  const addLegendEntry = usePedigreeStore((s) => s.addLegendEntry);
  const legendConfig = usePedigreeStore((s) => s.document.legendConfig);

  const selectedId =
    selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
  const individual = selectedId ? individuals[selectedId] : null;

  const update = useCallback(
    (patch: Partial<Individual>) => {
      if (selectedId) updateIndividual(selectedId, patch);
    },
    [selectedId, updateIndividual]
  );

  const [addingCondition, setAddingCondition] = useState(false);
  const [conditionName, setConditionName] = useState('');
  const [conditionColor, setConditionColor] = useState(COLOR_OPTIONS[0].value);
  const [conditionQuarter, setConditionQuarter] = useState<QuarterPosition>(
    QUARTER_OPTIONS[0].value,
  );
  const [conditionPattern, setConditionPattern] = useState<FillPatternType>(
    PATTERN_OPTIONS[0].value,
  );

  const resetConditionForm = useCallback(() => {
    setAddingCondition(false);
    setConditionName('');
    setConditionColor(COLOR_OPTIONS[0].value);
    setConditionQuarter(QUARTER_OPTIONS[0].value);
    setConditionPattern(PATTERN_OPTIONS[0].value);
  }, []);

  const submitCondition = useCallback(() => {
    if (!individual) return;
    if (!conditionName.trim()) return;
    const entry = createConditionEntry(
      generateId(),
      conditionName,
      conditionColor,
      conditionQuarter,
      conditionPattern,
    );
    addLegendEntry(entry);
    // Immediately apply the new condition to the selected individual.
    const current = individual.conditionIds ?? [];
    update({ conditionIds: [...current, entry.id] });
    resetConditionForm();
  }, [
    individual,
    conditionName,
    conditionColor,
    conditionQuarter,
    conditionPattern,
    addLegendEntry,
    update,
    resetConditionForm,
  ]);

  const [addingNote, setAddingNote] = useState(false);
  const [noteName, setNoteName] = useState('');
  const [noteAge, setNoteAge] = useState('');

  const resetNoteForm = useCallback(() => {
    setAddingNote(false);
    setNoteName('');
    setNoteAge('');
  }, []);

  const submitNote = useCallback(() => {
    if (!individual) return;
    const name = noteName.trim();
    if (!name) return;
    const parsedAge = noteAge.trim() ? parseInt(noteAge, 10) : NaN;
    const ageOfOnset = !isNaN(parsedAge) ? parsedAge : undefined;
    update({
      conditions: [
        ...individual.conditions,
        {
          id: generateId(),
          name,
          ageOfOnset,
        },
      ],
    });
    resetNoteForm();
  }, [individual, noteName, noteAge, update, resetNoteForm]);

  if (!propertiesPanelOpen || !individual) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Select an individual to edit their properties
        </div>
      </div>
    );
  }

  const toggleCondition = (entryId: string) => {
    const current = individual.conditionIds ?? [];
    const next = current.includes(entryId)
      ? current.filter((id) => id !== entryId)
      : [...current, entryId];
    update({ conditionIds: next });
  };

  const applicableEntries = legendConfig.entries.filter((entry) => {
    if (!entry.applicableTo) return true;
    if (entry.applicableTo === 'man' && individual.genderIdentity === GenderIdentity.Man) return true;
    if (entry.applicableTo === 'woman' && individual.genderIdentity === GenderIdentity.Woman) return true;
    return false;
  });

  const appliedConditionIds = individual.conditionIds ?? [];
  const clashes = detectQuarterClashes(
    appliedConditionIds,
    legendConfig.entries,
  );

  /**
   * Resolve a clash by moving a single condition to a different quarter. This is
   * a global edit to the shared LegendEntry, which is intentional in the
   * global-quarter model.
   */
  const shiftConditionQuarter = (
    entryId: string,
    quarter: QuarterPosition,
  ) => {
    updateLegendEntry(entryId, { quarter });
  };

  return (
    <div className={styles.panel}>
      {/* Identity Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Identity</div>

        <div className={styles.field}>
          <label className={styles.label}>Name / Initials</label>
          <input
            className={styles.input}
            value={individual.displayName ?? ''}
            onChange={(e) =>
              update({ displayName: e.target.value || undefined })
            }
            placeholder="Name or initials"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Gender Identity</label>
          <select
            className={styles.select}
            value={individual.genderIdentity}
            onChange={(e) =>
              update({
                genderIdentity: e.target.value as GenderIdentity,
              })
            }
          >
            <option value={GenderIdentity.Unknown}>Unknown</option>
            <option value={GenderIdentity.Man}>Man</option>
            <option value={GenderIdentity.Woman}>Woman</option>
            <option value={GenderIdentity.NonBinary}>Non-binary</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Sex Assigned at Birth</label>
          <select
            className={styles.select}
            value={individual.sexAssignedAtBirth ?? ''}
            onChange={(e) =>
              update({
                sexAssignedAtBirth: (e.target.value ||
                  undefined) as SexAssignedAtBirth | undefined,
              })
            }
          >
            <option value="">Not specified</option>
            <option value={SexAssignedAtBirth.AMAB}>AMAB</option>
            <option value={SexAssignedAtBirth.AFAB}>AFAB</option>
            <option value={SexAssignedAtBirth.UAAB}>UAAB</option>
          </select>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Clinical Section - Condition Checkboxes */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Conditions</div>

        {applicableEntries.length === 0 ? (
          <p className={styles.hint}>
            {legendConfig.entries.length === 0
              ? 'No conditions defined. Use the Legend editor to add conditions.'
              : 'No conditions apply to this individual.'}
          </p>
        ) : (
          applicableEntries.map((entry) => (
            <div key={entry.id} className={styles.field}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={(individual.conditionIds ?? []).includes(entry.id)}
                  onChange={() => toggleCondition(entry.id)}
                />
                <span
                  className={styles.conditionSwatch}
                  style={{ backgroundColor: entry.fillColor }}
                />
                {entry.name}
              </label>
            </div>
          ))
        )}

        {addingCondition ? (
          <div className={styles.noteForm}>
            <input
              className={styles.input}
              value={conditionName}
              onChange={(e) => setConditionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCondition();
                if (e.key === 'Escape') resetConditionForm();
              }}
              placeholder="Condition name"
              autoFocus
            />
            <div className={styles.field}>
              <label className={styles.label}>Color</label>
              <select
                className={styles.select}
                value={conditionColor}
                onChange={(e) => setConditionColor(e.target.value)}
              >
                {COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Quarter</label>
              <select
                className={styles.select}
                value={conditionQuarter}
                onChange={(e) =>
                  setConditionQuarter(e.target.value as QuarterPosition)
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
              <label className={styles.label}>Pattern</label>
              <select
                className={styles.select}
                value={conditionPattern}
                onChange={(e) =>
                  setConditionPattern(e.target.value as FillPatternType)
                }
              >
                {PATTERN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.noteFormActions}>
              <button
                className={styles.noteAddButton}
                onClick={submitCondition}
                disabled={!conditionName.trim()}
              >
                Add
              </button>
              <button
                className={styles.noteCancelButton}
                onClick={resetConditionForm}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className={styles.addButton}
            onClick={() => setAddingCondition(true)}
          >
            + Add Condition
          </button>
        )}

        {clashes.length > 0 && (
          <div className={styles.clashWarning} role="alert">
            <p className={styles.clashTitle}>
              {clashes.length === 1
                ? 'Two conditions share a quarter'
                : 'Conditions share quarters'}
            </p>
            {clashes.map((clash) => (
              <div key={clash.quarter} className={styles.clashGroup}>
                <p className={styles.clashText}>
                  {QUARTER_LABELS[clash.quarter]} is used by{' '}
                  {clash.entries.map((e) => e.name).join(', ')}. Shift one to a
                  free quarter:
                </p>
                {clash.entries.map((entry) => (
                  <ClashResolveRow
                    key={entry.id}
                    entry={entry}
                    appliedConditionIds={appliedConditionIds}
                    allEntries={legendConfig.entries}
                    onShift={shiftConditionQuarter}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* Clinical Notes */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Clinical Notes</div>

        <div className={styles.field}>
          {individual.conditions.map((condition, idx) => (
            <div key={condition.id} className={styles.conditionItem}>
              <span className={styles.conditionName}>
                {condition.name}
                {condition.ageOfOnset != null
                  ? ` (onset: ${condition.ageOfOnset})`
                  : ''}
              </span>
              <button
                className={styles.removeButton}
                onClick={() =>
                  update({
                    conditions: individual.conditions.filter(
                      (_, i) => i !== idx
                    ),
                  })
                }
              >
                &times;
              </button>
            </div>
          ))}
          {addingNote ? (
            <div className={styles.noteForm}>
              <input
                className={styles.input}
                value={noteName}
                onChange={(e) => setNoteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNote();
                  if (e.key === 'Escape') resetNoteForm();
                }}
                placeholder="Clinical note / condition"
                autoFocus
              />
              <input
                className={styles.input}
                type="number"
                value={noteAge}
                onChange={(e) => setNoteAge(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNote();
                  if (e.key === 'Escape') resetNoteForm();
                }}
                placeholder="Age of onset (optional)"
                min={0}
              />
              <div className={styles.noteFormActions}>
                <button
                  className={styles.noteAddButton}
                  onClick={submitNote}
                  disabled={!noteName.trim()}
                >
                  Add
                </button>
                <button
                  className={styles.noteCancelButton}
                  onClick={resetNoteForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.addButton}
              onClick={() => setAddingNote(true)}
            >
              + Add Note
            </button>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Vital Status Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Vital Status</div>

        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <select
            className={styles.select}
            value={individual.vitalStatus}
            onChange={(e) =>
              update({
                vitalStatus: e.target.value as VitalStatus,
              })
            }
          >
            <option value={VitalStatus.Alive}>Alive</option>
            <option value={VitalStatus.Deceased}>Deceased</option>
            <option value={VitalStatus.Stillborn}>Stillborn</option>
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Age</label>
          <input
            className={styles.input}
            type="number"
            value={individual.age ?? ''}
            onChange={(e) =>
              update({
                age: e.target.value
                  ? parseInt(e.target.value, 10)
                  : undefined,
              })
            }
            placeholder="Age"
            min={0}
          />
        </div>

        {individual.vitalStatus === VitalStatus.Deceased && (
          <div className={styles.field}>
            <label className={styles.label}>Cause of Death</label>
            <input
              className={styles.input}
              value={individual.causeOfDeath ?? ''}
              onChange={(e) =>
                update({
                  causeOfDeath: e.target.value || undefined,
                })
              }
              placeholder="Cause of death"
            />
          </div>
        )}
      </div>

      <div className={styles.divider} />

      {/* Pedigree Role Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Pedigree Role</div>

        <div className={styles.field}>
          <label className={styles.label}>Role</label>
          <select
            className={styles.select}
            value={
              individual.isProband
                ? 'proband'
                : individual.isConsultand
                  ? 'consultand'
                  : 'none'
            }
            onChange={(e) => {
              const val = e.target.value;
              update({
                isProband: val === 'proband',
                isConsultand: val === 'consultand',
              });
            }}
          >
            <option value="none">None</option>
            <option value="proband">Proband</option>
            <option value="consultand">Consultand</option>
          </select>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Notes Section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Notes</div>
        <div className={styles.field}>
          <textarea
            className={styles.input}
            value={individual.notes ?? ''}
            onChange={(e) =>
              update({ notes: e.target.value || undefined })
            }
            placeholder="Internal notes..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  );
}

interface ClashResolveRowProps {
  /** The clashing condition this row can relocate. */
  entry: LegendEntry;
  /** Ids of all conditions applied to the selected individual. */
  appliedConditionIds: string[];
  /** All legend entries in the document. */
  allEntries: LegendEntry[];
  /** Move `entry` to the chosen quarter (a global LegendEntry edit). */
  onShift: (entryId: string, quarter: QuarterPosition) => void;
}

/**
 * One row of the clash-resolution UI: names a clashing condition and lets the
 * user move it to a quarter that is free among the individual's other applied
 * conditions.
 */
function ClashResolveRow({
  entry,
  appliedConditionIds,
  allEntries,
  onShift,
}: ClashResolveRowProps) {
  const freeQuarters = freeQuartersFor(
    entry.id,
    appliedConditionIds,
    allEntries,
  ).filter((quarter) => quarter !== entry.quarter);

  return (
    <div className={styles.clashResolveRow}>
      <span className={styles.clashResolveLabel}>
        <span
          className={styles.conditionSwatch}
          style={{ backgroundColor: entry.fillColor }}
        />
        <span className={styles.clashResolveName}>{entry.name}</span>
      </span>
      <select
        className={styles.clashSelect}
        value=""
        disabled={freeQuarters.length === 0}
        onChange={(e) => {
          if (e.target.value) {
            onShift(entry.id, e.target.value as QuarterPosition);
          }
        }}
      >
        <option value="">
          {freeQuarters.length === 0 ? 'No free quarter' : 'Move to…'}
        </option>
        {freeQuarters.map((quarter) => (
          <option key={quarter} value={quarter}>
            {QUARTER_LABELS[quarter]}
          </option>
        ))}
      </select>
    </div>
  );
}
