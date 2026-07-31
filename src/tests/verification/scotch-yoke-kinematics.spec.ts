import '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, BuiltMechanism } from '../../test-utils/verification/fixture';
import {
  INPUT_SPEED,
  scotchYokeFixture,
  scotchYokeGuidedAtFarEndFixture,
  scotchYokeWithTracerFixture,
  YOKE_CRANK,
} from '../../test-utils/verification/slot-fixtures';

// The velocity half of Gate 3. A welded rider cannot turn in its block, and a
// block in a grounded guide cannot turn at all, so the assembly's angular
// velocity is zero rather than an unknown for the matrix to solve
// (docs/phase-3-slide-spec.md §3.6b).
//
// Without that the single loop offers two equations against three unknowns
// {ω_yoke, ṡ_E, ṡ_C} and the system is singular. With it the coefficient matrix
// is [v̂ | −û] with v̂ ⊥ û, which is as well conditioned as it gets.

const SAMPLES = [17, 45, 90, 133, 226, 314];

/** Solve one timestep and read the maps the solver leaves behind. */
function solveAt(built: BuiltMechanism, step: number) {
  KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
  KinematicsSolver.resetVariables();
  KinematicsSolver.determineKinematics(
    built.mechanism.joints[step],
    built.mechanism.links[step],
    INPUT_SPEED
  );
  const a = built.mechanism.joints[step].find((joint) => joint.id === 'A')!;
  const b = built.mechanism.joints[step].find((joint) => joint.id === 'B')!;
  return { theta: Math.atan2(b.y - a.y, b.x - a.x) };
}

describe('the kinematics of a Scotch yoke', () => {
  it('moves the yoke at x-dot = -r omega sin theta', () => {
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      const { theta } = solveAt(built, step);
      const velocity = KinematicsSolver.jointVelMap.get('C')!;
      expect(velocity[0], `C x-dot at step ${step}`).toBeCloseTo(
        -YOKE_CRANK * INPUT_SPEED * Math.sin(theta),
        3
      );
      // Welded to a horizontal guide, so there is no cross-guide motion at all.
      expect(velocity[1], `C y-dot at step ${step}`).toBeCloseTo(0, 6);
    }
  });

  it('accelerates the yoke at x-double-dot = -r omega squared cos theta', () => {
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      const { theta } = solveAt(built, step);
      const acceleration = KinematicsSolver.jointAccMap.get('C')!;
      expect(acceleration[0], `C x-double-dot at step ${step}`).toBeCloseTo(
        -YOKE_CRANK * INPUT_SPEED * INPUT_SPEED * Math.cos(theta),
        3
      );
      expect(acceleration[1], `C y-double-dot at step ${step}`).toBeCloseTo(0, 6);
    }
  });

  it('never gives the welded assembly an angular velocity', () => {
    // This is the assertion that fails when only the position half lands: the
    // picture is right and the numbers under it are not.
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      solveAt(built, step);
      expect(KinematicsSolver.linkAngVelMap.get('CD'), `omega at step ${step}`).toBeCloseTo(0, 9);
      expect(KinematicsSolver.linkAngAccMap.get('CD'), `alpha at step ${step}`).toBeCloseTo(0, 9);
    }
  });

  it('carries every joint of the assembly at the same velocity', () => {
    // One rigid body translating: C, D and the tracer G must agree exactly.
    const built = buildMechanism(scotchYokeWithTracerFixture());

    for (const step of SAMPLES) {
      solveAt(built, step);
      const c = KinematicsSolver.jointVelMap.get('C')!;
      for (const id of ['D', 'G']) {
        const other = KinematicsSolver.jointVelMap.get(id)!;
        expect(other[0], `${id} x-dot at step ${step}`).toBeCloseTo(c[0], 6);
        expect(other[1], `${id} y-dot at step ${step}`).toBeCloseTo(c[1], 6);
      }
    }
  });

  it('holds the rider still when the loop reaches it along a link edge', () => {
    // The plain yoke's loop steps from the slot straight onto the block, so the
    // rider link never appears as an edge and the two registration paths that
    // hand out unknowns along edges are never asked about it. Gating only the
    // slot path therefore passes every assertion above while leaving a welded
    // rider a spurious angular column everywhere else -- and the matrix solves
    // it and writes it over the seeded zero, so the result is a wrong number
    // rather than a singular system.
    //
    // Moving the guide to the far end of the slot puts the rider on an edge.
    // Same mechanism, same closed form, different loop.
    const built = buildMechanism(scotchYokeGuidedAtFarEndFixture());

    expect(built.mechanism.dof).toBe(1);
    for (const step of SAMPLES) {
      const { theta } = solveAt(built, step);
      expect(KinematicsSolver.linkAngVelMap.get('CD'), `omega at step ${step}`).toBeCloseTo(0, 9);
      expect(KinematicsSolver.linkAngAccMap.get('CD'), `alpha at step ${step}`).toBeCloseTo(0, 9);
      expect(KinematicsSolver.jointVelMap.get('D')![0], `D x-dot at step ${step}`).toBeCloseTo(
        -YOKE_CRANK * INPUT_SPEED * Math.sin(theta),
        3
      );
    }
  });

  it('produces finite numbers everywhere, not a singular solve', () => {
    const built = buildMechanism(scotchYokeFixture());

    for (const step of SAMPLES) {
      solveAt(built, step);
      for (const id of ['B', 'C', 'D', 'E']) {
        const velocity = KinematicsSolver.jointVelMap.get(id);
        expect(velocity?.every(Number.isFinite), `${id} finite at step ${step}`).toBe(true);
      }
    }
  });
});
