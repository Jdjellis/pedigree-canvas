# Parents-optional and partner-optional unions — design

Date: 2026-06-27
Status: Approved, pending implementation plan

## Goal

Let the radial menu add **siblings to a person who has no parents** and add a
**child to a person who has no partner**, without first forcing the user to
create the missing relatives.

The whole feature reduces to one model change: a union
(`PartnershipRelationship`) may have **0, 1, or 2 partners**.

- **0 partners** — a *parentless sibship*. Children hang from a bare horizontal
  sibship bar with no descent line rising above it.
- **1 partner** — a *single-parent union*. The line of descent drops **straight
  down** from the sole parent (a lone child sits directly below → one unbroken
  vertical line).
- **2 partners** — today's couple. Descent drops from the midpoint between them.

Non-goals (explicitly deferred):

- **PED round-trip of parentless sibships.** The PED format defines siblings
  only through shared parent IDs, so a 0-partner sibship exports as unrelated
  founders (`father=0`, `mother=0`). JSON I/O preserves everything. Neither path
  crashes. Out of scope to invent phantom PED parent IDs.
- **Twins in a parentless/single-parent union.** Twin groups already require a
  parent partnership and are created through a separate flow; no change here.

## Current state (what exists today)

- `src/types/pedigree.ts` — `PartnershipRelationship` requires `partner1Id` and
  `partner2Id` (non-optional `string`). Children belong to a union via
  `childrenIds` and a `ParentChildRelationship` whose `parentPartnershipId`
  points at the union.
- `src/components/ui/RadialMenu.tsx`:
  - `canAddSibling = hasParents(doc, targetId)` — Sibling disabled with no
    parents.
  - `canAddChild = hasPartnership(doc, targetId)` — Child disabled with no
    partner.
  - `handleAddParent` always creates a fresh couple + new union + new link (no
    guard against the target already having parents → latent double-parenting
    bug).
  - `handleAddPartner` always creates a fresh union.
  - `handleAddSibling` / `handleAddChild` find an existing union and add a child
    to it.
- `src/utils/graphTraversal.ts` — `hasParents` returns true if **any**
  `parentChildLink` names the individual as a child (regardless of whether the
  parent union actually has partners). `findParents`, `findChildren`,
  `findPartnerships`, `hasPartnership` all look partners up by id and tolerate a
  missing **individual**.
- `src/components/connections/ParentChildLine.tsx` and
  `src/components/connections/PartnershipLine.tsx` both **return `null` when
  either partner individual is missing** — so a partnerless union currently
  renders nothing.
- `src/components/connections/parentChildGeometry.ts` —
  `computeParentChildSegments(partnershipMidX, partnershipY, children)` returns
  `{ sibshipY, parentDrop, sibship, childDrops }`; `sibship` is `null` when
  nothing is horizontally offset (single child directly under the anchor →
  straight line). Konva-free and unit-tested.
- `src/io/svgExport.ts` — `renderParentChildLines` / `renderPartnershipLine`
  mirror the Konva components (parallel renderer; must be kept in sync). Both
  read partner positions directly.
- `src/io/pedIO.ts` — export already leaves `father`/`mother` as
  `MISSING_PARENT` when a partner individual is absent (no crash).
- `src/utils/respacing.ts` — `centerParentsOverChildren` already returns `{}`
  when a partner is missing (no-op). `computeParentClearanceShift` reflows newly
  added parents past in-laws.
- `src/utils/annotationPlacement.ts` — snaps captions to partnership lines via a
  `Map.get` lookup that is already undefined-safe.

## Design

### 1. Type change

In `src/types/pedigree.ts` make partner ids optional:

```ts
export interface PartnershipRelationship {
  id: string;
  type: RelationshipType.Partnership | RelationshipType.Consanguinity | RelationshipType.Separation;
  partner1Id?: string;
  partner2Id?: string;
  childrenIds: string[];
  isAdoptive?: boolean;
}
```

TypeScript will flag every direct `individuals[partnership.partnerNId]` read.
Add two helpers in `graphTraversal.ts` to keep call sites tidy and explicit:

```ts
/** Resolve the present partner individuals of a union (0, 1, or 2). */
export function getPresentPartners(
  individuals: Record<string, Individual>,
  partnership: PartnershipRelationship,
): Individual[];

/** A union with no partners — a parentless sibship. */
export function isParentlessUnion(partnership: PartnershipRelationship): boolean;
```

Existing reads keep their current "skip when individual missing" behaviour;
they just resolve the id through optional access first.

### 2. `hasParents` redefined

`hasParents(doc, id)` returns true only when the individual is a child of a
union that **has at least one present partner**:

```ts
for (const link of Object.values(doc.parentChildLinks)) {
  if (link.childId !== id) continue;
  const p = doc.partnerships[link.parentPartnershipId];
  if (p && (p.partner1Id || p.partner2Id)) return true;
}
return false;
```

A member of a 0-partner sibship therefore still reports **no parents**, so
*Add Parents* stays available and meaningful for them.

### 3. Radial menu — contextual actions

`canAddSibling` and `canAddChild` become **always true**. `canAddParents` is
**disabled only when the target already has two present parents**.

