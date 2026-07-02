import type { JSX } from 'react';
import { Line, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type {
  Individual,
  PartnershipRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { TwinType } from '../../types/enums';
import {
  LINE_COLOR,
  LINE_WIDTH,
  LABEL_FONT_FAMILY,
  TWIN_UNKNOWN_FONT_SIZE,
  RELATIONSHIP_LABEL_OFFSET,
  SELECTION_COLOR,
} from '../../utils/constants';
import { useUIStore } from '../../stores/uiStore';
import type { ConnectionSelection } from '../../stores/uiStore';
import { getPresentPartners } from '../../utils/graphTraversal';
import { computeSibshipY } from './parentChildGeometry';
import { ConnectionHalo } from './ConnectionHalo';
import { connectionEmphasis } from './connectionHighlight';

interface TwinConnectorProps {
  twinGroup: TwinGroup;
  individuals: Record<string, Individual>;
  partnerships: Record<string, PartnershipRelationship>;
  selectedConnection?: ConnectionSelection | null;
  hoveredConnection?: ConnectionSelection | null;
}

export function TwinConnector({
  twinGroup,
  individuals,
  partnerships,
  selectedConnection,
  hoveredConnection,
}: TwinConnectorProps) {
  const twins = twinGroup.individualIds
    .map((id) => individuals[id])
    .filter(Boolean);

  if (twins.length < 2) return null;

  const partnership = partnerships[twinGroup.parentPartnershipId];
  if (!partnership) return null;

  // The sibship bar depth is shared with ParentChildLine so the V apex lands on
  // it for any number of present parents (0, 1, or 2). Earlier this connector
  // required BOTH partners to exist and silently rendered nothing otherwise,
  // leaving single-parent and parentless twins with no connector at all.
  const childAnchors = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c))
    .map((c) => ({ x: c.position.x, y: c.position.y }));
  if (childAnchors.length === 0) return null;

  const partnerAnchors = getPresentPartners(individuals, partnership).map((p) => ({
    x: p.position.x,
    y: p.position.y,
  }));

  // The branch point is on the sibship line directly above the twins' midpoint.
  const sibshipY = computeSibshipY(partnerAnchors, childAnchors);
  const childrenY = Math.min(...twins.map((t) => t.position.y));

  const twinMidX =
    twins.reduce((sum, t) => sum + t.position.x, 0) / twins.length;

  const isSelected =
    selectedConnection?.kind === 'twin' && selectedConnection.id === twinGroup.id;
  const isHovered =
    hoveredConnection?.kind === 'twin' && hoveredConnection.id === twinGroup.id;
  const emphasis = connectionEmphasis(isSelected, isHovered);
  const stroke = isSelected ? SELECTION_COLOR : LINE_COLOR;

  const selectGroup = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    useUIStore.getState().selectConnection({ kind: 'twin', id: twinGroup.id });
  };

  const interactive = {
    hitStrokeWidth: 12,
    onClick: selectGroup,
    onTap: selectGroup,
    // Only hover state is updated; the pointer cursor is derived from
    // `hoveredConnection` by CanvasContainer's cursor effect.
    onMouseEnter: () => {
      useUIStore.getState().setHoveredConnection({ kind: 'twin', id: twinGroup.id });
    },
    onMouseLeave: () => {
      useUIStore.getState().setHoveredConnection(null);
    },
  };

  // Halos are collected separately so they all paint beneath every twin stroke.
  const halos: JSX.Element[] = [];
  const elements: JSX.Element[] = [];

  // V-shaped lines from branch point to each twin
  for (const twin of twins) {
    const points = [twinMidX, sibshipY, twin.position.x, twin.position.y];
    halos.push(
      <ConnectionHalo key={`twin-halo-${twin.id}`} points={points} emphasis={emphasis} />
    );
    elements.push(
      <Line
        key={`twin-line-${twin.id}`}
        points={points}
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        {...interactive}
      />
    );
  }

  // Horizontal bar for monozygotic twins
  if (twinGroup.twinType === TwinType.Monozygotic) {
    const barY = sibshipY + (childrenY - sibshipY) / 2;
    const leftX = Math.min(...twins.map((t) => {
      const dx = t.position.x - twinMidX;
      const dy = t.position.y - sibshipY;
      const ratio = (barY - sibshipY) / dy;
      return twinMidX + dx * ratio;
    }));
    const rightX = Math.max(...twins.map((t) => {
      const dx = t.position.x - twinMidX;
      const dy = t.position.y - sibshipY;
      const ratio = (barY - sibshipY) / dy;
      return twinMidX + dx * ratio;
    }));

    halos.push(
      <ConnectionHalo
        key={`twin-bar-halo-${twinGroup.id}`}
        points={[leftX, barY, rightX, barY]}
        emphasis={emphasis}
      />
    );
    elements.push(
      <Line
        key={`twin-bar-${twinGroup.id}`}
        points={[leftX, barY, rightX, barY]}
        stroke={stroke}
        strokeWidth={LINE_WIDTH}
        {...interactive}
      />
    );
  }

  // "?" at the convergence point for unknown zygosity.
  if (twinGroup.twinType === TwinType.Unknown) {
    const boxWidth = 40;
    elements.push(
      <Text
        key={`twin-unknown-${twinGroup.id}`}
        text="?"
        x={twinMidX - boxWidth / 2}
        y={sibshipY - RELATIONSHIP_LABEL_OFFSET - TWIN_UNKNOWN_FONT_SIZE}
        width={boxWidth}
        align="center"
        fontSize={TWIN_UNKNOWN_FONT_SIZE}
        fontFamily={LABEL_FONT_FAMILY}
        fontStyle="bold"
        fill={LINE_COLOR}
        listening={false}
      />
    );
  }

  return <>{[...halos, ...elements]}</>;
}
