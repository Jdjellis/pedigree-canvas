import type { JSX } from 'react';
import { Line } from 'react-konva';
import type { Individual, PartnershipRelationship } from '../../types/pedigree';
import {
  LINE_COLOR,
  LINE_WIDTH,
  CHILDLESS_STUB,
  CHILDLESS_BAR_HALF,
  CHILDLESS_BAR_GAP,
} from '../../utils/constants';
import { childlessMarks } from '../../utils/partnershipGeometry';
import { individualChildlessAnchor, individualHasChildren } from '../../utils/childlessness';

interface IndividualChildlessLineProps {
  individual: Individual;
  partnerships: Record<string, PartnershipRelationship>;
}

/**
 * Marks for an individual documented as childless (infertility / no children by
 * choice) with no partner drawn, hung straight below the symbol. The no-partner
 * analogue of {@link childlessMarkElements} in `PartnershipLine.tsx`: identical
 * stub + cross-bar(s) geometry, anchored at the symbol's bottom edge instead of
 * a relationship-line midpoint. Non-interactive — the individual symbol carries
 * selection and drives the properties panel.
 *
 * The cause text is *not* drawn here: it is folded into the symbol's label stack
 * (see {@link SymbolLabel}), which is pushed below these marks so the two never
 * collide.
 *
 * Suppressed once the individual has children on the canvas: the marker would
 * contradict the descent line, and the panel control is disabled there, so a
 * stale marker would otherwise be unremovable (mirrors svgExport.ts).
 */
export function IndividualChildlessLine({
  individual,
  partnerships,
}: IndividualChildlessLineProps): JSX.Element | null {
  if (!individual.childlessStatus) return null;
  if (individualHasChildren(partnerships, individual.id)) return null;

  const anchor = individualChildlessAnchor(individual);
  const { stub, bars } = childlessMarks(anchor, individual.childlessStatus, {
    stub: CHILDLESS_STUB,
    barHalf: CHILDLESS_BAR_HALF,
    barGap: CHILDLESS_BAR_GAP,
  });

  return (
    <>
      <Line
        key={`icl-stub-${individual.id}`}
        points={stub}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        listening={false}
      />
      {bars.map((b, i) => (
        <Line
          key={`icl-bar-${individual.id}-${i}`}
          points={b}
          stroke={LINE_COLOR}
          strokeWidth={LINE_WIDTH}
          listening={false}
        />
      ))}
    </>
  );
}
