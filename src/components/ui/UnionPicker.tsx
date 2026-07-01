// src/components/ui/UnionPicker.tsx
import { useEffect, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useViewportStore } from '../../stores/viewportStore';
import { usePedigreeStore } from '../../stores/pedigreeStore';
import { findPartnerships } from '../../utils/graphTraversal';
import { individualDisplayLabel } from '../../utils/individualLabel';
import { RelationshipType } from '../../types/enums';
import { addChildToUnion } from './addChild';
import { addTwinChildrenToUnion } from './addTwinChildren';
import type { PartnershipRelationship } from '../../types/pedigree';
import styles from './UnionPicker.module.css';

/** Screen-px gap between the node anchor and the picker sitting above it. */
const PICKER_GAP = 48;

/** Describe a union for the picker: who the co-parent is + a short status hint. */
function describeUnion(
  individuals: ReturnType<typeof usePedigreeStore.getState>['document']['individuals'],
  targetId: string,
  union: PartnershipRelationship,
): { label: string; hint: string } {
  const otherId = union.partner1Id === targetId ? union.partner2Id : union.partner1Id;
  const who = otherId ? individualDisplayLabel(individuals, otherId) : 'no partner yet';
  const label = `With ${who}`;

  if (union.type === RelationshipType.Consanguinity) {
    return { label, hint: 'Consanguineous union' };
  }
  const n = union.childrenIds.length;
  const hint = n === 0 ? 'No children yet' : n === 1 ? '1 child' : `${n} children`;
  return { label, hint };
}

/**
 * Union picker: a small HTML overlay shown when Add Child is triggered on an
 * individual who belongs to two or more unions. It lists each union so the user
 * chooses which one the new child belongs to, instead of the app silently
 * picking the first union in iteration order (issue #97). Rendered in the
 * react-dom tree (sibling of the Konva stage), so subscribing to Zustand here is
 * safe.
 *
 * Dismissal (Esc / click-away) adds no child. Choosing a union routes through
 * `addChildToUnion`, the same path the single-union Add Child uses.
 */
export function UnionPicker(): React.JSX.Element | null {
  const targetId = useUIStore((s) => s.unionPicker.targetId);
  const twinType = useUIStore((s) => s.unionPicker.twinType);
  const editingLocked = useUIStore((s) => s.editingLocked);
  const scale = useViewportStore((s) => s.scale);
  const viewportX = useViewportStore((s) => s.position.x);
  const viewportY = useViewportStore((s) => s.position.y);
  const doc = usePedigreeStore((s) => s.document);

  const target = targetId ? doc.individuals[targetId] : undefined;
  const unionIds = targetId ? findPartnerships(doc, targetId) : [];

  const dismiss = useCallback(() => {
    useUIStore.getState().hideUnionPicker();
  }, []);

  const choose = useCallback(
    (union: PartnershipRelationship) => {
      if (!target) return;
      useUIStore.getState().hideUnionPicker();
      // `doc`/`target` are the current store snapshot; the add helpers read the
      // union's present partners + children from it to place the child(ren).
      // A twin intent (held ⌥ over Child) adds a pair; otherwise a single child.
      if (twinType) {
        addTwinChildrenToUnion(doc, target, union, twinType);
      } else {
        addChildToUnion(doc, target, union);
      }
    },
    [doc, target, twinType],
  );

  // Self-clear: if the target disappears (undo, delete, import) or no longer has
  // an ambiguous set of unions while the picker is open, close it so the flow
  // isn't left stranded.
  useEffect(() => {
    if (targetId && (!target || unionIds.length < 2)) {
      useUIStore.getState().hideUnionPicker();
    }
  }, [targetId, target, unionIds.length]);

  // Capture-phase Escape so it dismisses before any global shortcut sees it.
  useEffect(() => {
    if (!targetId || !target || editingLocked) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [targetId, target, editingLocked, dismiss]);

  if (!targetId || !target || editingLocked || unionIds.length < 2) return null;

  const left = target.position.x * scale + viewportX;
  const top = target.position.y * scale + viewportY - PICKER_GAP;

  return (
    <>
      <div className={styles.backdrop} onClick={dismiss} aria-hidden="true" />
      <div
        className={styles.picker}
        style={{ left, top }}
        role="dialog"
        aria-label="Choose which union the child belongs to"
      >
        <p className={styles.title}>{twinType ? 'Add twins to…' : 'Add child to…'}</p>
        {unionIds.map((id) => {
          const union = doc.partnerships[id];
          if (!union) return null;
          const { label, hint } = describeUnion(doc.individuals, targetId, union);
          return (
            <button
              key={id}
              type="button"
              className={styles.option}
              onClick={() => choose(union)}
            >
              <span className={styles.optionLabel}>{label}</span>
              <span className={styles.optionHint}>{hint}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
