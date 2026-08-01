// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';

// Gate 4, third condition: every state the marks can draw survives the URL.
//
// A mark that cannot be shared is a mark nobody else can see, and the transcoder
// is a compatibility surface -- so this asserts the whole cross product the
// canvas distinguishes rather than the four cells of the 2x2 alone. What is
// checked is the state the mark reads from, not the bytes: two encodings of the
// same mechanism are both fine, a round trip that changes the picture is not.

interface MarkState {
  slider: boolean;
  welded: boolean;
  grounded: boolean;
  dangling: boolean;
  driven: boolean;
}

/** A---B---C with B optionally carrying a slider on AB, and flags applied. */
function scene(state: Partial<MarkState>): ReturnType<typeof createMechanismHarness> {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 3, 2);
  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints
        .filter((other) => other !== joint)
        .forEach((other) => joint.connectedJoints.push(other));
    });
    return link;
  };
  const ab = wire('AB', [a, b]);
  harness.service.joints = [a, b, c];
  harness.service.links = [ab, wire('BC', [b, c])];

  if (state.slider) {
    harness.active.updateSelectedObj(c);
    harness.service.toggleSlider();
    const slider = harness.service.joints.find(
      (joint): joint is PrisJoint => joint instanceof PrisJoint
    )!;
    if (state.grounded) slider.groundAt(0.75);
    else if (!state.dangling) slider.slideOn(ab, a, b);
    if (state.driven) slider.input = true;
    // Through the service, not by setting the flag: a weld says "everything here
    // is rigid", and reconcileAssemblyWelds correctly strips one with nothing
    // behind it. Setting the flag by hand tests the reconciler, not the mark.
    if (state.welded) {
      harness.active.updateSelectedObj(c);
      harness.service.weldJoint();
    }
  } else {
    if (state.grounded) c.ground = true;
    if (state.driven) c.input = true;
    if (state.welded) {
      harness.active.updateSelectedObj(b);
      harness.service.weldJoint();
    }
  }
  harness.service.finishStructuralEdit(false);
  return harness;
}

/** What the mark system reads off a mechanism, in one comparable shape. */
function readState(joints: unknown[]): MarkState {
  const all = joints as RealJoint[];
  const slider = all.find((joint): joint is PrisJoint => joint instanceof PrisJoint);
  return {
    slider: !!slider,
    welded: all.some((joint) => joint.isWelded),
    grounded: slider ? slider.ground : all.some((joint) => joint.ground),
    dangling: slider?.isDangling ?? false,
    driven: all.some((joint) => joint.input),
  };
}

function roundTrip(harness: ReturnType<typeof createMechanismHarness>): MarkState {
  const payload = new UrlGenerationService(
    harness.service,
    new SettingsService(),
    new ActiveObjService()
  ).generateUrlQuery();

  const decoder = new StringTranscoder();
  decoder.decodeURL(payload.replace(/^\?/, ''));
  const rebuilt = createMechanismHarness();
  new MechanismBuilder(rebuilt.service, decoder, new SettingsService(), rebuilt.active).build(true);
  return readState(rebuilt.service.joints);
}

/**
 * Every state the canvas draws differently. Slider crossed with Weld gives the
 * 2x2; each of those crossed with what is on the other side gives the eight base
 * marks; driven composites onto any of them rather than multiplying the set,
 * which is why it is sampled rather than crossed in full.
 */
const STATES: { name: string; state: MarkState }[] = [
  {
    name: 'Pin, floating',
    state: { slider: false, welded: false, grounded: false, dangling: false, driven: false },
  },
  {
    name: 'Pin, grounded',
    state: { slider: false, welded: false, grounded: true, dangling: false, driven: false },
  },
  {
    name: 'Rigid, floating',
    state: { slider: false, welded: true, grounded: false, dangling: false, driven: false },
  },
  {
    name: 'Rigid, grounded',
    state: { slider: false, welded: true, grounded: true, dangling: false, driven: false },
  },
  {
    name: 'Slot, floating',
    state: { slider: true, welded: false, grounded: false, dangling: false, driven: false },
  },
  {
    name: 'Slot, grounded',
    state: { slider: true, welded: false, grounded: true, dangling: false, driven: false },
  },
  {
    name: 'Slide, floating',
    state: { slider: true, welded: true, grounded: false, dangling: false, driven: false },
  },
  {
    name: 'Slide, grounded',
    state: { slider: true, welded: true, grounded: true, dangling: false, driven: false },
  },
  {
    name: 'Slot, dangling',
    state: { slider: true, welded: false, grounded: false, dangling: true, driven: false },
  },
  {
    name: 'Slide, dangling',
    state: { slider: true, welded: true, grounded: false, dangling: true, driven: false },
  },
  {
    name: 'driven pin, floating',
    state: { slider: false, welded: false, grounded: false, dangling: false, driven: true },
  },
  {
    name: 'driven pin, grounded',
    state: { slider: false, welded: false, grounded: true, dangling: false, driven: true },
  },
  {
    name: 'driven Slot, grounded',
    state: { slider: true, welded: false, grounded: true, dangling: false, driven: true },
  },
  {
    name: 'driven Slide, floating',
    state: { slider: true, welded: true, grounded: false, dangling: false, driven: true },
  },
];

describe('every state the marks can draw', () => {
  it('is built as asked in the first place', () => {
    // Without this the round trip could pass by encoding and decoding the same
    // wrong thing -- every assertion below rests on the scene really being the
    // state it is named after.
    for (const { name, state } of STATES) {
      expect(readState(scene(state).service.joints), name).toEqual(state);
    }
  });

  it('survives a round trip through the URL', () => {
    for (const { name, state } of STATES) {
      expect(roundTrip(scene(state)), name).toEqual(state);
    }
  });

  it('tells the three slot states apart, which is the one the format nearly loses', () => {
    // Grounded, floating and dangling all encode as "a prismatic joint". What
    // separates them is the ground flag and whether the three slot tokens are
    // written -- a format change that dropped either would collapse all three
    // into one and every assertion above would still pass on shape alone.
    const floating = roundTrip(scene({ slider: true }));
    const grounded = roundTrip(scene({ slider: true, grounded: true }));
    const dangling = roundTrip(scene({ slider: true, dangling: true }));

    expect([floating.grounded, floating.dangling]).toEqual([false, false]);
    expect([grounded.grounded, grounded.dangling]).toEqual([true, false]);
    expect([dangling.grounded, dangling.dangling]).toEqual([false, true]);
  });
});
