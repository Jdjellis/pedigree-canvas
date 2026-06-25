import React from 'react';
import { Group, Rect, Text, Shape, Circle as KonvaCircle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type {
  Investigation,
  LegendConfig,
  LegendEntry,
  Position,
} from '../../types/pedigree';
import type { CanvasBounds } from '../../utils/boundsCalculation';
import { GenderIdentity } from '../../types/enums';
import { clipSymbolPath } from '../../utils/symbolClip';
import { createPatternCanvas } from '../../utils/fillPatterns';
import { formatInvestigation } from '../../utils/investigations';
import { SYMBOL_COLOR, LABEL_FONT_FAMILY } from '../../utils/constants';

interface LegendLayerProps {
  legendConfig: LegendConfig;
  investigations: Investigation[];
  onMove: (position: Position) => void;
  bounds?: CanvasBounds | null;
}

const SWATCH_SIZE = 20;
const PADDING = 12;
const ROW_HEIGHT = 28;
const TITLE_HEIGHT = 24;

function SwatchShape({
  x,
  y,
  gender,
  entry,
}: {
  x: number;
  y: number;
  gender: GenderIdentity;
  entry: LegendEntry;
}) {
  const half = SWATCH_SIZE / 2;

  return (
    <Group x={x + half} y={y + half}>
      {/* Background shape */}
      {gender === GenderIdentity.Man ? (
        <Rect
          x={-half}
          y={-half}
          width={SWATCH_SIZE}
          height={SWATCH_SIZE}
          stroke={SYMBOL_COLOR}
          strokeWidth={1}
          fill="#ffffff"
        />
      ) : (
        <KonvaCircle
          radius={half - 0.5}
          stroke={SYMBOL_COLOR}
          strokeWidth={1}
          fill="#ffffff"
        />
      )}
      {/* Quarter fill */}
      <Shape
        sceneFunc={(ctx, shape) => {
          const nativeCtx = ctx._context;
          nativeCtx.save();
          clipSymbolPath(ctx, SWATCH_SIZE, gender);
          nativeCtx.clip();

          const qx =
            entry.quarter === 'topLeft' || entry.quarter === 'bottomLeft'
              ? -half : 0;
          const qy =
            entry.quarter === 'topLeft' || entry.quarter === 'topRight'
              ? -half : 0;

          if (entry.fillPattern === 'solid') {
            nativeCtx.fillStyle = entry.fillColor;
          } else {
            const patternCanvas = createPatternCanvas(entry.fillPattern, entry.fillColor);
            const pattern = nativeCtx.createPattern(patternCanvas, 'repeat');
            nativeCtx.fillStyle = pattern ?? entry.fillColor;
          }

          nativeCtx.fillRect(qx, qy, half, half);
          nativeCtx.restore();
          ctx.fillStrokeShape(shape);
        }}
      />
    </Group>
  );
}

export const LegendLayer: React.FC<LegendLayerProps> = React.memo(
  ({ legendConfig, investigations, onMove, bounds }) => {
    if (legendConfig.entries.length === 0 && investigations.length === 0) return null;

    // Calculate width: entries with "both" genders need wider rows
    const hasBothGender = legendConfig.entries.some((e) => !e.applicableTo);
    const swatchWidth = hasBothGender ? SWATCH_SIZE * 2 + 4 : SWATCH_SIZE;
    const contentWidth = PADDING * 2 + swatchWidth + 8 + 120;
    const contentHeight =
      PADDING * 2 +
      TITLE_HEIGHT +
      legendConfig.entries.length * ROW_HEIGHT +
      investigations.length * ROW_HEIGHT;

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
      onMove({ x: e.target.x(), y: e.target.y() });
    };

    // Position below the bounds rect so the legend never overlaps symbols or their decorators
    const legendX = bounds ? bounds.x + 10 : legendConfig.position.x;
    const legendY = bounds ? bounds.y + bounds.height + 16 : legendConfig.position.y;

    return (
      <Group
        x={legendX}
        y={legendY}
        draggable={!bounds}
        onDragEnd={!bounds ? handleDragEnd : undefined}
      >
        {/* Background */}
        <Rect
          width={contentWidth}
          height={contentHeight}
          fill="#ffffff"
          stroke={SYMBOL_COLOR}
          strokeWidth={1}
          cornerRadius={4}
        />

        {/* Title */}
        <Text
          x={PADDING}
          y={PADDING}
          text="Key"
          fontSize={14}
          fontFamily={LABEL_FONT_FAMILY}
          fontStyle="bold"
          fill={SYMBOL_COLOR}
        />

        {/* Entries */}
        {legendConfig.entries.map((entry, idx) => {
          const rowY = PADDING + TITLE_HEIGHT + idx * ROW_HEIGHT;
          const showBoth = !entry.applicableTo;
          const showSquare = entry.applicableTo === 'man' || showBoth;
          const showCircle = entry.applicableTo === 'woman' || showBoth;

          return (
            <React.Fragment key={entry.id}>
              {showSquare && (
                <SwatchShape
                  x={PADDING}
                  y={rowY}
                  gender={GenderIdentity.Man}
                  entry={entry}
                />
              )}
              {showCircle && (
                <SwatchShape
                  x={showBoth ? PADDING + SWATCH_SIZE + 4 : PADDING}
                  y={rowY}
                  gender={GenderIdentity.Woman}
                  entry={entry}
                />
              )}

              {/* Label — read as "icon = description", no gender suffix */}
              <Text
                x={PADDING + swatchWidth + 8}
                y={rowY + 4}
                text={`= ${entry.name}`}
                fontSize={12}
                fontFamily={LABEL_FONT_FAMILY}
                fill={SYMBOL_COLOR}
                width={120}
                ellipsis
                wrap="none"
              />
            </React.Fragment>
          );
        })}

        {/* Investigation rows ("label = description"), continuing on from the
            condition entries with no separate subheading. */}
        {investigations.map((investigation, idx) => (
          <Text
            key={`${investigation.label} ${investigation.description}`}
            x={PADDING}
            y={
              PADDING +
              TITLE_HEIGHT +
              (legendConfig.entries.length + idx) * ROW_HEIGHT +
              4
            }
            text={formatInvestigation(investigation)}
            fontSize={12}
            fontFamily={LABEL_FONT_FAMILY}
            fill={SYMBOL_COLOR}
            width={contentWidth - PADDING * 2}
            ellipsis
            wrap="none"
          />
        ))}
      </Group>
    );
  },
);

LegendLayer.displayName = 'LegendLayer';
