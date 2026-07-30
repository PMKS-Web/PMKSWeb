import '../joint';
import { PrisJoint, RevJoint } from '../joint';
import { Coord } from '../coord';
import { RealLink, SliderBlock } from '../link';
import { PositionSolver } from './position-solver';

/** Wire a chain of pin-jointed links through the given joints, in order. */
function chain(joints: RevJoint[]): RealLink[] {
  return joints.slice(0, -1).map((joint, index) => {
    const next = joints[index + 1];
    const link = new RealLink(
      joint.id + next.id,
      [joint, next],
      1,
      1,
      new Coord((joint.x + next.x) / 2, (joint.y + next.y) / 2)
    );
    joint.links.push(link);
    next.links.push(link);
    joint.connectedJoints.push(next);
    next.connectedJoints.push(joint);
    return link;
  });
}

describe('ordering joints no primitive can reach', () => {
  /**
   * A five-bar chain: two grounds, a driven crank, and two joints in the middle
   * that no pair of known references can pin down. Nothing here slides — the
   * point is what the walk does when it runs out of moves.
   */
  function fiveBar() {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 1);
    const d = new RevJoint('D', 3, 1);
    const e = new RevJoint('E', 4, 0, false, true);
    const joints = [a, b, c, d, e];
    return { joints, links: chain(joints) };
  }

  it('names the joints it could not order', () => {
    // Previously the walk simply stopped and the mechanism sat still, with
    // nothing anywhere saying which joints were the problem.
    PositionSolver.resetStaticVariables();
    const { joints, links } = fiveBar();

    PositionSolver.determineJointOrder(joints, links);

    expect(PositionSolver.unsolvableJoints).toEqual(['C', 'D']);
  });

  it('refuses to run a partial solve', () => {
    // Executing the steps it did emit would move the crank and leave the rest
    // of the linkage behind, which reads as a mechanism rather than a failure.
    PositionSolver.resetStaticVariables();
    const { joints, links } = fiveBar();
    PositionSolver.determineJointOrder(joints, links);

    expect(PositionSolver.determinePositionAnalysis(joints, links, [], true)).toBe(false);
  });

  it('reports nothing unsolvable for a linkage it can order', () => {
    PositionSolver.resetStaticVariables();
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 3, 1);
    const d = new RevJoint('D', 4, 0, false, true);
    const joints = [a, b, c, d];

    PositionSolver.determineJointOrder(joints, chain(joints));

    expect(PositionSolver.unsolvableJoints).toEqual([]);
    expect(PositionSolver.stepCount).toBe(2);
  });
});

