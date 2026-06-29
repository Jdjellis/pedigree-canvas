import type { TwinGroup } from '../../types/pedigree';
import { TwinType } from '../../types/enums';
import styles from './PropertiesPanel.module.css';

interface TwinZygosityFieldsProps {
  /** The twin group being edited. */
  twinGroup: TwinGroup;
  /** Set the group's zygosity. */
  onChangeType: (type: TwinType) => void;
  /** Disband the group. */
  onUngroup: () => void;
}

/**
 * Zygosity `<select>` + "Ungroup twins" button. Shared by the individual
 * properties panel (when a selected person is a twin) and the connection
 * editor (when the twin connector is selected) so both surfaces edit the same
 * group identically.
 */
export function TwinZygosityFields({
  twinGroup,
  onChangeType,
  onUngroup,
}: TwinZygosityFieldsProps) {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Zygosity</label>
        <select
          className={styles.select}
          value={twinGroup.twinType}
          onChange={(e) => onChangeType(e.target.value as TwinType)}
        >
          <option value={TwinType.Monozygotic}>Monozygotic (identical)</option>
          <option value={TwinType.Dizygotic}>Dizygotic (fraternal)</option>
          <option value={TwinType.Unknown}>Unknown zygosity</option>
        </select>
      </div>
      <button className={styles.addButton} onClick={onUngroup}>
        Ungroup twins
      </button>
    </>
  );
}
