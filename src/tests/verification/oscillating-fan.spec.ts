// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, RealJoint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { FAN, oscillatingFanFixture } from '../../test-utils/verification/library-fixtures';
import { describeActuator } from '../../app/model/actuator';

// An oscillating desk fan, driven at the crank its own gearbox turns.
//
// The motor is bolted to the head and the head is what it sweeps, so its output
// crank turns about an axis that is itself moving. That is the whole of the
// mechanism and the whole of the point: the only angle the motor can command is
// the one between the crank and the body it is bolted to.
//
// What this mechanism is here to show is the gap between that angle and any
// angle in the world. The commanded one goes round and round without stopping;
// the head it drives never leaves an 89-degree arc, and crosses the middle of it
// twice per turn. Same joint, two bodies, two completely different motions.

const DEG = 180 / Math.PI;

interface Sample {
  /** The commanded angle: crank measured against the head that carries it. */
  command: number;
  /** Where the head points, in the world. */
  head: number;
  /** Where the crank points, in the world. */
  crank: number;
}

function sampleMotion(): { samples: Sample[]; frames: number } {
  const { mechanism } = buildMechanism(oscillatingFanFixture());
  const samples = mechanism.joints.map((frame) => {
    const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
    const [pivot, shaft, pin, nose] = ['A', 'C', 'D', 'N'].map(at);
    const toPivot = Math.atan2(pivot.y - shaft.y, pivot.x - shaft.x);
    const toPin = Math.atan2(pin.y - shaft.y, pin.x - shaft.x);
    let command = (toPin - toPivot) * DEG;
    while (command <= -180) command += 360;
    while (command > 180) command -= 360;
    return {
      command,
      head: Math.atan2(nose.y - pivot.y, nose.x - pivot.x) * DEG,
      crank: Math.atan2(pin.y - shaft.y, pin.x - shaft.x) * DEG,
    };
  });
  return { samples, frames: mechanism.joints.length };
}

/** Signed step between two angles, taking the short way round. */
function step(from: number, to: number): number {
  let delta = to - from;
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  return delta;
}

describe('an oscillating fan, driven at the crank on its own head', () => {
  const { samples, frames } = sampleMotion();

  it('is driven at a pin carried by the body it drives', () => {
    const { joints } = buildMechanism(oscillatingFanFixture());
    const shaft = joints.find((joint) => joint.id === 'C')! as RealJoint;
    expect(shaft.ground).toBe(false);
    const actuator = describeActuator(shaft);
    if (typeof actuator === 'string') throw new Error(actuator);
    expect(actuator.kind).toBe('angle');
    // The head is the reference and the crank is what moves against it, which
    // is the way round a motor is bolted on. Reading it the other way would
    // describe a fan whose head drives its gearbox.
    expect(actuator.referenceBody).not.toBe('ground');
    expect((actuator.referenceBody as { id: string }).id).toBe('ACN');
    expect((actuator.drivenBody as { id: string }).id).toBe('CD');
  });

  it('takes the commanded angle right round, one degree at a time', () => {
    // Unlike every other driven pin in the library this one never stops: no
    // pair of bars in the loop can come into line, so there is no pose the
    // drive cannot step past. A full turn at a degree a sample is 360 of them.
    expect(frames).toBe(361);
    const steps = samples.slice(1).map((sample, i) => step(samples[i].command, sample.command));
    for (const delta of steps) {
      expect(Math.abs(delta - 1)).toBeLessThan(0.05);
    }
    const total = steps.reduce((sum, delta) => sum + delta, 0);
    expect(Math.abs(total - 360)).toBeLessThan(0.5);
  });

  it('sweeps the head through its arc and no further, twice per turn', () => {
    // The head's stops are the two poses where the link and the crank line up.
    // Those are a closed form in the bar lengths, and they land the same angle
    // either side of the drawn pose because the anchor is placed to make it so.
    // The drive walks past both of them without stopping, because they bound
    // the head and not the crank.
    const halfSweep = (span: number) =>
      Math.acos((FAN.arm ** 2 + FAN.anchor ** 2 - span ** 2) / (2 * FAN.arm * FAN.anchor)) * DEG;
    const reach = Math.abs(halfSweep(FAN.link + FAN.crank) - halfSweep(FAN.link - FAN.crank)) / 2;
    expect(reach).toBeGreaterThan(40);

    const head = samples.map((sample) => sample.head);
    expect(Math.abs(Math.max(...head) - reach)).toBeLessThan(0.2);
    expect(Math.abs(Math.min(...head) + reach)).toBeLessThan(0.2);

    // Twice per turn: the head reverses at each stop, so it changes direction
    // exactly twice over one revolution of the command.
    const turns = head
      .slice(1)
      .map((angle, i) => Math.sign(angle - head[i]))
      .filter((sign) => sign !== 0);
    const reversals = turns.filter((sign, i) => i > 0 && sign !== turns[i - 1]).length;
    expect(reversals).toBe(2);
  });

  it('holds the head still in the world while the crank turns through it', () => {
    // The two are not the same quantity, and this is the arithmetic of it: over
    // a full revolution of the command the crank also makes a full revolution
    // in the world, and the head makes none. Whatever the head borrowed on the
    // way out it gave back on the way home.
    const crankTotal = samples
      .slice(1)
      .map((sample, i) => step(samples[i].crank, sample.crank))
      .reduce((sum, delta) => sum + delta, 0);
    expect(Math.abs(Math.abs(crankTotal) - 360)).toBeLessThan(1);

    const headTotal = samples
      .slice(1)
      .map((sample, i) => step(samples[i].head, sample.head))
      .reduce((sum, delta) => sum + delta, 0);
    expect(Math.abs(headTotal)).toBeLessThan(1);
  });

  it('keeps every bar the length the fan was built with', () => {
    const { mechanism } = buildMechanism(oscillatingFanFixture());
    const span = (frame: Joint[], a: string, b: string) => {
      const at = (id: string) => frame.find((joint) => joint.id === id)!;
      return Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    };
    for (const frame of mechanism.joints) {
      expect(Math.abs(span(frame, 'A', 'C') - FAN.arm)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'C', 'D') - FAN.crank)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'D', 'B') - FAN.link)).toBeLessThan(3e-4);
      expect(Math.abs(span(frame, 'A', 'N') - FAN.nose)).toBeLessThan(3e-4);
    }
  });
});