| Action | Target situation | Behaviour |
|---|---|---|
| **Add Sibling** | has a parent-union | add a child to that union *(today)* |
| | no parent-union | create a **0-partner sibship** containing target + new sibling; target gains its first parent-link |
| **Add Child** | is a partner in a union | add a child under that union *(today)* |
| | no union | create a **1-partner union** (target as sole parent); child placed straight below |
| **Add Partner** | sole partner of a 1-partner union | **fill the empty slot** → new partner co-parents the existing children |
| | otherwise | create a fresh union *(today)* |
| **Add Parents** | no parent-union | create couple + union + link *(today)* |
| | 0-partner sibship | **fill both slots** → couple parents the whole sibship (no new child-link; target already linked) |
| | 1-partner union | **fill the empty slot** → add the missing second parent |
| | 2 present parents | disabled |

Positioning:

- New **sibling** (0-partner sibship): same generation/`y` as target, placed at
  `target.x + SIBLING_SPACING`.
- New **child** (1-partner union): same `x` as target, `y + GENERATION_SPACING`,
  generation `target.generation + 1` → straight-down line.
- **Add Partner fill** and **Add Parents fill**: insert the new individual(s)
  beside/above as the existing couple flows do, then re-centre over children via
  the existing respacing helpers.

When `canAddChild`'s old `hasPartnership` check is removed, drop the now-unused
import from `RadialMenu.tsx` if nothing else uses it.

### 4. Rendering

**`parentChildGeometry.ts`** — add a sibling pure function:

```ts
/** Sibship bar + child drops for a union with NO parents (no descent line up). */
export function computeParentlessSibshipSegments(
  children: ChildAnchor[],
): { sibshipY: number; sibship: LineSegment | null; childDrops: LineSegment[] };
```

The bar sits a fixed rise above the topmost child (`childTopY - PARENTLESS_SIBSHIP_RISE`,
a new constant ≈ `GENERATION_SPACING / 2`), spans `min(childX)…max(childX)`, and
is `null` when there is a single child (just a short drop). There is **no**
`parentDrop`.

**`ParentChildLine.tsx`** — replace the `if (!p1 || !p2) return null` bail with:

```ts
const partners = getPresentPartners(individuals, partnership);
const children = partnership.childrenIds.map(id => individuals[id]).filter(Boolean);
if (children.length === 0) return null;

if (partners.length === 0) {
  // parentless sibship: computeParentlessSibshipSegments(children) → bar + drops
} else {
  const anchorY = average(partners.map(p => p.position.y));
  const anchorX = average(partners.map(p => p.position.x));
  // computeParentChildSegments(anchorX, anchorY, children) → parent drop + bar + drops
}
```

The 1-partner case feeds the partner's own position as the anchor, so a lone
child directly below produces one straight vertical line.

**`svgExport.ts`** `renderParentChildLines` — mirror the same three branches
(0 / 1 / 2 partners) so the export matches the canvas.

`PartnershipLine.tsx` and `svgExport.renderPartnershipLine` already render
nothing without two partners — no change.

### 5. Store actions

Each runs inside a single `set` so one undo reverts the whole operation.

- `addSiblingViaNewUnion(target, sibling, partnership, targetLink, siblingLink)`
  — inserts the new 0-partner sibship, the new sibling individual, and **two**
  parent-child links (target + sibling). Respace the sibling's generation.
- `addChildViaNewUnion(child, partnership, link)` — inserts the new 1-partner
  union (target already exists as its sole partner), the child, and the link.
  Respace + (no re-centre needed; single parent sits above its own child).
- `fillUnionPartners(partnershipId, newIndividuals, opts)` — inserts the new
  partner individual(s), sets the union's empty partner slot(s), then reflows:
  - Add Partner (1→2): place partner beside the sole parent, `centerParentsOverChildren`.
  - Add Parents (0→2): place the couple above the sibship, centre over children
    (`centerParentsOverChildren`) + generation respacing. In-law clearance
    (`computeParentClearanceShift`) is **not** applied for the sibship case — a
    bare sibship rarely has already-partnered children, and generation respacing
    resolves same-row overlaps; left out to keep the action simple (YAGNI).
  - Add Parents (1→2): place the single new parent beside the existing one,
    centre over children.

  (May be split into two thin actions sharing a helper if that reads more
  clearly during implementation.)

### 6. Tests

- `parentChildGeometry.test.ts` — `computeParentlessSibshipSegments`: two
  children → bar + two drops, no parent drop; single child → drop only.
- `graphTraversal.test.ts` — `hasParents` false for a 0-partner sibship child,
  true once a partner is filled in.
- `pedigreeStore.test.ts` — each new action: resulting partnerships, children,
  links, and partner slots; one-undo behaviour.
- `svgExport` — markup for a 0-partner sibship (bar, no descent) and a 1-partner
  union (straight drop).

## Risks / edge cases

- **Optional partner ids ripple.** ~13 files read partner ids; most already
  guard on the resolved individual. The compiler enumerates the rest; helpers
  keep the edits mechanical.
- **Double-parenting bug (pre-existing).** Disabling Add Parents at 2 present
  parents fixes it as a side effect.
- **PED export** of a 0-partner sibship loses the sibling link (documented
  non-goal); no crash.
- **Deleting a partner** does **not** leave a 1-partner union: the existing
  `removeIndividual` flow drops the whole partnership when either partner is
  removed and prunes the children's parent-child links (unchanged here). A
  1-partner union therefore only arises via the Add-Child-without-partner flow,
  never from partner deletion. (A useful corollary: no union with a dangling
  partner id — id set but individual gone — can arise through the UI.)
