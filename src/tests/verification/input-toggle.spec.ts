// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { RealJoint } from '../../app/model/joint';
import {
  TEMPLATE_LINKAGES,
  TemplateID,
} from '../../app/component/MODALS/templates/template-linkages';
import { createMechanismHarness, MechanismHarness } from '../../test-utils/mechanism-harness';

/**
 * Moving the input from one joint to another.
 *
 * Two things were wrong with it, and they compounded. The edit asked for no
 * undo entry, so a user who moved the input could not put it back; and the
 * joint that held the input was cleared *before* the new one was checked, so a
 * refused click still took the input away — leaving a mechanism with no driven
 * joint and no way back to the one it had.
 */
describe('moving the input from one joint to another', () => {
  function load(template: TemplateID): MechanismHarness {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES[template]);
    new MechanismBuilder(
      harness.service,
      decoder,
      new SettingsService(),
      new ActiveObjService()
    ).build(false);
    return harness;
  }

  const inputs = (harness: MechanismHarness) =>
    (harness.service.joints as RealJoint[]).filter((joint) => joint.input).map((joint) => joint.id);

  it('is an undo entry, like every other edit that changes the mechanism', () => {
    const harness = load('4-Bar');
    const before = harness.saveCount();
    const held = inputs(harness);
    expect(held).toHaveLength(1);

    const other = (harness.service.joints as RealJoint[]).find(
      (joint) => joint.ground && joint.id !== held[0]
    )!;
    harness.active.selectedJoint = other;
    harness.service.adjustInput();

    expect(inputs(harness)).toEqual([other.id]);
    expect(harness.saveCount()).toBe(before + 1);
  });

  it('leaves the old input alone when the new joint is refused', () => {
    const harness = load('4-Bar');
    const held = inputs(harness);
    const before = harness.saveCount();

    // A joint where three bodies meet cannot be driven — "driven" would not say
    // which pair moves — so this click is refused. It must not cost the
    // mechanism the input it already had.
    const crowded = (harness.service.joints as RealJoint[]).find((joint) => joint.links.length > 2);
    if (!crowded) {
      // The four-bar has no such joint; weld one into existence rather than
      // skipping the case, so this never passes by not running.
      const joint = (harness.service.joints as RealJoint[]).find((j) => !j.ground)!;
      joint.isWelded = true;
      harness.active.selectedJoint = joint;
      harness.service.adjustInput();
      expect(inputs(harness)).toEqual(held);
      expect(harness.saveCount()).toBe(before);
      return;
    }
    harness.active.selectedJoint = crowded;
    harness.service.adjustInput();

    expect(inputs(harness)).toEqual(held);
    expect(harness.saveCount()).toBe(before);
  });
});
