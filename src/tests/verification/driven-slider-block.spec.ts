// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import {
  angleReference,
  canDrive,
  describeActuator,
  incidentBodies,
} from '../../app/model/actuator';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';

/**
 * The pin between a connecting rod and a slider's block.
 *
 * It looks like every other floating pin — two bodies meet, neither is ground —
 * and until this spec it was offered as a driven joint, accepted, and then
 * ignored. The block carries its pin and its prismatic joint at the same point,
 * so the direction the block's angle is measured along has zero length, the
 * commanded angle is the angle of nothing, and the solve produced a full 360
 * samples of a mechanism standing perfectly still.
 *
 * Nothing here asserts that such a drive works, because it does not: a body
 * that is one point has no angle to be turned through. What it asserts is that
 * the app says so instead of pretending.
 */
describe('a driven pin on a slider block', () => {
  function sliderCrank() {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES['Slider_Crank']);
    new MechanismBuilder(
      harness.service,
      decoder,
      new SettingsService(),
      new ActiveObjService()
    ).build(false);
    return harness.service;
  }

  /** The rod-to-block pin: the RevJoint sharing its place with a PrisJoint. */
  function blockPin(joints: RealJoint[]): RealJoint {
    const sliders = joints.filter((joint) => joint instanceof PrisJoint);
    const found = joints.find(
      (joint) =>
        !(joint instanceof PrisJoint) &&
        sliders.some((slider) => Math.hypot(slider.x - joint.x, slider.y - joint.y) < 1e-6)
    );
    if (!found) throw new Error('the slider-crank template has no rod-to-block pin');
    return found;
  }

  it('is a two-body floating pin, which is why it looked drivable', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const pin = blockPin(joints);

    expect(pin.ground).toBe(false);
    expect(incidentBodies(pin)).toHaveLength(2);
  });

  it('has no direction to measure the block through, and is refused', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const pin = blockPin(joints);
    const [reference, driven] = incidentBodies(pin);

    // One side is the rod, which has a far end and so a direction. The other is
    // the block, which has nothing but this point.
    const withDirection = [reference, driven].filter((body) => angleReference(body, pin));
    expect(withDirection).toHaveLength(1);

    expect(canDrive(pin)).toBe(false);
    expect(describeActuator(pin)).toMatch(/no angle to turn it through/);
  });

  it('says so, rather than solving a mechanism that never moves', () => {
    // The Edit panel sends this toggle to the slider's prismatic half, so the
    // way into this state is a URL — a shared link, or an undo step — which
    // sets `input` on the pin directly. Before the refusal above, such a link
    // opened as a valid one-freedom mechanism with a full 361-sample cycle
    // precomputed, and every joint in it stood still through all 361.
    const service = sliderCrank();
    const joints = service.joints as RealJoint[];
    for (const joint of joints) joint.input = false;
    blockPin(joints).input = true;
    service.updateMechanism();

    expect(service.oneValidMechanismExists()).toBe(false);
    expect(service.invalidReason()).toMatch(/no angle to turn it through/);
    // Not a cycle's worth of frames that all look the same.
    expect(
      (service.mechanisms[0] as unknown as { joints: unknown[] })?.joints?.length ?? 0
    ).toBeLessThan(3);
  });

  it('leaves the pin at the other end of the same rod drivable', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const pin = blockPin(joints);
    const rod = pin.links.find((link) => link.joints.length > 1 && link.joints.includes(pin))!;
    const farEnd = rod.joints.find((joint) => joint.id !== pin.id) as RealJoint;

    // The refusal has to be about this joint, not about slider-cranks: the
    // crank pin of the very same mechanism is still a legal driven joint.
    expect(farEnd.id).not.toBe(pin.id);
    expect(canDrive(farEnd)).toBe(true);
  });
});
