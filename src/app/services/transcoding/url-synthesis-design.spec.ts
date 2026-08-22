import { Coord } from '../../model/coord';
import { Force } from '../../model/force';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { MODEL_SCALE } from '../../model/render-scale';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { SynthesisBuilderService } from '../synthesis/synthesis-builder.service';
import { applySynthesisDesign } from '../synthesis/synthesis-url';
import { COR } from '../synthesis/synthesis-util';
import { designFor, urlGeneratorFor } from '../../../test-utils/url-encoding';
import { Checksum } from './checksum';
import { StringTranscoder } from './string-transcoder';

/**
 * A synthesis design in the URL.
 *
 * It rides in the trailing section the lock marks opened, under a tag of its
 * own, for the reason the mechanism is there: undo and redo are a stack of
 * these strings, so a design left out of them could not be undone, and a link
 * shared mid-design would open on an empty panel.
 *
 * The bargain the section was built on holds here too -- written only when
 * there is something to say, so a document with no design in progress encodes
 * to exactly the bytes it did before any of this existed.
 */

const S = MODEL_SCALE;

/** A four-bar to hang the design off, so the URL is a real one. */
function drawing() {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  return {
    joints: [a, b],
    links: [bar],
    forces: [] as Force[],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

function encode(design?: SynthesisBuilderService): string {
  return urlGeneratorFor(drawing(), new SettingsService(), design).generateUrlQuery();
}

/** Decode a URL and hand its design to a fresh, empty one. */
function decodeInto(url: string): SynthesisBuilderService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(url);
  const restored = designFor(new SettingsService());
  applySynthesisDesign(decoder.getSynthesisMarks(), restored);
  return restored;
}

/** A design with three positions placed and every requirement moved off default. */
function worked(): SynthesisBuilderService {
  const design = designFor(new SettingsService());
  design.stage = 'working';
  design.length = 6.25 * S;
  design.applyDecoded({
    length: 6.25 * S,
    reference: COR.FRONT,
    endsOnly: false,
    allowDefect: true,
    constrain: true,
    stage: 'working',
    poses: [
      { at: new Coord(-2.5 * S, 1.25 * S), thetaDegrees: 12.5 },
      { at: new Coord(4 * S, 2 * S), thetaDegrees: -37 },
      { at: new Coord(7 * S, 7.5 * S), thetaDegrees: 61.25 },
    ],
    region: { x: -3 * S, y: -8 * S, w: 14 * S, h: 9 * S },
    ownedJointIds: ['E', 'F', 'G', 'H'],
  });
  return design;
}

describe('a synthesis design in the URL', () => {
  it('adds nothing at all when no design has been started', () => {
    expect(encode(designFor(new SettingsService()))).toBe(encode());
  });

  it('brings back the three positions exactly as they were placed', () => {
    const restored = decodeInto(encode(worked()));
    const poses = restored.getAllPoses();
    expect(poses.length).toBe(3);
    expect(poses[0].position.x).toBeCloseTo(-2.5 * S, 3);
    expect(poses[0].position.y).toBeCloseTo(1.25 * S, 3);
    expect(poses[0].thetaDegrees).toBeCloseTo(12.5, 3);
    expect(poses[1].thetaDegrees).toBeCloseTo(-37, 3);
    expect(poses[2].position.x).toBeCloseTo(7 * S, 3);
    expect(poses[2].thetaDegrees).toBeCloseTo(61.25, 3);
  });

  it('brings back the coupler, the reference point and the screen', () => {
    const restored = decodeInto(encode(worked()));
    expect(restored.length).toBeCloseTo(6.25 * S, 3);
    expect(restored.COR).toBe(COR.FRONT);
    expect(restored.stage).toBe('working');
  });

  it('brings back what a solution has to satisfy', () => {
    const restored = decodeInto(encode(worked()));
    expect(restored.endsOnly).toBe(false);
    expect(restored.allowDefect).toBe(true);
    expect(restored.constrain).toBe(true);
  });

  it('brings back the region, but only because it is required', () => {
    const restored = decodeInto(encode(worked()));
    expect(restored.region.x).toBeCloseTo(-3 * S, 3);
    expect(restored.region.y).toBeCloseTo(-8 * S, 3);
    expect(restored.region.w).toBeCloseTo(14 * S, 3);
    expect(restored.region.h).toBeCloseTo(9 * S, 3);

    const unconstrained = worked();
    unconstrained.constrain = false;
    expect(encode(unconstrained)).not.toContain('SR~');
  });

  it('carries fewer than three positions while one is still being placed', () => {
    const partial = designFor(new SettingsService());
    partial.stage = 'working';
    partial.placeAngleDeg = 30;
    partial.placePose(new Coord(1 * S, 2 * S));
    const restored = decodeInto(encode(partial));
    expect(restored.getAllPoses().length).toBe(1);
    expect(restored.getAllPoses()[0].position.y).toBeCloseTo(2 * S, 3);
  });

  it('brings back the joints the design owns on the grid', () => {
    const restored = decodeInto(encode(worked()));
    expect(restored.ownedJointIds).toEqual(['E', 'F', 'G', 'H']);
  });

  it('says nothing about ownership when the design has inserted nothing', () => {
    const nothingInserted = worked();
    nothingInserted.ownedJointIds = [];
    expect(encode(nothingInserted)).not.toContain('SO~');
  });

  it('clears a design that the URL being read does not have', () => {
    const restored = worked();
    applySynthesisDesign([], restored);
    expect(restored.getAllPoses().length).toBe(0);
    expect(restored.stage).toBe('chooser');
    expect(restored.endsOnly).toBe(true);
    expect(restored.ownedJointIds).toEqual([]);
  });

  it('refuses a URL whose design is incomplete rather than half-reading it', () => {
    const url = encode(worked());
    // Run a position's last two numbers together, so it carries two fields
    // where it should carry three. The edit is one character for one character
    // -- the checksum is over the length, and a URL that fails that would fail
    // for a reason that says nothing about this section.
    const broken = url.replace(/(SP~[^~,]+~[^~,]+)~/, '$1-');
    expect(broken).not.toBe(url);
    expect(broken.length).toBe(url.length);
    expect(() => decodeInto(broken)).toThrowError(/incomplete synthesis entry/);
  });

  it('refuses a number it cannot read, rather than substituting a default', () => {
    const url = encode(worked());
    // One character of the coupler length replaced by something outside the
    // number alphabet. It used to decode as -1 and be absorbed silently: the
    // three positions came back intact around a coupler that was not the one
    // that had been shared, which is a half-load wearing the face of a success.
    const broken = url.replace(/SD~([^~,])/, 'SD~$');
    expect(broken).not.toBe(url);
    expect(broken.length).toBe(url.length);
    expect(() => decodeInto(broken)).toThrowError(/unreadable synthesis number/);
  });

  it('refuses a design that describes itself twice', () => {
    const url = encode(worked());
    // Doubled, and then given the checksum that length deserves. The checksum
    // is the first thing decode looks at, so without this the URL was rejected
    // for being the wrong length and `toThrow()` passed on an error that would
    // still be raised with the duplicate rule deleted.
    const body = url.slice(0, -1).replace(/(SD~[^,]+)/, '$1,$1');
    const doubled = body + new Checksum().generateChecksum(body.length);
    expect(() => decodeInto(doubled)).toThrowError(/repeats a synthesis entry/);
  });

  it('refuses an entry it does not recognise', () => {
    const url = encode(worked());
    expect(() => decodeInto(url.replace('SD~', 'SZ~'))).toThrowError(/unknown synthesis entry/);
  });
});
