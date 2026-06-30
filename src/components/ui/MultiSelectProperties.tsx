import { useMemo } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { GenderIdentity, SexAssignedAtBirth, VitalStatus, TwinType } from '../../types/enums';
import { commonSibshipId } from '../../utils/sibship';
import { twinGroupsTouching, pickSurvivingTwinGroup } from '../../utils/twinGrouping';
import type { Individual, LegendEntry } from '../../types/pedigree';
import { GenderIconButtons } from './GenderIconButtons';
import { SegmentedControl } from './SegmentedControl';
import styles from './PropertiesPanel.module.css';

const VITAL_STATUS_OPTIONS: { value: VitalStatus; label: string }[] = [
  { value: VitalStatus.Alive, label: 'Alive' },
  { value: VitalStatus.Deceased, label: 'Deceased' },
  { value: VitalStatus.Stillborn, label: 'Stillborn' },
];

const ZYGOSITY_LABELS: Record<TwinType, string> = {
  [TwinType.Monozygotic]: 'MZ',
  [TwinType.Dizygotic]: 'DZ',
  [TwinType.Unknown]: 'Unknown',
};

/**
 * Returns the value shared by every element, or `undefined` when the array is
 * empty or its elements disagree (a "mixed" selection).
 */
function sharedValue<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const [first, ...rest] = values;
  return rest.every((v) => v === first) ? first : undefined;
}

/** Whether a legend entry applies to a person, honouring its gender restriction. */
function conditionAppliesTo(entry: LegendEntry, person: Individual): boolean {
  if (!entry.applicableTo) return true;
  if (entry.applicableTo === 'man') return person.genderIdentity === GenderIdentity.Man;
  return person.genderIdentity === GenderIdentity.Woman;
}

/**
 * Properties editor shown when more than one individual is selected. Edits the
 * agreed bulk-eligible fields across the whole selection; controls whose people
 * disagree render a "Mixed" state and write only on an explicit change. It is a
 * react-dom component, so Zustand subscriptions are safe here.
 */
