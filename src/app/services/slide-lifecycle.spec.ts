import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink, SliderBlock } from '../model/link';
import { slideAssemblyAt } from '../model/slide-assembly';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

// A Slide is a weld with no compound behind it, which is a shape the weld code
// had never had to represent (docs/phase-3-slide-spec.md §3.2, §3.2b). Every way
// of making, unmaking or disturbing one is its own regression.

/**
 * Crank AB, and a rider CD whose end C sits on a block riding a grounded guide.
 * Welding C makes it a Slide.
 */
function sliderWithRider() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 1);
  const c = new RevJoint('C', 2, 0);
  const d = new RevJoint('D', 2, 2);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0, 0.5));
  const cd = new RealLink('CD', [c, d], 1, 1, new Coord(2, 1));

  const guide = new PrisJoint('P', c.x, c.y, false, true);
  guide.angle_rad = 0;
  const block = new SliderBlock('CP', [c, guide], 1);

  harness.service.joints.push(a, b, c, d, guide);
  harness.service.links.push(ab, cd, block);
  wireGraph(harness.service);
  return { ...harness, a, b, c, d, guide, ab, cd, block };
}

describe('welding a joint that carries a block', () => {
  it('sets the flag without building a compound', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);

    s.service.weldJoint();

    expect(s.c.isWelded).toBe(true);
    // Only one RealLink meets at C, so there is nothing to fuse -- the flag is
    // the whole of the weld, and the block is bound by it.
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'CD', 'CP']);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });

  it('used to be refused, and no longer is', () => {
    // The PrisJoint exclusion in canBeWelded is what Phase 3 lifts (§3.1).
    const s = sliderWithRider();

    expect(s.c.canBeWelded()).toBe(true);
  });

  it('leaves Weld and Unweld mutually exclusive afterwards', () => {
    // A compound weld collapses the joint's links to one, so the length test
    // happens to disable Weld afterwards. A Slide keeps two -- rider and
    // block -- so without an isWelded test the panel offers both at once.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);

    s.service.weldJoint();

    expect(s.c.canBeWelded()).toBe(false);
    expect(s.c.canBeUnwelded()).toBe(true);
  });

  it('unwelds again without needing a compound to take apart', () => {
    // unweldJointTopology reports failure when it finds no compound, having
    // already cleared the flag -- so routed there, an unweld would drop the
    // weld with no rebuild and no undo entry.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.unweldSelectedJoint();

    expect(s.c.isWelded).toBe(false);
    expect(slideAssemblyAt(s.c)).toBeUndefined();
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'CD', 'CP']);
  });

  it('is reached by Unweld All too', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.unweldAll();

    expect(s.c.isWelded).toBe(false);
  });
});

describe('a pin the resolver refuses', () => {
  it('is declined outright rather than welded and then quietly unwelded', () => {
    // Two blocks on one pin is a different joint type -- the drag refuses it
    // (§1.2), but a URL could carry one. Asking "does this have a block?"
    // instead of asking the resolver sends it down the assembly path, which
    // sets the flag, finds no compound, and leaves the reconcile to strip it
    // again: no weld either way, but a structural edit and an undo entry for
    // something that did not happen.
    const s = sliderWithRider();
    const second = new PrisJoint('Q', s.c.x, s.c.y, false, true);
    second.angle_rad = Math.PI / 2;
    s.service.joints.push(second);
    s.service.links.push(new SliderBlock('CQ', [s.c, second], 1));
    wireGraph(s.service);
    s.active.updateSelectedObj(s.c);
    const before = s.saveCount();

    s.service.weldJoint();

    expect(s.c.isWelded).toBe(false);
    expect(slideAssemblyAt(s.c)).toBeUndefined();
    // The flag ends up clear either way -- the reconcile would strip it. What
    // separates "refused" from "done and then undone" is the undo entry.
    expect(s.saveCount(), 'no undo entry for a refused weld').toBe(before);
  });

  it('still earns exactly one undo entry when the weld does take', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    const before = s.saveCount();

    s.service.weldJoint();

    expect(s.c.isWelded).toBe(true);
    expect(s.saveCount() - before).toBe(1);
  });
});

describe('a Slide made where two links meet the block', () => {
  /** A second rider CE at the same joint, so the weld has links to fuse. */
  function twoRiders() {
    const s = sliderWithRider();
    const e = new RevJoint('E', 4, 0);
    const ce = new RealLink('CE', [s.c, e], 1, 1, new Coord(3, 0));
    s.service.joints.push(e);
    s.service.links.push(ce);
    wireGraph(s.service);
    return { ...s, e, ce };
  }

  it('fuses the links into a compound and binds the block as well', () => {
    // §7 open question 3, answered: every body at the joint becomes rigid,
    // which is what the 2x2 means.
    const s = twoRiders();
    s.active.updateSelectedObj(s.c);

    s.service.weldJoint();

    expect(s.c.isWelded).toBe(true);
    const assembly = slideAssemblyAt(s.c);
    expect(assembly).toBeDefined();
    expect(assembly!.riders.length).toBe(1);
    expect(assembly!.riders[0].subset.map((link) => link.id).sort()).toEqual(['CD', 'CE']);
  });
});

