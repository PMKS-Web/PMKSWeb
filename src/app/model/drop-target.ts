import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';
import { Cylinder, cylinderJoints, sealedCylinderStructures } from './cylinder';

/** Why a candidate joint cannot receive the joint being dragged. */
export type MergeRefusal =
  | 'same-joint'
  | 'shares-a-link'
  | 'prismatic'
  | 'two-sliders'
  | 'over-constrained'
  | 'own-carrier'
  | 'not-a-real-joint'
  | 'sealed-cylinder'
  | 'welded-mount'
  | 'own-cylinder';

/** What to tell the user when a merge is refused. */
export const MERGE_REFUSAL_MESSAGES: Record<MergeRefusal, string> = {
  'same-joint': 'A joint cannot be merged into itself',
  'shares-a-link': 'These joints are on the same link, so merging them would collapse it',
  prismatic: 'Drop onto the pin of a slider, not onto its slot',
  'two-sliders': 'Only one of these joints can carry a slider',
  'over-constrained':
    'Merging here would tie the same two joints together twice, over-constraining the linkage',
  'own-carrier': 'A slider cannot ride on a link it is part of',
  'not-a-real-joint': 'This joint cannot be merged',
  'sealed-cylinder': 'A cylinder is one sealed part — attach at its mounts instead',
  'welded-mount': 'A welded joint cannot merge with a cylinder mount — unweld it first',
  'own-cylinder': 'A cylinder cannot fold onto itself',
};

/**
 * Whether `source` may be folded into `target`, and if not, why.
 *
 * Returns `undefined` when the merge is legal. The reason is returned rather
 * than a bare boolean because the canvas has to tell the user which rule it
 * hit — a joint that silently refuses to snap reads as a broken drag.
 */
export function refuseJointMerge(
  source: Joint,
  target: Joint,
  /**
   * The full joint list, when the caller has it: it is what lets the mount
   * rules run (a mount is only recognisable against the whole mechanism).
   */
  allJoints?: Joint[]
): MergeRefusal | undefined {
  if (source.id === target.id) return 'same-joint';
  // The prismatic half of a slider is its slot, not a pin anything can attach
  // to; the coincident RevJoint is the thing a link rides on.
  if (source instanceof PrisJoint || target instanceof PrisJoint) return 'prismatic';
  if (!(source instanceof RealJoint) || !(target instanceof RealJoint)) return 'not-a-real-joint';

  // Dropping a pin onto a slider's pin is a pin-in-slot, which is the point.
  // Two blocks on one pin is a different joint type, not a merge.
  if (carriesASlider(source) && carriesASlider(target)) return 'two-sliders';

  // A slider merged into one of its own carrier's joints would ride on a link
  // it is now part of: the slot's direction is measured from two joints, one of
  // which has become the block itself, so the constraint refers to its own
  // answer. `isSlotWellFormed` refuses that shape for the PrisJoint, but the
  // merge happens to its paired pin, which that check never sees -- so the
  // assembly stayed non-dangling and unflagged, sliding on itself.
  if (ridesOn(source, target) || ridesOn(target, source)) return 'own-carrier';

  // Two joints on one link collapsing to one point would leave that link a
  // zero-length body — degenerate for every solver downstream.
  if (source.links.some((link) => target.links.some((other) => other.id === link.id))) {
    return 'shares-a-link';
  }

  if (wouldOverConstrain(source, target)) return 'over-constrained';

  if (allJoints) {
    const cylinders = sealedCylinderStructures(allJoints);
    const mountOf = (joint: Joint) =>
      cylinders.find((c) => c.barrelFar.id === joint.id || c.rodFar.id === joint.id);
    const sourceMount = mountOf(source);
    const targetMount = mountOf(target);
    // A cylinder folded onto itself is no cylinder.
    if (sourceMount && targetMount && sourceMount.pin.id === targetMount.pin.id) {
      return 'own-cylinder';
    }
    // Welds at mounts are disabled, and a merge that carries a weld onto a
    // mount would manufacture exactly the state the toggle refuses.
    if ((sourceMount && target.isWelded) || (targetMount && source.isWelded)) {
      return 'welded-mount';
    }
  }

  return undefined;
}

