import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Link } from './link';

/** Why a candidate joint cannot receive the joint being dragged. */
export type MergeRefusal =
  | 'same-joint'
  | 'shares-a-link'
  | 'prismatic'
  | 'two-sliders'
  | 'over-constrained'
  | 'not-a-real-joint';

/** What to tell the user when a merge is refused. */
export const MERGE_REFUSAL_MESSAGES: Record<MergeRefusal, string> = {
  'same-joint': 'A joint cannot be merged into itself',
  'shares-a-link': 'These joints are on the same link, so merging them would collapse it',
  prismatic: 'Drop onto the pin of a slider, not onto its slot',
  'two-sliders': 'Only one of these joints can carry a slider',
  'over-constrained':
    'Merging here would tie the same two joints together twice, over-constraining the linkage',
  'not-a-real-joint': 'This joint cannot be merged',
};

/**
 * Whether `source` may be folded into `target`, and if not, why.
 *
 * Returns `undefined` when the merge is legal. The reason is returned rather
 * than a bare boolean because the canvas has to tell the user which rule it
 * hit — a joint that silently refuses to snap reads as a broken drag.
 */
export function refuseJointMerge(source: Joint, target: Joint): MergeRefusal | undefined {
  if (source.id === target.id) return 'same-joint';
  // The prismatic half of a slider is its slot, not a pin anything can attach
  // to; the coincident RevJoint is the thing a link rides on.
  if (source instanceof PrisJoint || target instanceof PrisJoint) return 'prismatic';
  if (!(source instanceof RealJoint) || !(target instanceof RealJoint)) return 'not-a-real-joint';

  // Dropping a pin onto a slider's pin is a pin-in-slot, which is the point.
  // Two blocks on one pin is a different joint type, not a merge.
  if (carriesASlider(source) && carriesASlider(target)) return 'two-sliders';

  // Two joints on one link collapsing to one point would leave that link a
  // zero-length body — degenerate for every solver downstream.
  if (source.links.some((link) => target.links.some((other) => other.id === link.id))) {
    return 'shares-a-link';
  }

  if (wouldOverConstrain(source, target)) return 'over-constrained';

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
  radius: number
): JointDropCandidate | undefined {
  let best: JointDropCandidate | undefined;
  let bestDistance = radius;

  joints.forEach((candidate) => {
    if (!(candidate instanceof RevJoint)) return;
    // The joint under the cursor is the one being dragged; pointing at itself is
    // not a near miss worth reporting.
    if (candidate.id === source.id) return;
    const refusal = refuseJointMerge(source, candidate);
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
