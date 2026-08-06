import '../../model/joint';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { UrlGenerationService } from '../url-generation.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { Checksum } from './checksum';
import { MODEL_SCALE } from '../../model/render-scale';

// §5.2. A driven prismatic joint's speed is length per second, which is not the
// rotational speed in another unit — it has its own setting, its own default,
// and its own place in the URL. The interesting half of that is the URLs
// written before it existed, which have to keep opening.

const S = MODEL_SCALE;

/** Any linkage at all: this file is about the settings, not the geometry. */
function source() {
  const a = new RevJoint('A', 0, 0, false, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return { joints: [a, b], links: [bar], forces: [] };
}

function encodeWith(settings: SettingsService): string {
  return new UrlGenerationService(
    { ...source(), mechanismTimeStep: 0 } as unknown as MechanismService,
    settings,
    new ActiveObjService()
  ).generateUrlQuery();
}

function decodeInto(encoded: string, settings: SettingsService): void {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true);
}

/**
 * The same URL as it would have been written before LINEAR_INPUT_SPEED existed:
 * one decimal setting instead of two. The checksum covers the string's length,
 * so it has to be re-stamped or the decoder rejects the URL for the wrong
 * reason and the test passes without testing anything.
 */
function asLegacyUrl(encoded: string): string {
  const body = encoded.substring(0, encoded.length - 1);
  const parts = body.split('.');
  parts[1] = parts[1].split(',').slice(0, -1).join(',');
  const legacy = parts.join('.');
  return legacy + new Checksum().generateChecksum(legacy.length);
}

describe('linear input speed in the URL', () => {
  it('round-trips a speed nobody could express in RPM', () => {
    const written = new SettingsService();
    written.linearInputSpeed.next(3.5);

    const read = new SettingsService();
    decodeInto(encodeWith(written), read);

    expect(read.linearInputSpeed.value).toBe(3.5);
  });

  it('keeps the rotational speed separate from it', () => {
    // The two settings are different quantities. Writing one must not be
    // readable as the other, which is exactly what sharing a single field did.
    const written = new SettingsService();
    written.inputSpeed.next(42);
    written.linearInputSpeed.next(3.5);

    const read = new SettingsService();
    decodeInto(encodeWith(written), read);

    expect(read.inputSpeed.value).toBe(42);
    expect(read.linearInputSpeed.value).toBe(3.5);
  });

  it('opens a URL written before the setting existed, at the default', () => {
    const written = new SettingsService();
    written.linearInputSpeed.next(3.5);
    const legacy = asLegacyUrl(encodeWith(written));

    const read = new SettingsService();
    const fresh = new SettingsService().linearInputSpeed.value;
    decodeInto(legacy, read);

    expect(read.linearInputSpeed.value).toBe(fresh);
  });

  it('leaves everything else in a legacy URL exactly where it was', () => {
    // The missing token is at the end of the decimal section, so a decoder that
    // mis-handled it would shift the object scale — the other decimal — and the
    // whole mechanism would open at the wrong size.
    const written = new SettingsService();
    // Read rather than assumed: objectScale is a static the whole suite shares.
    const scaleBefore = SettingsService.objectScale;
    const legacy = asLegacyUrl(encodeWith(written));

    const read = new SettingsService();
    decodeInto(legacy, read);

    expect(SettingsService.objectScale).toBeCloseTo(scaleBefore, 6);
  });
});