/**
 * Whether the merge would leave two distinct links rigidly holding the same
 * pair of joints, so that one of them adds no freedom and the solvers see a
 * redundant constraint.
 *
 * Sharing *two* joints is the test, not being an exact duplicate. A bar B–C
 * alongside a ternary link B–C–G is the same defect as two bars B–C: B and C
 * are already fixed relative to each other by the ternary body, so the bar
 * over-constrains them. Only pairs are enough to catch it, because any pair
 * shared by two bodies is a pair each one fixes on its own.
 */
function wouldOverConstrain(source: RealJoint, target: RealJoint): boolean {
  return source.links.some((link) => {
    const merged = jointIDSet(link, source.id, target.id);
    return target.links.some((other) => sharedIDCount(merged, jointIDSet(other)) >= 2);
  });
}

function carriesASlider(joint: RealJoint): boolean {
  return joint.connectedJoints.some((connected) => connected instanceof PrisJoint);
}

/** Whether `joint`'s slider slides along a link that `other` is a member of. */
function ridesOn(joint: RealJoint, other: RealJoint): boolean {
  return joint.connectedJoints.some(
    (connected) =>
      connected instanceof PrisJoint &&
      connected.isFloating &&
      connected.carrier!.joints.some((member) => member.id === other.id)
  );
}

function jointIDSet(link: Link, replace?: string, replacement?: string): Set<string> {
  return new Set(link.joints.map((joint) => (joint.id === replace ? replacement! : joint.id)));
}

function sharedIDCount(a: Set<string>, b: Set<string>): number {
  return [...a].filter((id) => b.has(id)).length;
}

/**
 * The joint `source` would merge into if the drag were released at (x, y).
 *
 * Nearest legal candidate within `radius` wins. Ties cannot be resolved
 * meaningfully at this scale, so the first of an exact tie is taken and the
 * user resolves it by moving.
 *
 * Phase 4.3 adds a second kind of drop target — a link body, for creating a
 * slot. When that lands, a joint in range must still win over a link in range:
 * the joint target is the more specific intent, and it is the only one the user
 * can aim at precisely.
 */
export function resolveJointDropTarget(
  source: Joint,
  x: number,
  y: number,
  joints: Joint[],
  radius: number
): RevJoint | undefined {
  let best: RevJoint | undefined;
  let bestDistance = radius;

  joints.forEach((candidate) => {
    if (!(candidate instanceof RevJoint)) return;
    if (refuseJointMerge(source, candidate)) return;
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });

  return best;
}

/**
 * A slot the drag would cut, if released on a link body (§4.3).
 *
 * `x` and `y` are the drop point projected onto the slot line: the dragged
 * joint is pulled onto it while previewing, the same way joint-snap captures,
 * so where it lands is never a surprise.
 */
export interface SlotDropCandidate {
  carrier: Link;
  a: Joint;
  b: Joint;
  x: number;
  y: number;
}

/**
 * The slot `source` would cut if the drag were released at (x, y).
 *
 * A link with n joints offers up to n(n-1)/2 candidate pairs, so the one whose
 * segment the drop point is nearest wins — and the caller shows which before
 * release, because on anything but a binary link the choice is not obvious from
 * the cursor alone.
 *
 * The segment is used rather than the infinite line through the pair: a point
 * out past the end of a bar is not between those two joints, and claiming that
 * pair would cut a slot where the user is not pointing.
 *
 * A link the dragged joint already belongs to is never offered. It would be a
 * joint sliding in its own body, and offering it only to refuse it would put a
 * red preview on the one link the user is most likely to sweep across.
 */
export function resolveSlotDropTarget(
  source: Joint,
  x: number,
  y: number,
  links: Link[],
  radius: number
): SlotDropCandidate | undefined {
  let best: SlotDropCandidate | undefined;
  let bestDistance = radius;

  for (const carrier of links) {
    if (carrier.joints.some((joint) => joint.id === source.id)) continue;
    for (const members of slotJointPools(carrier)) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const near = closestPointOnSegment(x, y, members[i], members[j]);
          if (near.distance < bestDistance) {
            bestDistance = near.distance;
            best = { carrier, a: members[i], b: members[j], x: near.x, y: near.y };
          }
        }
      }
    }
  }

  return best;
}

