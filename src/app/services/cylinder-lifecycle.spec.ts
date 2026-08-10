import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { sealedCylinderAt, sealedCylinders, CYLINDER_MIN_SPAN_SCALE } from '../model/cylinder';
import { refuseJointMerge } from '../model/drop-target';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { SettingsService } from './settings.service';
import { MODEL_SCALE } from '../model/render-scale';

// The object scale is process-wide static state, and earlier spec files in
// the same worker can leave it wherever they liked. Everything here that
// sizes a cylinder (creation minimum span, collinearity tolerance) reads it,
// so pin it for the file and put it back.
let previousObjectScale: number;
beforeEach(() => {
  previousObjectScale = SettingsService.objectScale;
  SettingsService._objectScale.next(1 * MODEL_SCALE);
});
afterEach(() => {
  SettingsService._objectScale.next(previousObjectScale);
});

// The atomic cylinder's service-level contract: creation is one undo entry,
// the assembly is permanent (no slider-off, no drag-out, no unweld at the
// pin), interior joints take no merges, and deletion cascades to the whole
// part from any member.

function harnessWithCylinder() {
  const harness = createMechanismHarness();
  harness.service.createCylinderFrom(new Coord(0, 0), new Coord(3 * MODEL_SCALE, 0));
  const slider = harness.service.joints.find(
    (joint): joint is PrisJoint => joint instanceof PrisJoint
  )!;
  const sealed = sealedCylinderAt(slider.connectedJoints[0] ?? slider)!;
  return { ...harness, sealed };
}

/** Resolve the assembly fresh, from its welded pin. */
function resolve(harness: ReturnType<typeof createMechanismHarness>) {
  return sealedCylinders(harness.service.joints)[0];
}

describe('creating a cylinder from the two-point gesture', () => {
  it('builds a complete, sealed, collinear assembly along the drawn axis', () => {
    const harness = createMechanismHarness();
    // A tilted axis, so collinearity is a real claim rather than shared y.
    const start = new Coord(2 * MODEL_SCALE, 1 * MODEL_SCALE);
    const end = new Coord(5 * MODEL_SCALE, 3.5 * MODEL_SCALE);

    harness.service.createCylinderFrom(start, end);

    expect(harness.service.joints).toHaveLength(5);
    expect(harness.service.links).toHaveLength(3);
    const sealed = resolve(harness);
    expect(sealed).toBeDefined();
    expect(sealed.slider.isSealed).toBe(true);
    expect(sealed.pin.isWelded).toBe(true);
    // The start point is the barrel-side mount; the rod finishes at the cursor.
    expect(Math.hypot(sealed.barrelFar.x - start.x, sealed.barrelFar.y - start.y)).toBeLessThan(
      0.01
    );
    expect(Math.hypot(sealed.rodFar.x - end.x, sealed.rodFar.y - end.y)).toBeLessThan(0.01);
    // Collinear along the drawn axis (within the codec-grade rounding the
    // creation applies to each coordinate).
    const axis = Math.hypot(end.x - start.x, end.y - start.y);
    for (const joint of [sealed.barrelNear, sealed.pin]) {
      const cross =
        (end.x - start.x) * (joint.y - start.y) - (end.y - start.y) * (joint.x - start.x);
      expect(Math.abs(cross / axis)).toBeLessThan(0.01);
    }
    // One gesture, one undo entry, committed on the second click.
    expect(harness.saveCount()).toBe(1);
    // The body is selected, so the panel opens on the cylinder.
    expect(harness.active.selectedLink?.id).toBe(sealed.barrel.id);
  });

  it('clamps a zero-length gesture to the minimum span instead of degenerating', () => {
    const harness = createMechanismHarness();

    harness.service.createCylinderFrom(new Coord(0, 0), new Coord(0, 0));

    const sealed = resolve(harness);
    expect(sealed).toBeDefined();
    // The floor a *drawing* gesture clamps at, which is not the floor a
    // cylinder can exist at: a new ram opens at mid-travel, so it needs half a
    // stroke of span on top of a fully-retracted one to reach the minimum
    // stroke. That is what CYLINDER_MIN_SPAN_SCALE now means. Along +x, since
    // a zero-length gesture names no direction.
    const span = Math.hypot(
      sealed.rodFar.x - sealed.barrelFar.x,
      sealed.rodFar.y - sealed.barrelFar.y
    );
    expect(span).toBeCloseTo(CYLINDER_MIN_SPAN_SCALE * MODEL_SCALE, 0);
    expect(sealed.slider.isSlotWellFormed).toBe(true);
  });
});

