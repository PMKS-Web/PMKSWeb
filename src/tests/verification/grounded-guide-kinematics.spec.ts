// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, BuiltMechanism } from '../../test-utils/verification/fixture';
import {
  ellipticalCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';

// `ground` means two different things, and the velocity analysis used to read
// only one of them. On a RevJoint it says the point is fixed in the world; on a
// PrisJoint it says only that the *guide* is fixed, and the joint itself is the
// block's coordinate travelling along that guide. The initializer seeds every
// grounded joint with zero rates, so a grounded guide was reported stationary
// while the pin welded through it -- the same point -- was reported moving.
//
// That is the failure worth a spec of its own: it is invisible. Nothing goes
// singular and no picture goes wrong, because the animation comes from the
// position solver and the force analysis already reads the rider. Only the
// velocity and acceleration a student is shown for the block are wrong, and
// they are wrong by being plausible -- zero is what a grounded thing does.
//
// Both solver routes are covered. The elliptical crank is settled by the
// simultaneous constraint set; the Scotch yoke by the loop matrix. They seeded
// the same zero for different reasons, so one fixture would not have caught it.

/** Every timestep, in an array indexed the way the fixture's frames are. */
interface Trace {
  velocity: [number, number][];
  acceleration: [number, number][];
}

function traceJoints(built: BuiltMechanism, ids: string[]): Map<string, Trace> {
  const traces = new Map<string, Trace>(ids.map((id) => [id, { velocity: [], acceleration: [] }]));
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
  for (let step = 0; step < built.mechanism.joints.length; step++) {
    KinematicsSolver.determineKinematics(
      built.mechanism.joints[step],
      built.mechanism.links[step],
      built.mechanism.inputAngularVelocities[step]
    );
    for (const id of ids) {
      traces.get(id)!.velocity.push(KinematicsSolver.jointVelMap.get(id) ?? [NaN, NaN]);
      traces.get(id)!.acceleration.push(KinematicsSolver.jointAccMap.get(id) ?? [NaN, NaN]);
    }
  }
  return traces;
}

const CASES = [
  { name: 'the elliptical crank', build: ellipticalCrankFixture, guide: 'P', rider: 'E' },
  { name: 'a Scotch yoke', build: scotchYokeFixture, guide: 'F', rider: 'C' },
] as const;

describe('a block on a grounded guide', () => {
  for (const { name, build, guide, rider } of CASES) {
    const built = buildMechanism(build());
    const traces = traceJoints(built, [guide, rider]);
    const steps = built.mechanism.joints.length;

    it(`moves with the pin it carries, in ${name}`, () => {
      for (let step = 0; step < steps; step++) {
        const block = traces.get(guide)!;
        const pin = traces.get(rider)!;
        for (const axis of [0, 1]) {
          expect(
            block.velocity[step][axis],
            `${guide} v[${axis}] vs ${rider} at step ${step}`
          ).toBeCloseTo(pin.velocity[step][axis], 9);
          expect(
            block.acceleration[step][axis],
            `${guide} a[${axis}] vs ${rider} at step ${step}`
          ).toBeCloseTo(pin.acceleration[step][axis], 9);
        }
      }
    });

    it(`gives that pair something to agree about, in ${name}`, () => {
      // Without this the whole suite passes on a "fix" that zeroes the rider to
      // match the block, which is the same defect pointed the other way.
      const pin = traces.get(rider)!;
      const largest = (rows: [number, number][]) =>
        Math.max(...rows.map(([x, y]) => Math.hypot(x, y)));
      expect(largest(pin.velocity), `${rider} peak speed`).toBeGreaterThan(0.1);
      expect(largest(pin.acceleration), `${rider} peak acceleration`).toBeGreaterThan(0.1);
    });

    it(`reports a speed its own positions confirm, in ${name}`, () => {
      // Anchored outside the solver: differentiate the positions the mechanism
      // was actually drawn at. Copying the rider's velocity onto the block is
      // only worth anything if the rider's velocity is itself right, and every
      // assertion above would hold just as well on a solver that was wrong
      // consistently.
      //
      // The tolerance is proportional with a floor rather than a fixed number
      // of decimals, because a central difference over one degree of crank has
      // two error sources that scale differently. Curvature costs a fraction of
      // the speed -- E accelerates fourfold over ten samples here -- while the
      // four decimals the solved coordinates are kept to cost a fixed amount of
      // travel, which only matters where the joint has nearly stopped. Both
      // terms are still small enough that a block reported stationary, the
      // defect this file exists for, misses by two orders of magnitude.
      const frames = built.mechanism.joints;
      const times = built.mechanism.timeNum;
      const at = (step: number): Joint => frames[step].find((j) => j.id === rider)!;
      const pin = traces.get(rider)!;
      for (let step = 1; step < frames.length - 1; step++) {
        const span = times[step + 1] - times[step - 1];
        const measured = [
          (at(step + 1).x - at(step - 1).x) / span,
          (at(step + 1).y - at(step - 1).y) / span,
        ];
        const tolerance = 0.02 * Math.hypot(...pin.velocity[step]) + 0.01;
        for (const axis of [0, 1]) {
          expect(
            Math.abs(pin.velocity[step][axis] - measured[axis]),
            `${rider} v[${axis}] vs finite difference at step ${step}`
          ).toBeLessThan(tolerance);
        }
      }
    });
  }
});