describe('deferring a slot whose carrier is not placed yet', () => {
  /**
   * Crank AB drives a block that rides in a slot along the grounded lever CD.
   * The walk reaches the block from the crank, but the lever's far joint is not
   * known at that moment — and the lever's pose is exactly what the slot line
   * depends on.
   */
  function invertedSliderCrank() {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 0, 1);
    const c = new RevJoint('C', 3, 0, false, true);
    const span = Math.hypot(0 - 3, 1);
    const d = new RevJoint('D', 3 + (5 * (0 - 3)) / span, (5 * 1) / span);

    const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0, 0.5));
    const cd = new RealLink('CD', [c, d], 1, 1, new Coord(1, 1));
    [a, b].forEach((joint) => joint.links.push(ab));
    [c, d].forEach((joint) => joint.links.push(cd));
    a.connectedJoints.push(b);
    b.connectedJoints.push(a);
    c.connectedJoints.push(d);
    d.connectedJoints.push(c);

    const slot = new PrisJoint('P', b.x, b.y);
    slot.slideOn(cd, c, d);
    const block = new SliderBlock('BP', [b, slot], 1);
    b.links.push(block);
    slot.links.push(block);
    b.connectedJoints.push(slot);
    slot.connectedJoints.push(b);

    return { joints: [a, b, c, d, slot], links: [ab, cd, block] };
  }

  it('orders the carrier only after the block that locates it', () => {
    PositionSolver.resetStaticVariables();
    const { joints, links } = invertedSliderCrank();

    PositionSolver.determineJointOrder(joints, links);

    const order = [...PositionSolver.jointNumOrderSolverMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, targets]) => targets);
    // Crank pin, then the block riding on it, then the lever it swings.
    expect(order).toEqual([['B'], ['P'], ['D']]);
    expect(PositionSolver.unsolvableJoints).toEqual([]);
  });

  /**
   * Crank AB drives link BF, whose far pin rides in a slot along the lever CD.
   * The walk reaches F immediately after the crank pin — one step before the
   * lever it slides on has been placed anywhere.
   */
  function riderReachedBeforeItsCarrier() {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 0);
    const f = new RevJoint('F', 2, 1);
    const c = new RevJoint('C', 3, 0, false, true);
    const span = Math.hypot(2 - 3, 1);
    const d = new RevJoint('D', 3 + (2 * (2 - 3)) / span, (2 * 1) / span);

    const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0.5, 0));
    const bf = new RealLink('BF', [b, f], 1, 1, new Coord(1.5, 0.5));
    const cd = new RealLink('CD', [c, d], 1, 1, new Coord(2.5, 0.5));
    [a, b].forEach((joint) => joint.links.push(ab));
    [b, f].forEach((joint) => joint.links.push(bf));
    [c, d].forEach((joint) => joint.links.push(cd));
    a.connectedJoints.push(b);
    b.connectedJoints.push(a, f);
    f.connectedJoints.push(b);
    c.connectedJoints.push(d);
    d.connectedJoints.push(c);

    const slot = new PrisJoint('P', f.x, f.y);
    slot.slideOn(cd, c, d);
    const block = new SliderBlock('FP', [f, slot], 1);
    f.links.push(block);
    slot.links.push(block);
    f.connectedJoints.push(slot);
    slot.connectedJoints.push(f);

    return { joints: [a, b, f, c, d, slot], links: [ab, bf, cd, block] };
  }

  it('will not place a rider on a slot whose carrier is still unknown', () => {
    // The walk arrives at F with the slot's far joint unplaced. Emitting the
    // step here would run it against the lever's previous-timestep pose: wrong,
    // and wrong in a way that still draws a moving mechanism.
    PositionSolver.resetStaticVariables();
    const { joints, links } = riderReachedBeforeItsCarrier();

    PositionSolver.determineJointOrder(joints, links);

    const targeted = [...PositionSolver.jointNumOrderSolverMap.values()].flat();
    expect(targeted).not.toContain('F');
  });

  it('reports the circular case unsolvable instead of guessing', () => {
    // F needs the lever's pose, the lever needs the block, and the block needs
    // F. That is a simultaneous system, which v1 names rather than solves.
    PositionSolver.resetStaticVariables();
    const { joints, links } = riderReachedBeforeItsCarrier();

    PositionSolver.determineJointOrder(joints, links);

    expect(PositionSolver.unsolvableJoints.sort()).toEqual(['D', 'F', 'P']);
  });

  it('places the whole carrier in a single step', () => {
    // The inverse primitive settles a link's pose, so its step targets a set of
    // joints. A one-joint-per-step representation could not express it.
    PositionSolver.resetStaticVariables();
    const { joints, links } = invertedSliderCrank();
    const carrier = links.find((link) => link.id === 'CD')!;
    // A third joint on the lever, carried along by the same rotation.
    const tip = new RevJoint('T', 1, 3);
    carrier.joints.push(tip);
    tip.links.push(carrier);
    carrier.joints.forEach((member) => {
      if (member.id === tip.id) return;
      tip.connectedJoints.push(member);
      (member as RevJoint).connectedJoints.push(tip);
    });
    joints.push(tip);

    PositionSolver.determineJointOrder(joints, links);

    const carrierStep = [...PositionSolver.jointNumOrderSolverMap.values()].find((targets) =>
      targets.includes('D')
    );
    expect(carrierStep?.sort()).toEqual(['D', 'T']);
  });
});
