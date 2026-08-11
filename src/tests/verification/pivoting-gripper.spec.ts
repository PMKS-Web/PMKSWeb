// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { pivotingGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { solveKinematics } from '../../test-utils/verification/solve';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// The counterpart to motiongen-gripper.spec.ts: the same gripper with the
// redundancy designed out, so that the refusal recorded there is shown to be
// about the mechanism rather than about grippers.

describe('a gripper with no redundant constraint', () => {
  const built = buildMechanismAtScale(pivotingGripperFixture(MODEL_SCALE), 1 * MODEL_SCALE);
  const { mechanism } = built;
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const gap = (t: number) =>
    Math.hypot(at(t, 'J').x - at(t, 'K').x, at(t, 'J').y - at(t, 'K').y) / MODEL_SCALE;

  it('has one degree of freedom and runs', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(mechanism.joints.length).toBeGreaterThan(50);
  });

  it('opens and closes the jaws', () => {
    const gaps = mechanism.joints.map((_, t) => gap(t));
    expect(Math.max(...gaps)).toBeGreaterThan(6);
    expect(Math.min(...gaps)).toBeLessThan(0.5);
  });

  it('keeps both jaws on their pivots and both rods rigid', () => {
    for (let t = 0; t < mechanism.joints.length; t++) {
      // Ground pivots stay put.
      for (const id of ['F', 'H']) {
        expect(Math.hypot(at(t, id).x - at(0, id).x, at(t, id).y - at(0, id).y)).toBeLessThan(3e-4);
      }
      // Rods and jaws stay their own length.
      for (const [a, b] of [
        ['B', 'G'],
        ['C', 'I'],
        ['F', 'K'],
        ['H', 'J'],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        const was = Math.hypot(at(0, a).x - at(0, b).x, at(0, a).y - at(0, b).y);
        expect(Math.abs(now - was)).toBeLessThan(3e-3);
      }
    }
  });

  it('keeps the plate on its rail, and square to it', () => {
    // Two pins on one line is what stops the plate turning, and it is the part
    // of this design that had to be a rail rather than a single pin: taking a
    // rod away otherwise leaves the plate free to rotate.
    for (let t = 0; t < mechanism.joints.length; t++) {
      expect(Math.abs(at(t, 'A').y)).toBeLessThan(3e-4);
      expect(Math.abs(at(t, 'M').y)).toBeLessThan(3e-4);
    }
  });

  // Everything above reads positions, and positions were never the problem: the
  // driven prismatic input tripped a guard in the kinematics initializer that
  // returned before any of its index maps were built, so the velocity solver
  // threw and the Analyze tab offered no data series to tick.
  it('gives every moving joint a velocity and acceleration that match its path', () => {
    const trace = solveKinematics(built);
    const frames = mechanism.joints.length;
    const dt = mechanism.timeNum[1] - mechanism.timeNum[0];
    const rate = mechanism.inputAngularVelocities;

    for (const id of ['A', 'B', 'C', 'G', 'I', 'J', 'K', 'M']) {
      for (let t = 1; t < frames - 1; t++) {
        const [vx, vy] = trace.jointVel[t][id];
        const [ax, ay] = trace.jointAcc[t][id];
        expect(Number.isFinite(vx) && Number.isFinite(vy), `${id} velocity at ${t}`).toBe(true);
        expect(Number.isFinite(ax) && Number.isFinite(ay), `${id} acceleration at ${t}`).toBe(true);
      }
      // A solver that gave up quietly would fill these with zeros, which reads
      // as a gripper that never opens.
      expect(
        Math.max(...trace.jointVel.slice(1, -1).map((v) => Math.hypot(...v[id]))),
        id
      ).toBeGreaterThan(1);
    }

    // The plate and its two pins ride the rail, so they travel at the commanded
    // rate and nothing else: exactly, not nearly.
    for (let t = 0; t < frames; t++) {
      for (const id of ['A', 'M', 'B', 'C']) {
        expect(trace.jointVel[t][id][0], `${id} at ${t}`).toBeCloseTo(rate[t], 9);
        expect(trace.jointVel[t][id][1], `${id} at ${t}`).toBeCloseTo(0, 9);
        expect(Math.hypot(...trace.jointAcc[t][id]), `${id} at ${t}`).toBeCloseTo(0, 9);
      }
    }

    // The jaws are what actually turn, and differentiating their drawn path has
    // to reproduce what the solver says. The stroke reverses twice per cycle —
    // this gripper opens and closes rather than going round — so the four frames
    // either side of a reversal are left out: a central difference straddling a
    // direction change measures the reversal, not the motion. Over the 111
    // frames that remain, the worst disagreement is 0.42% of peak speed and
    // 0.97% of peak acceleration.
    const steady = (t: number) =>
      [-4, -3, -2, -1, 1, 2, 3, 4].every(
        (k) => t + k >= 0 && t + k < frames && rate[t + k] === rate[t]
      );
    for (const id of ['G', 'I', 'J', 'K']) {
      let worstVel = 0;
      let worstAcc = 0;
      let peakVel = 0;
      let peakAcc = 0;
      for (let t = 1; t < frames - 1; t++) {
        if (!steady(t)) continue;
        const [before, here, after] = [at(t - 1, id), at(t, id), at(t + 1, id)];
        const fdVel = [(after.x - before.x) / (2 * dt), (after.y - before.y) / (2 * dt)];
        const fdAcc = [
          (after.x - 2 * here.x + before.x) / (dt * dt),
          (after.y - 2 * here.y + before.y) / (dt * dt),
        ];
        const vel = trace.jointVel[t][id];
        const acc = trace.jointAcc[t][id];
        worstVel = Math.max(worstVel, Math.hypot(fdVel[0] - vel[0], fdVel[1] - vel[1]));
        worstAcc = Math.max(worstAcc, Math.hypot(fdAcc[0] - acc[0], fdAcc[1] - acc[1]));
        peakVel = Math.max(peakVel, Math.hypot(fdVel[0], fdVel[1]));
        peakAcc = Math.max(peakAcc, Math.hypot(fdAcc[0], fdAcc[1]));
      }
      expect(worstVel / peakVel, `${id} velocity`).toBeLessThan(0.01);
      expect(worstAcc / peakAcc, `${id} acceleration`).toBeLessThan(0.02);
    }
  });
});
