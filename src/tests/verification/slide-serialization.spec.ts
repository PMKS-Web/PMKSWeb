// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { slideAssemblyAt } from '../../app/model/slide-assembly';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SettingsService } from '../../app/services/settings.service';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
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

/**
 * The joints, links, forces and selection — everything but the global-settings
 * prefix and the trailing checksum, which move for reasons unrelated to the
 * 2x2 (see template-url.spec.ts).
 */
function mechanismSection(payload: string): string {
  return payload.slice(0, -1).split('.').slice(4).join('.');
}

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

  it('rebuilds into model objects and re-encodes byte-identically', () => {
    // Through MechanismBuilder, not just the transcoder. Decoding and
    // re-encoding the same transcoder barely leaves the codec: it would pass
    // with the model side of the pairing entirely broken. What has to survive
    // is the trip out to real Joint and Link objects and back.
    for (const cell of CELLS) {
      const first = fixturePayload(cell.fixture);
      const rebuilt = buildMechanismFixture(first);

      const reencoded = new UrlGenerationService(
        rebuilt.service,
        rebuilt.settings,
        new ActiveObjService()
      ).generateUrlQuery();
      expect(mechanismSection(reencoded), `${cell.name}`).toBe(mechanismSection(first));
    }
  });

  it('rebuilds a Slide that the reconcile pass then leaves alone', () => {
    // A rebuilt Slide has a weld flag and no compound, which is exactly the
    // shape the strip rule looks for. It must recognise the assembly instead.
    const { service, active } = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(scotchYokeFixture()));
    new MechanismBuilder(service, decoder, new SettingsService(), active).build(true);
    const welded = service.joints.find((joint) => joint.id === 'C') as RealJoint;

    expect(welded.isWelded).toBe(true);
    expect(slideAssemblyAt(welded)).toBeDefined();

    service.finishStructuralEdit(false);

    expect(welded.isWelded, 'survives a reconcile').toBe(true);
    expect(slideAssemblyAt(welded)).toBeDefined();
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
