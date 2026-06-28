import type { JSX } from 'react';
import { Line } from 'react-konva';
import type {
  Individual,
  PartnershipRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { TwinType } from '../../types/enums';
import { LINE_COLOR, LINE_WIDTH } from '../../utils/constants';

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

  const p1 = partnership.partner1Id ? individuals[partnership.partner1Id] : undefined;
  const p2 = partnership.partner2Id ? individuals[partnership.partner2Id] : undefined;
  if (!p1 || !p2) return null;

  // The branch point is on the sibship line directly above the twins' midpoint
  const partnershipY = (p1.position.y + p2.position.y) / 2;
  const childrenY = Math.min(...twins.map((t) => t.position.y));
  const sibshipY = partnershipY + (childrenY - partnershipY) / 2;

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

  return <>{elements}</>;
}
