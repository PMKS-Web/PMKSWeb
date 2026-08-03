import './joint';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { SliderBlock, RealLink } from './link';
import {
  MERGE_REFUSAL_MESSAGES,
  MergeRefusal,
  refuseJointMerge,
  resolveDropCandidate,
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

    expect(refuseJointMerge(b, c)).toBe('over-constrained');
  });

  // The same defect one step less obvious: B and C are already fixed relative
  // to each other by the ternary body, so a bar between them adds nothing and
  // over-constrains the pair. An exact-duplicate test misses this.
  it('refuses a bar that would double a pair already held by a ternary link', () => {
    const b = new RevJoint('B', -2.7, 0.9);
    const c = new RevJoint('C', 2.9, 2.2);
    const g = new RevJoint('G', 0.7, 0.8);
    const f = new RevJoint('F', 1, 4);
    connect('BCG', [b, c, g]);
    connect('BF', [b, f]);

    expect(refuseJointMerge(f, c)).toBe('over-constrained');
  });

  it('still allows a bar onto a ternary link when it doubles no pair', () => {
    const b = new RevJoint('B', -2.7, 0.9);
    const c = new RevJoint('C', 2.9, 2.2);
    const g = new RevJoint('G', 0.7, 0.8);
    const f = new RevJoint('F', 1, 4);
    const h = new RevJoint('H', 4, 6);
    connect('BCG', [b, c, g]);
    connect('FH', [f, h]);

    expect(refuseJointMerge(f, c)).toBeUndefined();
  });

  it('refuses a prismatic joint, which is the slot rather than the pin', () => {
    const a = new RevJoint('A', 0, 0);
    const prismatic = new PrisJoint('B', 1, 0, false, true);

    expect(refuseJointMerge(a, prismatic)).toBe('prismatic');
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
      'two-sliders',
      'over-constrained',
      'not-a-real-joint',
    ];
    reasons.forEach((reason) => expect(MERGE_REFUSAL_MESSAGES[reason]).toBeTruthy());
  });
});

describe('merging onto sliders and welds', () => {
  /** Turn `joint` into a slider: a coincident PrisJoint joined by a block. */
  function addSlider(joint: RevJoint, prisId: string) {
    const prismatic = new PrisJoint(prisId, joint.x, joint.y, false, true);
    joint.connectedJoints.push(prismatic);
    prismatic.connectedJoints.push(joint);
    const block = new SliderBlock(joint.id + prisId, [joint, prismatic]);
    joint.links.push(block);
    prismatic.links.push(block);
    return prismatic;
  }

  // Dropping a pin onto a slider's pin is how a pin-in-slot gets built.
  it('allows a pin to be dropped onto the revolute half of a slider', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    connect('AB', [a, b]);
    connect('CD', [c, new RevJoint('D', 6, 0)]);
    addSlider(b, 'E');

    expect(refuseJointMerge(c, b)).toBeUndefined();
  });

  it('allows a slider to be dropped onto a plain pin', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    connect('AB', [a, b]);
    connect('CD', [c, new RevJoint('D', 6, 0)]);
    addSlider(b, 'E');

    expect(refuseJointMerge(b, c)).toBeUndefined();
  });

  it('refuses two sliders, which is a different joint type rather than a merge', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    connect('AB', [a, b]);
    connect('CD', [c, new RevJoint('D', 6, 0)]);
    addSlider(b, 'E');
    addSlider(c, 'F');

    expect(refuseJointMerge(b, c)).toBe('two-sliders');
  });

  it('allows a merge onto a welded joint, which the merge re-welds', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 1);
    const x = new RevJoint('X', 5, 5);
    connect('ABC', [a, b, c]);
    connect('XY', [x, new RevJoint('Y', 7, 5)]);
    b.isWelded = true;

    expect(refuseJointMerge(x, b)).toBeUndefined();
  });

  it('offers a slider pin as a drop target', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 3, 0);
    const c = new RevJoint('C', 9, 0);
    connect('AB', [a, b]);
    connect('CD', [c, new RevJoint('D', 12, 0)]);
    addSlider(b, 'E');

    expect(resolveJointDropTarget(c, 3, 0, [a, b, c], 1)).toBe(b);
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

