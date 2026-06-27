import clsx from 'clsx';
import { useUIStore } from '../../../stores/uiStore';
import type { DefaultSex } from '../../../utils/sex';
import { SquareIcon, CircleIcon, DiamondIcon } from './toolIcons';
import styles from './islands.module.css';

/** One segment's display metadata. */
interface SexSegment {
  sex: DefaultSex;
  label: string;
  icon: React.ReactNode;
}

const SEGMENTS: SexSegment[] = [
  { sex: 'male', label: 'Male', icon: <SquareIcon /> },
  { sex: 'female', label: 'Female', icon: <CircleIcon /> },
  { sex: 'unknown', label: 'Unknown', icon: <DiamondIcon /> },
];

/**
 * Always-visible segmented control beside the Select tool that sets the
 * {@link DefaultSex} applied to singly-added people. Lives in the react-dom
 * tree, so subscribing to the UI store here is safe.
 */
export function DefaultSexControl(): React.JSX.Element {
  const defaultSex = useUIStore((s) => s.defaultSex);
  const setDefaultSex = useUIStore((s) => s.setDefaultSex);

  return (
    <div className={styles.sexControl} role="group" aria-label="Default sex for new people">
      {SEGMENTS.map((seg) => (
        <button
          key={seg.sex}
          type="button"
          className={clsx(styles.sexSegment, defaultSex === seg.sex && styles.sexSegmentActive)}
          onClick={() => setDefaultSex(seg.sex)}
          title={`New people: ${seg.label}`}
          aria-label={seg.label}
          aria-pressed={defaultSex === seg.sex}
        >
          <span className={styles.toolIcon} aria-hidden="true">{seg.icon}</span>
        </button>
      ))}
    </div>
  );
}
