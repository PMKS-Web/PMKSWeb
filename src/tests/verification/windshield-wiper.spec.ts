// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { windshieldWiperFixture, WIPER } from '../../test-utils/verification/slot-fixtures';

// The four-bar people have actually looked at, and the one whose *purpose* is
// the property being asserted: a wiper turns unbounded motor rotation into a
// bounded sweep, which is the crank-rocker property. The limits of that sweep
// are a closed form -- the rocker reaches them when crank and coupler fall in
// line, extended and folded -- so this needs no reference data either.

/** Rocker angle at H when the crank and coupler are collinear at `reach`. */
function limitAngle(reach: number): number {
  const cos =
    (WIPER.ground ** 2 + WIPER.rocker ** 2 - reach ** 2) / (2 * WIPER.ground * WIPER.rocker);
  return Math.acos(cos);
}

describe('a windshield wiper', () => {
  const { mechanism } = buildMechanism(windshieldWiperFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  /** Where the blade points, measured at its ground pivot. */
  const blade = (t: number) => Math.atan2(at(t, 'T').y - at(t, 'H').y, at(t, 'T').x - at(t, 'H').x);

  it('is one degree of freedom and the motor turns all the way round', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps the arm and blade rigid', () => {
    for (let t = 0; t < frames; t++) {
      for (const [a, b, want] of [
        ['O', 'A', WIPER.crank],
        ['A', 'B', WIPER.coupler],
        ['B', 'H', WIPER.rocker],
        ['H', 'T', WIPER.blade],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        expect(Math.abs(now - want)).toBeLessThan(3e-3);
      }
    }
  });

  it('sweeps exactly the arc the proportions say it should', () => {
    // The closed form. The rocker is furthest over when the crank and coupler
    // are stretched into one line, and furthest back when they are folded onto
    // each other; everything in between is bounded by those two.
    const swept = Array.from({ length: frames }, (_, t) => blade(t));
    const measured = Math.max(...swept) - Math.min(...swept);
    const expected =
      limitAngle(WIPER.coupler + WIPER.crank) - limitAngle(WIPER.coupler - WIPER.crank);
    // A degree of slack, which is the sampling: the extremes fall between
    // samples unless the crank happens to step onto them exactly.
    expect(Math.abs(measured - expected)).toBeLessThan((1.5 * Math.PI) / 180);
    expect(measured).toBeGreaterThan(Math.PI / 4);
  });

  it('comes back, rather than going round', () => {
    // What separates a wiper from a fan. The blade must reverse -- twice, since
    // the motor turns continuously -- and end where it started.
    const swept = Array.from({ length: frames }, (_, t) => blade(t));
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
