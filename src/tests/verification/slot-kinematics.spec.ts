// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';

// Test-ladder cases 2 and 4 (docs/joint-types-plan.md §4.1) for velocity and
// acceleration: the inverted slider-crank, and the quick-return ratio that only
// comes out right if the carrier's own rotation is carried through the slot.
//
// Asserted against closed form. With crank r, ground offset d and crank angle
// theta measured from the line joining the two pivots:
//
//   s     = sqrt(r^2 + d^2 - 2 r d cos t)        travel along the slot
//   sdot  = w r d sin t / s
//   sddot = w^2 r d (s^2 cos t - r d sin^2 t) / s^3
//   w4    = w r (r - d cos t) / s^2              lever angular velocity
//   a4    = w^2 r d sin t (d^2 - r^2) / s^4
//
// Every one of these is wrong if the s*w term is dropped from the loop
// equation, and the acceleration pair is wrong if Coriolis is dropped.

const CRANK = 1;
const OFFSET = 3;
const LEVER = 5;
const INPUT_SPEED = 1;
const START_ANGLE = Math.PI / 2;

function invertedSliderCrank(offset: number): MechanismFixture {
  const bx = CRANK * Math.cos(START_ANGLE);
  const by = CRANK * Math.sin(START_ANGLE);
  const span = Math.hypot(bx - offset, by);
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: bx, y: by },
      { id: 'C', x: offset, y: 0, ground: true },
      { id: 'D', x: offset + (LEVER * (bx - offset)) / span, y: (LEVER * by) / span },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }],
    sliders: [{ at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
    inputAngVel: INPUT_SPEED,
  };
}

interface Sample {
  theta: number;
  slideRate: number;
  slideAccel: number;
  leverAngVel: number;
  leverAngAcc: number;
}

/** Solve every timestep and read back the slot and carrier rates. */
function sample(fixture: MechanismFixture): Sample[] {
  const { mechanism } = buildMechanism(fixture);
  const samples: Sample[] = [];
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;
  for (let t = 0; t < mechanism.joints.length; t++) {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    const at = (id: string): Joint => mechanism.joints[t].find((joint) => joint.id === id)!;
    const a = at('A');
    const b = at('B');
    samples.push({
      theta: Math.atan2(b.y - a.y, b.x - a.x),
      slideRate: KinematicsSolver.slideRateMap.get('P') ?? NaN,
      slideAccel: KinematicsSolver.slideAccelMap.get('P') ?? NaN,
      leverAngVel: KinematicsSolver.linkAngVelMap.get('CD') ?? NaN,
      leverAngAcc: KinematicsSolver.linkAngAccMap.get('CD') ?? NaN,
    });
  }
  return samples;
}

const span = (theta: number, offset: number) =>
  Math.sqrt(CRANK * CRANK + offset * offset - 2 * CRANK * offset * Math.cos(theta));

describe('velocity through a moving slot', () => {
  it('finds the loop that closes across the slot', () => {
    // Nothing below can pass without this: the joint graph has the slider and
    // the lever in separate components until the slot is walkable.
    const { mechanism } = buildMechanism(invertedSliderCrank(OFFSET));

    expect(mechanism.requiredLoops).toHaveLength(1);
    expect(mechanism.requiredLoops[0].id).toBe('A-B-P~P~C');
  });

  it('matches the closed form for travel rate along the slot', () => {
    const samples = sample(invertedSliderCrank(OFFSET));

    samples.forEach(({ theta, slideRate }, index) => {
      const s = span(theta, OFFSET);
      const expected = (INPUT_SPEED * CRANK * OFFSET * Math.sin(theta)) / s;
      expect(slideRate, `t=${index}`).toBeCloseTo(expected, 3);
    });
  });

  it('matches the closed form for the lever it slides in', () => {
    // The s*omega term lives here. Drop it and this is the assertion that goes.
    const samples = sample(invertedSliderCrank(OFFSET));

    samples.forEach(({ theta, leverAngVel }, index) => {
      const s = span(theta, OFFSET);
      const expected = (INPUT_SPEED * CRANK * (CRANK - OFFSET * Math.cos(theta))) / (s * s);
      expect(leverAngVel, `t=${index}`).toBeCloseTo(expected, 3);
    });
  });
});

describe('acceleration through a moving slot', () => {
  it('matches the closed form for travel acceleration', () => {
    const samples = sample(invertedSliderCrank(OFFSET));

    samples.forEach(({ theta, slideAccel }, index) => {
      const s = span(theta, OFFSET);
      const expected =
        (INPUT_SPEED *
          INPUT_SPEED *
          CRANK *
          OFFSET *
          (s * s * Math.cos(theta) - CRANK * OFFSET * Math.pow(Math.sin(theta), 2))) /
        Math.pow(s, 3);
      expect(slideAccel, `t=${index}`).toBeCloseTo(expected, 3);
    });
  });

  it('matches the closed form for the lever, which needs Coriolis', () => {
    // 2*sdot*omega is the only term separating this from a plausible answer.
    const samples = sample(invertedSliderCrank(OFFSET));

    samples.forEach(({ theta, leverAngAcc }, index) => {
      const s = span(theta, OFFSET);
      const expected =
        (INPUT_SPEED *
          INPUT_SPEED *
          CRANK *
          OFFSET *
          Math.sin(theta) *
          (OFFSET * OFFSET - CRANK * CRANK)) /
        Math.pow(s, 4);
      expect(leverAngAcc, `t=${index}`).toBeCloseTo(expected, 3);
    });
  });
});

describe('quick-return ratio', () => {
  it('reverses the lever at the crank angles the geometry predicts', () => {
    // The end-to-end check. A crank-and-slotted-lever reaches its extreme lever
    // positions when the crank is perpendicular to the slot, at cos t = r/d, and
    // the ratio of the two crank sweeps between those points is the quick
    // return. Both fall out of where the lever's angular velocity changes sign.
    const samples = sample(invertedSliderCrank(OFFSET));

    // The crank advances a degree per sample, so the sign change is only
    // bracketed, not landed on. Interpolate across the bracket rather than
    // loosening the tolerance to swallow half a step.
    const reversals: number[] = [];
    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (previous.leverAngVel * current.leverAngVel >= 0) continue;
      const fraction =
        Math.abs(previous.leverAngVel) /
        (Math.abs(previous.leverAngVel) + Math.abs(current.leverAngVel));
      const cosine =
        Math.cos(previous.theta) + fraction * (Math.cos(current.theta) - Math.cos(previous.theta));
      reversals.push(Math.abs(cosine));
    }

    expect(reversals.length).toBeGreaterThanOrEqual(2);
    reversals.forEach((cosine, index) => {
      expect(cosine, `reversal ${index}`).toBeCloseTo(CRANK / OFFSET, 3);
    });
  });

  it('gives the published time ratio for its proportions', () => {
    // beta = acos(r/d); the crank turns 2*pi - 2*beta on the slow stroke and
    // 2*beta on the quick one, so the ratio is (pi - beta)/beta. At r/d = 1/3
    // that is a little over 2:1.
    const beta = Math.acos(CRANK / OFFSET);
    const expectedRatio = (Math.PI - beta) / beta;
    const samples = sample(invertedSliderCrank(OFFSET));

    const forward = samples.filter((s) => s.leverAngVel > 0).length;
    const backward = samples.filter((s) => s.leverAngVel < 0).length;
    const ratio = Math.max(forward, backward) / Math.min(forward, backward);

    expect(ratio).toBeCloseTo(expectedRatio, 1);
  });
});
