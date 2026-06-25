import type { JSX } from 'react';
import { Line } from 'react-konva';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../../types/pedigree';
import { LINE_COLOR, LINE_WIDTH, DASH_PATTERN } from '../../utils/constants';
import { computeParentChildSegments } from './parentChildGeometry';

interface ParentChildLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  parentChildLinks: Record<string, ParentChildRelationship>;
}

export function ParentChildLine({
  partnership,
  individuals,
  parentChildLinks,
}: ParentChildLineProps) {
  const p1 = individuals[partnership.partner1Id];
  const p2 = individuals[partnership.partner2Id];

  if (!p1 || !p2) return null;
  if (partnership.childrenIds.length === 0) return null;

  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter(Boolean);

  if (children.length === 0) return null;

  const partnershipY = (p1.position.y + p2.position.y) / 2;
  const partnershipMidX = (p1.position.x + p2.position.x) / 2;

  const { parentDrop, sibship, childDrops } = computeParentChildSegments(
    partnershipMidX,
    partnershipY,
    children.map((c) => ({ x: c.position.x, y: c.position.y })),
  );

  const lines: JSX.Element[] = [];

  // Vertical line from partnership midpoint down to the sibship line.
  lines.push(
    <Line
      key={`vert-${partnership.id}`}
      points={parentDrop}
      stroke={LINE_COLOR}
      strokeWidth={LINE_WIDTH}
    />
  );

  // Horizontal sibship line joining the parents' drop to every child drop.
  // Drawn whenever anything is horizontally offset (incl. a single child whose
  // x differs from the partnership midpoint), so the connector never breaks
  // into disconnected stubs.
  if (sibship) {
    lines.push(
      <Line
        key={`sib-${partnership.id}`}
        points={sibship}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />
    );
  }

  // Vertical drops from the sibship line down to each child.
  children.forEach((child, i) => {
    const link = Object.values(parentChildLinks).find(
      (l) =>
        l.parentPartnershipId === partnership.id &&
        l.childId === child.id
    );
    const isAdopted = link?.isAdopted ?? false;

    lines.push(
      <Line
        key={`drop-${child.id}`}
        points={childDrops[i]}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        dash={isAdopted ? DASH_PATTERN : undefined}
      />
    );
  });

  return <>{lines}</>;
}
