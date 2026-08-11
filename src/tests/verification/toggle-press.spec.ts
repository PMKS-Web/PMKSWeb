// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { TOGGLE, togglePressFixture } from '../../test-utils/verification/library-fixtures';
import { sealedCylinders } from '../../app/model/cylinder';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A toggle press: a ram drives the knee of two equal links, and the far end of
// the pair is a block on a vertical guide.
//
// The mechanism the library had for a cylinder driving a block was the gripper,
// where the output is a jaw on a pivot. This one puts a *slider* on the output,
// which is where the interesting property is: as the knee approaches the line
// between the ground pivot and the guide, slider travel per unit of knee travel
// goes to zero and the force multiplication goes the other way. That is a
// closed form -- the block's depth is the knee's height plus the lower link's
// projection -- so there is nothing to drift and no reference data to keep.

const S = MODEL_SCALE;
const DEG = 180 / Math.PI;

/** How deep the slider sits when the toggle is exactly straight. */
const DEAD_POINT_DEPTH = -2 * TOGGLE.link;

interface Sample {
  /** Ram length, mount to mount, in user units. */
  ram: number;
  /** Where the knee sits about the ground pivot, in degrees, unwrapped to 0..360. */
  knee: number;
  /** The knee itself, which is what both closed forms are written in. */
  kneeAt: { x: number; y: number };
  /** The slider, which only moves along its guide. */
  slider: { x: number; y: number };
  upper: number;
  lower: number;
  barrel: number;
  rod: number;
}

function sampleMotion(): { samples: Sample[]; cylinders: number; frames: number } {
  // Pinned: a ram's stroke is measured against the process-wide objectScale.
  const { mechanism } = buildMechanismAtScale(togglePressFixture(S), 1 * MODEL_SCALE);
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [a, b, c, d, g, r] = ['A', 'B', 'C', 'D', 'G', 'R'].map(at);
    const degrees = Math.atan2(d.y - g.y, d.x - g.x) * DEG;
    return {
      ram: Math.hypot(d.x - a.x, d.y - a.y) / S,
      knee: degrees < 0 ? degrees + 360 : degrees,
      kneeAt: { x: (d.x - g.x) / S, y: (d.y - g.y) / S },
      slider: { x: (r.x - g.x) / S, y: (r.y - g.y) / S },
      upper: Math.hypot(d.x - g.x, d.y - g.y) / S,
      lower: Math.hypot(r.x - d.x, r.y - d.y) / S,
      barrel: Math.hypot(b.x - a.x, b.y - a.y) / S,
      rod: Math.hypot(d.x - c.x, d.y - c.y) / S,
    };
  });
  return {
    samples,
    cylinders: sealedCylinders(mechanism.joints[0]).length,
    frames: mechanism.joints.length,
  };
}

describe('a toggle press closed by a hydraulic ram', () => {
  const { samples, cylinders, frames } = sampleMotion();
  const drawn = samples[0];

  it('solves, and the ram is drawn as a ram', () => {
    expect(cylinders).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps both toggle links their stated length', () => {
    for (const sample of samples) {
      expect(sample.upper).toBeCloseTo(TOGGLE.link, 4);
      expect(sample.lower).toBeCloseTo(TOGGLE.link, 4);
    }
  });

  it('keeps the cylinder a cylinder', () => {
    for (const sample of samples) {
      expect(sample.barrel).toBeCloseTo(drawn.barrel, 5);
      expect(sample.rod).toBeCloseTo(drawn.barrel, 5);
    }
  });

  it('keeps the slider on its guide, under the pivot', () => {
    for (const sample of samples) {
      expect(Math.abs(sample.slider.x)).toBeLessThan(3e-3);
    }
  });

  it('puts the slider exactly where the two links put it', () => {
    // The whole kinematics in one line: the block hangs a lower link's vertical
    // projection below the knee. Everything else here is a consequence of it.
    for (const sample of samples) {
      const want = sample.kneeAt.y - Math.sqrt(TOGGLE.link ** 2 - sample.kneeAt.x ** 2);
      expect(sample.slider.y).toBeCloseTo(want, 3);
    }
  });

  it('drives the knee toward the dead point and stops short of it', () => {
    // Past 270 degrees the press goes over-centre and starts opening again. The
    // ram's stops are placed so it never gets there -- and never quite reaches
    // the singular depth either.
    const knees = samples.map((sample) => sample.knee);
    expect(Math.min(...knees)).toBeGreaterThan(200);
    expect(Math.max(...knees)).toBeLessThan(265);
    expect(Math.max(...knees)).toBeLessThan(270);
    for (const sample of samples) {
      expect(sample.slider.y).toBeGreaterThan(DEAD_POINT_DEPTH);
    }
  });

  it('travels the whole of the ram stroke, out and back to where it started', () => {
    const reversals = samples
      .slice(1)
      .map((sample, i) => Math.sign(sample.ram - samples[i].ram))
      .filter((direction, i, all) => i > 0 && direction !== all[i - 1]).length;
    expect(reversals).toBe(2);
    expect(samples[samples.length - 1].ram).toBeCloseTo(drawn.ram, 6);
    expect(samples[samples.length - 1].slider.y).toBeCloseTo(drawn.slider.y, 4);
  });

  it('gives away travel to buy force as it closes — the point of a toggle', () => {
    // Split the knee's sweep in half by angle, not by time, and compare how far
    // the slider goes in each. The second half is the closing half, and it is
    // worth a fraction of the first: that ratio *is* the mechanical advantage,
    // and it is what a press is bought for.
    const knees = samples.map((sample) => sample.knee);
    const open = Math.min(...knees);
    const shut = Math.max(...knees);
    const middle = (open + shut) / 2;
    const depthAt = (angle: number) =>
      samples.reduce((best, sample) =>
        Math.abs(sample.knee - angle) < Math.abs(best.knee - angle) ? sample : best
      ).slider.y;

    const first = depthAt(open) - depthAt(middle);
    const second = depthAt(middle) - depthAt(shut);
    expect(first).toBeGreaterThan(1.8 * second);

    // And the last five degrees, which is where a press is actually working,
    // are worth a few per cent of the travel and nearly all of the force.
    const travel = depthAt(open) - depthAt(shut);
    expect(depthAt(shut - 5) - depthAt(shut)).toBeLessThan(0.05 * travel);
  });

  it('moves every joint at the rate its own motion implies', () => {
    // The check no assertion about positions can make. The slider on its guide
    // once graphed 1.18 where its own travel says 7.43, and also reported an X
    // velocity on a guide that only runs in Y, while the press animated
    // perfectly throughout. Positions and rates leave the solver by different
    // routes, so differencing one against the other is a real cross-check;
    // RATE_TOLERANCE carries why one percent.
    const agreement = velocityAgreesWithPositions(buildMechanism(togglePressFixture(S)));
    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
