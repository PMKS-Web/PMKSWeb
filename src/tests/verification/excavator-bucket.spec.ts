// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { BUCKET, excavatorBucketFixture } from '../../test-utils/verification/library-fixtures';
import { turningPoints } from '../../test-utils/verification/compare';
import { sealedCylinders } from '../../app/model/cylinder';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';

// A backhoe bucket, driven by its own ram. The suite already drives a boom with
// a cylinder, where the ram and the member it moves are the only two bodies;
// here the ram moves a bell crank, the bell crank a link, and the link the
// bucket. It is the case where a driven cylinder feeds an ordinary four-bar
// rather than closing a triangle by itself.
//
// The assertions are the mechanism's own invariants -- rigid members, a ram
// that stays a ram, a bucket that curls one way and back -- plus the two
// closed forms that hold whatever the solver does: the bell crank's angle from
// the law of cosines on the ram triangle, and the bucket's rotation matching
// its ear's.

const S = MODEL_SCALE;
const DEG = 180 / Math.PI;

/** How far the ram's mount sits from the bell crank's pivot, and the ear's throw. */
const MOUNT_TO_PIVOT = Math.hypot(BUCKET.mount.x - BUCKET.pivot.x, BUCKET.mount.y - BUCKET.pivot.y);
const EAR_THROW = Math.hypot(BUCKET.ear.x - BUCKET.pivot.x, BUCKET.ear.y - BUCKET.pivot.y);

interface Sample {
  /** Ram length, mount to mount, in user units. */
  ram: number;
  /** Bell-crank angle at its pivot, measured from the ray to the ram's mount. */
  crank: number;
  /** Where the bucket points, from its hinge to its ear. */
  bucket: number;
  /** The cutting edge, which is what the machine is aimed with. */
  tip: { x: number; y: number };
  barrel: number;
  rod: number;
  pinOffAxis: number;
  bellCrankArm: number;
  link: number;
  bucketEar: number;
  bucketTip: number;
  /** The gap the link and the bucket ear have to span between them. */
  armToHinge: number;
}

function sampleMotion(): { samples: Sample[]; cylinders: number; frames: number } {
  // objectScale is a process-wide static and a ram's stroke is measured
  // against it, so an unpinned run would travel however far the last spec left
  // it free to.
  const { mechanism } = buildMechanismAtScale(excavatorBucketFixture(S), 1 * MODEL_SCALE);
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [a, b, c, d, g, h, j, k, t] = ['A', 'B', 'C', 'D', 'G', 'H', 'J', 'K', 'T'].map(at);
    const gap = Math.hypot(d.x - a.x, d.y - a.y);
    const axisX = (d.x - a.x) / gap;
    const axisY = (d.y - a.y) / gap;
    return {
      ram: gap / S,
      crank: (Math.atan2(d.y - g.y, d.x - g.x) - Math.atan2(a.y - g.y, a.x - g.x)) * DEG,
      bucket: Math.atan2(k.y - j.y, k.x - j.x) * DEG,
      tip: { x: t.x / S, y: t.y / S },
      barrel: Math.hypot(b.x - a.x, b.y - a.y) / S,
      rod: Math.hypot(d.x - c.x, d.y - c.y) / S,
      pinOffAxis: Math.abs((c.x - a.x) * axisY - (c.y - a.y) * axisX) / S,
      bellCrankArm: Math.hypot(h.x - g.x, h.y - g.y) / S,
      link: Math.hypot(k.x - h.x, k.y - h.y) / S,
      bucketEar: Math.hypot(k.x - j.x, k.y - j.y) / S,
      bucketTip: Math.hypot(t.x - j.x, t.y - j.y) / S,
      armToHinge: Math.hypot(h.x - j.x, h.y - j.y) / S,
    };
  });
  return {
    samples,
    cylinders: sealedCylinders(mechanism.joints[0]).length,
    frames: mechanism.joints.length,
  };
}

