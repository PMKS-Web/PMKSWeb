// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { rigidLinkResidual, slotResidual } from '../../app/model/mechanism/constraint-residuals';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  COUPLER,
  CRANK,
  GROUND,
  RIDER_LEVER as LEVER,
  ROCKER,
  slottedCouplerFixture,
} from '../../test-utils/verification/slot-fixtures';

const SLOTTED_COUPLER = slottedCouplerFixture();

// Test-ladder case 5 (docs/joint-types-plan.md §4.1): a four-bar whose coupler
// carries a slot, driving a grounded lever that rides in it.
//
// This case exists for one reason. Cases 2, 3 and 4 are all the *inverse*
// direction, where the block is known and the carrier's pose follows. Here the
// carrier is settled by the four-bar first and the rider is the unknown, which
// is the only way the forward primitive gets exercised at all.
//
// The forward primitive is where a slot line has to be re-measured every
// timestep. A grounded guide can be recorded once; a slot cut into a moving
// coupler points somewhere different at every crank angle, and using a stale
// line produces a picture that looks plausible and is wrong.

function at(joints: Joint[], id: string): Joint {
  return joints.find((joint) => joint.id === id)!;
}

describe('four-bar with a slotted coupler (forward slot direction)', () => {
  it('assembles at one degree of freedom and runs a full cycle', () => {
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.joints.length).toBeGreaterThanOrEqual(360);
  });

  it('keeps the rider on the coupler slot as the coupler moves', () => {
    // The assertion the whole case is for. A slot line fixed at t = 0 satisfies
    // this only at t = 0 and drifts from there.
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const f = at(joints, 'F');
      expect(slotResidual(f.x, f.y, b.x, b.y, c.x, c.y), `t=${t}`).toBeCloseTo(0, 3);
    }
  });

  it('holds the four-bar and the lever rigid throughout', () => {
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const [a, b, c, d, e, f] = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => at(joints, id));
      expect(rigidLinkResidual(a.x, a.y, b.x, b.y, CRANK), `crank t=${t}`).toBeCloseTo(0, 3);
      expect(rigidLinkResidual(b.x, b.y, c.x, c.y, COUPLER), `coupler t=${t}`).toBeCloseTo(0, 3);
      expect(rigidLinkResidual(c.x, c.y, d.x, d.y, ROCKER), `rocker t=${t}`).toBeCloseTo(0, 3);
      expect(rigidLinkResidual(e.x, e.y, f.x, f.y, LEVER), `lever t=${t}`).toBeCloseTo(0, 3);
    }
  });

  it('moves the coupler slot rather than leaving it where it started', () => {
    // Guards the assertions above against passing for the wrong reason: they
    // would all hold trivially if the coupler never moved.
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    const angleAt = (t: number) => {
      const b = at(mechanism.joints[t], 'B');
      const c = at(mechanism.joints[t], 'C');
      return Math.atan2(c.y - b.y, c.x - b.x);
    };
    const swept = Array.from({ length: mechanism.joints.length }, (_, t) => angleAt(t));

    expect(Math.max(...swept) - Math.min(...swept)).toBeGreaterThan(0.2);
  });

  it('places the rider where the four-bar closed form puts it', () => {
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    for (let t = 0; t < mechanism.joints.length; t++) {
      const joints = mechanism.joints[t];
      const [a, b, c, e, f] = ['A', 'B', 'C', 'E', 'F'].map((id) => at(joints, id));

      // Independent of the solver: intersect the lever's circle with the line
      // through the two coupler pins and take the root nearest the answer.
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      expect(b.x, `crank x t=${t}`).toBeCloseTo(CRANK * Math.cos(theta), 3);

      const dx = c.x - b.x;
      const dy = c.y - b.y;
      const length = Math.hypot(dx, dy);
      const ux = dx / length;
      const uy = dy / length;
      const toE = [e.x - b.x, e.y - b.y];
      const along = toE[0] * ux + toE[1] * uy;
      const across = toE[0] * -uy + toE[1] * ux;
      const half = Math.sqrt(Math.max(LEVER * LEVER - across * across, 0));
      const roots = [along - half, along + half].map(
        (s) => [b.x + s * ux, b.y + s * uy] as [number, number]
      );
      const nearest = roots.reduce((best, root) =>
        Math.hypot(root[0] - f.x, root[1] - f.y) < Math.hypot(best[0] - f.x, best[1] - f.y)
          ? root
          : best
      );

      expect(Math.hypot(nearest[0] - f.x, nearest[1] - f.y), `rider t=${t}`).toBeLessThan(0.002);
    }
  });
});

