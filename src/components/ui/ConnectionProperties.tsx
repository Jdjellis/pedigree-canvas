import type { JSX } from 'react';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { useUIStore } from '../../stores/uiStore';
import { RelationshipType } from '../../types/enums';
import type { PartnershipRelationship } from '../../types/pedigree';
import { SegmentedControl } from './SegmentedControl';
import { TwinZygosityFields } from './TwinZygosityFields';
import { parentCoupleLabel } from '../../utils/adoption';
import styles from './PropertiesPanel.module.css';

type PartnershipStatus = PartnershipRelationship['type'];

const STATUS_OPTIONS: { value: PartnershipStatus; label: string }[] = [
  { value: RelationshipType.Partnership, label: 'Partnership' },
  { value: RelationshipType.Separation, label: 'Separated' },
  { value: RelationshipType.Consanguinity, label: 'Consanguineous' },
];

const DESCENT_OPTIONS: { value: 'biological' | 'adoptive'; label: string }[] = [
  { value: 'biological', label: 'Biological' },
  { value: 'adoptive', label: 'Adoptive' },
];

/**
 * Properties editor for a selected connection (line of descent, partnership, or
 * twin connector). Rendered by {@link PropertiesPanel} when
 * `uiStore.selectedConnection` is set. Reads/writes the stores directly (it is a
 * react-dom component, so subscriptions are safe here).
 */
export function ConnectionProperties() {
  const selectedConnection = useUIStore((s) => s.selectedConnection);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const clearConnectionSelection = useUIStore((s) => s.clearConnectionSelection);

  const partnerships = usePedigreeStore((s) => s.document.partnerships);
  const parentChildLinks = usePedigreeStore((s) => s.document.parentChildLinks);
  const twinGroups = usePedigreeStore((s) => s.document.twinGroups);
  const individuals = usePedigreeStore((s) => s.document.individuals);
  const updatePartnership = usePedigreeStore((s) => s.updatePartnership);
  const setLinkAdoptive = usePedigreeStore((s) => s.setLinkAdoptive);
  const updateTwinGroup = usePedigreeStore((s) => s.updateTwinGroup);
  const removeTwinGroup = usePedigreeStore((s) => s.removeTwinGroup);

  const empty = (
    <div className={styles.panel}>
      <div className={styles.empty}>Select an individual or connection to edit its properties</div>
    </div>
  );

  if (!selectedConnection) return empty;

  let body: JSX.Element | null = null;

  if (selectedConnection.kind === 'partnership') {
    const p = partnerships[selectedConnection.id];
    if (p) {
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Relationship</div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <SegmentedControl
              options={STATUS_OPTIONS}
              value={p.type}
              onChange={(type) => updatePartnership(p.id, { type })}
              ariaLabel="Relationship status"
            />
          </div>
          {p.type === RelationshipType.Consanguinity && (
            <div className={styles.field}>
              <label className={styles.label}>Degree of relationship</label>
              <input
                className={styles.input}
                value={p.consanguinityDegree ?? ''}
                onChange={(e) =>
                  updatePartnership(p.id, {
                    consanguinityDegree: e.target.value || undefined,
                  })
                }
                placeholder="e.g. 1st cousins"
              />
            </div>
          )}
        </div>
      );
    }
  } else if (selectedConnection.kind === 'parentChild') {
    const link = parentChildLinks[selectedConnection.id];
    if (link) {
      const childName = individuals[link.childId]?.displayName || 'Child';
      const parents = parentCoupleLabel({ individuals, partnerships }, link);
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Line of descent</div>
          <p className={styles.hint}>
            {childName} → {parents}
          </p>
          <div className={styles.field}>
            <SegmentedControl
              options={DESCENT_OPTIONS}
              value={link.isAdoptive ? 'adoptive' : 'biological'}
              onChange={(v) => setLinkAdoptive(link.id, v === 'adoptive')}
              ariaLabel="Line of descent"
            />
            <p className={styles.hint}>
              Adoptive draws a dashed line to the adoptive parents. The bracket
              annotation around the child is set on the person.
            </p>
          </div>
        </div>
      );
    }
  } else if (selectedConnection.kind === 'twin') {
    const tg = twinGroups[selectedConnection.id];
    if (tg) {
      body = (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Twin</div>
          <TwinZygosityFields
            twinGroup={tg}
            onChangeType={(twinType) => updateTwinGroup(tg.id, { twinType })}
            onUngroup={() => {
              removeTwinGroup(tg.id);
              clearConnectionSelection();
            }}
          />
        </div>
      );
    }
  }

  if (!body) return empty;

  return (
    <div className={styles.panel}>
      <fieldset
        disabled={editingLocked}
        style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}
      >
        {body}
      </fieldset>
    </div>
  );
}