describe('permanence of a sealed cylinder', () => {
  it('refuses Slider-off on a mount', () => {
    const h = harnessWithCylinder();
    h.active.updateSelectedObj(h.sealed.rodFar);
    const before = h.service.links.length;

    h.service.toggleSlider();

    expect(h.service.links).toHaveLength(before);
    expect(resolve(h)).toBeDefined();
  });

  it('refuses detaching the sealed block from its bore', () => {
    const h = harnessWithCylinder();

    h.service.detachSlider(h.sealed.slider);

    expect(h.sealed.slider.isFloating).toBe(true);
    expect(resolve(h)).toBeDefined();
  });

  it('refuses unwelding the sealed pin', () => {
    const h = harnessWithCylinder();
    h.active.updateSelectedObj(h.sealed.pin);

    h.service.unweldSelectedJoint();

    expect(h.sealed.pin.isWelded).toBe(true);
    expect(resolve(h)).toBeDefined();
  });

  it('refuses merges into the interior joints', () => {
    const h = harnessWithCylinder();
    const stray = new RevJoint('Z', h.sealed.pin.x, h.sealed.pin.y);
    const bar = new RealLink('Z' + h.sealed.rodFar.id, [stray, h.sealed.rodFar]);
    h.service.joints.push(stray);
    h.service.links.push(bar);
    wireGraph(h.service);

    expect(h.service.mergeJoints(stray, h.sealed.pin as RealJoint)).toBe('sealed-cylinder');
    expect(resolve(h)).toBeDefined();
  });

  it('still grounds and drives through the sanctioned surfaces', () => {
    const h = harnessWithCylinder();
    h.active.updateSelectedObj(h.sealed.barrelFar);
    h.service.toggleGround();
    expect((h.sealed.barrelFar as RealJoint).ground).toBe(true);

    h.service.toggleCylinderInput(h.sealed);
    expect(h.sealed.slider.input).toBe(true);
    h.service.toggleCylinderInput(h.sealed);
    expect(h.sealed.slider.input).toBe(false);
  });
});

describe('deleting a cylinder cascades to the whole assembly', () => {
  /** The ram, plus a bar hanging off its rod mount. */
  function cylinderWithNeighbour() {
    const h = harnessWithCylinder();
    const e = new RevJoint('Z', h.sealed.rodFar.x + 100, h.sealed.rodFar.y);
    const neighbour = new RealLink(h.sealed.rodFar.id + 'Z', [h.sealed.rodFar, e]);
    h.service.joints.push(e);
    h.service.links.push(neighbour);
    wireGraph(h.service);
    return { ...h, neighbour };
  }

  // Two different asks, two different answers, and the labels say which is
  // which: a mount's own menu offers "Delete Cylinder", while the panel's
  // Delete acts on whatever is selected — here, the joint.
  it('from a mount via Delete Cylinder, keeping the mount while a neighbour holds it', () => {
    const h = cylinderWithNeighbour();
    const savesBefore = h.saveCount();

    h.active.updateSelectedObj(h.sealed.rodFar);
    h.service.deleteCylinder();

    expect(sealedCylinders(h.service.joints)).toHaveLength(0);
    expect(h.service.links.map((link) => link.id)).toEqual([h.neighbour.id]);
    // The rod mount survives on the neighbour; every other member is gone.
    const ids = h.service.joints.map((joint) => joint.id).sort();
    expect(ids).toEqual([h.sealed.rodFar.id, 'Z'].sort());
    expect(h.saveCount()).toBe(savesBefore + 1);
  });

  it('from a mount via Delete Joint, taking the joint and what cannot stand without it', () => {
    // Asked to delete the *joint*, the app used to delete only the ram and
    // leave the joint sitting on its neighbour — so the thing that was selected
    // was the one thing still there afterwards.
    const h = cylinderWithNeighbour();

    h.active.updateSelectedObj(h.sealed.rodFar);
    h.service.deleteJoint();

    expect(sealedCylinders(h.service.joints)).toHaveLength(0);
    // The joint itself goes, and so does the bar that lost an end to it.
    expect(h.service.joints.map((joint) => joint.id)).not.toContain(h.sealed.rodFar.id);
    expect(h.service.links).toHaveLength(0);
    // Z is left behind holding nothing. That is what deleting a joint does
    // everywhere in this app — only `deleteLink` sweeps up orphans — so it is
    // recorded here rather than asserted away.
    expect(h.service.joints.map((joint) => joint.id)).toEqual(['Z']);
  });

  it('from the body, removing everything including orphaned mounts', () => {
    const h = harnessWithCylinder();

    h.active.updateSelectedObj(h.sealed.barrel as RealLink);
    h.service.deleteLink();

    expect(h.service.joints).toHaveLength(0);
    expect(h.service.links).toHaveLength(0);
  });

  it('from a member link via deleteLink on the rod', () => {
    const h = harnessWithCylinder();

    h.active.updateSelectedObj(h.sealed.rod);
    h.service.deleteLink();

    expect(h.service.joints).toHaveLength(0);
    expect(h.service.links).toHaveLength(0);
  });
});