/**
 * The joint pairs a carrier may hang a slot between, grouped by rigid body.
 *
 * A slot has to lie between two joints of the same drawn bar — that segment is
 * where the channel is cut. A welded compound's `joints` is the union of its
 * sub-links' joints, so pairing across it offered segments joining joints of
 * *different* constituent bars: a diagonal through the compound's empty corner,
 * with the previewed channel floating partly outside the body. Restricting the
 * pairs to one sub-link at a time is exactly the non-welded rule applied to
 * each bar the compound is made of; a link with no subset is unchanged.
 */
function slotJointPools(carrier: Link): Joint[][] {
  if (carrier instanceof RealLink && carrier.subset.length > 0) {
    const pools = carrier.subset
      .filter(
        (leaf): leaf is RealLink => leaf instanceof RealLink && !(leaf instanceof SliderBlock)
      )
      .map((leaf) => leaf.joints);
    if (pools.length > 0) return pools;
  }
  return [carrier.joints];
}

function closestPointOnSegment(
  x: number,
  y: number,
  a: Joint,
  b: Joint
): { x: number; y: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  // Two coincident joints define no line, so no slot either.
  if (lengthSquared < 1e-12) return { x: a.x, y: a.y, distance: Infinity };
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { x: px, y: py, distance: Math.hypot(x - px, y - py) };
}

/** The joint a drag is currently aimed at, and why it would refuse the merge. */
export interface JointDropCandidate {
  joint: RevJoint;
  /** Absent when the merge is legal. */
  refusal?: MergeRefusal;
}

/**
 * The joint `source` is aiming at if the drag were released at (x, y),
 * *including* one it is not allowed to merge with.
 *
 * Nearest wins outright, legal or not. A refused joint that silently declines to
 * light up reads as a dead drop zone, so the canvas needs the near miss in order
 * to mark it red and say why. `resolveJointDropTarget` remains the "may I merge"
 * question; this one is "what am I pointing at".
 */
export function resolveDropCandidate(
  source: Joint,
  x: number,
  y: number,
  joints: Joint[],
  radius: number,
  /**
   * Precomputed sealed-cylinder structures, from the service's per-revision
   * cache. Passed in rather than derived here for two reasons: the caller's
   * `joints` list is already filtered (the interior pins the structural
   * resolution enters through are gone, so deriving from it finds nothing —
   * which is how the mount rules silently skipped the drag and the refusal
   * appeared only at release, with no ring); and deriving per candidate per
   * pointermove is exactly the kind of quadratic work the stutter came from.
   */
  cylinders: Cylinder[] = []
): JointDropCandidate | undefined {
  let best: JointDropCandidate | undefined;
  let bestDistance = radius;
  const sourceCylinder = cylinders.find((c) =>
    cylinderJoints(c).some((member) => member.id === source.id)
  );
  const mountOf = (joint: Joint) =>
    cylinders.find((c) => c.barrelFar.id === joint.id || c.rodFar.id === joint.id);

  joints.forEach((candidate) => {
    if (!(candidate instanceof RevJoint)) return;
    // The joint under the cursor is the one being dragged; pointing at itself is
    // not a near miss worth reporting.
    if (candidate.id === source.id) return;
    // A joint of the dragged mount's own cylinder is not a target at all —
    // like the far end of a held link, the drawing already says they are one
    // part, so there is nothing to mark red and a legal joint further out can
    // still win.
    if (sourceCylinder && cylinderJoints(sourceCylinder).some((m) => m.id === candidate.id)) {
      return;
    }
    let refusal = refuseJointMerge(source, candidate);
    // A weld may not land on a mount, from either side; the ring says so live.
    if (
      !refusal &&
      source instanceof RealJoint &&
      ((mountOf(source) && candidate.isWelded) || (mountOf(candidate) && source.isWelded))
    ) {
      refusal = 'welded-mount';
    }
    // Nor is the other end of the link you are holding. Marking that in red
    // would be explaining something the drawing already says — the two have a
    // bar between them — so it is not a target at all, and a legal joint
    // further out can still win.
    if (refusal === 'shares-a-link') return;
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { joint: candidate, refusal };
    }
  });

  return best;
}
