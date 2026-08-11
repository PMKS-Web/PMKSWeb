// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MARK } from '../../app/model/joint-marks';
import { SliderMarkService } from '../../app/services/slider-mark.service';
import { SettingsService } from '../../app/services/settings.service';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MODEL_SCALE } from '../../app/model/render-scale';

// Geometry is built in internal model units (user units x MODEL_SCALE) so the
// link-to-mark proportions match what the app actually renders; R is
// objectScale-derived and therefore already a model-unit size.
const S = MODEL_SCALE;

/**
 * A Slide is one body, so its plate has to be one outline.
 *
 * What it replaced was four shapes at three different widths: a capsule fitted
 * to the rider, the block laid over it, and two fillet wedges patched into the
 * internal angles. Each seam between them showed through the plate's own alpha,
 * and the capsule was 10% wider than the rider it stood for, so the plate
 * haloed every link it was drawn over. These assert the properties that made
 * that visible rather than the path text, which a union is free to write any
 * number of ways.
 */

/**
 * The joint radius every mark is a multiple of, read when it is used.
 *
 * Frozen at import instead, it was whatever the drawing scale happened to be
 * when this file was first loaded — which is a different number from the one
 * the marks are actually built at, the moment anything resets the scale between
 * the two. The assertions then compare a real geometry against a stale ruler.
 */
const radius = () => 0.15 * SettingsService.objectScale;

/** A---B, with a slider at B riding on AB, optionally welded. `at` is in user units. */
function slide(welded: boolean, at = { x: 3, y: 0 }) {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', at.x * S, at.y * S);
  const c = new RevJoint('C', at.x * 2 * S, at.y * 2 * S);
  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints
        .filter((other) => other !== joint)
        .forEach((other) => joint.connectedJoints.push(other));
    });
    return link;
  };
  const ab = wire('AB', [a, b]);
  harness.service.joints = [a, b, c];
  harness.service.links = [ab, wire('BC', [b, c])];

  harness.active.updateSelectedObj(c);
  harness.service.toggleSlider();
  const slider = harness.service.joints.find(
    (joint): joint is PrisJoint => joint instanceof PrisJoint
  )!;
  slider.slideOn(ab, a, b);
  if (welded) {
    harness.active.updateSelectedObj(c);
    harness.service.weldJoint();
  }
  harness.service.finishStructuralEdit(false);
  return harness;
}

function plateOf(welded: boolean, at?: { x: number; y: number }) {
  const harness = slide(welded, at);
  const marks = new SliderMarkService().marks(harness.service.joints, radius());
  return marks[0]?.plate;
}

/** Every subpath of a path string, split on its move commands. */
function subpaths(path: string): string[] {
  return path
    .split(/(?=M)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function points(path: string): [number, number][] {
  const found: [number, number][] = [];
  for (const [, command, body] of path.matchAll(/([MLQA])([^MLQAZ]*)/g)) {
    const values = (body.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
    // An arc carries five parameters before its endpoint; a quadratic carries a
    // control point first. Taking the last pair is right for all of them.
    if (values.length >= 2) found.push([values[values.length - 2], values[values.length - 1]]);
    if (command === 'Q' && values.length >= 4) found.push([values[0], values[1]]);
  }
  return found;
}

describe('the weld plate', () => {
  it('fuses rider and block into a single closed outline', () => {
    const plate = plateOf(true);

    expect(plate).toBeDefined();
    // One ring. Two would mean the union failed and the rider and the block
    // were emitted side by side -- which under even-odd fill subtracts their
    // overlap and punches a hole through the joint they share.
    expect(subpaths(plate!.path).length).toBe(1);
  });

  it('is exactly as wide as the rider it stands in for', () => {
    // The rider runs along the slot here, so across the frame the plate is the
    // wider of the rider (2 x barHalf) and the block (2 x blockAcrossHalf), and
    // the rider wins. A capsule fitted at the old 1.84R would read 0.276
    // against the link's own 0.25 and stand proud of it all the way round.
    const plate = plateOf(true);
    const across = points(plate!.path).map(([, y]) => Math.abs(y));

    expect(Math.max(...across)).toBeCloseTo(MARK.barHalf * radius(), 2);
    expect(MARK.barHalf * radius()).toBeGreaterThan(MARK.blockAcrossHalf * radius());
  });

  it('reaches the far joint of the rider it stands in for', () => {
    // The rider is BC, running from the pin back toward B and on to its own far
    // end 3 units away, so the plate ends there plus the bar's half-width --
    // the link's real outline, not a capsule's guess at where it stops.
    const plate = plateOf(true);
    const along = points(plate!.path).map(([x]) => x);

    expect(Math.min(...along)).toBeCloseTo(-(3 * S + MARK.barHalf * radius()), 2);
    // ...and the other end is the block's, since the rider stops at the pin.
    expect(Math.max(...along)).toBeCloseTo(MARK.blockAlongHalf * radius(), 2);
  });

  it('draws no plate for a slider that is not welded', () => {
    expect(plateOf(false)).toBeUndefined();
  });

  it('gives two welded blocks on one link a single plate covering both', () => {
    // A rider welded to two blocks makes all three one rigid body. Drawing a
    // plate per block would paint the shared link twice at its own alpha; the
    // rule that stopped that let the first block claim the rider outright, so
    // the second had nothing left to plate and stayed a bare black block beside
    // an identically welded one that did not.
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 8 * S, 0);
    const rider = new RevJoint('R', 2 * S, 0);
    const far = new RevJoint('F', 6 * S, 0);
    const wire = (id: string, joints: RevJoint[]) => {
      const link = new RealLink(id, joints);
      joints.forEach((joint) => {
        joint.links.push(link);
        joints
          .filter((other) => other !== joint)
          .forEach((other) => joint.connectedJoints.push(other));
      });
      return link;
    };
    const carrier = wire('AB', [a, b]);
    harness.service.joints = [a, b, rider, far];
    harness.service.links = [carrier, wire('RF', [rider, far])];

    for (const pin of [rider, far]) {
      harness.active.updateSelectedObj(pin);
      harness.service.toggleSlider();
      const slider = harness.service.joints
        .filter((joint): joint is PrisJoint => joint instanceof PrisJoint)
        .find((joint) => !joint.isFloating || joint.carrier?.id !== carrier.id)!;
      slider.slideOn(carrier, a, b);
      harness.active.updateSelectedObj(pin);
      harness.service.weldJoint();
    }
    harness.service.finishStructuralEdit(false);

    const marks = new SliderMarkService().marks(harness.service.joints, radius());
    const plated = marks.filter((mark) => mark.plate);

    expect(marks.length, 'two blocks').toBe(2);
    expect(plated.length, 'one plate between them').toBe(1);
    // And it is one shape, reaching across both blocks rather than one of them.
    const path = plated[0].plate!.path;
    expect(subpaths(path).length).toBe(1);
    const along = points(path).map(([x]) => x);
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(4 * S);
  });

  it('stays a single finite outline for a rider at any angle', () => {
    for (const deg of [0, 31, 58.9, 90, 137, 180, 244, 300]) {
      const angle = (deg * Math.PI) / 180;
      const plate = plateOf(true, { x: 3 * Math.cos(angle), y: 3 * Math.sin(angle) });

      expect(plate, `rider at ${deg} deg`).toBeDefined();
      expect(subpaths(plate!.path).length, `rings at ${deg} deg`).toBe(1);
      expect(
        points(plate!.path).every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
        `finite at ${deg} deg`
      ).toBe(true);
    }
  });
});
