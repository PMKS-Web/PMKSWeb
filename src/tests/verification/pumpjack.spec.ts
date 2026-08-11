// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { PUMPJACK, pumpjackFixture } from '../../test-utils/verification/library-fixtures';
import { describeActuator } from '../../app/model/actuator';

// A walking-beam pumping unit, driven where the pitman meets the beam.
//
// That pin is the one an actuator would span to work this machine without a
// crankshaft, and neither body meeting there is the ground: the pitman swings
// and the beam rocks. What the well sees is at the other end of the beam
// entirely -- a polished rod in the wellhead's guide, which can only go up and
// down.
//
// Two things are asserted here that the library's other driven pins do not
// show. The output is a straight line, and it turns round before the command
// does: the beam runs out of travel of its own part way through the sweep and
// starts back while the drive is still asking for more.

const DEG = 180 / Math.PI;

interface Sample {
  /** The commanded angle at the pitman's upper pin: crank pin, pin, post. */
  command: number;
  /** Where the beam points, in the world. */
  beam: number;
  /** Where the crank points about the crankshaft. */
  crank: number;
  rod: { x: number; y: number };
}

function sampleMotion(): { samples: Sample[]; frames: number } {
  const { mechanism } = buildMechanism(pumpjackFixture());
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [crankshaft, pin, tail, post, horsehead, rod] = ['A', 'M', 'P', 'S', 'H', 'R'].map(at);
    const toPin = Math.atan2(pin.y - tail.y, pin.x - tail.x);
    const toPost = Math.atan2(post.y - tail.y, post.x - tail.x);
    let command = (toPost - toPin) * DEG;
    while (command <= -180) command += 360;
    while (command > 180) command -= 360;
    return {
      command,
      beam: Math.atan2(horsehead.y - post.y, horsehead.x - post.x) * DEG,
      crank: Math.atan2(pin.y - crankshaft.y, pin.x - crankshaft.x) * DEG,
      rod: { x: rod.x, y: rod.y },
    };
  });
  return { samples, frames: mechanism.joints.length };
}

