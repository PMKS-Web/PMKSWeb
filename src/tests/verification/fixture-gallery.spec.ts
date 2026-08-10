// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FIXTURE_GALLERY,
  fixturePayload,
  galleryMarkdown,
} from '../../test-utils/verification/fixture-gallery';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { PrisJoint, RealJoint } from '../../app/model/joint';

// docs/fixture-urls.md is generated, not written. This spec is what keeps it
// honest: adding a fixture without regenerating fails here rather than leaving
// a table that quietly omits the newest mechanism.
//
// Run `npm run fixture-urls` to regenerate.

const GALLERY_PATH = resolve(__dirname, '../../../docs/fixture-urls.md');
const DEFAULT_BASE_URL = 'https://app.pmksplus.com';

/** A bare stand-in for the service the builder fills and the encoder reads. */
function emptyMechanism(): MechanismService {
  return { joints: [], links: [], forces: [], mechanismTimeStep: 0 } as unknown as MechanismService;
}

function rebuild(payload: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  const target = emptyMechanism();
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

function encode(mechanism: MechanismService): string {
  return new UrlGenerationService(
    mechanism,
    new SettingsService(),
    new ActiveObjService()
  ).generateUrlQuery();
}

/**
 * Everything about a mechanism that a share URL is supposed to carry, in a
 * form two of them can be compared by.
 *
 * Positions are rounded to the codec's own resolution. It stores user units to
 * three decimals, and a value that lands exactly between two steps may round
 * either way on a second pass; comparing any finer would fail on arithmetic
 * rather than on meaning.
 */
function describeMechanism(mechanism: MechanismService) {
  const place = (value: number) => Math.round(value * 100) / 100;
  return {
    joints: mechanism.joints
      .map((joint) => {
        const real = joint as RealJoint;
        return [
          joint.id,
          joint instanceof PrisJoint ? 'slider' : 'pin',
          place(joint.x),
          place(joint.y),
          real.ground ? 'ground' : '',
          real.input ? 'input' : '',
          joint instanceof PrisJoint && joint.isSealed ? 'sealed' : '',
          // The slot a slider runs in: which body carries it and between which
          // two joints. This is the part of a URL that a floating slot lives or
          // dies by, and the part a plain payload comparison would not notice.
          joint instanceof PrisJoint
            ? [
                joint.carrier?.id ?? '',
                joint.slotJointA?.id ?? '',
                joint.slotJointB?.id ?? '',
              ].join('/')
            : '',
        ].join(':');
      })
      .sort(),
    links: mechanism.links
      .map(
        (link) =>
          `${link.id}[${link.joints
            .map((joint) => joint.id)
            .sort()
            .join('')}]`
      )
      .sort(),
    forces: mechanism.forces.map((force) => force.id).sort(),
  };
}

describe('the published fixture gallery', () => {
  it('round-trips every fixture through the URL codec', () => {
    // A link nobody can open is worse than no link, and the codec refuses a
    // malformed slot rather than repairing it — so decoding is the real check.
    for (const entry of FIXTURE_GALLERY) {
      const payload = fixturePayload(entry.fixture);
      const decoder = new StringTranscoder();
      expect(() => decoder.decodeURL(payload), entry.name).not.toThrow();
      expect(decoder.getJoints().length, entry.name).toBe(
        entry.fixture.joints.length +
          (entry.fixture.sliders?.length ?? 0) +
          (entry.fixture.slider ? 1 : 0)
      );
    }
  });

  it('re-encodes every fixture to a URL that means the same mechanism', () => {
    // The check above starts from a payload the gallery generated. This one
    // starts from a mechanism the app is *holding*: decode, then ask the
    // encoder for a URL the way the Share button does, and decode that. It is
    // the round trip a user makes by opening a link and sharing it onward,
    // and the half of it that reads live state has no other coverage.
    //
    // A loop over an empty list passes and proves nothing, so say how many.
    expect(FIXTURE_GALLERY.length).toBeGreaterThan(20);
    for (const entry of FIXTURE_GALLERY) {
      const opened = rebuild(fixturePayload(entry.fixture));
      const shared = rebuild(encode(opened));
      expect(describeMechanism(shared), entry.name).toEqual(describeMechanism(opened));
    }
  });

  it('carries the slot tokens for exactly the floating-slot mechanisms', () => {
    for (const entry of FIXTURE_GALLERY) {
      const decoder = new StringTranscoder();
      decoder.decodeURL(fixturePayload(entry.fixture));
      const carried = decoder.getJoints().some((joint) => joint.carrierID !== '');
      expect(carried, entry.name).toBe(entry.floatingSlot);
    }
  });

  it('matches the generated file that is checked in', () => {
    const markdown = galleryMarkdown(process.env['PMKS_FIXTURE_BASE_URL'] ?? DEFAULT_BASE_URL);
    if (process.env['PMKS_WRITE_FIXTURE_URLS']) {
      writeFileSync(GALLERY_PATH, markdown);
      return;
    }
    expect(readFileSync(GALLERY_PATH, 'utf8'), 'run `npm run fixture-urls`').toBe(markdown);
  });
});
