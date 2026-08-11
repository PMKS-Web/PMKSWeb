// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { windshieldWiperFixture, WIPER } from '../../test-utils/verification/slot-fixtures';

// A wiper turns unbounded motor rotation into a bounded sweep, which is the
// crank-rocker property; and a car's pair of them stay parallel, which is the
// parallelogram property of the tie rod between the two arms. Both are closed
// forms — the rocker reaches its limits when crank and coupler fall in line,
// and a parallelogram holds its opposite sides parallel by construction — so
// this spec needs no reference data.

/** Rocker angle at the spindle when crank and coupler are collinear at `reach`. */
function limitAngle(reach: number): number {
  const cos =
    (WIPER.motorGround ** 2 + WIPER.rocker ** 2 - reach ** 2) /
    (2 * WIPER.motorGround * WIPER.rocker);
  return Math.acos(cos);
}

describe('a pair of windshield wipers', () => {
  const { mechanism } = buildMechanism(windshieldWiperFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  /** Where a blade points, measured at its own spindle. */
  const heading = (t: number, spindle: string, tip: string) =>
    Math.atan2(at(t, tip).y - at(t, spindle).y, at(t, tip).x - at(t, spindle).x);
  const driver = (t: number) => heading(t, 'P', 'T');
  const passenger = (t: number) => heading(t, 'Q', 'U');

  it('is one degree of freedom and the motor turns all the way round', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps every bar the length it was built at', () => {
    for (let t = 0; t < frames; t++) {
      for (const [a, b, want] of [
        ['O', 'A', WIPER.crank],
        ['A', 'B', WIPER.coupler],
        ['B', 'P', WIPER.rocker],
        ['P', 'T', WIPER.blade],
        ['P', 'C', WIPER.tie],
        ['Q', 'D', WIPER.tie],
        ['Q', 'U', WIPER.blade],
        // The tie rod is as long as the gap between the spindles, which is what
        // makes the four of them a parallelogram rather than a general four-bar.
        ['C', 'D', WIPER.spindles],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        expect(Math.abs(now - want), `${a}${b} at ${t}`).toBeLessThan(3e-3);
      }
    }
  });

  it('sweeps exactly the arc the proportions say it should', () => {
    // The closed form. The arm is furthest over when crank and coupler are
    // stretched into one line, and furthest back when they are folded onto each
    // other; everything in between is bounded by those two.
    const swept = Array.from({ length: frames }, (_, t) => driver(t));
    const measured = Math.max(...swept) - Math.min(...swept);
    const expected =
      limitAngle(WIPER.coupler + WIPER.crank) - limitAngle(WIPER.coupler - WIPER.crank);
    // A degree and a half of slack, which is the sampling: the extremes fall
    // between samples unless the crank steps onto them exactly.
    expect(Math.abs(measured - expected)).toBeLessThan((1.5 * Math.PI) / 180);
    // Wiper-sized rather than merely non-zero: a real one sweeps most of a
    // right angle and this one is a little under 100 degrees.
    expect((measured * 180) / Math.PI).toBeGreaterThan(90);
  });

  it('keeps the two blades parallel the whole way across', () => {
    // The reason a car uses a tie rod at all. Both arms hang off cranks of the
    // same length, joined by a rod as long as the gap between their spindles,
    // so the second blade copies the first exactly rather than approximately.
    for (let t = 0; t < frames; t++) {
      const apart = Math.abs(driver(t) - passenger(t));
      expect(apart, `blades disagree at ${t}`).toBeLessThan(1e-3);
    }
  });

  it('comes back, rather than going round', () => {
    // What separates a wiper from a fan. The blade must reverse — twice, since
    // the motor turns continuously — and end where it started.
    const swept = Array.from({ length: frames }, (_, t) => driver(t));
    let reversals = 0;
    for (let t = 2; t < frames; t++) {
      const before = swept[t - 1] - swept[t - 2];
      const after = swept[t] - swept[t - 1];
      if (before * after < 0 && Math.abs(before) > 1e-6) reversals++;
    }
    expect(reversals).toBeGreaterThanOrEqual(2);
    expect(Math.abs(swept[frames - 1] - swept[0])).toBeLessThan(0.02);
  });
});