// The canvas needs the joint the user is *aiming* at, legal or not, so that a
// refused target can be marked red and explained instead of going dark.
describe('resolving the joint a drag is aimed at', () => {
  /**
   * A dragged joint plus one legal target and one refused target, side by side.
   * The refusal is over-constraint rather than sharing a link, because a joint
   * on the dragged joint's own link is skipped outright — see the specs below.
   */
  function scene() {
    const dragged = new RevJoint('A', 0, 0);
    const anchor = new RevJoint('X', -5, 0);
    const refused = new RevJoint('B', 10, 0);
    const legal = new RevJoint('C', 10.5, 0);
    connect('AX', [dragged, anchor]);
    // Merging A into B would leave a second bar spanning X and B.
    connect('XB', [anchor, refused]);
    connect('CG', [legal, new RevJoint('G', 10.5, 5)]);
    return { dragged, refused, legal, joints: [dragged, refused, legal] };
  }

  it('reports a legal target with no refusal', () => {
    const { dragged, legal, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.5, 0, joints, 1)).toEqual({
      joint: legal,
      refusal: undefined,
    });
  });

  it('reports a refused target together with the reason it was refused', () => {
    const { dragged, refused, joints } = scene();

    expect(resolveDropCandidate(dragged, 10, 0, joints, 1)).toEqual({
      joint: refused,
      refusal: 'over-constrained',
    });
  });

  // Nearest wins outright: a refused joint under the cursor must not be stepped
  // over in favour of a legal one further away, or the red ring would appear on
  // a joint the user is not pointing at.
  it('takes the nearest joint even when a legal one sits just behind it', () => {
    const { dragged, refused, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.1, 0, joints, 1)?.joint).toBe(refused);
  });

  it('takes the nearer legal joint when that is the one under the cursor', () => {
    const { dragged, legal, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.4, 0, joints, 1)?.joint).toBe(legal);
  });

  it('takes nothing when every joint is outside the radius', () => {
    const { dragged, joints } = scene();

    expect(resolveDropCandidate(dragged, 5, 0, joints, 1)).toBeUndefined();
  });

  // Dragging one end of a bar onto the other is self-explanatory — the drawing
  // already shows the bar — so it is not a target at all rather than a red one.
  it('ignores the other end of the link being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 3, 0);
    connect('AB', [dragged, partner]);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, partner], 5)).toBeUndefined();
  });

  it('lets a legal joint further out win over a skipped same-link one', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 3, 0);
    const legal = new RevJoint('C', 3.4, 0);
    connect('AB', [dragged, partner]);
    connect('CD', [legal, new RevJoint('D', 3.4, 5)]);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, partner, legal], 5)?.joint).toBe(legal);
  });

  // The dragged joint is always at distance zero from the cursor, so reporting
  // it would pin a permanent ring to the thing being dragged.
  it('never reports the joint being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);

    expect(resolveDropCandidate(dragged, 0, 0, [dragged], 5)).toBeUndefined();
  });

  it('ignores the prismatic half of a slider, which is the slot rather than a pin', () => {
    const dragged = new RevJoint('A', 0, 0);
    const prismatic = new PrisJoint('B', 3, 0, false, true);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, prismatic], 5)).toBeUndefined();
  });
});

describe('a slider and the link it rides', () => {
  /** Bar C--D, with a block at P riding a slot cut into it. */
  function slottedLever() {
    const c = new RevJoint('C', 0, 0);
    const d = new RevJoint('D', 4, 0);
    const carrier = connect('CD', [c, d]);
    const p = new RevJoint('P', 2, 0);
    const e = new RevJoint('E', 2, 3);
    connect('EP', [e, p]);
    const slider = new PrisJoint('S', 2, 0);
    const block = new SliderBlock('PS', [p, slider]);
    p.links.push(block);
    slider.links.push(block);
    p.connectedJoints.push(slider);
    slider.connectedJoints.push(p);
    slider.slideOn(carrier, c, d);
    return { c, d, p, e, slider };
  }

  it('refuses to merge the block into a joint that defines its own slot', () => {
    // Found by dragging a block 25px: it snapped onto the nearer end of its own
    // carrier, and the assembly went on sliding on itself -- non-dangling and
    // unflagged, because the slot's own well-formedness test looks at the
    // PrisJoint, and the merge happens to its paired pin.
    const scene = slottedLever();

    expect(refuseJointMerge(scene.p, scene.c)).toBe('own-carrier');
    expect(refuseJointMerge(scene.p, scene.d)).toBe('own-carrier');
  });

  it('refuses it from either direction', () => {
    const scene = slottedLever();

    expect(refuseJointMerge(scene.c, scene.p)).toBe('own-carrier');
  });

  it('says which rule it hit', () => {
    expect(MERGE_REFUSAL_MESSAGES['own-carrier']).toMatch(/ride/i);
  });

  it('still allows a merge with a joint that has nothing to do with the slot', () => {
    // The refusal must be about the carrier, not about sliders in general --
    // dropping a pin onto a slider's pin is a pin-in-slot, which is the point.
    const scene = slottedLever();
    const loose = new RevJoint('Z', 9, 9);
    const other = new RevJoint('Y', 9, 8);
    connect('YZ', [loose, other]);

    expect(refuseJointMerge(loose, scene.p)).toBeUndefined();
  });

  it('never offers such a target to a drag', () => {
    const scene = slottedLever();

    const found = resolveJointDropTarget(scene.p, 0.05, 0, [scene.c, scene.d], 1);

    expect(found).toBeUndefined();
  });
});
