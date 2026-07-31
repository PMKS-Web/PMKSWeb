// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { slideAssemblyAt } from '../../app/model/slide-assembly';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import {
  invertedSliderCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';

// The 2x2 of docs/joint-types-plan.md §2.1 is a property of an *assembly*, not
// of one serialized joint: isPrismatic lives on the PrisJoint and isWelded on
// the RevJoint, and nothing in the model enforces the pairing. So the pair has
// to be asserted rather than assumed (§3.5).

/** A four-bar with one joint welded: the compound cell of the 2x2. */
function compoundWeldFixture() {
  return { ...teachingLabFourBarFixture(), welds: ['B'] };
}

const CELLS = [
  { name: 'pin', fixture: teachingLabFourBarFixture(), welded: [] as string[], slider: false },
  { name: 'compound weld', fixture: compoundWeldFixture(), welded: ['B'], slider: false },
  { name: 'slot', fixture: invertedSliderCrankFixture(), welded: [], slider: true },
  { name: 'slide', fixture: scotchYokeFixture(), welded: ['C'], slider: true },
];

describe('every cell of the 2x2', () => {
  it('round-trips its flags through the URL', () => {
    for (const cell of CELLS) {
      const decoder = new StringTranscoder();
      decoder.decodeURL(fixturePayload(cell.fixture));

      const weldedIds = decoder
        .getJoints()
        .filter((joint) => joint.isWelded)
        .map((joint) => joint.id);
      expect(weldedIds, `${cell.name}: welded joints`).toEqual(cell.welded);

      const hasPrismatic = decoder.getJoints().some((joint) => joint.type === 0);
      expect(hasPrismatic, `${cell.name}: has a slider`).toBe(cell.slider);
    }
  });

  it('re-encodes byte-identically after a decode', () => {
    // The pair is two independent records, so an encoder that dropped one would
    // still produce a URL that decodes -- just to a different mechanism.
    for (const cell of CELLS) {
      const first = fixturePayload(cell.fixture);
      const decoder = new StringTranscoder();
      decoder.decodeURL(first);
      expect(decoder.encodeURL(), `${cell.name}`).toBe(first);
    }
  });
});

describe('a Slide across the per-timestep copies', () => {
  it('keeps the flag and its block at the last timestep, not just the first', () => {
    // cloneJointAt copies isWelded, but the flag alone does not mean "Slide" --
    // the pairing with a block does. A copy path that kept one and lost the
    // other would leave a welded joint the reconcile rules would then strip.
    const built = buildMechanism(scotchYokeFixture());
    const last = built.mechanism.joints.length - 1;

    for (const step of [0, 1, Math.floor(last / 2), last]) {
      const joints = built.mechanism.joints[step];
      const links = built.mechanism.links[step];
      const c = joints.find((joint) => joint.id === 'C') as RealJoint;
      expect(c.isWelded, `flag at step ${step}`).toBe(true);

      // Rebind links the way the solvers see them, then resolve.
      const assembly = slideAssemblyAt(c);
      expect(assembly, `assembly at step ${step}`).toBeDefined();
      expect(assembly!.block, `block at step ${step}`).toBeInstanceOf(SliderBlock);
      expect(links, `block is a body at step ${step}`).toContain(assembly!.block);
      expect(assembly!.riders[0], `rider at step ${step}`).toBeInstanceOf(RealLink);
      // §2.10 item 2: the pair stays coincident at every timestep.
      const slider = joints.find((joint) => joint.id === 'F') as PrisJoint;
      expect(slider.x, `coincident x at step ${step}`).toBeCloseTo(c.x, 9);
      expect(slider.y, `coincident y at step ${step}`).toBeCloseTo(c.y, 9);
    }
  });
});