describe('the invariant: no write can leave a sealed cylinder bent', () => {
  const offAxis = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    p: { x: number; y: number }
  ) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length;
  };

  it('straightens a garbage pin position on the next mechanism update', () => {
    const h = harnessWithCylinder();
    // A write that bypassed every gesture: the pin flung far off the axis.
    h.sealed.pin.x += 137;
    h.sealed.pin.y -= 89;
    h.sealed.slider.x = h.sealed.pin.x;
    h.sealed.slider.y = h.sealed.pin.y;

    h.service.updateMechanism();

    // Geometric resolution — the strict test — succeeds again.
    const restored = resolve(h);
    expect(restored).toBeDefined();
    expect(offAxis(restored.barrelFar, restored.rodFar, restored.pin)).toBeLessThan(1e-3);
    expect(offAxis(restored.barrelFar, restored.rodFar, restored.barrelNear)).toBeLessThan(1e-3);
  });

  it('straightens a garbage buried barrel end without moving the mounts', () => {
    const h = harnessWithCylinder();
    const mountA = { x: h.sealed.barrelFar.x, y: h.sealed.barrelFar.y };
    const mountC = { x: h.sealed.rodFar.x, y: h.sealed.rodFar.y };
    // A write that bypassed every gesture: the buried end swung 45 degrees off
    // the axis about its own mount. It keeps the barrel's *length*, because
    // that length is now the part's size — barrel and rod are equal by
    // construction, so a write that changed it is asking for a different ram
    // rather than a bent one, which is the case below. Swung much further it
    // would also end up further from the rod's mount than the barrel's own
    // mount is, and the resolver would name the two barrel ends the other way
    // round: a different failure, and not the one this is about.
    const offset = { x: h.sealed.barrelNear.x - mountA.x, y: h.sealed.barrelNear.y - mountA.y };
    const swing = Math.PI / 4;
    const barrelLength = Math.hypot(offset.x, offset.y);
    h.sealed.barrelNear.x = mountA.x + offset.x * Math.cos(swing) - offset.y * Math.sin(swing);
    h.sealed.barrelNear.y = mountA.y + offset.x * Math.sin(swing) + offset.y * Math.cos(swing);

    h.service.updateMechanism();

    const restored = resolve(h);
    expect(restored).toBeDefined();
    expect(offAxis(restored.barrelFar, restored.rodFar, restored.barrelNear)).toBeLessThan(1e-3);
    expect(
      Math.hypot(restored.barrelNear.x - mountA.x, restored.barrelNear.y - mountA.y)
    ).toBeCloseTo(barrelLength, 3);
    // The mounts are the user's handles; normalization never moves them.
    expect(restored.barrelFar.x).toBeCloseTo(mountA.x, 6);
    expect(restored.barrelFar.y).toBeCloseTo(mountA.y, 6);
    expect(restored.rodFar.x).toBeCloseTo(mountC.x, 6);
    expect(restored.rodFar.y).toBeCloseTo(mountC.y, 6);
  });

  it('refuses to draw a part whose barrel a stray write lengthened', () => {
    // The normalizer is a straightener, not a resizer: it holds the mounts and
    // the barrel it finds, so a write that changed the barrel's length asks for
    // a ram whose rod no longer matches it. The invariant is enforced where
    // cylinders are *built* — creation, drag, panel — and the geometric test is
    // the tripwire for everything else, so what has to happen here is that the
    // part stops being recognised rather than being drawn as a cylinder it is
    // not. It stays a cylinder structurally, which is what keeps the guards on
    // it while it is wrong.
    const h = harnessWithCylinder();
    const mountA = { x: h.sealed.barrelFar.x, y: h.sealed.barrelFar.y };
    h.sealed.barrelNear.x = mountA.x + 2 * (h.sealed.barrelNear.x - mountA.x);
    h.sealed.barrelNear.y = mountA.y + 2 * (h.sealed.barrelNear.y - mountA.y);

    h.service.updateMechanism();

    expect(resolve(h)).toBeUndefined();
    expect(h.service.cylinderAt(h.sealed.rodFar)).toBeDefined();
  });

  it('is the identity for an assembly that is already valid', () => {
    const h = harnessWithCylinder();
    const before = h.service.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));

    h.service.updateMechanism();

    h.service.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(before[index].x, 6);
      expect(joint.y).toBeCloseTo(before[index].y, 6);
    });
  });

  it('keeps recognising the assembly structurally while it is bent', () => {
    // The guards and drag routing must not fail open mid-repair — that lapse
    // is exactly how a fast drag used to tear a cylinder for good.
    const h = harnessWithCylinder();
    h.sealed.pin.y += 300;

    expect(h.service.cylinderAt(h.sealed.rodFar)).toBeDefined();
    expect(h.service.cylinderAt(h.sealed.barrel)).toBeDefined();
  });
});

