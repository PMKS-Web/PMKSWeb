// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { FlagPacker } from '../../app/services/transcoding/flag-packer';
import { BoolSetting } from '../../app/services/transcoding/stored-settings';
import { createMechanismHarness, MechanismHarness } from '../../test-utils/mechanism-harness';

// What the Force tab asks for before it will call itself ready, now that
// gravity is a load and a massless link is an idealization rather than a sin.
//
// The situations here are the ones a fresh drawing actually walks through:
// every link starts massless, gravity starts on, and no force is drawn. Each
// step of giving the drawing weight should move exactly one row, and the tab
// should come ready the moment there is genuinely something to solve.

/** A crank-rocker with every link at the default mass of zero. */
function fourBar(harness: MechanismHarness): RealLink[] {
  const at: [number, number][] = [
    [0, 0],
    [0, 1],
    [3, 2],
    [4, 0],
  ];
  const joints = at.map(([x, y], i) => new RevJoint('ABCD'[i], x, y));
  joints[0].ground = true;
  joints[3].ground = true;
  joints[0].input = true;
  const links = [0, 1, 2].map((i) => {
    const link = new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]]);
    joints[i].links.push(link);
    joints[i + 1].links.push(link);
    joints[i].connectedJoints.push(joints[i + 1]);
    joints[i + 1].connectedJoints.push(joints[i]);
    return link;
  });
  harness.service.joints.push(...joints);
  harness.service.links.push(...links);
  harness.service.updateMechanism();
  return links;
}

const row = (harness: MechanismHarness, title: string) =>
  harness.service.forceAnalysisRequirements().find((r) => r.title === title)!;

describe('force analysis setup, as a fresh drawing meets it', () => {
  it('starts unloaded: massless everywhere, gravity with nothing to pull on', () => {
    const harness = createMechanismHarness();
    fourBar(harness);

    const load = row(harness, 'A load to react against');
    expect(load.met).toBe(false);
    // Both ways out, kept short: attach a force, or give a link mass.
    expect(load.body).toContain('Attach a force');
    expect(load.body).toContain('mass');
    expect(harness.service.forceAnalysisReady()).toBe(false);
  });

  it('comes ready the moment one link has mass, because gravity is a load', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.service.updateMechanism();

    const load = row(harness, 'A load to react against');
    expect(load.met).toBe(true);
    expect(load.body).toContain('Gravity');
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('warns about the links still massless, without standing in the way', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.service.updateMechanism();

    const massless = row(harness, 'Massless links');
    expect(massless.met).toBe(false);
    expect(massless.warning).toBe(true);
    // Names the links, and says the idealization is allowed.
    expect(massless.body).toContain('AB');
    expect(massless.body).toContain('CD');
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('with gravity off, mass alone is no longer a load, and the message says so', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    const load = row(harness, 'A load to react against');
    expect(load.met).toBe(false);
    expect(load.body).toContain('gravity is off');
    expect(harness.service.forceAnalysisReady()).toBe(false);
  });

  it('offers to turn gravity on where doing so is the whole fix', () => {
    // Everything the analysis needs is drawn; the only thing in the way is a
    // switch in another panel, so this refusal is the one the setup drawer can
    // clear on the reader's behalf.
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    expect(row(harness, 'A load to react against').act).toBe('gravity');

    harness.settings.isGravity.next(true);
    harness.service.updateMechanism();
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('does not offer it where it would leave the reader still blocked', () => {
    // Gravity off over a drawing with no mass anywhere: turning it on pulls on
    // nothing, so a button promising a fix would not deliver one. The sentence
    // still names both halves of the way out.
    const harness = createMechanismHarness();
    fourBar(harness);
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    const load = row(harness, 'A load to react against');
    expect(load.act).toBeUndefined();
    expect(load.body).toContain('Attach a force');
    expect(load.body).toContain('gravity');
  });

  it('feeds the gravity setting into the solved mechanism itself', () => {
    const on = createMechanismHarness();
    const linksOn = fourBar(on);
    linksOn.forEach((link) => (link.mass = 2));
    on.service.updateMechanism();
    const withGravity = on.service.mechanisms[0].getForceAnalysis('static');

    const off = createMechanismHarness();
    const linksOff = fourBar(off);
    linksOff.forEach((link) => (link.mass = 2));
    off.settings.isGravity.next(false);
    off.service.updateMechanism();
    const withoutGravity = off.service.mechanisms[0].getForceAnalysis('static');

    expect(withGravity.successfulFrames).toBeGreaterThan(0);
    const weightOn = [...withGravity.frames[0].jointReactions.values()].some(
      ([x, y]) => Math.hypot(x, y) > 1e-6
    );
    const weightOff = [...withoutGravity.frames[0].jointReactions.values()].every(
      ([x, y]) => Math.hypot(x, y) < 1e-9
    );
    expect(weightOn).toBe(true);
    expect(weightOff).toBe(true);
  });
});

describe('what a fresh link weighs', () => {
  it('starts with no mass and no moment of inertia', () => {
    // MoI used to default to 1 while mass defaulted to 0, so a "massless" link
    // still resisted angular acceleration — every dynamic analysis of a fresh
    // drawing quietly carried unit inertia on every link.
    const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 1, 0)]);
    expect(link.mass).toBe(0);
    expect(link.massMoI).toBe(0);
  });

  it('so a fully massless mechanism takes no torque to drive', () => {
    // No mass, no inertia, no gravity, no load: the drive has nothing to work
    // against, and the dynamic input effort has to come out zero everywhere.
    const harness = createMechanismHarness();
    fourBar(harness);
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    const series = harness.service.mechanisms[0].getForceAnalysis('dynamic');
    expect(series.successfulFrames).toBeGreaterThan(0);
    series.frames
      .filter((frame) => frame.status === 'ok')
      .forEach((frame) => {
        expect(Math.abs(frame.inputEffort!.valueSI)).toBeLessThan(1e-9);
      });
  });
});

