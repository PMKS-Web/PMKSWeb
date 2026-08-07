import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { canDrive } from '../../app/model/actuator';
import { MERGE_REFUSAL_MESSAGES, refuseJointMerge } from '../../app/model/drop-target';
import { describeActuator } from '../../app/model/actuator';

// Three gates, all guarding the same thing: an input names the freedom between
// *two* bodies (§2.9), so a third one arriving at a driven joint takes away the
// thing the input names.
//
// The bug this exists for was reported from a deploy preview: switch Driven on
// while two bodies meet, attach a third link afterwards, and the mechanism
// stopped being able to describe its own input. A restriction enforced only
// where the flag is first set is not a restriction.

const bar = (id: string, joints: RealJoint[]) => {
  const link = new RealLink(id, joints, 1, 1);
  joints.forEach((joint) => joint.links.push(link));
  return link;
};

describe('what may be driven', () => {
  it('allows a grounded crank, where the world is the second body', () => {
    const pivot = new RevJoint('O', 0, 0, false, true);
    bar('OA', [pivot, new RevJoint('A', 1, 0)]);
    expect(canDrive(pivot)).toBe(true);
  });

  it('allows a floating pin between exactly two links', () => {
    const pin = new RevJoint('C', 0, 0);
    bar('AC', [new RevJoint('A', -1, 0), pin]);
    bar('CD', [pin, new RevJoint('D', 1, 0)]);
    expect(canDrive(pin)).toBe(true);
  });

  it('refuses a joint where a third body has arrived', () => {
    const pin = new RevJoint('C', 0, 0);
    bar('AC', [new RevJoint('A', -1, 0), pin]);
    bar('CD', [pin, new RevJoint('D', 1, 0)]);
    bar('CE', [pin, new RevJoint('E', 0, 1)]);
    expect(canDrive(pin)).toBe(false);
  });

  it('refuses a grounded joint carrying two links, which is three bodies', () => {
    // The case §2.9 calls already-wrong: the solvers pick the first link and
    // hope. Reachable today, so decode still accepts it -- only the control
    // that would newly create one is closed.
    const pivot = new RevJoint('O', 0, 0, false, true);
    bar('OA', [pivot, new RevJoint('A', 1, 0)]);
    bar('OB', [pivot, new RevJoint('B', 0, 1)]);
    expect(canDrive(pivot)).toBe(false);
  });
});

describe('dragging a joint onto a driven one', () => {
  /** Two joints, each on its own bar, ready to be merged. */
  function pair(options: { drivenTarget?: boolean; groundedTarget?: boolean } = {}) {
    const source = new RevJoint('S', 0, 0);
    bar('SX', [source, new RevJoint('X', 1, 0)]);
    const target = new RevJoint('T', 0, 0, false, !!options.groundedTarget);
    bar('TY', [target, new RevJoint('Y', -1, 0)]);
    target.input = !!options.drivenTarget;
    return { source, target };
  }

  it('refuses when the merge would leave three bodies at the driven joint', () => {
    const { source, target } = pair({ drivenTarget: true, groundedTarget: true });
    // Ground + the target's own bar + the arriving bar is three.
    expect(refuseJointMerge(source, target)).toBe('driven-joint');
  });

  it('says why, in the words the canvas shows', () => {
    expect(MERGE_REFUSAL_MESSAGES['driven-joint']).toContain('two bodies');
  });

  it('allows the merge when the driven joint still ends up with two', () => {
    // A floating driven pin with one bar, taking on one more: two bodies, which
    // is a perfectly good actuator.
    const { source, target } = pair({ drivenTarget: true });
    expect(refuseJointMerge(source, target)).toBeUndefined();
  });

  it('leaves merges that touch no input alone', () => {
    const { source, target } = pair({ groundedTarget: true });
    expect(refuseJointMerge(source, target)).toBeUndefined();
  });
});

describe('a weld and an input at the same joint', () => {
  it('cannot both be true, whichever is asked for first', () => {
    // A weld says the bodies at this joint do not move relative to each other;
    // an input says they do. The model refuses to drive a welded joint, and the
    // Weld control is greyed on a driven one -- the same rule from both sides,
    // so neither surface can create a state the other forbids.
    const pin = new RevJoint('C', 0, 0);
    bar('AC', [new RevJoint('A', -1, 0), pin]);
    bar('CD', [pin, new RevJoint('D', 1, 0)]);

    pin.isWelded = true;
    expect(typeof describeActuator(pin)).toBe('string');
    expect(describeActuator(pin) as string).toContain('welded');

    pin.isWelded = false;
    expect(canDrive(pin)).toBe(true);
  });
});
