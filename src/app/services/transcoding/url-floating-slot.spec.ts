import '../../model/joint';
import { Coord } from '../../model/coord';
import { PrisJoint, RevJoint } from '../../model/joint';
import { RealLink, SliderBlock } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { UrlGenerationService } from '../url-generation.service';
import { Checksum } from './checksum';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';

function withChecksum(raw: string): string {
  return raw + new Checksum().generateChecksum(raw.length);
}

function targetService(): MechanismService {
  return {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

/**
 * A crank AB driving a block that slides in a slot cut along the lever CD —
 * the inverted slider-crank shape, and the smallest thing that exercises all
 * three tokens.
 */
function invertedSliderCrank() {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 1, 0);
  const c = new RevJoint('C', 3, 0, false, true);
  const d = new RevJoint('D', 3, 2);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0.5, 0));
  const cd = new RealLink('CD', [c, d], 1, 1, new Coord(3, 1));

  const slot = new PrisJoint('P', 1, 0);
  slot.slideOn(cd, c, d);
  const block = new SliderBlock('BP', [b, slot], 1);

  [a, b].forEach((joint) => (joint.links = [ab]));
  [c, d].forEach((joint) => (joint.links = [cd]));
  b.links.push(block);
  slot.links = [block];
  a.connectedJoints = [b];
  b.connectedJoints = [a, slot];
  c.connectedJoints = [d];
  d.connectedJoints = [c];
  slot.connectedJoints = [b];

  return { joints: [a, b, c, d, slot], links: [ab, cd, block], forces: [], slot };
}

function encode(source: { joints: unknown; links: unknown; forces: unknown }): string {
  return new UrlGenerationService(
    { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService(),
    new ActiveObjService()
  ).generateUrlQuery();
}

function rebuild(encoded: string): MechanismService {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = targetService();
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(false);
  return target;
}

describe('floating slot URL round-trip', () => {
  it('restores the carrier and both slot joints as the rebuilt objects', () => {
    const target = rebuild(encode(invertedSliderCrank()));

    const slot = target.joints.find((joint) => joint.id === 'P') as PrisJoint;
    const carrier = target.links.find((link) => link.id === 'CD')!;
    expect(slot.isFloating).toBe(true);
    // Identity, not just id: a slot bound to objects from a different copy of
    // the mechanism reads positions that never move.
    expect(slot.carrier).toBe(carrier);
    expect(slot.slotJointA).toBe(target.joints.find((joint) => joint.id === 'C'));
    expect(slot.slotJointB).toBe(target.joints.find((joint) => joint.id === 'D'));
    expect(slot.isSlotWellFormed).toBe(true);
  });

  it('carries the slot direction rather than a stored angle', () => {
    const target = rebuild(encode(invertedSliderCrank()));
    const slot = target.joints.find((joint) => joint.id === 'P') as PrisJoint;

    // C is at (3,0) and D at (3,2), so the slot points straight up — a value
    // that was never encoded anywhere, only re-derived.
    expect(slot.slotAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(slot.angle_rad).toBe(0);
  });

  it('writes no slot tokens for a grounded slider', () => {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 0);
    const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0.5, 0));
    const slot = new PrisJoint('P', 1, 0, false, true);
    slot.angle_rad = Math.PI / 6;
    const block = new SliderBlock('BP', [b, slot], 1);
    a.links = [ab];
    b.links = [ab, block];
    slot.links = [block];

    const encoded = encode({ joints: [a, b, slot], links: [ab, block], forces: [] });
    const slotRecord = encoded.split('.').find((record) => record.split(',')[1] === 'P')!;

    // Five tokens, exactly as before floating slots existed. A grounded slider
    // that grew three empty tokens would still decode, but every shared URL
    // would silently get longer.
    expect(slotRecord.split(',')).toHaveLength(5);

    const target = rebuild(encoded);
    const rebuilt = target.joints.find((joint) => joint.id === 'P') as PrisJoint;
    expect(rebuilt.isFloating).toBe(false);
    // Three decimals is all the URL stores. A floating slot has no such loss:
    // it re-derives its angle from coordinates instead of carrying a number.
    expect(rebuilt.slotAngle).toBeCloseTo(Math.PI / 6, 3);
  });

  it('reads a URL written before slots existed as a grounded slider', () => {
    // Strip the three tokens off a floating slot and what is left is exactly
    // the record shape every previously shared URL has.
    const encoded = encode(invertedSliderCrank());
    const legacy = withChecksum(encoded.slice(0, -1).replace(',CD,C,D', ''));

    const target = rebuild(legacy);
    const slot = target.joints.find((joint) => joint.id === 'P') as PrisJoint;

    expect(slot.isFloating).toBe(false);
    expect(slot.carrier).toBeUndefined();
    expect(slot.slotAngle).toBe(0);
  });
});

describe('floating slot decode validation', () => {
  function corrupt(replace: (raw: string) => string): () => void {
    const encoded = encode(invertedSliderCrank());
    const raw = replace(encoded.slice(0, -1));
    return () => new StringTranscoder().decodeURL(withChecksum(raw));
  }

  it('refuses a slot that has lost one of its three tokens', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',CD,C'))).toThrow(
      /missing its carrier or slot joints/
    );
  });

  it('refuses a slot whose carrier does not exist', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',ZZ,C,D'))).toThrow(/carrier link is missing/);
  });

  it('refuses a slot whose defining joint does not exist', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',CD,C,Q'))).toThrow(
      /defining joints are missing/
    );
  });

  it('refuses a slot defined by one joint named twice', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',CD,C,C'))).toThrow(/one joint twice/);
  });

  it('refuses defining joints that are not on the carrier', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',AB,C,D'))).toThrow(/not on its carrier/);
  });

  it('refuses a slot defined by the sliding joint itself', () => {
    expect(corrupt((raw) => raw.replace(',CD,C,D', ',CD,C,P'))).toThrow(
      /defined by the sliding joint itself/
    );
  });

  it('builds no mechanism at all from a broken slot', () => {
    // The failure §2.4a exists to prevent: a half-decoded slot reaching the
    // builder and coming out as a working grounded slider, which moves
    // differently from the mechanism that was actually shared.
    const encoded = encode(invertedSliderCrank());
    const raw = withChecksum(encoded.slice(0, -1).replace(',CD,C,D', ',CD,C'));
    const target = targetService();

    expect(() => {
      const decoder = new StringTranscoder();
      decoder.decodeURL(raw);
      new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
        false
      );
    }).toThrow();

    expect(target.joints).toEqual([]);
    expect(target.links).toEqual([]);
  });
});
