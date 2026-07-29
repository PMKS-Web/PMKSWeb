// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { SliderBlock, RealLink } from '../../app/model/link';
import {
  BUILT_IN_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { JOINT_TYPE, LINK_TYPE } from '../../app/services/transcoding/transcoder-data';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { TEMPLATE_BASELINES } from './template-baseline';

// The URL codec is a compatibility surface: every mechanism anyone has ever
// shared is a string in this format. These tests pin what the five built-in
// templates decode to and what they solve to, so a solver or codec refactor
// cannot quietly change either. See docs/joint-types-plan.md, Phase 0.

function decode(payload: string): StringTranscoder {
  const transcoder = new StringTranscoder();
  transcoder.decodeURL(payload);
  return transcoder;
}

describe('built-in template URLs', () => {
  for (const templateID of BUILT_IN_TEMPLATE_IDS) {
    const baseline = TEMPLATE_BASELINES[templateID];

    describe(templateID, () => {
      it('decodes to the pinned topology', () => {
        const transcoder = decode(TEMPLATE_LINKAGES[templateID]);

        expect(
          transcoder.getJoints().map((joint) => ({
            id: joint.id,
            type: joint.type,
            x: joint.x,
            y: joint.y,
            isGrounded: joint.isGrounded,
            isInput: joint.isInput,
            isWelded: joint.isWelded,
            angleRadians: joint.angleRadians,
          }))
        ).toEqual(baseline.joints);

        expect(
          transcoder.getLinks().map((link) => ({
            id: link.id,
            type: link.type,
            jointIDs: link.jointIDs,
            subsetLinkIDs: link.subsetLinkIDs,
          }))
        ).toEqual(baseline.links);
      });

      it('survives a decode/encode/decode round trip unchanged', () => {
        const first = decode(TEMPLATE_LINKAGES[templateID]);
        const second = decode(first.encodeURL());

        expect(second.getJoints()).toEqual(first.getJoints());
        expect(second.getLinks()).toEqual(first.getLinks());
        expect(second.getForces()).toEqual(first.getForces());
      });

      it('solves to the pinned positions', () => {
        const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES[templateID]);

        expect(mechanism.isMechanismValid()).toBe(true);
        expect(mechanism.dof).toBe(1);
        // The sample count fixes the t=0 pose: a mechanism that closes its
        // cycle in a different number of steps has moved its own zero.
        expect(mechanism.joints.length).toBe(baseline.steps);

        baseline.picks.forEach((timestep, index) => {
          const solved = mechanism.joints[timestep].map(
            (joint) => [joint.id, joint.x, joint.y] as [string, number, number]
          );
          expect(solved).toEqual(baseline.samples[index]);
        });
      });
    });
  }
});

// The slider-crank is the template that exercises the prismatic path, so its
// structure gets asserted explicitly rather than only through the snapshot.
describe('Slider_Crank prismatic structure', () => {
  it('pairs a grounded prismatic joint with a coincident revolute via a slider block', () => {
    const transcoder = decode(TEMPLATE_LINKAGES['Slider_Crank']);
    const jointC = transcoder.getJoints().find((joint) => joint.id === 'C')!;
    const jointD = transcoder.getJoints().find((joint) => joint.id === 'D')!;
    const linkCD = transcoder.getLinks().find((link) => link.id === 'CD')!;

    expect(jointC.type).toBe(JOINT_TYPE.REVOLUTE);
    expect(jointD.type).toBe(JOINT_TYPE.PRISMATIC);
    expect(jointD.isGrounded).toBe(true);
    expect([jointD.x, jointD.y]).toEqual([jointC.x, jointC.y]);

    expect(linkCD.type).toBe(LINK_TYPE.PISTON);
    expect(linkCD.jointIDs).toEqual(['C', 'D']);
  });

  it('builds a SliderBlock whose two joints stay coincident at every timestep', () => {
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Slider_Crank']);

    const block = mechanism.links[0].find((link) => link instanceof SliderBlock);
    expect(block).toBeInstanceOf(SliderBlock);
    expect(block!.joints).toHaveLength(2);
    expect(block!.joints.some((joint) => joint instanceof PrisJoint)).toBe(true);
    expect(block!.joints.some((joint) => joint instanceof RevJoint)).toBe(true);
    expect(mechanism.links[0].some((link) => link instanceof RealLink)).toBe(true);

    for (let timestep = 0; timestep < mechanism.joints.length; timestep++) {
      const joints = mechanism.joints[timestep];
      const jointC = joints.find((joint) => joint.id === 'C')!;
      const jointD = joints.find((joint) => joint.id === 'D')!;
      expect([jointD.x, jointD.y]).toEqual([jointC.x, jointC.y]);
    }
  });

  it('keeps the slider on its guide line for the whole cycle', () => {
    const { mechanism } = buildMechanismFixture(TEMPLATE_LINKAGES['Slider_Crank']);

    // The template's guide is horizontal, so the slider's y is the invariant
    // the circle-line intersection has to preserve. This is the assertion the
    // parametric-line rewrite must not move.
    const guideY = mechanism.joints[0].find((joint) => joint.id === 'C')!.y;
    const prismatic = mechanism.joints[0].find(
      (joint) => joint instanceof PrisJoint
    ) as unknown as RealJoint;
    expect((prismatic as unknown as PrisJoint).angle_rad).toBe(0);

    for (let timestep = 0; timestep < mechanism.joints.length; timestep++) {
      expect(mechanism.joints[timestep].find((joint) => joint.id === 'C')!.y).toBe(guideY);
    }
  });
});
