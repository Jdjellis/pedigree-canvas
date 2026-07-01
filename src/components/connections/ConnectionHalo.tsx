import { Line } from 'react-konva';
import { SELECTION_COLOR, CONNECTION_HALO_WIDTH } from '../../utils/constants';
import { haloOpacity, type ConnectionEmphasis } from './connectionHighlight';

interface ConnectionHaloProps {
  /** The same point list as the line segment this halo sits beneath. */
  points: number[];
  emphasis: ConnectionEmphasis;
}

/**
 * A soft translucent glow drawn *beneath* a relationship line to signal that it
 * is interactive (hover) or currently selected — the line-level analogue of the
 * symbol HoverHighlight / SelectionHighlight.
 *
 * Render this immediately BEFORE its line so paint order keeps the glow behind
 * the stroke. Non-interactive (`listening={false}`) so it never steals the hit
 * area, and tagged `export-exclude` because selection/hover chrome must not
 * appear in SVG exports (svgExport.ts already omits it).
 */
export function ConnectionHalo({ points, emphasis }: ConnectionHaloProps) {
  const opacity = haloOpacity(emphasis);
  if (opacity === null) return null;
  return (
    <Line
      points={points}
      stroke={SELECTION_COLOR}
      strokeWidth={CONNECTION_HALO_WIDTH}
      opacity={opacity}
      lineCap="round"
      lineJoin="round"
      listening={false}
      name="export-exclude"
    />
  );
}