describe('a mount welded into a neighbouring link', () => {
  function weldedMount() {
    const h = harnessWithCylinder();
    const e = new RevJoint('Z', h.sealed.rodFar.x + 100, h.sealed.rodFar.y);
    const neighbour = new RealLink(h.sealed.rodFar.id + 'Z', [h.sealed.rodFar, e]);
    h.service.joints.push(e);
    h.service.links.push(neighbour);
    wireGraph(h.service);
    h.active.updateSelectedObj(h.sealed.rodFar);
    h.service.weldJoint();
    return { ...h, e };
  }

  it('keeps the weld functional and the skin resolvable through the compound', () => {
    const h = weldedMount();

    expect((h.sealed.rodFar as RealJoint).isWelded).toBe(true);
    // The rod is now a subset leaf of a compound; the resolver follows it.
    const still = resolve(h);
    expect(still).toBeDefined();
    expect(still.rod.id).toBe(h.sealed.rod.id);
    expect(still.rodFar.id).toBe(h.sealed.rodFar.id);
  });

  it('still cascades a delete, unwelding the mount so the neighbour survives', () => {
    const h = weldedMount();

    h.service.deleteCylinder(resolve(h));

    expect(sealedCylinders(h.service.joints)).toHaveLength(0);
    // The neighbour bar came back out of the compound intact.
    expect(h.service.links.map((link) => link.id)).toEqual([h.sealed.rodFar.id + 'Z']);
    expect(h.service.joints.map((joint) => joint.id).sort()).toEqual(
      [h.sealed.rodFar.id, 'Z'].sort()
    );
  });
});

describe('mount merge rules', () => {
  // Mounts merge like any joint — that is how a cylinder attaches — but a
  // weld may not ride along in either direction, and a part cannot fold onto
  // itself.
  it('refuses merging a welded joint with a mount, both directions', () => {
    const h = harnessWithCylinder();
    const stray = new RevJoint('Z', 999, 999);
    stray.isWelded = true;
    h.service.joints.push(stray);

    expect(refuseJointMerge(stray, h.sealed.rodFar, h.service.joints)).toBe('welded-mount');
    expect(refuseJointMerge(h.sealed.rodFar, stray, h.service.joints)).toBe('welded-mount');
  });

  it('refuses folding a cylinder onto itself', () => {
    const h = harnessWithCylinder();

    expect(refuseJointMerge(h.sealed.barrelFar, h.sealed.rodFar, h.service.joints)).toBe(
      'own-cylinder'
    );
  });

  it('allows a mount onto a plain joint', () => {
    const h = harnessWithCylinder();
    const plain = new RevJoint('Z', 999, 999);
    h.service.joints.push(plain);

    expect(refuseJointMerge(h.sealed.rodFar, plain, h.service.joints)).toBeUndefined();
  });
});