export function MultiSelectProperties() {
  const selectedIds = useUIStore((s) => s.selectedIds);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const individuals = usePedigreeStore((s) => s.document.individuals);
  const updateIndividuals = usePedigreeStore((s) => s.updateIndividuals);
  const legendConfig = usePedigreeStore((s) => s.document.legendConfig);
  const setConditionForIndividuals = usePedigreeStore((s) => s.setConditionForIndividuals);
  const parentChildLinks = usePedigreeStore((s) => s.document.parentChildLinks);
  const twinGroups = usePedigreeStore((s) => s.document.twinGroups);
  const groupTwins = usePedigreeStore((s) => s.groupTwins);
  const ungroupTwins = usePedigreeStore((s) => s.ungroupTwins);

  const ids = useMemo(
    () => Array.from(selectedIds).filter((id) => individuals[id]),
    [selectedIds, individuals],
  );
  const people = ids.map((id) => individuals[id]);

  if (people.length < 2) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>Select an individual to edit their properties</div>
      </div>
    );
  }

  const genderValue = sharedValue(people.map((p) => p.genderIdentity));
  const saabValue = sharedValue(people.map((p) => p.sexAssignedAtBirth ?? ''));
  const vitalValue = sharedValue(people.map((p) => p.vitalStatus));
  const allDeceased = people.every((p) => p.vitalStatus === VitalStatus.Deceased);
  const causeShared = sharedValue(people.map((p) => p.causeOfDeath ?? ''));
  const allAdopted = people.every((p) => p.adopted === true);
  const anyAdopted = people.some((p) => p.adopted === true);
  const adoptedMixed = anyAdopted && !allAdopted;

  const applicableEntries = legendConfig.entries.filter((entry) =>
    people.some((p) => conditionAppliesTo(entry, p)),
  );

  const sibshipId = commonSibshipId({ parentChildLinks }, ids);
  // Twin groups any selected sibling already belongs to. Drives which controls
  // the Twins section shows.
  const touchedGroups = twinGroupsTouching(twinGroups, ids);
  // Existing group whose zygosity would survive a merge (largest, stable
  // tiebreak) — shared with the groupTwins store action so the displayed
  // zygosity always matches the type the merge would keep.
  const survivingGroup = pickSurvivingTwinGroup(touchedGroups);
  // The whole selection sits inside a single existing twin group: there is
  // nothing to add (every selected person is already grouped together), so we
  // offer only "Ungroup twins" — not the no-op "Add to twin group".
  const fullyGroupedInOne =
    touchedGroups.length === 1 &&
    ids.every((id) => touchedGroups[0].individualIds.includes(id));
  // Mixed selection (ungrouped siblings alongside a group, or spanning 2+
  // groups): "Add to twin group" extends/merges, and "Ungroup twins" dissolves
  // the touched group(s) — both are meaningful, so show both.
  const showAddToGroup = touchedGroups.length > 0 && !fullyGroupedInOne;
  const showUngroup = touchedGroups.length > 0;

  return (
    <div className={styles.panel}>
      <fieldset
        disabled={editingLocked}
        style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}
      >
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{people.length} people selected</div>
        </div>

        {sibshipId && (
          <>
            <div className={styles.divider} />
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Twins</div>
              {survivingGroup ? (
                <div className={styles.field}>
                  {showAddToGroup && (
                    <>
                      <button
                        type="button"
                        className={styles.twinAddButton}
                        onClick={() => groupTwins(ids, survivingGroup.twinType)}
                      >
                        Add to twin group
                      </button>
                      <p className={styles.hint}>
                        Joins the existing {ZYGOSITY_LABELS[survivingGroup.twinType]} twin group.
                      </p>
                    </>
                  )}
                  {showUngroup && (
                    <>
                      <button
                        type="button"
                        className={styles.twinAddButton}
                        onClick={() => ungroupTwins(ids)}
                      >
                        Ungroup twins
                      </button>
                      <p className={styles.hint}>
                        {fullyGroupedInOne
                          ? `Dissolves the ${ZYGOSITY_LABELS[survivingGroup.twinType]} twin group.`
                          : touchedGroups.length > 1
                            ? 'Dissolves the selected twin groups.'
                            : 'Dissolves the existing twin group.'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className={styles.field}>
                  <div
                    className={styles.twinChoices}
                    role="group"
                    aria-label="Group as twins"
                  >
                    <button
                      type="button"
                      className={styles.twinChoice}
                      title="Monozygotic (identical)"
                      aria-label="Group as monozygotic twins"
                      onClick={() => groupTwins(ids, TwinType.Monozygotic)}
                    >
                      MZ
                    </button>
                    <button
                      type="button"
                      className={styles.twinChoice}
                      title="Dizygotic (fraternal)"
                      aria-label="Group as dizygotic twins"
                      onClick={() => groupTwins(ids, TwinType.Dizygotic)}
                    >
                      DZ
                    </button>
                    <button
                      type="button"
                      className={styles.twinChoice}
                      title="Unknown zygosity"
                      aria-label="Group as twins of unknown zygosity"
                      onClick={() => groupTwins(ids, TwinType.Unknown)}
                    >
                      Unknown
                    </button>
                  </div>
                  <p className={styles.hint}>
                    Group the {people.length} selected siblings as twins.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Identity</div>

          <div className={styles.field}>
            <label className={styles.label}>Gender Identity</label>
            {/* A value not in the enum renders no active button — our "Mixed" state. */}
            <GenderIconButtons
              value={genderValue ?? ('' as GenderIdentity)}
              onChange={(v) => updateIndividuals(ids, { genderIdentity: v })}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Sex Assigned at Birth</label>
            <select
              className={styles.select}
              value={saabValue ?? ''}
              onChange={(e) =>
                updateIndividuals(ids, {
                  sexAssignedAtBirth: (e.target.value || undefined) as
                    | SexAssignedAtBirth
                    | undefined,
                })
              }
            >
              <option value="">{saabValue === undefined ? 'Mixed' : 'Not specified'}</option>
              <option value={SexAssignedAtBirth.AMAB}>AMAB</option>
              <option value={SexAssignedAtBirth.AFAB}>AFAB</option>
              <option value={SexAssignedAtBirth.UAAB}>UAAB</option>
            </select>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Vital Status</div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            {/* A value not in the options renders no active segment — "Mixed". */}
            <SegmentedControl
              options={VITAL_STATUS_OPTIONS}
              value={vitalValue ?? ('' as VitalStatus)}
              onChange={(v) => updateIndividuals(ids, { vitalStatus: v })}
              ariaLabel="Vital status"
            />
          </div>
          {allDeceased && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="bulk-cause-of-death">
                Cause of Death
              </label>
              <input
                id="bulk-cause-of-death"
                className={styles.input}
                value={causeShared ?? ''}
                onChange={(e) =>
                  updateIndividuals(ids, { causeOfDeath: e.target.value || undefined })
                }
                placeholder={causeShared === undefined ? 'Mixed — type to set all' : 'Cause of death'}
              />
            </div>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Adoption</div>
          <div className={styles.field}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={allAdopted}
                ref={(el) => {
                  if (el) el.indeterminate = adoptedMixed;
                }}
                onChange={() => updateIndividuals(ids, { adopted: allAdopted ? undefined : true })}
              />
              Adopted
            </label>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Conditions</div>
          {applicableEntries.length === 0 ? (
            <p className={styles.hint}>
              {legendConfig.entries.length === 0
                ? 'No conditions defined. Use the Legend editor to add conditions.'
                : 'No conditions apply to the selected people.'}
            </p>
          ) : (
            applicableEntries.map((entry) => {
              const applicableIds = ids.filter((id) =>
                conditionAppliesTo(entry, individuals[id]),
              );
              const allHave =
                applicableIds.length > 0 &&
                applicableIds.every((id) =>
                  (individuals[id].conditionIds ?? []).includes(entry.id),
                );
              const anyHave = applicableIds.some((id) =>
                (individuals[id].conditionIds ?? []).includes(entry.id),
              );
              const mixed = anyHave && !allHave;
              return (
                <div key={entry.id} className={styles.field}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={allHave}
                      ref={(el) => {
                        if (el) el.indeterminate = mixed;
                      }}
                      onChange={() =>
                        setConditionForIndividuals(applicableIds, entry.id, !allHave)
                      }
                    />
                    <span
                      className={styles.conditionSwatch}
                      style={{ backgroundColor: entry.fillColor }}
                    />
                    {entry.name}
                  </label>
                </div>
              );
            })
          )}
        </div>
      </fieldset>
    </div>
  );
}
