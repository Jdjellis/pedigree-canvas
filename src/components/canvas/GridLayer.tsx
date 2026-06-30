import React, { useMemo } from 'react';
import { Layer, Circle, Line } from 'react-konva';
import { GRID_SIZE, GRID_COLOR, GENERATION_SPACING } from '../../utils/constants';

export interface GridLayerProps {
  width: number;
  height: number;
  scale: number;
  position: { x: number; y: number };
  /** Grid-dot colour for the active theme. Defaults to the light constant. */
  gridColor?: string;
  /** Generation guide-line colour for the active theme. */
  generationLineColor?: string;
}

const DOT_RADIUS = 1;
const GENERATION_LINE_DASH = [4, 6];

export const GridLayer: React.FC<GridLayerProps> = React.memo(
  ({
    width,
    height,
    scale,
    position,
    gridColor = GRID_COLOR,
    generationLineColor = '#d4d4d4',
  }) => {
    const dots = useMemo(() => {
      // Convert viewport bounds to canvas (world) coordinates
      const viewLeft = -position.x / scale;
      const viewTop = -position.y / scale;
      const viewRight = (width - position.x) / scale;
      const viewBottom = (height - position.y) / scale;

      // Snap to grid boundaries, with one extra cell of padding on each side
      const startX = Math.floor(viewLeft / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
      const endX = Math.ceil(viewRight / GRID_SIZE) * GRID_SIZE + GRID_SIZE;
      const startY = Math.floor(viewTop / GRID_SIZE) * GRID_SIZE - GRID_SIZE;
      const endY = Math.ceil(viewBottom / GRID_SIZE) * GRID_SIZE + GRID_SIZE;

      const result: { x: number; y: number }[] = [];

      for (let x = startX; x <= endX; x += GRID_SIZE) {
        for (let y = startY; y <= endY; y += GRID_SIZE) {
          result.push({ x, y });
        }
      }

      return result;
    }, [width, height, scale, position.x, position.y]);

    const generationLines = useMemo(() => {
      const viewLeft = -position.x / scale;
      const viewTop = -position.y / scale;
      const viewRight = (width - position.x) / scale;
      const viewBottom = (height - position.y) / scale;

      const startY =
        Math.floor(viewTop / GENERATION_SPACING) * GENERATION_SPACING;
      const endY =
        Math.ceil(viewBottom / GENERATION_SPACING) * GENERATION_SPACING;

      const lines: { y: number; x1: number; x2: number }[] = [];

      for (let y = startY; y <= endY; y += GENERATION_SPACING) {
        lines.push({
          y,
          x1: viewLeft - GRID_SIZE,
          x2: viewRight + GRID_SIZE,
        });
      }

      return lines;
    }, [width, height, scale, position.x, position.y]);

    return (
      <Layer listening={false} name="export-exclude">
        {generationLines.map((line, i) => (
          <Line
            key={`gen-${i}`}
            points={[line.x1, line.y, line.x2, line.y]}
            stroke={generationLineColor}
            strokeWidth={1 / scale}
            dash={GENERATION_LINE_DASH}
            opacity={0.5}
          />
        ))}
        {dots.map((dot, i) => (
          <Circle
            key={i}
            x={dot.x}
            y={dot.y}
            radius={DOT_RADIUS / scale}
            fill={gridColor}
          />
        ))}
      </Layer>
    );
  }
);

GridLayer.displayName = 'GridLayer';
