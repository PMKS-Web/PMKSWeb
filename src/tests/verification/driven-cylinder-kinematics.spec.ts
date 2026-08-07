// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A cylinder-driven mechanism had no velocity analysis at all: loop detection
// cannot see through a sealed cylinder, so it reached the loopless path and
// came away with nothing, and the graphs plotted NaN in silence.
//
// The rates now come from differentiating the same constraints the positions
// came from. That is checkable against a closed form, which is the only reason
// to trust it: the boom is a triangle with one side driven, so
//
//   s^2 = BASE^2 + BOOM^2 - 2 BASE BOOM cos(theta)
//   =>  theta_dot = s * s_dot / (BASE * BOOM * sin theta)
//
// and the tip's velocity is BOOM * theta_dot perpendicular to the boom.

const S = MODEL_SCALE;
const BOOM = 4;
const BASE = 3;
const SPEED = 2; // user units per second, the commanded extension rate

const boom = (): MechanismFixture => ({
  ...cylinderBoomFixture(S),
  inputAngVel: SPEED * S,
});

interface Sample {
  theta: number;
  span: number;
  tipSpeed: number;
  tipVelocity: [number, number];
  tipAcceleration: [number, number];
  groundSpeed: number;
  /** The commanded extension rate at this sample, sign and all. */
  rate: number;
}

function sampled(): Sample[] {
  SettingsService._objectScale.next(1 * MODEL_SCALE);
  const { mechanism } = buildMechanism(boom());
  const out: Sample[] = [];
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  for (let t = 0; t < mechanism.joints.length; t++) {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    const at = (id: string): Joint => mechanism.joints[t].find((joint) => joint.id === id)!;
    const [o, c, g] = ['O', 'C', 'G'].map(at);
    const velocity = KinematicsSolver.jointVelMap.get('C') ?? [NaN, NaN];
    const tipAcceleration = KinematicsSolver.jointAccMap.get('C') ?? [NaN, NaN];
    const groundVelocity = KinematicsSolver.jointVelMap.get('G') ?? [NaN, NaN];
    out.push({
      theta: Math.atan2(c.y - o.y, c.x - o.x),
      span: Math.hypot(c.x - g.x, c.y - g.y) / S,
      tipSpeed: Math.hypot(velocity[0], velocity[1]) / S,
      tipVelocity: [velocity[0] / S, velocity[1] / S],
      tipAcceleration: [tipAcceleration[0] / S, tipAcceleration[1] / S],
      groundSpeed: Math.hypot(groundVelocity[0], groundVelocity[1]) / S,
      rate: mechanism.inputAngularVelocities[t] / S,
    });
  }
  return out;
}

describe('a cylinder-driven boom, differentiated', () => {
  const samples = sampled();

  it('reports velocities at all', () => {
    expect(samples.length).toBeGreaterThan(50);
    for (const sample of samples) {
      expect(Number.isFinite(sample.tipSpeed)).toBe(true);
    }
    // And they are not all zero, which would pass every check below vacuously.
    expect(Math.max(...samples.map((s) => s.tipSpeed))).toBeGreaterThan(0.1);
  });

  it('matches the closed-form tip velocity, sign and all', () => {
    // Compared as a vector, deliberately. A speed alone cannot tell a boom
    // rising from a boom falling, and a whole-system sign error passes every
    // magnitude check ever written.
    for (const sample of samples) {
      const rate = (sample.span * sample.rate) / (BASE * BOOM * Math.sin(sample.theta));
      const expected = [
        -BOOM * rate * Math.sin(sample.theta),
        BOOM * rate * Math.cos(sample.theta),
      ];
      expect(sample.tipVelocity[0]).toBeCloseTo(expected[0], 3);
      expect(sample.tipVelocity[1]).toBeCloseTo(expected[1], 3);
    }
  });

  it('points the tip velocity along the arc the boom sweeps', () => {
    // The tip rides a circle about O, so its velocity is perpendicular to the
    // boom. A magnitude alone could be right for the wrong reason.
    for (const sample of samples) {
      const along =
        sample.tipVelocity[0] * Math.cos(sample.theta) +
        sample.tipVelocity[1] * Math.sin(sample.theta);
      expect(Math.abs(along)).toBeLessThan(1e-6);
    }
  });

  it('matches the closed-form tip acceleration', () => {
    // Differentiating the tip speed once more. The tangential term comes from
    // theta_dot_dot and the centripetal one from theta_dot squared; getting
    // only the first would still look plausible on a graph.
    const K = BASE * BOOM;
    for (const sample of samples) {
      const sin = Math.sin(sample.theta);
      const cos = Math.cos(sample.theta);
      const rate = (sample.span * sample.rate) / (K * sin);
      const squared = sample.rate * sample.rate;
      const secondRate =
        squared / (K * sin) -
        (sample.span * sample.span * squared * cos) / (K * K * sin * sin * sin);
      const tangential = BOOM * secondRate;
      const centripetal = BOOM * rate * rate;
      const expected: [number, number] = [
        -tangential * sin - centripetal * cos,
        tangential * cos - centripetal * sin,
      ];
      expect(sample.tipAcceleration[0]).toBeCloseTo(expected[0], 2);
      expect(sample.tipAcceleration[1]).toBeCloseTo(expected[1], 2);
    }
  });

  it('holds the grounded joints still', () => {
    for (const sample of samples) {
      expect(sample.groundSpeed).toBeLessThan(1e-9);
    }
  });
});
