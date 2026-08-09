// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  chebyshevStraightLineFixture,
  CHEBYSHEV,
} from '../../test-utils/verification/slot-fixtures';

// Approximate straight-line generation is the reason four-bars are taught at
// all, and the suite had no case of it. The assertion needs no reference data:
// how flat the traced line is over its central span follows from the
// proportions, so there is nothing to drift.

describe("Chebyshev's straight-line linkage", () => {
  const { mechanism } = buildMechanism(chebyshevStraightLineFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  const path = Array.from({ length: frames }, (_, t) => ({ x: at(t, 'M').x, y: at(t, 'M').y }));

  it('is one degree of freedom and rocks through its travel', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(frames).toBeGreaterThan(100);
  });

  it('keeps every bar rigid, tracer included', () => {
    for (let t = 0; t < frames; t++) {
      for (const [a, b, want] of [
        // Crossed: the left pivot holds the right-hand coupler pin.
        ['G', 'B', CHEBYSHEV.rocker],
        ['A', 'B', CHEBYSHEV.coupler],
        ['A', 'H', CHEBYSHEV.rocker],
        ['A', 'M', CHEBYSHEV.coupler / 2],
        ['B', 'M', CHEBYSHEV.coupler / 2],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y);
        expect(Math.abs(now - want)).toBeLessThan(3e-3);
      }
    }
  });

  it('draws a straight line along the middle of its stroke', () => {
    // The tracer curves away at each end of its travel, so measuring the whole
    // path measures the turn-around rather than the line. Take the central 70%
    // by x, fit a line, and ask how far the tracer strays from it.
    //
    // The band is taken by x and not, as it once was, by "the upper half by y":
    // that filter only means anything on a path with a pronounced top, and on
    // the linkage this is supposed to be there isn't one -- the path is flat,
    // the y-half split lands inside the noise, and the band it returns is a few
    // thousandths of a unit wide. It quietly stopped measuring anything.
    const allX = path.map((p) => p.x);
    const span = Math.max(...allX) - Math.min(...allX);
    const band = path.filter(
      (p) => p.x >= Math.min(...allX) + span * 0.15 && p.x <= Math.max(...allX) - span * 0.15
    );
    expect(band.length).toBeGreaterThan(20);

    const n = band.length;
    const mx = band.reduce((t, p) => t + p.x, 0) / n;
    const my = band.reduce((t, p) => t + p.y, 0) / n;
    const slope =
      band.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) /
      band.reduce((t, p) => t + (p.x - mx) ** 2, 0);
    const stray = Math.max(
      ...band.map((p) => Math.abs(p.y - (my + slope * (p.x - mx))) / Math.sqrt(1 + slope * slope))
    );
    const run = Math.max(...band.map((p) => p.x)) - Math.min(...band.map((p) => p.x));

    // A line longer than the coupler that produced it, and level: the linkage is
    // symmetric about the middle of the ground link, so the line it draws runs
    // flat. Level is necessary and nowhere near sufficient, which is the whole
    // lesson of the bound below.
    expect(run).toBeGreaterThan(CHEBYSHEV.coupler);
    expect(Math.abs(slope)).toBeLessThan(0.02);
    // It strays 0.38% of the distance travelled, which is what "approximate
    // straight-line linkage" means: near enough to teach with, and not exact.
    // The bound is close to where the mechanism lands rather than a round
    // number, because this is the only assertion in the file that can tell the
    // linkage from its own wrong assembly: built uncrossed it is rigid, one
    // degree of freedom, symmetric, traces a level line of much the same
    // length -- and strays 6.4% instead of 0.38%.
    expect(stray / run).toBeLessThan(0.006);
  });

  it('travels, rather than barely moving', () => {
    // Measured along the line and not across it. This asked for a rise of half
    // the coupler, which the linkage the file was written against duly gave --
    // by sweeping an arc. A straight-line generator's whole point is that it has
    // no rise, so on the real thing the demand for one was a demand to be wrong.
    const travel = Math.max(...path.map((p) => p.x)) - Math.min(...path.map((p) => p.x));
    expect(travel).toBeGreaterThan(CHEBYSHEV.coupler);
  });
});
