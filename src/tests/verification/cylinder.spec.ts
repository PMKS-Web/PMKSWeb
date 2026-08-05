import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { describeCylinder, resolveCylinder } from '../../app/model/cylinder';
import { MARK } from '../../app/model/joint-marks';
import { SettingsService } from '../../app/services/settings.service';
import { MODEL_SCALE } from '../../app/model/render-scale';

// Geometry is built in internal model units (user units x MODEL_SCALE) so the
// shape-to-mark proportions match what the app actually renders. Options that
// are already model-unit quantities (derived from objectScale) pass through.
const S = MODEL_SCALE;

// §2.7. A piston is not a new joint type -- it is a Slide whose rod and barrel
// happen to line up, drawn as the part an engineer would recognise. The test is
// therefore the shape, not a flag, and everything that is not that shape has to
// keep the ordinary block-in-a-channel drawing.

/**
 * Barrel M--N along the x axis with a bore, a block welded at P, and a rod
 * reaching out to T on the far side of P from N.
 */
function piston(options: { rodAt?: [number, number]; barrelFarAt?: [number, number] } = {}) {
  const [rodX, rodY] = options.rodAt ?? [6 * S, 0];
  const [barX, barY] = options.barrelFarAt ?? [-8 * S, 0];

  const m = new RevJoint('M', barX, barY);
  const n = new RevJoint('N', -1 * S, 0);
  const p = new RevJoint('P', 0, 0);
  const t = new RevJoint('T', rodX, rodY);
  const slider = new PrisJoint('S', 0, 0);

  const barrel = new RealLink('MN', [m, n], 1, 1);
  const rod = new RealLink('PT', [p, t], 1, 1);
  const block = new SliderBlock('PS', [p, slider], 1);

  [m, n].forEach((joint) => joint.links.push(barrel));
  [p, t].forEach((joint) => joint.links.push(rod));
  p.links.push(block);
  slider.links.push(block);
  p.isWelded = true;
  slider.slideOn(barrel, m, n);

  return { p, t, m, n, slider, barrel, rod, block };
}

describe('recognising a cylinder', () => {
  it('sees a Slide whose rod and barrel line up', () => {
    const scene = piston();

    const found = resolveCylinder(scene.p);

    expect(found).toBeDefined();
    expect(found!.barrel.id).toBe('MN');
    expect(found!.rod.id).toBe('PT');
    expect(found!.rodFar.id).toBe('T');
    // The barrel's far end is the one further from the block, and it has to be
    // on the other side, or the rod would run out into thin air.
    expect(found!.barrelFar.id).toBe('M');
    // The inner end is the one the skin hides: it is buried where rod and
    // barrel overlap, while M and T are the mounts and have to stay visible.
    expect(found!.barrelNear.id).toBe('N');
  });

  it('declines a rod that is not on the slot line', () => {
    // A bent assembly drawn as a straight part would claim geometry the
    // mechanism does not have.
    expect(resolveCylinder(piston({ rodAt: [6 * S, 2 * S] }).p)).toBeUndefined();
  });

  it('declines a rod on the same side as the barrel', () => {
    // Both ends pointing the same way is not a piston; the ordinary channel
    // drawing is the honest one.
    expect(resolveCylinder(piston({ rodAt: [-6 * S, 0] }).p)).toBeUndefined();
  });

  it('declines a Slot — the rider has to be welded to the block', () => {
    const scene = piston();
    scene.p.isWelded = false;

    expect(resolveCylinder(scene.p)).toBeUndefined();
  });

  it('declines a grounded slider, which has no barrel to be', () => {
    const scene = piston();
    scene.slider.groundAt(0);

    expect(resolveCylinder(scene.p)).toBeUndefined();
  });

  it('declines a rod carrying more than one other joint', () => {
    // Three joints on the rod is a body with its own shape, and hiding it
    // inside a cylinder would lose a joint the user placed.
    const scene = piston();
    const extra = new RevJoint('U', 3 * S, 4 * S);
    scene.rod.joints.push(extra);
    extra.links.push(scene.rod);

    expect(resolveCylinder(scene.p)).toBeUndefined();
  });

  it('declines a barrel carrying more than two joints', () => {
    const scene = piston();
    const extra = new RevJoint('V', -4 * S, 3 * S);
    scene.barrel.joints.push(extra);
    extra.links.push(scene.barrel);

    expect(resolveCylinder(scene.p)).toBeUndefined();
  });

  it('tolerates a rod drawn by hand, not only one placed by arithmetic', () => {
    // At 1e-6 a piston could be opened from a URL and never built: nothing
    // placed with a mouse lands within a millionth of a unit of a line. Half a
    // block's width across is the bound, because anything inside that is behind
    // the block the skin draws over it.
    const inside = MARK.blockAcrossHalf * 0.15 * SettingsService.objectScale * 0.9;
    const outside = MARK.blockAcrossHalf * 0.15 * SettingsService.objectScale * 1.1;

    // `inside`/`outside` are objectScale-derived and so already model units.
    expect(resolveCylinder(piston({ rodAt: [6 * S, inside] }).p)).toBeDefined();
    expect(resolveCylinder(piston({ rodAt: [6 * S, outside] }).p)).toBeUndefined();
  });

  it('says what is missing when the shape does not qualify', () => {
    // The panel offers the picker to any Slide now, so the reason has to be
    // readable by someone who does not yet have a cylinder.
    const bent = describeCylinder(piston({ rodAt: [6 * S, 2 * S] }).p);

    expect(typeof bent).toBe('string');
    expect(bent).toContain('line up');
  });

  it('tolerates the float error a solved position carries', () => {
    // Positions come out of a numeric solve, so exact collinearity never
    // survives to the renderer. A test at machine epsilon would make the skin
    // flicker on and off between timesteps.
    const scene = piston({ rodAt: [6 * S, 1e-9] });

    expect(resolveCylinder(scene.p, 1e-6)).toBeDefined();
  });
});
