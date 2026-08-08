// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { ellipticalCrankFixture } from '../../test-utils/verification/slot-fixtures';

// The MotionGen library's "Elliptical Crank": an entirely ordinary six-bar with
// a grounded crank and one fixed guide. Nothing about it is exotic -- it is the
// kind of thing a user will draw -- and for a long time PMKS+ would not animate
// it, for two reasons worth keeping written down beside the mechanism itself.
//
// No joint in it is locatable from two already-known ones. The crank pin swings
// about the grounded pivot and that is the whole of what the dyadic walk can
// do; C, D and E only locate each other, which is the case §2.7a hands to a
// simultaneous solve. That solve declined the work twice over. It read the
// guide joint's `ground` flag as "this point does not move" -- true of a pin,
// false of a slot, whose *line* is what the world holds -- so the block's
// coincidence pinned E to where it was drawn instead of to a line it may travel
// along. And it wanted a drive of its own among the unknowns, which a grounded
// crank does not give it: by the time these joints are reached the crank pin has
// already been placed exactly, and the input is a boundary condition rather than
// something left to solve for.
//
// What the assertions below are really checking is that neither repair bought
// the animation at the cost of the linkage: every bar has to still measure what
// it measured, and E has to stay on the guide rather than near it.

/** Where the fixed guide runs, read back off the fixture's own definition. */
const GUIDE_ANGLE = Math.atan2(0.050399 - 0.05919, 4.561923 - 1.432252);
const GUIDE_POINT: [number, number] = [2.337757, 0.056553];

describe('an ordinary six-bar with a grounded guide', () => {
  const { mechanism } = buildMechanism(ellipticalCrankFixture());
  const frames = mechanism.joints;
  const at = (step: number, id: string): Joint => frames[step].find((j) => j.id === id)!;
  const length = (step: number, a: string, b: string) =>
    Math.hypot(at(step, a).x - at(step, b).x, at(step, a).y - at(step, b).y);
  // Solved positions are kept to four decimals, so a distance between two of
  // them carries a few of those. Everything below is bounded by that rounding
  // rather than by a round number of decimal places.
  const ROUNDING = 5e-4;

  it('counts as a one-degree-of-freedom mechanism', () => {
    expect((mechanism as unknown as { dof: number }).dof).toBe(1);
  });

  it('precomputes a whole revolution rather than a single frame', () => {
    // A one-degree crank step closes its cycle in 360 samples; the count is the
    // shape of the failure this replaces, which stopped after one.
    expect(PositionSolver.unsolvableJoints).toEqual([]);
    expect(frames.length).toBeGreaterThan(300);
  });

  it('keeps every bar the length it was drawn', () => {
    // The whole point of refusing to animate this before was that a solve which
    // moves the joints without holding the links is a picture of a different
    // mechanism. AB is the crank the walk places; the rest come out of the
    // simultaneous solve, including both bars of the ternary CDE.
    for (let step = 0; step < frames.length; step++) {
      for (const [a, b] of [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['C', 'E'],
        ['D', 'E'],
        ['D', 'F'],
      ] as const) {
        expect(
          Math.abs(length(step, a, b) - length(0, a, b)),
          `${a}${b} at step ${step}`
        ).toBeLessThan(ROUNDING);
      }
    }
  });

  it('keeps the block a single point', () => {
    // The block is zero-length: the pin and the sliding joint it rides in are
    // one point (§2.10 item 1). Reading the slot's `ground` as "fixed" used to
    // hold P still while E moved, which stretches the block a little further
    // every sample.
    for (let step = 0; step < frames.length; step++) {
      expect(length(step, 'E', 'P'), `block at step ${step}`).toBeLessThan(ROUNDING);
    }
  });

  it('keeps the sliding pin on the guide it was cut to run along', () => {
    // Perpendicular distance, not a coordinate: the guide is tilted 0.0028 rad
    // off horizontal, so a pin drifting straight up the y axis would pass a
    // coordinate check for most of the travel and still be off the slot.
    const along: [number, number] = [Math.cos(GUIDE_ANGLE), Math.sin(GUIDE_ANGLE)];
    for (let step = 0; step < frames.length; step++) {
      const pin = at(step, 'E');
      const offset = Math.abs(
        (pin.x - GUIDE_POINT[0]) * along[1] - (pin.y - GUIDE_POINT[1]) * along[0]
      );
      expect(offset, `E off the guide at step ${step}`).toBeLessThan(ROUNDING);
    }
  });

  it('turns the crank all the way round', () => {
    // Summed as increments so a mechanism that rocked back and forth over a
    // small arc could not add up to a revolution.
    const pivot = at(0, 'A');
    const angle = (step: number) =>
      Math.atan2(at(step, 'B').y - pivot.y, at(step, 'B').x - pivot.x);
    let swept = 0;
    for (let step = 1; step < frames.length; step++) {
      let increment = angle(step) - angle(step - 1);
      while (increment > Math.PI) increment -= 2 * Math.PI;
      while (increment < -Math.PI) increment += 2 * Math.PI;
      swept += increment;
    }
    expect(Math.abs(swept)).toBeCloseTo(2 * Math.PI, 3);
  });

  it('comes back to the pose it started in', () => {
    // The cycle closing is what makes the animation loop rather than jump. It
    // is not free: the solve is seeded from the previous sample, so a branch
    // taken wrongly anywhere in the revolution would land somewhere else here.
    const last = frames.length - 1;
    for (const id of ['B', 'C', 'D', 'E', 'P']) {
      expect(
        Math.hypot(at(last, id).x - at(0, id).x, at(last, id).y - at(0, id).y),
        `${id} back at start`
      ).toBeLessThan(ROUNDING);
    }
  });
});
