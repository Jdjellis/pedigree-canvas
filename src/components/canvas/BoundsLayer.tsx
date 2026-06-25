import React from 'react';
import { Rect, Text } from 'react-konva';
import type { CanvasBounds } from '../../utils/boundsCalculation';
import type { Individual } from '../../types/pedigree';
import { computeGenerationNumerals } from '../../utils/boundsCalculation';
import { LABEL_FONT_FAMILY, LABEL_COLOR } from '../../utils/constants';

interface BoundsLayerProps {
  bounds: CanvasBounds | null;
  individuals: Individual[];
}

export const BoundsLayer: React.FC<BoundsLayerProps> = React.memo(
  ({ bounds, individuals }) => {
    if (!bounds) return null;

    const genLabels = computeGenerationNumerals(individuals);

    return (
      <>
        <Rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          stroke="#cccccc"
          strokeWidth={1}
          dash={[6, 4]}
          listening={false}
          name="export-exclude"
        />
        {genLabels.map(({ generation, roman, y }) => (
          <Text
            key={`gen-${generation}`}
            x={bounds.x + 10}
            y={y - 7}
            text={roman}
            fontSize={14}
            fontFamily={LABEL_FONT_FAMILY}
            fontStyle="bold"
            fill={LABEL_COLOR}
            listening={false}
            name="export-exclude"
          />
        ))}
      </>
    );
  },
);

BoundsLayer.displayName = 'BoundsLayer';
