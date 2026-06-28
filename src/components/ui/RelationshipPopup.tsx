import { useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { RelationshipType } from '../../types/enums';
import styles from './RelationshipPopup.module.css';
import clsx from 'clsx';

type PartnershipType =
  | RelationshipType.Partnership
  | RelationshipType.Separation
  | RelationshipType.Consanguinity;

const OPTIONS: ReadonlyArray<{ type: PartnershipType; label: string }> = [
  { type: RelationshipType.Partnership, label: 'Partnership' },
  { type: RelationshipType.Separation, label: 'Separated' },
  { type: RelationshipType.Consanguinity, label: 'Consanguineous' },
];

export function RelationshipPopup() {
  const { visible, partnershipId, screenPosition } = useUIStore(
    (s) => s.relationshipPopup,
  );
  const hideRelationshipPopup = useUIStore((s) => s.hideRelationshipPopup);
  const partnerships = usePedigreeStore((s) => s.document.partnerships);
  const updatePartnership = usePedigreeStore((s) => s.updatePartnership);

  const partnership = partnershipId ? partnerships[partnershipId] : null;

  const setType = useCallback(
    (type: PartnershipType) => {
      if (!partnershipId) return;
      updatePartnership(partnershipId, { type });
      // Changing away from consanguinity is handled at render time (the degree
      // field hides); the stored value is kept so toggling back restores it.
      if (type !== RelationshipType.Consanguinity) {
        hideRelationshipPopup();
      }
    },
    [partnershipId, updatePartnership, hideRelationshipPopup],
  );

  if (!visible || !partnership) return null;

  const isConsanguineous = partnership.type === RelationshipType.Consanguinity;

  return (
    <div className={styles.backdrop} onClick={hideRelationshipPopup}>
      <div
        className={styles.popup}
        style={{ left: screenPosition.x, top: screenPosition.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>Relationship Status</div>
        {OPTIONS.map((option) => {
          const isActive = partnership.type === option.type;
          return (
            <button
              key={option.type}
              className={clsx(styles.option, isActive && styles.active)}
              onClick={() => setType(option.type)}
            >
              {option.label}
              {isActive && <span className={styles.check}>✓</span>}
            </button>
          );
        })}
        {isConsanguineous && (
          <div className={styles.degreeField}>
            <label className={styles.degreeLabel} htmlFor="consanguinity-degree">
              Degree of relationship
            </label>
            <input
              id="consanguinity-degree"
              className={styles.degreeInput}
              value={partnership.consanguinityDegree ?? ''}
              onChange={(e) =>
                partnershipId &&
                updatePartnership(partnershipId, {
                  consanguinityDegree: e.target.value || undefined,
                })
              }
              placeholder="e.g. 1st cousins"
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