describe('a weld flag that has outrun its compound', () => {
  it('is repaired rather than stripped', () => {
    // Reachable from ordinary edits: mergeJoints takes a weld apart and
    // rebuilds it. Stripping here would destroy a weld the user made; leaving
    // it would let a malformed mechanism look settled to every consumer.
    const s = sliderWithRider();
    const e = new RevJoint('E', 4, 0);
    const ce = new RealLink('CE', [s.c, e], 1, 1, new Coord(3, 0));
    s.service.joints.push(e);
    s.service.links.push(ce);
    wireGraph(s.service);
    s.c.isWelded = true;
    expect(slideAssemblyAt(s.c)!.riders.length).toBe(2);

    // Every structural edit passes through here.
    s.service.finishStructuralEdit(true);

    expect(s.c.isWelded).toBe(true);
    expect(slideAssemblyAt(s.c)!.riders.length).toBe(1);
  });

  it('is stripped when there is nothing left to repair it into', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    // Turning the Slider toggle off takes the block away, leaving a RevJoint
    // flagged welded with a single link and no compound.
    s.service.toggleSlider();

    expect(s.service.joints.map((joint) => joint.id)).not.toContain('P');
    expect(s.c.isWelded).toBe(false);
  });

  it('survives the ground toggle, which no longer takes the block', () => {
    // toggleGround used to have its own slider-removal branch, so un-grounding
    // a Slide destroyed the block and stranded the weld flag. Ground and Slider
    // are independent controls now (§4.1): un-grounding takes the slot's
    // direction away and nothing else, so the assembly is still an assembly --
    // a dangling one -- and the weld still describes something real.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();
    s.active.updateSelectedObj(s.guide);

    s.service.toggleGround();

    expect(s.service.joints.map((joint) => joint.id)).toContain('P');
    expect(s.guide.isDangling).toBe(true);
    expect(s.c.isWelded, 'the weld still has an assembly behind it').toBe(true);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });

  it('leaves a legitimate Slide alone', () => {
    // The rule above must not fire on a working assembly. A reconcile that
    // quietly unwelded every Slide would pass most of this file.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    s.service.finishStructuralEdit(true);

    expect(s.c.isWelded).toBe(true);
    expect(slideAssemblyAt(s.c)).toBeDefined();
  });
});

describe('a Slide under a joint-onto-joint merge', () => {
  it('survives a link being dragged onto its pin', () => {
    // The merge unwelds and re-welds around the survivor. Routed at the
    // compound-only pair, whether the Slide came back depended on whether the
    // arriving link happened to bring the RealLink count to two.
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    const e = new RevJoint('E', 4, 0);
    const f = new RevJoint('F', 4, 2);
    const ef = new RealLink('EF', [e, f], 1, 1, new Coord(4, 1));
    s.service.joints.push(e, f);
    s.service.links.push(ef);
    wireGraph(s.service);

    expect(s.service.mergeJoints(e, s.c)).toBeUndefined();

    expect(s.c.isWelded).toBe(true);
    const assembly = slideAssemblyAt(s.c);
    expect(assembly).toBeDefined();
    expect(assembly!.slider.id).toBe('P');
    // One rider, because the reconcile built the compound the merge implied.
    expect(assembly!.riders.length).toBe(1);
  });
});

describe('the assembly invariants after every edit', () => {
  const assertInvariants = (joint: RealJoint) => {
    const assembly = slideAssemblyAt(joint)!;
    expect(assembly, 'resolves').toBeDefined();
    // §2.10 item 1: one block, holding exactly this joint and one PrisJoint.
    expect(assembly.block.joints.length).toBe(2);
    expect(assembly.block.joints).toContain(joint);
    expect(assembly.block.joints).toContain(assembly.slider);
    // Item 2: coincident.
    expect(assembly.slider.x).toBeCloseTo(joint.x, 9);
    expect(assembly.slider.y).toBeCloseTo(joint.y, 9);
    // Item 5: a slot never rides the link it belongs to.
    expect(assembly.riders.some((rider) => rider.id === assembly.block.id)).toBe(false);
    // The post-reconcile shape (§3.0).
    expect(assembly.riders.length).toBe(1);
  };

  it('hold after welding', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();

    assertInvariants(s.c);
  });

  it('hold after a merge onto the pin', () => {
    const s = sliderWithRider();
    s.active.updateSelectedObj(s.c);
    s.service.weldJoint();
    const e = new RevJoint('E', 4, 0);
    const f = new RevJoint('F', 4, 2);
    s.service.joints.push(e, f);
    s.service.links.push(new RealLink('EF', [e, f], 1, 1, new Coord(4, 1)));
    wireGraph(s.service);

    s.service.mergeJoints(e, s.c);

    assertInvariants(s.c);
  });
});