describe('a walking-beam pumping unit, driven at the pitman pin', () => {
  const { samples, frames } = sampleMotion();

  it('is driven where two moving bodies meet, and nothing else', () => {
    const { joints } = buildMechanism(pumpjackFixture());
    const pin = joints.find((joint) => joint.id === 'P')! as RealJoint;
    expect(pin.ground).toBe(false);
    const actuator = describeActuator(pin);
    if (typeof actuator === 'string') throw new Error(actuator);
    expect(actuator.kind).toBe('angle');
    expect((actuator.referenceBody as { id: string }).id).toBe('MP');
    expect((actuator.drivenBody as { id: string }).id).toBe('PSH');
  });

  it('runs a whole cycle and closes it', () => {
    expect(frames).toBeGreaterThan(100);
    const first = samples[0];
    const last = samples[samples.length - 1];
    expect(Math.abs(last.command - first.command)).toBeLessThan(0.5);
    expect(Math.hypot(last.rod.x - first.rod.x, last.rod.y - first.rod.y)).toBeLessThan(0.01);
  });

  it('sends the polished rod up and down a line and nowhere else', () => {
    // The rod is a block in the wellhead's guide, so this is what makes it a
    // pump rather than a linkage waving about: every sample sits on the same
    // vertical, to the fourth decimal the solver keeps.
    for (const sample of samples) {
      expect(Math.abs(sample.rod.x - PUMPJACK.wellhead)).toBeLessThan(3e-4);
    }
    const depth = samples.map((sample) => sample.rod.y);
    const stroke = Math.max(...depth) - Math.min(...depth);
    expect(stroke).toBeGreaterThan(2);
    expect(stroke).toBeLessThan(2.2);
  });

  it('stops the beam at its own limit going up, and at the drive going down', () => {
    // The two ends of the nod are limited by different things, and that is the
    // clearest statement this mechanism makes about a relative angle not being
    // an absolute one.
    //
    // Going up, the beam runs out of travel of its own: the crank comes into
    // line with the pitman, which is where any rocker stops, and the command
    // has not finished. It carries on asking and the beam starts back down.
    // That top angle is a closed form in the bar lengths, so it can be
    // predicted rather than sampled.
    const bearing = (span: number) =>
      Math.acos(
        (PUMPJACK.tail ** 2 + span ** 2 - PUMPJACK.pitman ** 2) / (2 * PUMPJACK.tail * span)
      ) * DEG;
    const drawn =
      (bearing(PUMPJACK.reach - PUMPJACK.crank) + bearing(PUMPJACK.reach + PUMPJACK.crank)) / 2;
    /** Where the beam stands when crank and pitman are in line, either way. */
    const rockerLimit = (reachOfPin: number) =>
      drawn -
      Math.acos(
        (PUMPJACK.tail ** 2 + PUMPJACK.reach ** 2 - reachOfPin ** 2) /
          (2 * PUMPJACK.tail * PUMPJACK.reach)
      ) *
        DEG;

    const beam = samples.map((sample) => sample.beam);
    const top = rockerLimit(PUMPJACK.pitman - PUMPJACK.crank);
    expect(Math.abs(Math.max(...beam) - top)).toBeLessThan(0.1);

    // Going down it is the drive that gives out first: the crank reaches the
    // line from crankshaft to post while the beam still has ten degrees of nod
    // left in it, so this end of the travel is nowhere near the beam's own
    // limit.
    const bottom = rockerLimit(PUMPJACK.pitman + PUMPJACK.crank);
    expect(Math.min(...beam)).toBeGreaterThan(bottom + 5);
  });

  it('gives the well one stroke per sweep, down and back', () => {
    // Total travel against net travel. A rod that went down once and up once
    // covers twice its stroke and no more; anything that wandered on the way
    // would show up here as a larger ratio. The couple of percent over two is
    // the beam touching its own limit and retreating, above -- real, small, and
    // the only excursion in the cycle.
    const depth = samples.map((sample) => sample.rod.y);
    const stroke = Math.max(...depth) - Math.min(...depth);
    const travelled = depth.slice(1).reduce((sum, y, i) => sum + Math.abs(y - depth[i]), 0);
    expect(travelled / stroke).toBeGreaterThan(1.95);
    expect(travelled / stroke).toBeLessThan(2.15);
  });

  it('rocks the crank rather than turning it', () => {
    // The pitman and the beam's tail span 5.8 between them, more than the 5.2
    // the crank pin can ever be from the post, so those two can never come into
    // line and the drive is never stopped by them. What stops it is the crank
    // reaching the line from crankshaft to post, which it does twice -- half a
    // revolution apart, so the crank sweeps most of 180 degrees and returns.
    expect(PUMPJACK.pitman + PUMPJACK.tail).toBeGreaterThan(PUMPJACK.reach + PUMPJACK.crank);
    const crank = samples.map((sample) => sample.crank);
    const swept = Math.max(...crank) - Math.min(...crank);
    expect(swept).toBeGreaterThan(140);
    expect(swept).toBeLessThan(180);
  });

  it('keeps every member the length it was drawn', () => {
    const { mechanism } = buildMechanism(pumpjackFixture());
    const span = (frame: Joint[], a: string, b: string) => {
      const at = (id: string) => frame.find((joint) => joint.id === id)!;
      return Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    };
    for (const frame of mechanism.joints) {
      expect(Math.abs(span(frame, 'A', 'M') - PUMPJACK.crank)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'M', 'P') - PUMPJACK.pitman)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'P', 'S') - PUMPJACK.tail)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'S', 'H') - PUMPJACK.head)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'H', 'R') - PUMPJACK.rod)).toBeLessThan(3e-4);
    }
  });
});
