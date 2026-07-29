import './joint';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { SliderBlock, RealLink } from './link';
import {
  MERGE_REFUSAL_MESSAGES,
  MergeRefusal,
  refuseJointMerge,
  resolveJointDropTarget,
} from './drop-target';

/** Wire `joints` into one link, the way MechanismService keeps the graph. */
function connect(id: string, joints: RevJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => {
    joint.links.push(link);
    joints.filter((other) => other !== joint).forEach((other) => joint.connectedJoints.push(other));
  });
  return link;
}

describe('joint merge rules', () => {
  it('allows two joints that share no link', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    const d = new RevJoint('D', 5, 0);
    connect('AB', [a, b]);
    connect('CD', [c, d]);

    expect(refuseJointMerge(b, c)).toBeUndefined();
  });

  it('refuses the two ends of one link, which would collapse it', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    connect('AB', [a, b]);

    expect(refuseJointMerge(a, b)).toBe('shares-a-link');
  });

  // Links A-B and A-C, with B dropped on C, would leave two rigid bars spanning
  // the same pair of points: a weld written as an accident.
  it('refuses a merge that would leave two links between the same pair', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 1, 1);
    connect('AB', [a, b]);
    connect('AC', [a, c]);

    expect(refuseJointMerge(b, c)).toBe('duplicate-link');
  });

  it('refuses a joint that carries a slider', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    connect('AB', [a, b]);
    const prismatic = new PrisJoint('D', b.x, b.y, false, true);
    b.connectedJoints.push(prismatic);
    prismatic.connectedJoints.push(b);
    const block = new SliderBlock('BD', [b, prismatic]);
    b.links.push(block);
    prismatic.links.push(block);

    expect(refuseJointMerge(c, b)).toBe('carries-a-slider');
    expect(refuseJointMerge(b, c)).toBe('carries-a-slider');
  });

  it('refuses a prismatic joint outright', () => {
    const a = new RevJoint('A', 0, 0);
    const prismatic = new PrisJoint('B', 1, 0, false, true);

    expect(refuseJointMerge(a, prismatic)).toBe('prismatic');
  });

  it('refuses a welded joint, whose weld a merge would have to reconcile', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    b.isWelded = true;

    expect(refuseJointMerge(a, b)).toBe('welded');
  });

  it('refuses a joint merged into itself', () => {
    const a = new RevJoint('A', 0, 0);

    expect(refuseJointMerge(a, a)).toBe('same-joint');
  });

  it('has a message for every refusal it can return', () => {
    const reasons: MergeRefusal[] = [
      'same-joint',
      'shares-a-link',
      'prismatic',
      'carries-a-slider',
      'welded',
      'duplicate-link',
      'not-a-real-joint',
    ];
    reasons.forEach((reason) => expect(MERGE_REFUSAL_MESSAGES[reason]).toBeTruthy());
  });
});

describe('resolving a joint drop target', () => {
  function scene() {
    const dragged = new RevJoint('A', 0, 0);
    const near = new RevJoint('B', 10, 0);
    const nearer = new RevJoint('C', 10.2, 0);
    const far = new RevJoint('D', 40, 0);
    connect('AE', [dragged, new RevJoint('E', -5, 0)]);
    connect('BF', [near, new RevJoint('F', 10, -5)]);
    connect('CG', [nearer, new RevJoint('G', 10, 5)]);
    connect('DH', [far, new RevJoint('H', 40, 5)]);
    return { dragged, near, nearer, far, joints: [dragged, near, nearer, far] };
  }

  it('takes the nearest legal joint inside the radius', () => {
    const { dragged, nearer, joints } = scene();

    expect(resolveJointDropTarget(dragged, 10.15, 0, joints, 1)).toBe(nearer);
  });

  it('takes nothing when every joint is outside the radius', () => {
    const { dragged, joints } = scene();

    expect(resolveJointDropTarget(dragged, 25, 0, joints, 1)).toBeUndefined();
  });

  it('skips a joint in range that it is not allowed to merge with', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 1, 0);
    connect('AB', [dragged, partner]);

    expect(resolveJointDropTarget(dragged, 1, 0, [dragged, partner], 5)).toBeUndefined();
  });

  it('never returns the joint being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);

    expect(resolveJointDropTarget(dragged, 0, 0, [dragged], 5)).toBeUndefined();
  });

  it('ignores prismatic joints sitting exactly under the pointer', () => {
    const dragged = new RevJoint('A', 0, 0);
    const prismatic = new PrisJoint('B', 3, 0, false, true);

    expect(resolveJointDropTarget(dragged, 3, 0, [dragged, prismatic], 5)).toBeUndefined();
  });
});
