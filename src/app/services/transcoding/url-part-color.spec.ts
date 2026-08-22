import '../../model/joint';
import { Joint, RevJoint } from '../../model/joint';
import { Force } from '../../model/force';
import { Coord } from '../../model/coord';
import { DEFAULT_FORCE_COLOR } from '../../model/joint-colors';
import { Link, RealLink } from '../../model/link';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

/**
 * A part drawn in a colour of its own travels in the trailing section
 * the lock marks and the centre-of-mass anchors already share: a tagged
 * reference to an object the URL carries. Its tag is 'K', which none of the
 * others uses, and what follows is the family's id rather than a colour -- a
 * joint is drawn resting, pointed at and picked, and the URL names the set
 * rather than one member of it.
 *
 * It is in the URL rather than kept on this machine because undo and redo are
 * a stack of these strings -- a colour written anywhere else would be wiped by
 * the first undo -- and because which pin a reader is being pointed at is a
 * fact about the drawing, so a shared link should carry it.
 */

const S = MODEL_SCALE;

function source(colors: Record<string, string>) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * S, 0);
  const bar = new RealLink('AB', [a, b], 1, 1);
  [a, b].forEach((joint) => joint.links.push(bar));
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  [a, b].forEach((joint) => (joint.colorFamily = colors[joint.id] ?? ''));
  return { joints: [a, b], links: [bar], forces: [] as Force[] };
}

function encode(colors: Record<string, string>): string {
  return urlGeneratorFor(
    { ...source(colors), mechanismTimeStep: 0 } as unknown as MechanismService,
    new SettingsService()
  ).generateUrlQuery();
}

function decode(encoded: string): { joints: Joint[]; links: Link[] } {
  const decoder = new StringTranscoder();
  decoder.decodeURL(encoded);
  const target = {
    joints: [] as Joint[],
    links: [] as Link[],
    forces: [] as Force[],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(true);
  return target;
}

/** The URL minus its checksum character, which is a function of length alone. */
function body(encoded: string): string {
  return encoded.substring(0, encoded.length - 1);
}

const familyOf = (opened: { joints: Joint[] }, id: string) =>
  opened.joints.find((joint) => joint.id === id)!.colorFamily;

describe('a joint colour in the URL', () => {
  it('round-trips the family onto the joint it names', () => {
    const opened = decode(encode({ B: 'd' }));
    expect(familyOf(opened, 'B')).toBe('d');
    expect(familyOf(opened, 'A')).toBe('');
  });

  it('carries one entry per joint that has one', () => {
    const opened = decode(encode({ A: 'o', B: 'b' }));
    expect(familyOf(opened, 'A')).toBe('o');
    expect(familyOf(opened, 'B')).toBe('b');
  });

  it('writes nothing for the family every joint already wears', () => {
    // The bytes every URL in circulation already has: the section is written
    // only when there is something to say, and amber is what a joint says
    // nothing about.
    expect(body(encode({}))).not.toContain('.K');
    expect(body(encode({ B: '' }))).toBe(body(encode({})));
    expect(body(encode({ B: 'o' }))).toBe(body(encode({})) + '.KJB~o');
  });

  it('sits alongside lock marks without either reading the other', () => {
    const withBoth = source({ B: 'b' });
    withBoth.joints[0].locked = true;
    const encoded = urlGeneratorFor(
      { ...withBoth, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();

    expect(body(encoded)).toContain('.JA,KJB~b');
    const opened = decode(encoded);
    expect((opened.joints.find((joint) => joint.id === 'A') as RevJoint).locked).toBe(true);
    expect(familyOf(opened, 'B')).toBe('b');
    expect((opened.links[0] as RealLink).id).toBe('AB');
  });

  it('refuses a colour on a joint the URL does not carry', () => {
    // Fail closed, as the lock and anchor sections do: a reference that does
    // not resolve would otherwise decode as a colour quietly dropped, and the
    // reader would be looking at a different drawing than the one shared.
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode({ B: 'o' }).replace('KJB~', 'KJZ~'))).toThrow();
  });

  it('refuses a family this build does not have', () => {
    // Including the default's own empty id, which is never written: an entry
    // naming it is a URL saying nothing twice.
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode({ B: 'o' }).replace('~o', '~zz'))).toThrow();
    expect(() => decoder.decodeURL(encode({ B: 'o' }).replace('~o', '~'))).toThrow();
  });
});

describe('a force colour in the URL', () => {
  function loaded(color: string) {
    const parts = source({});
    const force = new Force('F1', parts.links[0] as RealLink, new Coord(0, 0), new Coord(S, S));
    force.color = color;
    return { ...parts, forces: [force] };
  }

  function encodeForce(color: string): string {
    return urlGeneratorFor(
      { ...loaded(color), mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();
  }

  it('round-trips the colour onto the force it names', () => {
    const opened = decode(encodeForce('#26A69A')) as unknown as { forces: Force[] };
    expect(opened.forces[0].color).toBe('#26A69A');
  });

  it('says nothing about a force drawn in the colour they all share', () => {
    // Including one that has been set to it by hand: what is written is the
    // difference from the default, not the fact that somebody opened a picker.
    expect(body(encodeForce(''))).not.toContain('.K');
    expect(body(encodeForce(DEFAULT_FORCE_COLOR))).toBe(body(encodeForce('')));
  });

  it('shares the section with a joint colour without either reading the other', () => {
    const both = loaded('#00695C');
    both.joints[1].colorFamily = 'd';
    const encoded = urlGeneratorFor(
      { ...both, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();

    // Written exactly as the palette spells it: the link records have
    // carried these six strings verbatim since long before this section, and a
    // colour that changed case between them would stop matching.
    expect(body(encoded)).toContain('.KJB~d,KFF1~00695C');
    const opened = decode(encoded) as unknown as { joints: Joint[]; forces: Force[] };
    expect(familyOf(opened, 'B')).toBe('d');
    expect(opened.forces[0].color).toBe('#00695C');
  });

  it('refuses a colour on a force the URL does not carry', () => {
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encodeForce('#26A69A').replace('KFF1~', 'KFZZ~'))).toThrow();
    expect(() => decoder.decodeURL(encodeForce('#26A69A').replace('~26A69A', '~teal'))).toThrow();
  });

  it('refuses a tag naming neither a joint nor a force', () => {
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encodeForce('#26A69A').replace('KFF1~', 'KXF1~'))).toThrow();
  });
});