describe('mass on a slider block', () => {
  it('counts as weight, the same as the solver counts it', () => {
    // A slider-crank whose only mass is the piston itself: the solver hangs
    // that mass from gravity, so setup has to call the mechanism loaded.
    const harness = createMechanismHarness();
    const at: [number, number][] = [
      [0, 0],
      [1, 1],
      [3, 0],
    ];
    const joints = at.map(([x, y], i) => new RevJoint('ABC'[i], x, y));
    joints[0].ground = true;
    joints[0].input = true;
    const links = [0, 1].map((i) => {
      const link = new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]]);
      joints[i].links.push(link);
      joints[i + 1].links.push(link);
      joints[i].connectedJoints.push(joints[i + 1]);
      joints[i + 1].connectedJoints.push(joints[i]);
      return link;
    });
    // The block and its grounded guide, wired the way the fixture builder
    // wires them: pin C rides in a horizontal slot fixed to the world.
    const pris = new PrisJoint('P', joints[2].x, joints[2].y, false, true);
    pris.angle_rad = 0;
    pris.connectedJoints.push(joints[2]);
    joints[2].connectedJoints.push(pris);
    const block = new SliderBlock('CP', [joints[2], pris], 3);
    pris.links.push(block);
    joints[2].links.push(block);
    harness.service.joints.push(...joints, pris);
    harness.service.links.push(...links, block);
    harness.service.updateMechanism();

    const load = row(harness, 'A load to react against');
    expect(load.met).toBe(true);
  });
});

describe('the GRAVITY_OFF flag against every URL already in circulation', () => {
  it('unpacks as false — gravity on — from a token written before it existed', () => {
    // Eight flags was the whole enum when today's URLs were written. Packing
    // eight and unpacking nine is exactly what decoding an old URL does, and
    // the ninth has to come back false, because false means what those URLs
    // have always meant.
    const oldEra = FlagPacker.pack([true, false, true, true, false, true, false, true]);
    const decoded = FlagPacker.unpack(oldEra, 9);
    expect(decoded[BoolSetting.GRAVITY_OFF]).toBe(false);
    expect(decoded.slice(0, 8)).toEqual([true, false, true, true, false, true, false, true]);
  });

  it('keeps the token the same length, so no URL field shifts', () => {
    const eight = FlagPacker.pack([true, false, true, true, false, true, false, true]);
    const nine = FlagPacker.pack([true, false, true, true, false, true, false, true, false]);
    expect(nine).toBe(eight);
  });
});
