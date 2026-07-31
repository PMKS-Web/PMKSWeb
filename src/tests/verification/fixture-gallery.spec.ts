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

// docs/fixture-urls.md is generated, not written. This spec is what keeps it
// honest: adding a fixture without regenerating fails here rather than leaving
// a table that quietly omits the newest mechanism.
//
// Run `npm run fixture-urls` to regenerate.

const GALLERY_PATH = resolve(__dirname, '../../../docs/fixture-urls.md');
const DEFAULT_BASE_URL = 'https://app.pmksplus.com';

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
