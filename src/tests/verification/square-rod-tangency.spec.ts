// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  squareRodSliderCrankFixture,
  SQUARE_ROD_CRANK,
  SQUARE_ROD_OFFSET,
} from '../../test-utils/verification/slot-fixtures';

// The circle-line branch, which Phase 0 rewrote in parametric form and left
// choosing its root once and holding it.
//
// A held index is safe only while the two roots stay on their own sides of the
// foot of the perpendicular. Where the slot is tangent to the circle they meet
// there, the joint runs through, and the root it is riding becomes the other
// one. Holding the old index makes the slider arrive at the foot and go back
// the way it came, at undiminished speed, in a mechanism that has no limit
// there -- and every constraint still holds, so nothing else notices.
//
// "Tangent" sounds like a pose nobody reaches. It is the rod standing square to
// the guide, which is what a connecting rod that just reaches will do.

const ROD = SQUARE_ROD_OFFSET + SQUARE_ROD_CRANK;

describe('a slider-crank whose rod comes square to its guide', () => {
  const { mechanism } = buildMechanism(squareRodSliderCrankFixture());
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const samples = mechanism.joints.length;

  /** How high the crank pin rides above the guide at each sample. */
  const heights = Array.from({ length: samples }, (_, t) => at(t, 'B').y);
  /** The sample the rod stands up on: the pin's height is greatest there. */
  const tangency = heights.indexOf(Math.max(...heights));

  it('turns all the way round, through the pose rather than stopping at it', () => {
    expect(samples).toBeGreaterThan(300);
    // Not at either end of the run -- a fixture that reversed at the pose, or
    // started on it, would exercise nothing.
    expect(tangency).toBeGreaterThan(20);
    expect(tangency).toBeLessThan(samples - 20);
    // And it really is the tangency: the rod reaches exactly to the guide.
    expect(Math.abs(heights[tangency] - ROD)).toBeLessThan(2e-3);
  });

  it('keeps the rod rigid and the slider on its guide', () => {
    // True of the broken version too -- both roots are legal assemblies. This
    // is here so that a failure below is read as the wrong root and not as a
    // linkage that has come apart.
    for (let t = 0; t < samples; t++) {
      const b = at(t, 'B');
      const c = at(t, 'C');
      expect(Math.abs(Math.hypot(b.x - c.x, b.y - c.y) - ROD)).toBeLessThan(3e-4);
      expect(Math.abs(c.y)).toBeLessThan(3e-4);
    }
  });

  it('carries the slider through the tangency instead of bouncing off it', () => {
    // The discriminating assertion. A bounce is a corner in the travel, not a
    // curve, so bound the second difference: a smooth pass leaves it the order
    // of the step squared, a reversal leaves it twice the step itself.
    const travel = Array.from({ length: samples }, (_, t) => at(t, 'C').x);
    const stride = Math.max(...travel.slice(1).map((x, i) => Math.abs(x - travel[i])));
    for (let t = 1; t < samples - 1; t++) {
      const bend = Math.abs(travel[t + 1] - 2 * travel[t] + travel[t - 1]);
      expect(bend).toBeLessThan(stride * 0.5);
    }
  });

  it('matches the closed form, swapping branch where the roots meet', () => {
    // s = r cos(theta) +/- sqrt(rod^2 - h^2), h the pin's height above the
    // guide. Which sign is not a free choice and not a fitted parameter: the
    // slider crosses the foot of the perpendicular at the tangency, so it comes
    // out on the other root, and the sign flips there and nowhere else.
    for (let t = 1; t < samples; t++) {
      const a = at(t, 'A');
      const b = at(t, 'B');
      const theta = Math.atan2(b.y - a.y, b.x - a.x);
      const height = SQUARE_ROD_OFFSET + SQUARE_ROD_CRANK * Math.sin(theta);
      const reach = Math.sqrt(Math.max(0, ROD * ROD - height * height));
      const sign = t <= tangency ? 1 : -1;
      const expected = SQUARE_ROD_CRANK * Math.cos(theta) + sign * reach;

      // The bound is derived rather than chosen, because the formula is
      // ill-conditioned next to the very pose this fixture exists for:
      // d(reach)/d(height) is height/reach, which runs away as reach goes to
      // zero. Solved positions are held to four decimals, so an input error of
      // 1e-4 in the pin's height comes out as 1e-4 * height/reach here -- a
      // hundredfold one sample past the tangency, and negligible a quarter turn
      // later. A single fixed tolerance would either fail at the tangency or
      // say nothing away from it.
      expect(Math.abs(at(t, 'C').x - expected)).toBeLessThan(3e-4 * (1 + height / reach));
    }
  });
});
