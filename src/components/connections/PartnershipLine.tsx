import type { JSX } from 'react';
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
  CHILDLESS_STUB,
  CHILDLESS_BAR_HALF,
  CHILDLESS_BAR_GAP,
  LABEL_FONT_SIZE,
  LABEL_FONT_FAMILY,
  LABEL_COLOR,
  RELATIONSHIP_LABEL_OFFSET,
  SELECTION_COLOR,
} from '../../utils/constants';
import {
  childlessMarks,
  consanguinityLines,
  partnershipMidpoint,
} from '../../utils/partnershipGeometry';
import { ConnectionHalo } from './ConnectionHalo';
import { connectionEmphasis } from './connectionHighlight';

/**
 * Marks for a childless union (infertility / no children by choice), hung below
 * the relationship-line midpoint. Rendered for any relationship type, so it is
 * computed once and appended after the base line. Non-interactive: selection is
 * driven by the base line's hit area.
 *
 * Suppressed once the union has children on the canvas: a childless marker would
 * contradict the sibship it hangs over, and the panel control is disabled there,
 * so a stale marker would otherwise be unremovable (mirrors svgExport.ts).
 */
function childlessMarkElements(
  partnership: PartnershipRelationship,
  mid: { x: number; y: number },
  stroke: string,
): JSX.Element[] {
  if (!partnership.childlessStatus || partnership.childrenIds.length > 0) return [];
  const { stub, bars } = childlessMarks(mid, partnership.childlessStatus, {
    stub: CHILDLESS_STUB,
    barHalf: CHILDLESS_BAR_HALF,
    barGap: CHILDLESS_BAR_GAP,
  });
  const els: JSX.Element[] = [
    <Line
      key={`cl-stub-${partnership.id}`}
      points={stub}
      stroke={stroke}
      strokeWidth={LINE_WIDTH}
      listening={false}
    />,
    ...bars.map((b, i) => (
      <Line
        key={`cl-bar-${partnership.id}-${i}`}
        points={b}
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        listening={false}
      />
    )),
  ];
  const reason = partnership.childlessReason?.trim();
  if (partnership.childlessStatus === 'infertility' && reason) {
    els.push(
      <Text
        key={`cl-reason-${partnership.id}`}
        text={reason}
        x={mid.x - 100}
        y={mid.y + CHILDLESS_STUB + RELATIONSHIP_LABEL_OFFSET}
        width={200}
        align="center"
        fontSize={LABEL_FONT_SIZE}
        fontFamily={LABEL_FONT_FAMILY}
        fill={LABEL_COLOR}
        listening={false}
      />,
    );
  }
  return els;
}

interface PartnershipLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  selectedConnection?: ConnectionSelection | null;
  hoveredConnection?: ConnectionSelection | null;
}

export function PartnershipLine({
  partnership,
  individuals,
  selectedConnection,
  hoveredConnection,
}: PartnershipLineProps) {
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

  const handleEnter = useCallback(() => {
    setCursor('pointer');
    useUIStore.getState().setHoveredConnection({ kind: 'partnership', id: partnership.id });
  }, [setCursor, partnership.id]);

  const handleLeave = useCallback(() => {
    setCursor('default');
    useUIStore.getState().setHoveredConnection(null);
  }, [setCursor]);

  if (!p1 || !p2) return null;

  const mid = partnershipMidpoint(p1.position, p2.position);

  const isSelected =
    selectedConnection?.kind === 'partnership' && selectedConnection.id === partnership.id;
  const isHovered =
    hoveredConnection?.kind === 'partnership' && hoveredConnection.id === partnership.id;
  const emphasis = connectionEmphasis(isSelected, isHovered);

  const lineProps = {
    stroke: isSelected ? SELECTION_COLOR : LINE_COLOR,
    strokeWidth: LINE_WIDTH,
    hitStrokeWidth: 12,
    onClick: selectLine,
    onTap: selectLine,
    onMouseEnter: handleEnter,
    onMouseLeave: handleLeave,
  };

  const markStroke = isSelected ? SELECTION_COLOR : LINE_COLOR;
  const childless = childlessMarkElements(partnership, mid, markStroke);

  if (partnership.type === RelationshipType.Consanguinity) {
    const degree = partnership.consanguinityDegree?.trim();
    const { a, b } = consanguinityLines(p1.position, p2.position, CONSANGUINITY_GAP);
    const labelBoxWidth = 200;
    return (
      <>
        <ConnectionHalo points={a} emphasis={emphasis} />
        <ConnectionHalo points={b} emphasis={emphasis} />
        <Line points={a} {...lineProps} />
        <Line points={b} {...lineProps} />
        {degree && (
          <Text
            text={degree}
            x={mid.x - labelBoxWidth / 2}
            y={mid.y - CONSANGUINITY_GAP / 2 - RELATIONSHIP_LABEL_OFFSET - LABEL_FONT_SIZE}
            width={labelBoxWidth}
            align="center"
            fontSize={LABEL_FONT_SIZE}
            fontFamily={LABEL_FONT_FAMILY}
            fill={LABEL_COLOR}
            listening={false}
          />
        )}
        {childless}
      </>
    );
  }

  if (partnership.type === RelationshipType.Separation) {
    const hashSize = 6;
    return (
      <>
        <ConnectionHalo
          points={[p1.position.x, p1.position.y, p2.position.x, p2.position.y]}
          emphasis={emphasis}
        />
        <Line
          points={[p1.position.x, p1.position.y, p2.position.x, p2.position.y]}
          {...lineProps}
        />
        <Line
          points={[mid.x - 4, mid.y - hashSize, mid.x + 4, mid.y + hashSize]}
          {...lineProps}
        />
        <Line
          points={[mid.x + 2, mid.y - hashSize, mid.x + 10, mid.y + hashSize]}
          {...lineProps}
        />
        {childless}
      </>
    );
  }

  // Standard partnership - solid line
  return (
    <>
      <ConnectionHalo
        points={[p1.position.x, p1.position.y, p2.position.x, p2.position.y]}
        emphasis={emphasis}
      />
      <Line
        points={[p1.position.x, p1.position.y, p2.position.x, p2.position.y]}
        {...lineProps}
      />
      {childless}
    </>
  );
}
