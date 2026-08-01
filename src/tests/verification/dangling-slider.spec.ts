// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint } from '../../app/model/joint';
import { Link, SliderBlock } from '../../app/model/link';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { invertedSliderCrankFixture } from '../../test-utils/verification/slot-fixtures';

// A slider with a block and no carrier (§4.1). Phase 2 held that a slot is
// always either grounded or floating, and re-grounded one that lost its carrier
// at whatever angle it last pointed. That kept the object and quietly invented
// the one thing about it nobody had chosen -- where it points.
//
// Phase 4 needs the third state because the panel's Slider toggle can be turned
// on for a joint with no carrier, and a carrier is geometry rather than a
// boolean: no toggle can produce one. So the slider dangles, the mechanism is
// invalid, the canvas says so in red, and the fix is a drag.

/** A real MechanismService holding the fixture, for the paths that reconcile. */
function loadIntoService(): { service: MechanismService; slider: PrisJoint } {
  const { service, active } = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(fixturePayload(invertedSliderCrankFixture()));
  new MechanismBuilder(service, decoder, new SettingsService(), active).build(true);
  return { service, slider: sliderIn(service.joints, 'P') };
}

function sliderIn(joints: unknown[], id: string): PrisJoint {
  return (joints as PrisJoint[]).find((joint) => joint.id === id)!;
}

describe('a slider with nowhere to slide', () => {
  it('is neither grounded nor floating', () => {
    const built = buildMechanism(invertedSliderCrankFixture());
    const slider = built.joints.find((joint) => joint.id === 'P') as PrisJoint;

    expect(slider.isFloating).toBe(true);
    expect(slider.isDangling).toBe(false);

    slider.detach();

    expect(slider.isFloating).toBe(false);
    expect(slider.ground).toBe(false);
    expect(slider.isDangling).toBe(true);
  });

  it('keeps the angle it last pointed, so grounding it restores that guide', () => {
    // Otherwise toggling Ground back on silently rebuilds a guide at zero, which
    // is a different mechanism wearing the same controls.
    const built = buildMechanism(invertedSliderCrankFixture());
    const slider = built.joints.find((joint) => joint.id === 'P') as PrisJoint;
    const before = slider.slotAngle;

    slider.groundAt(slider.slotAngle);
    slider.detach();
    slider.groundAt(slider.slotAngle);

    expect(slider.ground).toBe(true);
    expect(slider.slotAngle).toBeCloseTo(before, 9);
  });
});

describe('reconciling a slot that lost its carrier', () => {
  it('lets it dangle rather than grounding it somewhere nobody chose', () => {
    // This is the Phase 2 policy reversed, and the reversal is visible in an
    // existing flow: deleting a carrier link used to leave a working grounded
    // slider, and now leaves a red one that names what it needs.
    const { service, slider } = loadIntoService();
    const carrier = slider.carrier!;

    expect(slider.isFloating).toBe(true);

    // Delete the carrier the way a link deletion does: it stops being a body.
    service.links = service.links.filter((link: Link) => link.id !== carrier.id);
    service.finishStructuralEdit(false);

    expect(slider.isDangling, 'dangles instead of being re-grounded').toBe(true);
    expect(slider.ground).toBe(false);
  });

  it('still keeps the block, so the slider the user drew is not thrown away', () => {
    const { service, slider } = loadIntoService();
    const carrier = slider.carrier!;

    service.links = service.links.filter((link: Link) => link.id !== carrier.id);
    service.finishStructuralEdit(false);

    expect(slider.links.some((link) => link instanceof SliderBlock)).toBe(true);
    expect(service.joints).toContain(slider);
  });

  it('survives a second reconcile without changing its mind', () => {
    // finishStructuralEdit runs on every structural edit, so a state that only
    // holds for one pass is not a state.
    const { service, slider } = loadIntoService();
    service.links = service.links.filter((link: Link) => link.id !== slider.carrier!.id);

    service.finishStructuralEdit(false);
    service.finishStructuralEdit(false);

    expect(slider.isDangling).toBe(true);
  });
});

describe('a mechanism holding a dangling slider', () => {
  it('is invalid, and claims no degrees of freedom it cannot justify', () => {
    expect(buildMechanism(invertedSliderCrankFixture()).mechanism.isMechanismValid()).toBe(true);

    const broken = buildMechanism({ ...invertedSliderCrankFixture(), detach: ['P'] });

    expect(broken.mechanism.isMechanismValid()).toBe(false);
  });

  it('produces finite numbers rather than crashing', () => {
    // The solvers read a slot's direction through slotAngle, which answers with
    // the stashed angle when there are no slot joints -- so an ungated dangling
    // slider does not throw, it solves a mechanism the user did not draw. The
    // gate is what makes this a refusal instead of a wrong answer.
    const broken = buildMechanism({ ...invertedSliderCrankFixture(), detach: ['P'] });

    broken.mechanism.joints.forEach((frame, step) => {
      frame.forEach((joint) => {
        expect(Number.isFinite(joint.x), `${joint.id} finite at step ${step}`).toBe(true);
        expect(Number.isFinite(joint.y), `${joint.id} finite at step ${step}`).toBe(true);
      });
    });
  });
});

describe('a dangling slider through the URL', () => {
  it('round-trips as itself, not as a grounded guide', () => {
    // The encoding already tells the three states apart: a floating slot writes
    // three extra tokens, a grounded one sets the ground flag, and a dangling
    // one does neither. What has to hold is that the round trip preserves which.
    const first = buildMechanismFixture(fixturePayload(invertedSliderCrankFixture()));
    sliderIn(first.service.joints, 'P').detach();

    const payload = new UrlGenerationService(
      first.service,
      first.settings,
      new ActiveObjService()
    ).generateUrlQuery();
    const restored = sliderIn(buildMechanismFixture(payload).service.joints, 'P');

    expect(restored.isDangling, 'still dangling after a round trip').toBe(true);
    expect(restored.ground).toBe(false);
    expect(restored.carrier).toBeUndefined();
  });

  it('carries its stashed angle across, so grounding it lands where it was', () => {
    const first = buildMechanismFixture(fixturePayload(invertedSliderCrankFixture()));
    const slider = sliderIn(first.service.joints, 'P');
    const angle = slider.slotAngle;
    slider.groundAt(angle);
    slider.detach();

    const payload = new UrlGenerationService(
      first.service,
      first.settings,
      new ActiveObjService()
    ).generateUrlQuery();
    const restored = sliderIn(buildMechanismFixture(payload).service.joints, 'P');
    restored.groundAt(restored.slotAngle);

    // Three places, not more: the codec packs decimals at a fixed precision, so
    // the last few digits belong to the URL format rather than to this state.
    expect(restored.slotAngle).toBeCloseTo(angle, 3);
  });
});
