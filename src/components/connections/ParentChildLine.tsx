import type { JSX } from 'react';
import { Line } from 'react-konva';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
} from '../../types/pedigree';
import { LINE_COLOR, LINE_WIDTH, DASH_PATTERN } from '../../utils/constants';
import { getPresentPartners } from '../../utils/graphTraversal';
import {
  computeParentChildSegments,
  computeParentlessSibshipSegments,
} from './parentChildGeometry';

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
  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c));
  if (children.length === 0) return null;

  const partners = getPresentPartners(individuals, partnership);
  const anchors = children.map((c) => ({ x: c.position.x, y: c.position.y }));

  let parentDrop: [number, number, number, number] | null = null;
  let sibship: [number, number, number, number] | null = null;
  let childDrops: [number, number, number, number][] = [];

  // 0 partners → bare sibship bar (no descent up); 1–2 partners → descent from the averaged anchor.
  if (partners.length === 0) {
    ({ sibship, childDrops } = computeParentlessSibshipSegments(anchors));
  } else {
    const anchorX = partners.reduce((s, p) => s + p.position.x, 0) / partners.length;
    const anchorY = partners.reduce((s, p) => s + p.position.y, 0) / partners.length;
    ({ parentDrop, sibship, childDrops } = computeParentChildSegments(anchorX, anchorY, anchors));
  }

  const lines: JSX.Element[] = [];

  if (parentDrop) {
    lines.push(
      <Line key={`vert-${partnership.id}`} points={parentDrop} stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} />,
    );
  }

  if (sibship) {
    lines.push(
      <Line key={`sib-${partnership.id}`} points={sibship} stroke={LINE_COLOR} strokeWidth={LINE_WIDTH} />,
    );
  }

  children.forEach((child, i) => {
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    // Dash the line of descent when the child is adopted, sourced from either the
    // link's flag (adoption created via the link popup) or the individual's
    // `adopted` toggle (properties panel). See NSGC/Bennett adoption notation.
    const isAdopted = (link?.isAdopted ?? false) || (child.adopted ?? false);
    lines.push(
      <Line
        key={`drop-${child.id}`}
        points={childDrops[i]}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        dash={isAdopted ? DASH_PATTERN : undefined}
      />,
    );
  });

  return <>{lines}</>;
}
