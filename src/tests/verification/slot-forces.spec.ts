// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';

// Test-ladder case 9 (docs/joint-types-plan.md §4.1): the inverted slider-crank
// carrying a load. Two things are under test, and only one of them is the
// reaction's direction.
//
// The other is carrier-side incidence. Option A stores the carrier outside the
// slider's `links` and keeps the slider out of the carrier's `joints`, so the
// force solver's incidence -- built from exactly those two structures -- did
// not see the body on the far side of the slot at all. The slot then pushed on
// the block and on nothing in return, and the analysis came back all zeros
// rather than reporting that it could not model the topology.

const CRANK = 1;
const OFFSET = 3;
const LEVER = 5;
const START_ANGLE = Math.PI / 2;
const START = {
  bx: CRANK * Math.cos(START_ANGLE),
  by: CRANK * Math.sin(START_ANGLE),
};
const SPAN = Math.hypot(START.bx - OFFSET, START.by);
const TIP: [number, number] = [
  OFFSET + (LEVER * (START.bx - OFFSET)) / SPAN,
  (LEVER * START.by) / SPAN,
];

const LOADED_INVERTED_SLIDER_CRANK: MechanismFixture = {
  joints: [
    { id: 'A', x: 0, y: 0, ground: true, input: true },
    { id: 'B', x: START.bx, y: START.by },
    { id: 'C', x: OFFSET, y: 0, ground: true },
    { id: 'D', x: TIP[0], y: TIP[1] },
  ],
  links: [{ joints: 'AB' }, { joints: 'CD' }],
  sliders: [{ at: 'B', prisId: 'P', on: { carrier: 'CD', a: 'C', b: 'D' } }],
  load: { onLink: 'CD', at: TIP, vector: [0, -10] },
  inputAngVel: 1,
};

describe('forces through a moving slot', () => {
  it('produces a determinate model rather than giving up', () => {
    const { mechanism } = buildMechanism(LOADED_INVERTED_SLIDER_CRANK);

    const series = mechanism.getForceAnalysis('static');

    expect(series.frames[0].status).toBe('ok');
    expect(series.successfulFrames).toBeGreaterThan(0);
  });

  it('lists the carrier among the bodies reacting at the slot', () => {
    // The incidence bug, stated directly: without the carrier here, the slot's
    // reaction has only one side.
    const { mechanism } = buildMechanism(LOADED_INVERTED_SLIDER_CRANK);

    const series = mechanism.getForceAnalysis('static');

    expect(series.reactionIndex.linksByJoint.get('P')).toEqual(expect.arrayContaining(['CD']));
  });

  it('pushes on the block and the carrier equally and oppositely', () => {
    const { mechanism } = buildMechanism(LOADED_INVERTED_SLIDER_CRANK);
    const series = mechanism.getForceAnalysis('static');

    for (let index = 0; index < Math.min(series.frames.length, 90); index++) {
      const frame = series.frames[index];
      if (frame.status !== 'ok') continue;
      const onBlock = frame.jointReactionsByLink.get('P')?.get('BP');
      const onCarrier = frame.jointReactionsByLink.get('P')?.get('CD');
      expect(onBlock, `block frame=${index}`).toBeDefined();
      expect(onCarrier, `carrier frame=${index}`).toBeDefined();
      expect(onBlock![0] + onCarrier![0], `x frame=${index}`).toBeCloseTo(0, 9);
      expect(onBlock![1] + onCarrier![1], `y frame=${index}`).toBeCloseTo(0, 9);
    }
  });

  it('carries the load rather than reporting no force at all', () => {
    // A ten-newton load on the lever has to show up somewhere. All-zero
    // reactions were the previous answer and they looked like a valid one.
    const { mechanism } = buildMechanism(LOADED_INVERTED_SLIDER_CRANK);
    const series = mechanism.getForceAnalysis('static');

    const frame = series.frames.find((candidate) => candidate.status === 'ok')!;
    const magnitudes = [...frame.jointReactions.values()].map((reaction) =>
      Math.hypot(reaction[0], reaction[1])
    );

    expect(Math.max(...magnitudes)).toBeGreaterThan(1);
  });

  it('keeps the slot reaction perpendicular to the slot', () => {
    // A frictionless slot can only push sideways; any component along the slot
    // would be the solver inventing a force the joint cannot transmit.
    const { mechanism } = buildMechanism(LOADED_INVERTED_SLIDER_CRANK);
    const series = mechanism.getForceAnalysis('static');

    for (let index = 0; index < Math.min(series.frames.length, 90); index++) {
      const frame = series.frames[index];
      if (frame.status !== 'ok') continue;
      const reaction = frame.jointReactionsByLink.get('P')?.get('BP');
      if (!reaction) continue;
      const joints = mechanism.joints[index];
      const c = joints.find((joint) => joint.id === 'C')!;
      const d = joints.find((joint) => joint.id === 'D')!;
      const length = Math.hypot(d.x - c.x, d.y - c.y);
      const along = (reaction[0] * (d.x - c.x) + reaction[1] * (d.y - c.y)) / length;
      expect(along, `frame=${index}`).toBeCloseTo(0, 6);
    }
  });
});
