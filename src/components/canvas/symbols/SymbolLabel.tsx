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
  ADOPTION_BRACKET_GAP,
} from '../../../utils/constants';
import { CHILDLESS_LABEL_OFFSET } from '../../../utils/childlessness';

export interface SymbolLabelProps {
  individual: Individual;
  individualNumber?: number;
  /**
   * True when this individual's childless marks are drawn below the symbol. The
   * label block is then pushed down to clear the stub + cross-bar(s), and the
   * childless cause (if any) is folded in as the first line so it reads as part
   * of the marks. Owned by the parent, which knows whether the marks are
   * suppressed by children — see {@link childlessMarksActive}.
   */
  childlessActive?: boolean;
}

const LINE_HEIGHT = LABEL_FONT_SIZE + 4;

/**
 * Horizontal gap between the symbol's right edge (or the adoption bracket's
 * right arm, when the individual is adopted) and the start of the bottom-right
 * individual number, so the digits never touch the outline or clip against the
 * bracket.
 */
const NUMBER_CORNER_GAP = 3;

/**
 * X of the bottom-right individual number's left edge. Normally just outside
 * the symbol's bounding box; when the individual is adopted the number is
 * shifted past the adoption bracket's right vertical stroke so the bracket
 * arm cannot occlude the digits (see issue #152).
 */
function numberCornerX(adopted: boolean): number {
  const base = adopted ? ADOPTION_BRACKET_GAP : SYMBOL_SIZE / 2;
  return base + NUMBER_CORNER_GAP;
}

export const SymbolLabel: React.FC<SymbolLabelProps> = React.memo(
  ({ individual, individualNumber, childlessActive = false }) => {
    const lines = useMemo(() => {
      const result: string[] = [];

      // Childless cause (e.g. "vasectomy") sits first, directly under the
      // cross-bar(s), when the childless marks are drawn — mirrors the partnership
      // marker, which prints the cause below its bars.
      const childlessReason = individual.childlessReason?.trim();
      if (childlessActive && childlessReason) {
        result.push(childlessReason);
      }

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

      // Stillbirth: "SB" abbreviation plus gestational age, per NSGC/Bennett
      // (the symbol stays the sex-specific shape with a deceased slash — a
      // stillbirth is never a triangle). Gestational age is only meaningful for
      // a stillbirth or an ongoing pregnancy, so it is gated on those rather
      // than shown for any individual that happens to carry a stale value.
      if (individual.vitalStatus === VitalStatus.Stillborn) {
        result.push('SB');
      }
      // Pregnancy not carried to term: annotate the triangle with the outcome
      // abbreviation (SAB / TOP / ECT) so the three losses are distinguishable.
      if (individual.isPregnancy && individual.pregnancyOutcome) {
        result.push(individual.pregnancyOutcome);
      }
      if (
        (individual.vitalStatus === VitalStatus.Stillborn || individual.isPregnancy) &&
        individual.gestationalAge?.trim()
      ) {
        result.push(`GA: ${individual.gestationalAge.trim()}`);
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

      // Investigations (genetic tests etc.) — the short label only; the
      // free-text description is surfaced in the key and properties panel.
      for (const investigation of individual.investigations) {
        const value = investigation.label.trim();
        if (value) result.push(value);
      }

      return result;
    }, [individual, childlessActive]);

    if (lines.length === 0 && individualNumber == null) {
      return null;
    }

    const half = SYMBOL_SIZE / 2;
    // Push the whole stack below the childless marks when they are drawn.
    const startY =
      half + LABEL_OFFSET_Y + (childlessActive ? CHILDLESS_LABEL_OFFSET : 0);

    return (
      <Group>
        {/* Individual number at the symbol's bottom-right corner (pedigree
            convention). Left-anchored just outside the shape's bounding box so
            it reads as sitting at the corner without overlapping the outline. */}
        {individualNumber != null && (
          <Text
            text={`${individualNumber}`}
            x={numberCornerX(individual.adopted ?? false)}
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
