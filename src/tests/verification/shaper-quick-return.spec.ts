// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { SHAPER, shaperQuickReturnFixture } from '../../test-utils/verification/library-fixtures';
import { turningPoints } from '../../test-utils/verification/compare';

// A shaper's drive, ram included: a crank pin riding in a slot cut into a
// rocking lever, and the lever pushing a block along a fixed guide.
//
// The suite already has the slot on its own (the inverted slider-crank, and the
// Whitworth proportions of it). What it did not have is that mechanism doing
// its job -- a floating slot handing off to a grounded one, which is a linkage
// with both kinds of prismatic joint in the same loop chain.
//
// Nothing here needs reference data. The lever's rock is asin(crank / offset)
// exactly, the ends of the rock are where crank and lever stand square, and the
// quick return follows from where those two poses fall on the revolution.

const DEG = 180 / Math.PI;

/** The rounding the solver leaves on a coordinate, with room to spare. */
const NOISE = 1e-3;

/** The lever's rock, either side of the ground line: asin(crank / offset). */
const ROCK = Math.asin(SHAPER.crank / SHAPER.offset) * DEG;

interface Sample {
  /** The lever's lean from the line through the two ground pivots. */
  lever: number;
  /** The ram, which only moves along its guide. */
  ram: { x: number; y: number };
  /** Crank pin to lever pivot: whether the block is still on the slot line. */
  offSlot: number;
  crankLength: number;
  leverLength: number;
  connector: number;
}

function sampleMotion(): { samples: Sample[]; frames: number; dof: number } {
  const { mechanism } = buildMechanism(shaperQuickReturnFixture());
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [a, b, c, d, r] = ['A', 'B', 'C', 'D', 'R'].map(at);
    const lever = Math.hypot(d.x - c.x, d.y - c.y);
    return {
      // Measured from the ray C -> A, which is straight up.
      lever: Math.atan2(d.x - c.x, d.y - c.y) * DEG,
      ram: { x: r.x, y: r.y },
      // The block is on the slot when the pin, the pivot and the tip are
      // collinear: the cross product of the two rays, over the lever's length.
      offSlot: Math.abs((b.x - c.x) * (d.y - c.y) - (b.y - c.y) * (d.x - c.x)) / lever,
      crankLength: Math.hypot(b.x - a.x, b.y - a.y),
      leverLength: lever,
      connector: Math.hypot(r.x - d.x, r.y - d.y),
    };
  });
  return {
    samples,
    frames: mechanism.joints.length,
    dof: (mechanism as unknown as { dof: number }).dof,
  };
}

describe("a shaper's quick-return drive", () => {
  const { samples, frames, dof } = sampleMotion();

  it('is one degree of freedom and turns a full revolution', () => {
    expect(dof).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps the crank, the lever and the connector rigid', () => {
    for (const sample of samples) {
      expect(sample.crankLength).toBeCloseTo(SHAPER.crank, 3);
      expect(sample.leverLength).toBeCloseTo(SHAPER.lever, 3);
      expect(sample.connector).toBeCloseTo(SHAPER.connector, 3);
    }
  });

  it('keeps the crank pin in the slot at every angle', () => {
    // The one constraint that is not a length: the block rides the line through
    // the lever, so the pin's distance off that line is the residual the whole
    // mechanism rests on.
    for (const sample of samples) {
      expect(sample.offSlot).toBeLessThan(3e-3);
    }
  });

  it('keeps the ram on its guide', () => {
    for (const sample of samples) {
      expect(sample.ram.y).toBeCloseTo(SHAPER.guide, 3);
    }
  });

  it('rocks the lever through exactly asin(crank / offset) either way', () => {
    // Crank shorter than the offset is what makes this a rocking lever rather
    // than a rotating one, and the bound is the tangent from the lever's pivot
    // to the crank circle. It does not depend on the lever's own length.
    const leans = samples.map((sample) => sample.lever);
    expect(Math.max(...leans)).toBeCloseTo(ROCK, 2);
    expect(Math.min(...leans)).toBeCloseTo(-ROCK, 2);
  });

  it('reciprocates the ram once per revolution', () => {
    const xs = samples.map((sample) => sample.ram.x);
    expect(turningPoints(xs, NOISE).length).toBe(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3);
  });

  it('cuts slowly and returns fast — the quick return', () => {
    // The two strokes take different amounts of crank, and the ratio between
    // them is what the arrangement is for. Measured in samples, which are
    // uniform in crank angle for a rotating input.
    const xs = samples.map((sample) => sample.ram.x);
    const turns = turningPoints(xs, NOISE);
    const between = turns[1] - turns[0];
    const around = xs.length - 1 - between;
    const slow = Math.max(between, around);
    const fast = Math.min(between, around);
    expect(slow / fast).toBeGreaterThan(1.5);
    expect(slow / fast).toBeLessThan(1.65);
  });

  it('moves every joint at the rate its own motion implies', () => {
    // The check no assertion about positions can make. The ram travels 3.33
    // units and was once graphed as standing still, because no loop ran between
    // the lever's pivot and the ram's guide and the velocity walk never reached
    // the output stage at all. Positions and rates leave the solver by
    // different routes, so differencing one against the other is a real
    // cross-check; RATE_TOLERANCE carries why one percent.
    const agreement = velocityAgreesWithPositions(buildMechanism(shaperQuickReturnFixture()));
    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
