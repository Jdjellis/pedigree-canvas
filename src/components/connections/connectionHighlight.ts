import {
  CONNECTION_HOVER_OPACITY,
  CONNECTION_SELECTED_OPACITY,
} from '../../utils/constants';

/**
 * Visual emphasis for an interactive relationship line. A selected line reads
 * stronger than a merely-hovered one; an idle line shows no halo at all.
 * Selection wins over hover so a hovered-and-selected line stays "selected".
 */
export type ConnectionEmphasis = 'selected' | 'hover' | 'none';

export function connectionEmphasis(
  isSelected: boolean,
  isHovered: boolean,
): ConnectionEmphasis {
  if (isSelected) return 'selected';
  if (isHovered) return 'hover';
  return 'none';
}

/**
 * Halo opacity for a given emphasis, or `null` when no halo should render.
 * Keeping this pure (no Konva import) makes it unit-testable — the line
 * components themselves cannot render under jsdom.
 */
export function haloOpacity(emphasis: ConnectionEmphasis): number | null {
  switch (emphasis) {
    case 'selected':
      return CONNECTION_SELECTED_OPACITY;
    case 'hover':
      return CONNECTION_HOVER_OPACITY;
    case 'none':
      return null;
  }
}