describe('a backhoe bucket curled by its cylinder', () => {
  const { samples, cylinders, frames } = sampleMotion();
  const drawn = samples[0];

  it('is one degree of freedom, and the ram is drawn as a ram', () => {
    // Sealed means skinned: the payload the library ships opens as a hydraulic
    // cylinder rather than as three bars that happen to line up.
    expect(cylinders).toBe(1);
    expect(frames).toBeGreaterThan(300);
  });

  it('keeps every member the length it was drawn', () => {
    for (const sample of samples) {
      expect(sample.bellCrankArm).toBeCloseTo(drawn.bellCrankArm, 5);
      expect(sample.link).toBeCloseTo(drawn.link, 5);
      expect(sample.bucketEar).toBeCloseTo(drawn.bucketEar, 5);
      expect(sample.bucketTip).toBeCloseTo(drawn.bucketTip, 5);
    }
  });

  it('keeps the cylinder a cylinder: straight, and both halves their own length', () => {
    for (const sample of samples) {
      expect(sample.barrel).toBeCloseTo(drawn.barrel, 5);
      expect(sample.rod).toBeCloseTo(drawn.barrel, 5);
      expect(sample.pinOffAxis).toBeLessThan(1e-6);
    }
  });

  it('sets the bell crank by the law of cosines on the ram triangle', () => {
    // The mount, the pivot and the ear are a triangle with one side that
    // changes length, exactly as the boom is -- so the first half of this
    // mechanism has a closed form even though the second half does not.
    for (const sample of samples) {
      const want =
        Math.acos(
          (MOUNT_TO_PIVOT ** 2 + EAR_THROW ** 2 - sample.ram ** 2) /
            (2 * MOUNT_TO_PIVOT * EAR_THROW)
        ) * DEG;
      expect(Math.abs(Math.abs(sample.crank) - want)).toBeLessThan(0.02);
    }
  });

  it('travels the whole of the ram stroke, out and back', () => {
    const reversals = samples
      .slice(1)
      .map((sample, i) => Math.sign(sample.ram - samples[i].ram))
      .filter((direction, i, all) => i > 0 && direction !== all[i - 1]).length;
    expect(reversals).toBe(2);
    expect(samples[samples.length - 1].ram).toBeCloseTo(drawn.ram, 6);
  });

  it('curls the bucket through 54 degrees, and only ever one way at a time', () => {
    const angles = samples.map((sample) => sample.bucket);
    const swept = Math.max(...angles) - Math.min(...angles);
    expect(swept).toBeGreaterThan(54);
    expect(swept).toBeLessThan(55);

    // The bucket follows the ram: two reversals in the drive, two in the
    // output, and no third one from a dyad changing its mind.
    //
    // The deadband is a fifth of a degree rather than a rounding quantum
    // because the sample at each of the ram's own stops overshoots the stop by
    // about a tenth of a degree of bucket: the grid is anchored where the part
    // was drawn rather than at a limit, so the last step into a stop is a whole
    // one and lands slightly past it. Counting that as two more reversals would
    // be counting the sampling, not the mechanism.
    expect(turningPoints(angles, 0.2).length).toBe(2);
  });

  it('never lets either dyad reach a tangency', () => {
    // The one way this mechanism could quietly become a different one: the two
    // circles that place the bucket's ear meeting at a single point, where the
    // root the solver returns is decided by rounding.
    for (const sample of samples) {
      // The ram triangle flattens at 0 and at 180 degrees; it stays between 30
      // and 106, which is where the ram's own stops leave it. Drawn as it once
      // was, this reached 6 degrees.
      expect(Math.abs(sample.crank)).toBeGreaterThan(25);
      expect(Math.abs(sample.crank)).toBeLessThan(115);
      expect(sample.link + sample.bucketEar - sample.armToHinge).toBeGreaterThan(0.9);
      expect(sample.armToHinge - Math.abs(sample.link - sample.bucketEar)).toBeGreaterThan(0.9);
    }
  });

  it('swings the cutting edge without dragging it back through the stick', () => {
    // The mirror root satisfies every length and folds the bucket up inside the
    // machine, so this is what says the drawn assembly mode held.
    for (const sample of samples) {
      expect(sample.tip.x).toBeGreaterThan(BUCKET.hinge.x);
    }
    const heights = samples.map((sample) => sample.tip.y);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(2);
  });

  it('moves every joint at the rate its own motion implies', () => {
    // The check no assertion about positions can make. A bucket that curls
    // correctly and graphs a flat zero looks perfect in the animation, and the
    // Analyze tab is where a student would notice. Positions and rates leave
    // the solver by different routes, so differencing one against the other is
    // a real cross-check rather than a restatement; RATE_TOLERANCE carries why
    // one percent, and what the quotient's own truncation error costs.
    const agreement = velocityAgreesWithPositions(buildMechanism(excavatorBucketFixture(S)));
    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(1000);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });
});
