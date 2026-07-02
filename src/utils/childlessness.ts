/**
 * Helpers for individual-level childlessness marks (the no-partner analogue of a
 * childless partnership). Shared by the Konva renderer
 * (`IndividualChildlessLine.tsx`), the SVG exporter (`svgExport.ts`), and the
 * properties panel so the geometry and the "has children" suppression rule
 * cannot drift.
 */
import { SYMBOL_SIZE, CHILDLESS_STUB } from './constants';
import type {
  ChildlessStatus,
  Individual,
  PartnershipRelationship,
} from '../types/pedigree';
import type { Point } from './partnershipGeometry';

/** The segmented-control selection: a childless status, or `'none'` (cleared). */
export type ChildlessSelection = 'none' | ChildlessStatus;

/**
 * The subset of an individual/partnership that tracks its childless status and
 * the free-text cause(s). Shared so {@link childlessStatusChange} can operate on
 * either entity.
 */
export interface ChildlessCauseState {
  childlessStatus?: ChildlessStatus;
  childlessReason?: string;
  childlessReasonByStatus?: Partial<Record<ChildlessStatus, string>>;
}

/**
 * Compute the patch to apply when the user picks `next` in the childless-status
 * segmented control.
 *
 * The cause is per-status: the cause the user was editing is parked under the
 * *outgoing* status, and the *incoming* status's parked cause (if any) is
 * restored as the active {@link ChildlessCauseState.childlessReason}. So an
 * accidental status change — or a round-trip like no-children → infertility →
 * no-children — never discards typed text, while the rendered cause always
 * matches the selected status. Selecting `'none'` clears the active status and
 * cause but keeps every parked cause for when a status is re-selected.
 */
export function childlessStatusChange(
  current: ChildlessCauseState,
  next: ChildlessSelection,
): Pick<
  ChildlessCauseState,
  'childlessStatus' | 'childlessReason' | 'childlessReasonByStatus'
> {
  const parked: Partial<Record<ChildlessStatus, string>> = {
    ...current.childlessReasonByStatus,
  };

  // Park the cause the user was editing under the status it belonged to.
  if (current.childlessStatus) {
    if (current.childlessReason) parked[current.childlessStatus] = current.childlessReason;
    else delete parked[current.childlessStatus];
  }

  const nextStatus = next === 'none' ? undefined : next;
  // Restore the incoming status's cause; it is now active, not parked.
  const restored = nextStatus ? parked[nextStatus] : undefined;
  if (nextStatus) delete parked[nextStatus];

  return {
    childlessStatus: nextStatus,
    childlessReason: restored,
    childlessReasonByStatus: Object.keys(parked).length > 0 ? parked : undefined,
  };
}

/**
 * Anchor point for an individual's childless marks: the bottom-centre of the
 * symbol, so the vertical stub drops straight down from the symbol exactly as a
 * partnership's stub drops from the relationship line.
 */
export function individualChildlessAnchor(individual: Individual): Point {
  return {
    x: individual.position.x,
    y: individual.position.y + SYMBOL_SIZE / 2,
  };
}

/**
 * True when `individualId` is a partner in any union that has children on the
 * canvas. An individual childless marker contradicts existing descendants, so it
 * is suppressed in rendering (and the panel control disabled) in that case —
 * mirrors the partnership rule in {@link PartnershipRelationship}.
 */
export function individualHasChildren(
  partnerships: Record<string, PartnershipRelationship>,
  individualId: string,
): boolean {
  return Object.values(partnerships).some(
    (p) =>
      (p.partner1Id === individualId || p.partner2Id === individualId) &&
      p.childrenIds.length > 0,
  );
}

/**
 * Whether an individual's childless marks are actually drawn: the status is set
 * *and* not suppressed by existing children. Used to gate both the marks and the
 * label-block offset that keeps the name/investigations/cause stack clear of
 * them, so the two never disagree.
 */
export function childlessMarksActive(
  individual: Individual,
  partnerships: Record<string, PartnershipRelationship>,
): boolean {
  return (
    !!individual.childlessStatus &&
    !individualHasChildren(partnerships, individual.id)
  );
}

/**
 * Extra vertical offset added to the label block when childless marks are drawn,
 * so the name / investigations / cause stack starts below the stub and
 * cross-bar(s) instead of colliding with them. Equal to the stub length, which
 * leaves the normal label gap ({@link LABEL_OFFSET_Y}) between the bars and the
 * first line.
 */
export const CHILDLESS_LABEL_OFFSET = CHILDLESS_STUB;
