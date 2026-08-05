import '../../model/joint';
import { Coord } from '../../model/coord';
import { PrisJoint, RevJoint } from '../../model/joint';
import { RealLink, SliderBlock } from '../../model/link';
import {
  cylinderCollinearTolerance,
  sealedCylinderAt,
  sealedCylinders,
} from '../../model/cylinder';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { UrlGenerationService } from '../url-generation.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { MODEL_SCALE } from '../../model/render-scale';

// Models are built in internal model units (user units x MODEL_SCALE) so the
// encoded URLs carry the same user-unit numbers they always have.
const S = MODEL_SCALE;

function targetService(): MechanismService {
  return {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

/**
 * A sealed cylinder tilted off the axes, so the codec's 3-decimal user-unit
 * quantization actually perturbs the collinearity it has to preserve.
 * Proportions mirror the fixture gallery's hydraulic cylinder.
 */
function sealedSource(options: { sealed?: boolean; angle?: number } = {}) {
  const angle = options.angle ?? 0.31; // radians, deliberately irrational-ish
  const at = (along: number) => new Coord(along * Math.cos(angle) * S, along * Math.sin(angle) * S);

  const a = new RevJoint('A', at(-4).x, at(-4).y, false, true);
  const b = new RevJoint('B', at(-1).x, at(-1).y);
  const c = new RevJoint('C', at(0).x, at(0).y);
  const d = new RevJoint('D', at(4).x, at(4).y);
  const slider = new PrisJoint('P', c.x, c.y);
  slider.isSealed = options.sealed ?? true;

  const barrel = new RealLink('AB', [a, b], 1, 1);
  const rod = new RealLink('CD', [c, d], 1, 1);
  const block = new SliderBlock('CP', [c, slider], 1);

  [a, b].forEach((joint) => joint.links.push(barrel));
  [c, d].forEach((joint) => joint.links.push(rod));
  c.links.push(block);
  slider.links.push(block);
  c.isWelded = true;
  slider.slideOn(barrel, a, b);
  c.connectedJoints.push(d, slider);
  d.connectedJoints.push(c);
  a.connectedJoints.push(b);
  b.connectedJoints.push(a);
  slider.connectedJoints.push(c);

  return {
    joints: [a, b, c, d, slider],
    links: [barrel, rod, block],
    forces: [],
    slider,
    pin: c,
  };
}

function encode(source: ReturnType<typeof sealedSource>): string {
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

describe('sealed cylinder URL round-trip', () => {
  it('keeps the sealed bit through encode → decode → rebuild', () => {
    const target = rebuild(encode(sealedSource()));

    const slider = target.joints.find((joint) => joint.id === 'P') as PrisJoint;
    expect(slider.isSealed).toBe(true);
    expect(slider.isFloating).toBe(true);
  });

  it('still qualifies geometrically after quantization, with room to spare', () => {
    const target = rebuild(encode(sealedSource()));

    const pin = target.joints.find((joint) => joint.id === 'C')!;
    const found = sealedCylinderAt(pin);
    expect(found).toBeDefined();
    expect(found!.barrel.id).toBe('AB');
    expect(found!.rod.id).toBe('CD');

    // The codec rounds to 1/1000 of a user unit, so a decoded joint can sit at
    // most ~5e-4 user units off the slot line. The collinearity tolerance is
    // ~0.23 user units — three orders of magnitude of headroom, so a cylinder
    // can never decode into a shape that has stopped qualifying.
    const slider = found!.slider;
    const angle = slider.slotAngle;
    const across = (point: { x: number; y: number }) =>
      Math.abs(-(point.x - pin.x) * Math.sin(angle) + (point.y - pin.y) * Math.cos(angle));
    const worst = Math.max(...[found!.rodFar, found!.barrelFar, found!.barrelNear].map(across));
    const quantizationBound = 0.002 * S; // a few rounding steps, generously
    expect(worst).toBeLessThanOrEqual(quantizationBound);
    expect(quantizationBound).toBeLessThan(cylinderCollinearTolerance() / 20);
  });

  it('leaves an unsealed welded slide unsealed — and unskinned', () => {
    const target = rebuild(encode(sealedSource({ sealed: false })));

    const slider = target.joints.find((joint) => joint.id === 'P') as PrisJoint;
    expect(slider.isSealed).toBe(false);
    // A plain slide never skins any more: sealed ⇔ skinned.
    expect(sealedCylinders(target.joints)).toHaveLength(0);
  });

  it('rejects a URL that seals a joint that is not a floating slider', () => {
    const source = sealedSource();
    // Ground the slider: sealed no longer describes a cylinder's pin.
    source.slider.groundAt(0);

    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(encode(source))).toThrow(
      /seals a joint that is not a floating slider/
    );
  });
});
