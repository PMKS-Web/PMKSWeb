// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { PEDAL, pedalingLegFixture } from '../../test-utils/verification/library-fixtures';
import { describeActuator } from '../../app/model/actuator';
import { RealJoint } from '../../app/model/joint';

// A leg on a bicycle crank, driven at the knee.
//
// The knee is a pin with no ground under it, so the input is the angle between
// two bodies that both move. What that buys and what it costs are both
// checkable in closed form here, because a leg on a crank is a four-bar and
// every quantity below is a distance or an angle between named points.
//
// The claim worth pinning is the one about the crank. A knee cannot pedal: the
// drive stops where the crank comes into line with the bottom bracket and the
// hip, that happens twice, and the two poses are half a revolution apart. So
// the crank rocks rather than turns, and no amount of knee travel changes that.

const DEG = 180 / Math.PI;

interface Sample {
  /** Where the pedal is about the bottom bracket, in degrees. */
  crank: number;
  /** The commanded angle: hip, knee, pedal. */
  knee: number;
  /** How far the pedal is from the hip — what the knee angle is really about. */
  reach: number;
}

function sampleMotion(): { samples: Sample[]; frames: number } {
  const { mechanism } = buildMechanism(pedalingLegFixture());
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [bracket, pedal, hip, knee] = ['B', 'P', 'H', 'K'].map(at);
    const toHip = Math.atan2(hip.y - knee.y, hip.x - knee.x);
    const toPedal = Math.atan2(pedal.y - knee.y, pedal.x - knee.x);
    let bend = (toPedal - toHip) * DEG;
    while (bend < 0) bend += 360;
    while (bend > 360) bend -= 360;
    return {
      crank: Math.atan2(pedal.y - bracket.y, pedal.x - bracket.x) * DEG,
      knee: Math.min(bend, 360 - bend),
      reach: Math.hypot(pedal.x - hip.x, pedal.y - hip.y),
    };
  });
  return { samples, frames: mechanism.joints.length };
}

describe('a leg pedaling a bicycle, driven at the knee', () => {
  const { samples, frames } = sampleMotion();

  it('is driven at a pin the ground never touches', () => {
    const { joints } = buildMechanism(pedalingLegFixture());
    const knee = joints.find((joint) => joint.id === 'K')! as RealJoint;
    expect(knee.ground).toBe(false);
    const actuator = describeActuator(knee);
    if (typeof actuator === 'string') throw new Error(actuator);
    // Thigh against shank: two bodies, and neither of them is the world.
    expect(actuator.kind).toBe('angle');
    expect(actuator.referenceBody).not.toBe('ground');
    expect(actuator.drivenBody).not.toBe('ground');
  });

  it('runs a whole cycle and comes back to where it started', () => {
    expect(frames).toBeGreaterThan(120);
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(Math.abs(last.crank - first.crank)).toBeLessThan(0.5);
    expect(Math.abs(last.knee - first.knee)).toBeLessThan(0.5);
  });

  it('keeps the pedal on the crank circle and the leg the length it was', () => {
    const { mechanism } = buildMechanism(pedalingLegFixture());
    const span = (frame: Joint[], a: string, b: string) => {
      const at = (id: string) => frame.find((joint) => joint.id === id)!;
      return Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    };
    for (const frame of mechanism.joints) {
      // Solved positions are kept to four decimals, so a length built from two
      // of them cannot be held tighter than that.
      expect(Math.abs(span(frame, 'B', 'P') - PEDAL.crank)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'H', 'K') - PEDAL.thigh)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'K', 'P') - PEDAL.shank)).toBeLessThan(3e-4);
    }
  });

  it('never straightens the knee, so the leg is not what stops it', () => {
    // The knee angle and the hip-to-pedal reach are the same fact twice, by the
    // cosine rule. The reach can never make the leg straight -- 7.69 against
    // 8.6 of leg -- which is why the stop has to come from somewhere else.
    const reaches = samples.map((sample) => sample.reach);
    expect(Math.max(...reaches)).toBeLessThan(PEDAL.thigh + PEDAL.shank - 0.8);
    expect(Math.min(...reaches)).toBeGreaterThan(4.2);
    expect(Math.max(...samples.map((s) => s.knee))).toBeLessThan(130);
  });

  it('swings the crank half a revolution and no further', () => {
    // The two stops are where the crank lies along the line from the bottom
    // bracket to the hip. They are 180 degrees apart by construction, and the
    // drive reaches all but the last few degrees of that at each end -- a
    // degree of knee buys more and more crank as a stop is approached, so a
    // one-degree step overshoots before it arrives.
    const crank = samples.map((sample) => sample.crank);
    const swept = Math.max(...crank) - Math.min(...crank);
    expect(swept).toBeGreaterThan(150);
    expect(swept).toBeLessThan(180);

    // And it is a rock, not a revolution: the pedal never crosses the far side
    // of the line through the bottom bracket and the hip, so half the circle is
    // simply unvisited.
    const hipBearing = Math.atan2(PEDAL.hip.y, PEDAL.hip.x) * DEG;
    for (const angle of crank) {
      let off = angle - hipBearing;
      while (off < 0) off += 360;
      // Every sample is on one side: between the hip's bearing and its
      // opposite, going the short way round through the drawn pose.
      expect(off).toBeGreaterThan(180);
    }
  });

  it('turns a small knee sweep into a large crank sweep', () => {
    // This is the reason to look at the mechanism at all. Sixty-odd degrees of
    // knee is worth more than twice that at the crank, which is the gearing a
    // leg gets for free from the geometry rather than from the chainrings.
    const knee = samples.map((sample) => sample.knee);
    const kneeSweep = Math.max(...knee) - Math.min(...knee);
    const crank = samples.map((sample) => sample.crank);
    const crankSweep = Math.max(...crank) - Math.min(...crank);
    expect(kneeSweep).toBeGreaterThan(60);
    expect(kneeSweep).toBeLessThan(70);
    expect(crankSweep / kneeSweep).toBeGreaterThan(2);
  });
});