describe('velocity through a slot whose carrier is solved first', () => {
  /** Solve one timestep's kinematics and hand back the solver's maps. */
  function solveAt(timestep: number) {
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    for (let t = 0; t <= timestep; t++) {
      KinematicsSolver.determineKinematics(
        mechanism.joints[t],
        mechanism.links[t],
        mechanism.inputAngularVelocities[t]
      );
    }
    return { joints: mechanism.joints[timestep] };
  }

  it('closes a loop through the slot as well as around the four-bar', () => {
    const { mechanism } = buildMechanism(SLOTTED_COUPLER);

    const ids = mechanism.requiredLoops.map((loop) => loop.id);
    expect(ids).toContain('A-B-C-D');
    expect(ids).toContain('A-B~P~P-F-E');
  });

  it('keeps the rider on a circle about its own pivot', () => {
    // E is ground and |EF| is rigid, so F's velocity can only be perpendicular
    // to EF. Any component along it would be the lever changing length.
    for (const timestep of [0, 40, 90, 140, 200, 260, 320]) {
      const { joints } = solveAt(timestep);
      const e = at(joints, 'E');
      const f = at(joints, 'F');
      const velocity = KinematicsSolver.jointVelMap.get('F')!;
      const along =
        (velocity[0] * (f.x - e.x) + velocity[1] * (f.y - e.y)) / Math.hypot(f.x - e.x, f.y - e.y);

      expect(along, `t=${timestep}`).toBeCloseTo(0, 6);
      // Looser than the perpendicularity check above on purpose: this one
      // compares against LEVER, and the solved lever length carries the
      // position solver's own four-decimal rounding.
      expect(Math.hypot(velocity[0], velocity[1]), `speed t=${timestep}`).toBeCloseTo(
        Math.abs(KinematicsSolver.linkAngVelMap.get('EF')!) * LEVER,
        4
      );
    }
  });

  it('lets the rider move only along the slot, relative to the coupler', () => {
    // The slot constraint in velocity form: subtract the motion of the coupler
    // point the rider is sitting on, and what is left must lie along the slot.
    // This is the forward-direction counterpart of the position residual above.
    for (const timestep of [0, 40, 90, 140, 200, 260, 320]) {
      const { joints } = solveAt(timestep);
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const f = at(joints, 'F');
      const couplerOmega = KinematicsSolver.linkAngVelMap.get('BC')!;
      const riderVelocity = KinematicsSolver.jointVelMap.get('F')!;
      const pinVelocity = KinematicsSolver.jointVelMap.get('B')!;

      // Velocity of the coupler's own point currently under the rider.
      const carried = [
        pinVelocity[0] - couplerOmega * (f.y - b.y),
        pinVelocity[1] + couplerOmega * (f.x - b.x),
      ];
      const length = Math.hypot(c.x - b.x, c.y - b.y);
      const across =
        ((riderVelocity[0] - carried[0]) * -(c.y - b.y) +
          (riderVelocity[1] - carried[1]) * (c.x - b.x)) /
        length;

      expect(across, `t=${timestep}`).toBeCloseTo(0, 6);
    }
  });

  it('accelerates along the slot only once Coriolis is accounted for', () => {
    // The acceleration form of the same constraint. Relative to the coupler the
    // rider may only accelerate along the slot -- but the frame it is measured
    // in is rotating, so 2*omega x (sdot*u) has to come out before what is left
    // is allowed to lie along the slot. Without that term this is off by
    // exactly the Coriolis acceleration.
    for (const timestep of [0, 40, 90, 140, 200, 260, 320]) {
      const { joints } = solveAt(timestep);
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const f = at(joints, 'F');
      const omega = KinematicsSolver.linkAngVelMap.get('BC')!;
      const alpha = KinematicsSolver.linkAngAccMap.get('BC')!;
      const rate = KinematicsSolver.slideRateMap.get('P')!;
      const riderAcc = KinematicsSolver.jointAccMap.get('F')!;
      const pinAcc = KinematicsSolver.jointAccMap.get('B')!;

      const rx = f.x - b.x;
      const ry = f.y - b.y;
      // Acceleration of the coupler's own point under the rider.
      const carried = [
        pinAcc[0] - alpha * ry - omega * omega * rx,
        pinAcc[1] + alpha * rx - omega * omega * ry,
      ];
      const length = Math.hypot(c.x - b.x, c.y - b.y);
      const ux = (c.x - b.x) / length;
      const uy = (c.y - b.y) / length;
      const coriolis = [-2 * omega * rate * uy, 2 * omega * rate * ux];
      const across =
        (riderAcc[0] - carried[0] - coriolis[0]) * -uy +
        (riderAcc[1] - carried[1] - coriolis[1]) * ux;

      // Second derivatives amplify the position solver's four-decimal rounding,
      // so this sits a decade looser than the velocity form above. The Coriolis
      // term it is testing for is of order 0.1 here, not 1e-5.
      expect(across, `t=${timestep}`).toBeCloseTo(0, 4);
    }
  });
});

describe('the forward case with its slot joints declared the other way round', () => {
  // The inverse case broke when the anchor was the carrier's free end. Here the
  // carrier is the coupler and neither slot joint is grounded, so both orders
  // have to work off a joint the four-bar settled first.
  const swapped = slottedCouplerFixture();
  swapped.sliders = [{ at: 'F', prisId: 'P', on: { carrier: 'BC', a: 'C', b: 'B' } }];

  function solveSwappedAt(timestep: number) {
    const { mechanism } = buildMechanism(swapped);
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    for (let t = 0; t <= timestep; t++) {
      KinematicsSolver.determineKinematics(
        mechanism.joints[t],
        mechanism.links[t],
        mechanism.inputAngularVelocities[t]
      );
    }
    return mechanism.joints[timestep];
  }

  it('solves without throwing', () => {
    expect(() => solveSwappedAt(90)).not.toThrow();
  });

  it('keeps the rider on the slot from the other anchor too', () => {
    for (const timestep of [0, 40, 90, 140, 200, 260, 320]) {
      const joints = solveSwappedAt(timestep);
      const b = at(joints, 'B');
      const c = at(joints, 'C');
      const f = at(joints, 'F');
      expect(slotResidual(f.x, f.y, b.x, b.y, c.x, c.y), `t=${timestep}`).toBeCloseTo(0, 3);

      const velocity = KinematicsSolver.jointVelMap.get('F')!;
      const e = at(joints, 'E');
      const along =
        (velocity[0] * (f.x - e.x) + velocity[1] * (f.y - e.y)) / Math.hypot(f.x - e.x, f.y - e.y);
      expect(along, `speed t=${timestep}`).toBeCloseTo(0, 6);
    }
  });
});
