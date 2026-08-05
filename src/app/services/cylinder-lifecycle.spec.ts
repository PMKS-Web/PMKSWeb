import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { sealedCylinderAt, sealedCylinders } from '../model/cylinder';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { MODEL_SCALE } from '../model/render-scale';

// The atomic cylinder's service-level contract: creation is one undo entry,
// the assembly is permanent (no slider-off, no drag-out, no unweld at the
// pin), interior joints take no merges, and deletion cascades to the whole
// part from any member.

function harnessWithCylinder() {
  const harness = createMechanismHarness();
  harness.service.createCylinderAt(new Coord(0, 0));
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

describe('creating a cylinder from the menu point', () => {
  it('stamps a complete, sealed, collinear assembly as one undo entry', () => {
    const harness = createMechanismHarness();

    harness.service.createCylinderAt(new Coord(2 * MODEL_SCALE, 1 * MODEL_SCALE));

    expect(harness.service.joints).toHaveLength(5);
    expect(harness.service.links).toHaveLength(3);
    const sealed = resolve(harness);
    expect(sealed).toBeDefined();
    expect(sealed.slider.isSealed).toBe(true);
    expect(sealed.pin.isWelded).toBe(true);
    // Exactly collinear, centred on the click.
    for (const joint of [sealed.barrelFar, sealed.barrelNear, sealed.pin, sealed.rodFar]) {
      expect(joint.y).toBeCloseTo(1 * MODEL_SCALE, 6);
    }
    expect((sealed.barrelFar.x + sealed.rodFar.x) / 2).toBeCloseTo(2 * MODEL_SCALE, 6);
    // One gesture, one undo entry.
    expect(harness.saveCount()).toBe(1);
    // The body is selected, so the panel opens on the cylinder.
    expect(harness.active.selectedLink?.id).toBe(sealed.barrel.id);
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
  it('from a mount, keeping the mount only while a neighbour still holds it', () => {
    const h = harnessWithCylinder();
    // A neighbour link attached at the rod mount.
    const e = new RevJoint('Z', h.sealed.rodFar.x + 100, h.sealed.rodFar.y);
    const neighbour = new RealLink(h.sealed.rodFar.id + 'Z', [h.sealed.rodFar, e]);
    h.service.joints.push(e);
    h.service.links.push(neighbour);
    wireGraph(h.service);
    const savesBefore = h.saveCount();

    h.active.updateSelectedObj(h.sealed.rodFar);
    h.service.deleteJoint();

    expect(sealedCylinders(h.service.joints)).toHaveLength(0);
    expect(h.service.links.map((link) => link.id)).toEqual([neighbour.id]);
    // The rod mount survives on the neighbour; every other member is gone.
    const ids = h.service.joints.map((joint) => joint.id).sort();
    expect(ids).toEqual([h.sealed.rodFar.id, 'Z'].sort());
    expect(h.saveCount()).toBe(savesBefore + 1);
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
