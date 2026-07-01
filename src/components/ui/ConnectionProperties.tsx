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

type ChildlessValue = 'none' | 'noChildren' | 'infertility';

const CHILDLESS_OPTIONS: { value: ChildlessValue; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'noChildren', label: 'No children' },
  { value: 'infertility', label: 'Infertility' },
];

/** Plain-language description of the marker each childless status draws. */
const CHILDLESS_HINT: Record<'noChildren' | 'infertility', string> = {
  noChildren:
    'Draws a single cross-bar below the couple’s line (with the cause, if given) — no children by choice or reason unknown.',
  infertility:
    'Draws a double cross-bar below the couple’s line (with the cause, if given), per standard.',
};

/** Placeholder for the free-text cause, tuned to the childless status. */
const CHILDLESS_CAUSE_PLACEHOLDER: Record<'noChildren' | 'infertility', string> = {
  noChildren: 'e.g. vasectomy',
  infertility: 'e.g. azoospermia',
};

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
  const removePartnership = usePedigreeStore((s) => s.removePartnership);
  const removeParentChildLink = usePedigreeStore((s) => s.removeParentChildLink);

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
          <div className={styles.field}>
            <label className={styles.label}>Childlessness</label>
            <SegmentedControl
              options={CHILDLESS_OPTIONS}
              value={p.childlessStatus ?? 'none'}
              disabled={p.childrenIds.length > 0}
              onChange={(v) =>
                updatePartnership(p.id, {
                  childlessStatus: v === 'none' ? undefined : v,
                  // Keep the cause across no-children/infertility; drop it only
                  // when clearing the childless status entirely.
                  childlessReason: v === 'none' ? undefined : p.childlessReason,
                })
              }
              ariaLabel="Childless status"
            />
            {p.childrenIds.length > 0 ? (
              <p className={styles.hint}>
                A childless marker doesn’t apply — this union has{' '}
                {p.childrenIds.length === 1 ? 'a child' : 'children'}. Detach{' '}
                {p.childrenIds.length === 1 ? 'them' : 'all of them'} first to mark
                it infertile or childless.
              </p>
            ) : (
              <>
                {p.childlessStatus && (
                  <p className={styles.hint}>{CHILDLESS_HINT[p.childlessStatus]}</p>
                )}
                {p.childlessStatus && (
                  <>
                    <label className={styles.label}>Cause</label>
                    <input
                      className={styles.input}
                      value={p.childlessReason ?? ''}
                      onChange={(e) =>
                        updatePartnership(p.id, {
                          childlessReason: e.target.value || undefined,
                        })
                      }
                      placeholder={CHILDLESS_CAUSE_PLACEHOLDER[p.childlessStatus]}
                    />
                  </>
                )}
              </>
            )}
          </div>
          {p.childrenIds.length > 0 && (
            <p className={styles.hint}>
              Removing this relationship also detaches its{' '}
              {p.childrenIds.length === 1
                ? 'child'
                : `${p.childrenIds.length} children`}{' '}
              from these parents. The {p.childrenIds.length === 1 ? 'person stays' : 'people stay'} on
              the canvas.
            </p>
          )}
          <button
            className={styles.deleteConnectionButton}
            onClick={() => {
              removePartnership(p.id);
              clearConnectionSelection();
            }}
          >
            Remove relationship
          </button>
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
          <button
            className={styles.deleteConnectionButton}
            onClick={() => {
              removeParentChildLink(link.id);
              clearConnectionSelection();
            }}
          >
            Remove line of descent
          </button>
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
