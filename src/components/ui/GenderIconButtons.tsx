import type { ReactElement } from 'react';
import { GenderIdentity } from '../../types/enums';
import styles from './GenderIconButtons.module.css';

const SYMBOL_SIZE = 26;

function SquareSymbol() {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="3" y="3" width="22" height="22" rx="1" stroke="currentColor" strokeWidth="2.5" fill="none" />
    </svg>
  );
}

function CircleSymbol() {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2.5" fill="none" />
    </svg>
  );
}

function DiamondSymbol() {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 28 28" aria-hidden="true">
      <polygon points="14,3 25,14 14,25 3,14" stroke="currentColor" strokeWidth="2.5" fill="none" />
    </svg>
  );
}

function UnknownSymbol() {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 28 28" aria-hidden="true">
      <polygon points="14,3 25,14 14,25 3,14" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <text x="14" y="18" textAnchor="middle" fontSize="10" fill="currentColor">?</text>
    </svg>
  );
}

interface GenderOption {
  value: GenderIdentity;
  label: string;
  Symbol: () => ReactElement;
}

const GENDER_OPTIONS: GenderOption[] = [
  { value: GenderIdentity.Man, label: 'Man', Symbol: SquareSymbol },
  { value: GenderIdentity.Woman, label: 'Woman', Symbol: CircleSymbol },
  { value: GenderIdentity.NonBinary, label: 'Non-binary', Symbol: DiamondSymbol },
  { value: GenderIdentity.Unknown, label: 'Unknown', Symbol: UnknownSymbol },
];

interface GenderIconButtonsProps {
  value: GenderIdentity;
  onChange: (value: GenderIdentity) => void;
}

export function GenderIconButtons({ value, onChange }: GenderIconButtonsProps) {
  return (
    <div className={styles.grid} role="group" aria-label="Gender identity">
      {GENDER_OPTIONS.map(({ value: opt, label, Symbol }) => (
        <button
          key={opt}
          type="button"
          className={`${styles.iconButton} ${opt === value ? styles.iconButtonActive : ''}`}
          aria-pressed={opt === value}
          aria-label={label}
          onClick={() => onChange(opt)}
        >
          <Symbol />
          <span className={styles.iconLabel}>{label}</span>
        </button>
      ))}
    </div>
  );
}
