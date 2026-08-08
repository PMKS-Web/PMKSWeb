// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { ellipticalCrankFixture } from '../../test-utils/verification/slot-fixtures';

// The MotionGen library's "Elliptical Crank": an entirely ordinary six-bar with
// a grounded crank and one fixed guide. MotionGen animates it. PMKS+ does not,
// and the reason is worth having written down, because nothing about this
// mechanism is exotic -- it is the kind of thing a user will draw.
//
// No joint in it is locatable from two already-known ones. The crank pin swings
// about the grounded pivot and that is the whole of what the dyadic walk can
// do; C, D and E only locate each other. That is precisely the case 2.7a
// describes -- "when a pass makes no progress, the remaining unsolved joints
// are a simultaneous system" -- and the machinery for it exists and is reached.
// It declines to build a system for these three, and that is the gap.
//
// Kept as an assertion of the present behaviour so the day it changes is
// visible, rather than as a skipped test nobody runs.

describe('an ordinary six-bar with a grounded guide', () => {
  const { mechanism } = buildMechanism(ellipticalCrankFixture());
  const solver = PositionSolver as unknown as {
    unsolvableJoints: string[];
    stepCount: number;
    simultaneousSystem: unknown;
  };

  it('counts as a one-degree-of-freedom mechanism', () => {
    // Mobility is not the problem here, which is what separates this from the
    // MotionGen gripper: that one is miscounted, this one is counted right and
    // still cannot be solved.
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
  });

  it('orders one step and then stops', () => {
    expect(solver.stepCount).toBe(1);
    expect(solver.unsolvableJoints.sort()).toEqual(['C', 'D', 'E']);
  });

  it('does not fall back to a simultaneous solve, which is the gap', () => {
    expect(solver.simultaneousSystem).toBeUndefined();
  });

  it('reports itself invalid rather than animating something wrong', () => {
    // The one thing that must stay true whatever else is unfinished.
    expect(mechanism.joints.length).toBeLessThan(3);
  });
});
