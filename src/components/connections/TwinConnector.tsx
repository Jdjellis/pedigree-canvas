import type { JSX } from 'react';
import { Line, Text } from 'react-konva';
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
} from '../../utils/constants';
import { getPresentPartners } from '../../utils/graphTraversal';
import { computeSibshipY } from './parentChildGeometry';

interface TwinConnectorProps {
  twinGroup: TwinGroup;
  individuals: Record<string, Individual>;
  partnerships: Record<string, PartnershipRelationship>;
}

export function TwinConnector({
  twinGroup,
  individuals,
  partnerships,
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

  const elements: JSX.Element[] = [];

  // V-shaped lines from branch point to each twin
  for (const twin of twins) {
    elements.push(
      <Line
        key={`twin-line-${twin.id}`}
        points={[twinMidX, sibshipY, twin.position.x, twin.position.y]}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
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

    elements.push(
      <Line
        key={`twin-bar-${twinGroup.id}`}
        points={[leftX, barY, rightX, barY]}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
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

  return <>{elements}</>;
}
