import { useCallback } from 'react';
import { Line, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Individual, PartnershipRelationship } from '../../types/pedigree';
import { RelationshipType } from '../../types/enums';
import { useUIStore } from '../../stores/uiStore';
import type { ConnectionSelection } from '../../stores/uiStore';
import {
  LINE_COLOR,
  LINE_WIDTH,
  CONSANGUINITY_GAP,
  LABEL_FONT_SIZE,
  LABEL_FONT_FAMILY,
  LABEL_COLOR,
  RELATIONSHIP_LABEL_OFFSET,
  SELECTION_COLOR,
} from '../../utils/constants';

interface PartnershipLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  selectedConnection?: ConnectionSelection | null;
}

export function PartnershipLine({ partnership, individuals, selectedConnection }: PartnershipLineProps) {
  const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
  const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;

  const selectLine = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      useUIStore.getState().selectConnection({ kind: 'partnership', id: partnership.id });
    },
    [partnership.id],
  );

  const setCursor = useCallback((cursor: string) => {
    const stage = document.querySelector('canvas');
    if (stage) stage.style.cursor = cursor;
  }, []);

  if (!p1 || !p2) return null;

  const y = (p1.position.y + p2.position.y) / 2;

  const isSelected =
    selectedConnection?.kind === 'partnership' && selectedConnection.id === partnership.id;

  const lineProps = {
    stroke: isSelected ? SELECTION_COLOR : LINE_COLOR,
    strokeWidth: LINE_WIDTH,
    hitStrokeWidth: 12,
    onClick: selectLine,
    onTap: selectLine,
    onMouseEnter: () => setCursor('pointer'),
    onMouseLeave: () => setCursor('default'),
  };

  if (partnership.type === RelationshipType.Consanguinity) {
    const degree = partnership.consanguinityDegree?.trim();
    const midX = (p1.position.x + p2.position.x) / 2;
    const labelBoxWidth = 200;
    return (
      <>
        <Line
          points={[p1.position.x, y - CONSANGUINITY_GAP / 2, p2.position.x, y - CONSANGUINITY_GAP / 2]}
          {...lineProps}
        />
        <Line
          points={[p1.position.x, y + CONSANGUINITY_GAP / 2, p2.position.x, y + CONSANGUINITY_GAP / 2]}
          {...lineProps}
        />
        {degree && (
          <Text
            text={degree}
            x={midX - labelBoxWidth / 2}
            y={y - CONSANGUINITY_GAP / 2 - RELATIONSHIP_LABEL_OFFSET - LABEL_FONT_SIZE}
            width={labelBoxWidth}
            align="center"
            fontSize={LABEL_FONT_SIZE}
            fontFamily={LABEL_FONT_FAMILY}
            fill={LABEL_COLOR}
            listening={false}
          />
        )}
      </>
    );
  }

  if (partnership.type === RelationshipType.Separation) {
    const midX = (p1.position.x + p2.position.x) / 2;
    const hashSize = 6;
    return (
      <>
        <Line points={[p1.position.x, y, p2.position.x, y]} {...lineProps} />
        <Line
          points={[midX - 4, y - hashSize, midX + 4, y + hashSize]}
          {...lineProps}
        />
        <Line
          points={[midX + 2, y - hashSize, midX + 10, y + hashSize]}
          {...lineProps}
        />
      </>
    );
  }

  // Standard partnership - solid line
  return <Line points={[p1.position.x, y, p2.position.x, y]} {...lineProps} />;
}
