import React, { useMemo } from 'react';
import { Group, Text } from 'react-konva';
import type { Individual } from '../../../types/pedigree';
import { VitalStatus } from '../../../types/enums';
import {
  SYMBOL_SIZE,
  LABEL_FONT_SIZE,
  LABEL_FONT_FAMILY,
  LABEL_COLOR,
  LABEL_OFFSET_Y,
} from '../../../utils/constants';

export interface SymbolLabelProps {
  individual: Individual;
  individualNumber?: number;
}

const LINE_HEIGHT = LABEL_FONT_SIZE + 4;

/**
 * Horizontal gap between the symbol's right edge and the start of the
 * bottom-right individual number, so the digits never touch the outline.
 */
const NUMBER_CORNER_GAP = 3;

export const SymbolLabel: React.FC<SymbolLabelProps> = React.memo(
  ({ individual, individualNumber }) => {
    const lines = useMemo(() => {
      const result: string[] = [];

      // Display name
      if (individual.displayName) {
        result.push(individual.displayName);
      }

      // Age (or "d. [age]" if deceased)
      if (individual.age != null) {
        if (
          individual.vitalStatus === VitalStatus.Deceased ||
          individual.vitalStatus === VitalStatus.Stillborn
        ) {
          result.push(`d. ${individual.age}`);
        } else {
          result.push(`${individual.age}`);
        }
      }

      // Sex assigned at birth annotation (AMAB / AFAB)
      if (individual.sexAssignedAtBirth) {
        result.push(individual.sexAssignedAtBirth);
      }

      // Subsequent lines: conditions with age of onset
      for (const condition of individual.conditions) {
        if (condition.ageOfOnset != null) {
          result.push(`${condition.name} (dx ${condition.ageOfOnset})`);
        } else {
          result.push(condition.name);
        }
      }

      // Free-text investigations (genetic tests etc.)
      for (const investigation of individual.investigations) {
        const value = investigation.trim();
        if (value) result.push(value);
      }

      return result;
    }, [individual]);

    if (lines.length === 0 && individualNumber == null) {
      return null;
    }

    const half = SYMBOL_SIZE / 2;
    const startY = half + LABEL_OFFSET_Y;

    return (
      <Group>
        {/* Individual number at the symbol's bottom-right corner (pedigree
            convention). Left-anchored just outside the shape's bounding box so
            it reads as sitting at the corner without overlapping the outline. */}
        {individualNumber != null && (
          <Text
            text={`${individualNumber}`}
            x={half + NUMBER_CORNER_GAP}
            y={half - LABEL_FONT_SIZE / 2}
            fontSize={LABEL_FONT_SIZE}
            fontFamily={LABEL_FONT_FAMILY}
            fill={LABEL_COLOR}
          />
        )}

        {/* Name / age / conditions stack, centred below the symbol. */}
        {lines.map((line, index) => (
          <Text
            key={index}
            text={line}
            y={startY + index * LINE_HEIGHT}
            fontSize={LABEL_FONT_SIZE}
            fontFamily={LABEL_FONT_FAMILY}
            fill={LABEL_COLOR}
            align="center"
            width={200}
            x={-100}
          />
        ))}
      </Group>
    );
  }
);

SymbolLabel.displayName = 'SymbolLabel';
