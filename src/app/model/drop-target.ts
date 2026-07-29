import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';

/** Why a candidate joint cannot receive the joint being dragged. */
export type MergeRefusal =
  | 'same-joint'
  | 'shares-a-link'
  | 'prismatic'
  | 'carries-a-slider'
  | 'welded'
  | 'duplicate-link'
  | 'not-a-real-joint';

/** What to tell the user when a merge is refused. */
export const MERGE_REFUSAL_MESSAGES: Record<MergeRefusal, string> = {
  'same-joint': 'A joint cannot be merged into itself',
  'shares-a-link': 'These joints are on the same link, so merging them would collapse it',
  prismatic: 'Prismatic joints cannot be merged',
  'carries-a-slider': 'Remove the slider before merging this joint',
  welded: 'Unweld this joint before merging it',
  'duplicate-link': 'Merging here would leave two links between the same pair of joints',
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
  if (source instanceof PrisJoint || target instanceof PrisJoint) return 'prismatic';
  if (!(source instanceof RealJoint) || !(target instanceof RealJoint)) return 'not-a-real-joint';

  // A slider is a RevJoint plus a coincident PrisJoint joined by a SliderBlock.
  // Merging either end would have to decide what happens to the block and to
  // the slot; the slot model does not exist yet, so refuse rather than guess.
  // See docs/joint-types-plan.md, Phase 2.
  if (carriesASlider(source) || carriesASlider(target)) return 'carries-a-slider';

  // Welding is a property of the joint, and a merge would have to reconcile two
  // of them. Phase 3 owns weld semantics across an assembly.
  if (source.isWelded || target.isWelded) return 'welded';

  // Two joints on one link collapsing to one point would leave that link a
  // zero-length body — degenerate for every solver downstream.
  if (source.links.some((link) => target.links.some((other) => other.id === link.id))) {
    return 'shares-a-link';
  }

  // Links A–B and A–C, with B dragged onto C, would become two separate rigid
  // bars spanning the same pair of points. That is a weld expressed as an
  // accident, and the solvers would see a redundant constraint.
  const wouldDuplicate = source.links.some((link) => {
    const merged = jointIDSet(link, source.id, target.id);
    return target.links.some((other) => sameIDs(merged, jointIDSet(other)));
  });
  if (wouldDuplicate) return 'duplicate-link';

  return undefined;
}

function jointIDSet(
  link: { joints: Joint[] },
  replace?: string,
  replacement?: string
): Set<string> {
  return new Set(link.joints.map((joint) => (joint.id === replace ? replacement! : joint.id)));
}

function sameIDs(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function carriesASlider(joint: RealJoint): boolean {
  return joint.connectedJoints.some((connected) => connected instanceof PrisJoint);
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
