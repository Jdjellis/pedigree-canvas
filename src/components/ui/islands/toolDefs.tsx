import { MousePointer2, Minus, Type, Eraser } from 'lucide-react';
import type { ActiveTool } from '../../../stores/uiStore';

/**
 * The subset of tools that get a top-level button + number badge in the tool
 * island. Excludes `hand`, which is a modal helper rendered separately with no
 * badge. Used to type the badge row and its activator lookup exhaustively.
 */
export type PlacementToolId = Exclude<ActiveTool, 'hand'>;

/** A single placeable tool's display metadata. */
export interface ToolDef {
  id: PlacementToolId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

/** Outlined square — the pedigree symbol for a male individual. */
export function SquareIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <rect x="1.5" y="1.5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Outlined circle — the pedigree symbol for a female individual. */
export function CircleIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Outlined diamond — the pedigree symbol for unknown sex. */
export function DiamondIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="4.5" y="4.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45 9 9)" />
    </svg>
  );
}

/** Placeable tools, in toolbar display order, with their number shortcuts. */
export const PLACEMENT_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: '1', icon: <MousePointer2 size={19} /> },
  { id: 'male', label: 'Add male', shortcut: '2', icon: <SquareIcon /> },
  { id: 'female', label: 'Add female', shortcut: '3', icon: <CircleIcon /> },
  { id: 'unknown', label: 'Add unknown sex', shortcut: '4', icon: <DiamondIcon /> },
  { id: 'partnership', label: 'Partnership', shortcut: '5', icon: <Minus size={19} /> },
  { id: 'text', label: 'Text', shortcut: '6', icon: <Type size={19} /> },
  { id: 'eraser', label: 'Eraser', shortcut: '7', icon: <Eraser size={19} /> },
];
