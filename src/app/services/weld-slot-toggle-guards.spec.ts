import { Coord } from '../model/coord';
import { PrisJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { resolveSlotDropTarget } from '../model/drop-target';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

// Guards around three structural toggles: Weld on a joint with nothing to
// fuse, slot candidates on a welded compound, and Slider on a grounded joint.

/** A bare link A-B with a tracer T riding on it. T connects exactly one link. */
function linkWithTracer() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const t = new RevJoint('T', 2, 0);
  const ab = new RealLink('ABT', [a, b, t], 1, 1, new Coord(2, 0));
  harness.service.joints.push(a, b, t);
  harness.service.links.push(ab);
  wireGraph(harness.service);
  return { ...harness, a, b, t, ab };
}

/** Two bars A-B and B-C, ready to be welded at B into a compound. */
function twoBars() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const c = new RevJoint('C', 4, 3);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(2, 0));
  const bc = new RealLink('BC', [b, c], 1, 1, new Coord(4, 1.5));
  harness.service.joints.push(a, b, c);
  harness.service.links.push(ab, bc);
  wireGraph(harness.service);
  return { ...harness, a, b, c, ab, bc };
}

describe('weld on a joint that connects fewer than two links', () => {
  it('is not offered: the shared predicate declines a one-link joint', () => {
    const s = linkWithTracer();
    expect(s.service.gridUtils.canToggleWeld(s.t)).toBe(false);
    expect(s.service.gridUtils.canToggleWeld(s.a)).toBe(false);
  });

  it('is offered where there is something to fuse, and on any welded joint', () => {
    const s = twoBars();
    expect(s.service.gridUtils.canToggleWeld(s.b)).toBe(true);
    s.service.weldJoint(s.b);
    expect(s.b.isWelded).toBe(true);
    // The same control is how the weld comes off again.
    expect(s.service.gridUtils.canToggleWeld(s.b)).toBe(true);
  });

  it('refuses the mutation outright, changing nothing and saving nothing', () => {
    const s = linkWithTracer();
    const linkIDsBefore = s.service.links.map((link) => link.id);

    s.service.weldJoint(s.t);

    expect(s.t.isWelded).toBe(false);
    expect(s.service.links.map((link) => link.id)).toEqual(linkIDsBefore);
    expect(s.saveCount()).toBe(0);
  });

  it('tolerates a toggle with no resolvable selection', () => {
    const s = linkWithTracer();
    // A stale selection: the menu can fire after the joint is gone.
    s.active.updateSelectedObj(new RevJoint('Z', 9, 9));
    expect(() => s.service.toggleWeldedJoint()).not.toThrow();
  });

  it('still makes a Slide when the second "link" is the slider block itself', () => {
    // A slider pin counts its block: rider + block is two links, and welding it
    // is how a Slide is made (§2.1). The guard must not close that door.
    const s = linkWithTracer();
    s.active.updateSelectedObj(s.t);
    s.service.toggleSlider();
    expect(s.t.links.length).toBe(2);
    expect(s.service.gridUtils.canToggleWeld(s.t)).toBe(true);

    s.service.weldJoint(s.t);
    expect(s.t.isWelded).toBe(true);
  });
});

describe('slot candidates on a welded compound', () => {
  /** The two-bar L welded at B, plus a free joint Z to drag. */
  function weldedL() {
    const s = twoBars();
    s.service.weldJoint(s.b);
    const compound = s.service.links.find(
      (link): link is RealLink => link instanceof RealLink && link.subset.length > 0
    )!;
    const z = new RevJoint('Z', 10, 10);
    return { ...s, compound, z };
  }

  it('never offers a segment joining joints of different sub-links', () => {
    const s = weldedL();
    // The midpoint of the A-C diagonal: 1.5 from bar AB, 2 from bar BC, and 0
    // from the cross-sub-link pair the compound's joint union used to offer.
    const hit = resolveSlotDropTarget(s.z, 2, 1.5, [s.compound], 1);
    expect(hit).toBeUndefined();
  });

  it('still offers each sub-link its own segments, carried by the compound', () => {
    const s = weldedL();
    const hit = resolveSlotDropTarget(s.z, 2, 0.2, [s.compound], 1);
    expect(hit).toBeDefined();
    expect(hit!.carrier.id).toBe(s.compound.id);
    expect([hit!.a.id, hit!.b.id].sort()).toEqual(['A', 'B']);
  });

  it('leaves a non-welded link exactly as it was: every pair is a candidate', () => {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 4, 3);
    const tern = new RealLink('ABC', [a, b, c], 1, 1, new Coord(3, 1));
    harness.service.joints.push(a, b, c);
    harness.service.links.push(tern);
    wireGraph(harness.service);
    const z = new RevJoint('Z', 10, 10);

    const hit = resolveSlotDropTarget(z, 2, 1.5, [tern], 1);
    expect(hit).toBeDefined();
    expect([hit!.a.id, hit!.b.id].sort()).toEqual(['A', 'C']);
  });
});

describe('slider on a grounded joint', () => {
  function loneBar() {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const ab = new RealLink('AB', [a, b], 1, 1, new Coord(2, 0));
    harness.service.joints.push(a, b);
    harness.service.links.push(ab);
    wireGraph(harness.service);
    return { ...harness, a, b, ab };
  }

  const sliderOf = (s: ReturnType<typeof loneBar>) =>
    s.service.joints.find((j): j is PrisJoint => j instanceof PrisJoint);

  it('ground first, then Slider: always a grounded slider', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleGround();
    expect(s.a.ground).toBe(true);

    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.isDangling).toBe(false);
    // The ground lives on the slider now, not on the pin.
    expect(s.a.ground).toBe(false);
  });

  it('Slider first, then Ground: the same grounded slider', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleSlider();
    s.service.toggleGround();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.isDangling).toBe(false);
    expect(s.a.ground).toBe(false);
  });

  it('a grounded slider survives Slider off and on again', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleGround();
    s.service.toggleSlider();
    const angle = sliderOf(s)!.slotAngle;

    s.service.toggleSlider();
    expect(sliderOf(s)).toBeUndefined();
    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(true);
    expect(slider.slotAngle).toBeCloseTo(angle, 9);
  });

  it('an ungrounded joint still grows a dangling slider, not a grounded one', () => {
    const s = loneBar();
    s.active.updateSelectedObj(s.a);
    s.service.toggleSlider();

    const slider = sliderOf(s)!;
    expect(slider.ground).toBe(false);
    expect(slider.isDangling).toBe(true);
  });
});
