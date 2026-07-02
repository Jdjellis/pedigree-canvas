import type { JSX } from 'react';
import { useCallback } from 'react';
import { Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type {
  Individual,
  PartnershipRelationship,
  ParentChildRelationship,
  TwinGroup,
} from '../../types/pedigree';
import { LINE_COLOR, LINE_WIDTH, DASH_PATTERN, SELECTION_COLOR } from '../../utils/constants';
import { useUIStore } from '../../stores/uiStore';
import type { ConnectionSelection } from '../../stores/uiStore';
import { getPresentPartners } from '../../utils/graphTraversal';
import { twinApexXByMember } from '../../utils/twinOperations';
import {
  computeParentChildSegments,
  computeParentlessSibshipSegments,
} from './parentChildGeometry';
import { ConnectionHalo } from './ConnectionHalo';
import { connectionEmphasis } from './connectionHighlight';

interface ParentChildLineProps {
  partnership: PartnershipRelationship;
  individuals: Record<string, Individual>;
  parentChildLinks: Record<string, ParentChildRelationship>;
  twinGroups: Record<string, TwinGroup>;
  selectedConnection?: ConnectionSelection | null;
  hoveredConnection?: ConnectionSelection | null;
}

export function ParentChildLine({
  partnership,
  individuals,
  parentChildLinks,
  twinGroups,
  selectedConnection,
  hoveredConnection,
}: ParentChildLineProps) {
  const selectLink = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>, linkId: string) => {
      e.cancelBubble = true;
      useUIStore.getState().selectConnection({ kind: 'parentChild', id: linkId });
    },
    [],
  );

  const children = partnership.childrenIds
    .map((id) => individuals[id])
    .filter((c): c is Individual => Boolean(c));
  if (children.length === 0) return null;

  const partners = getPresentPartners(individuals, partnership);
  // Twin members anchor the sibship bar at their group's apex, not their own
  // positions, so the bar joins the parent drop to the twin junction instead of
  // spanning the twins (whose converging lines TwinConnector draws). A centred
  // twins-only sibship therefore collapses to no bar at all.
  const twinApexX = twinApexXByMember(twinGroups, individuals);
  const anchors = children.map((c) => ({
    x: twinApexX.get(c.id) ?? c.position.x,
    y: c.position.y,
  }));

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

  // Twin members are connected by TwinConnector — skip their individual drops to
  // avoid overlaying a plain bracket on top of the converging twin lines.
  const twinMemberIds = new Set(
    Object.values(twinGroups).flatMap((tg) => tg.individualIds),
  );

  children.forEach((child, i) => {
    if (twinMemberIds.has(child.id)) return;
    const link = Object.values(parentChildLinks).find(
      (l) => l.parentPartnershipId === partnership.id && l.childId === child.id,
    );
    const isSelected =
      !!link &&
      selectedConnection?.kind === 'parentChild' &&
      selectedConnection.id === link.id;
    const isHovered =
      !!link &&
      hoveredConnection?.kind === 'parentChild' &&
      hoveredConnection.id === link.id;
    // A halo beneath the drop signals the line of descent is clickable (hover)
    // or selected — only for links that are actually interactive.
    if (link) {
      lines.push(
        <ConnectionHalo
          key={`drop-halo-${child.id}`}
          points={childDrops[i]}
          emphasis={connectionEmphasis(isSelected, isHovered)}
        />,
      );
    }
    // Dash the line of descent only for an adoptive (non-biological) edge, per
    // NSGC/Bennett. Brackets on the child are handled separately in the symbol.
    lines.push(
      <Line
        key={`drop-${child.id}`}
        points={childDrops[i]}
        stroke={isSelected ? SELECTION_COLOR : LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        dash={link?.isAdoptive ? DASH_PATTERN : undefined}
        {...(link
          ? {
              hitStrokeWidth: 12,
              onClick: (e: KonvaEventObject<MouseEvent>) => selectLink(e, link.id),
              onTap: (e: KonvaEventObject<TouchEvent>) => selectLink(e, link.id),
              // Only hover state is updated; the pointer cursor is derived from
              // `hoveredConnection` by CanvasContainer's cursor effect.
              onMouseEnter: () => {
                useUIStore.getState().setHoveredConnection({ kind: 'parentChild', id: link.id });
              },
              onMouseLeave: () => {
                useUIStore.getState().setHoveredConnection(null);
              },
            }
          : {})}
      />,
    );
  });

  return <>{lines}</>;
}
