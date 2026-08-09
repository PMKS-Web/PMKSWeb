import '../model/joint';
import { Coord } from '../model/coord';
import { PrisJoint, RevJoint } from '../model/joint';
import { RealLink, SliderBlock } from '../model/link';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

// Option A (docs/joint-types-plan.md §2.3) keeps a slot's carrier and its two
// defining joints outside `links` and `connectedJoints`. Nothing that rebuilds
// those structures can see them, so every way of destroying one is its own
// regression — §4.2.

/**
 * Crank AB drives a block riding in a slot along the lever CD. The whole point
 * of this shape is that the slider depends on CD without appearing anywhere in
 * CD's joint list.
 */
function slottedLever() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 1);
  const c = new RevJoint('C', 3, 0, false, true);
  const d = new RevJoint('D', 1, 2);
  const ab = new RealLink('AB', [a, b], 1, 1, new Coord(0, 0.5));
  const cd = new RealLink('CD', [c, d], 1, 1, new Coord(2, 1));

  const slot = new PrisJoint('P', b.x, b.y);
  slot.slideOn(cd, c, d);
  const block = new SliderBlock('BP', [b, slot], 1);

  harness.service.joints.push(a, b, c, d, slot);
  harness.service.links.push(ab, cd, block);
  wireGraph(harness.service);
  return { ...harness, a, b, c, d, slot, ab, cd, block };
}

describe('a slot losing what defines it', () => {
  it('starts out floating on its carrier', () => {
    const s = slottedLever();
    s.service.updateMechanism();

    expect(s.slot.isFloating).toBe(true);
    expect(s.slot.carrier).toBe(s.cd);
    expect(s.slot.slotAngle).toBeCloseTo(Math.atan2(2, -2), 9);
  });

  it('dangles when the carrier is deleted, rather than grounding itself', () => {
    // Phase 2 re-grounded it here, to keep the slider the user drew. That kept
    // the object and quietly invented the one thing nobody had chosen: where it
    // points. Phase 4 keeps the block, drops the direction, and draws it red --
    // the fix is to drag it onto a link (§4.1).
    const s = slottedLever();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.cd);

    s.service.deleteLink();

    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.carrier).toBeUndefined();
    expect(s.slot.ground).toBe(false);
    expect(s.slot.isDangling).toBe(true);
    // The direction is stashed rather than applied, so grounding it later lands
    // on the guide it had instead of rebuilding one at zero.
    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });

  it('follows a defining joint that is merged away, rather than stranding the slot', () => {
    // This used to strand it. The reasoning was that merging a joint the slot
    // is measured from is a strange thing to do, so let the slot dangle and let
    // the user see it -- which was defensible while nothing depended on it.
    //
    // Something does now: dragging a cylinder's mount onto another joint is how
    // a ram is attached to the rest of a linkage, and the mount is one of the
    // two joints its barrel's slot is measured from. Stranding the slot there
    // deleted the cylinder, silently, in the gesture that exists to connect it.
    //
    // A merge says the two joints are one. Link membership already follows that
    // -- `replaceJointInLink` rewrites every link -- and a slot's endpoints are
    // the same kind of reference, so they follow it too. Where that leaves no
    // line to measure, the next test shows it still dangles.
    const s = slottedLever();
    const spare = new RevJoint('Z', 5, 5);
    const bar = new RealLink('AZ', [s.a, spare], 1, 1, new Coord(2.5, 2.5));
    s.service.joints.push(spare);
    s.service.links.push(bar);
    wireGraph(s.service);

    expect(s.service.mergeJoints(s.d, spare)).toBeUndefined();

    expect(s.slot.isFloating).toBe(true);
    expect(s.slot.isDangling).toBe(false);
    expect(s.slot.isSlotWellFormed).toBe(true);
    // The carrier kept both its ends; one of them is now the joint that survived.
    expect([s.slot.slotJointA!.id, s.slot.slotJointB!.id]).toContain('Z');
  });

  it('cannot be asked to collapse a slot onto a single point', () => {
    // The repair above only ever moves an endpoint to another joint; it cannot
    // put both ends on the same one, because merging one end of a carrier into
    // the other end of that same carrier is refused before any of this runs.
    // So the case where a slot would be left with no direction to measure is
    // closed at the gesture rather than repaired after it.
    const s = slottedLever();
    const spare = new RevJoint('Z', 5, 5);
    const bar = new RealLink('AZ', [s.a, spare], 1, 1, new Coord(2.5, 2.5));
    s.service.joints.push(spare);
    s.service.links.push(bar);
    wireGraph(s.service);

    expect(s.service.mergeJoints(s.d, spare)).toBeUndefined();
    const other = s.slot.slotJointA!.id === 'Z' ? s.slot.slotJointB! : s.slot.slotJointA!;

    expect(s.service.mergeJoints(other as RevJoint, spare)).toBeDefined();
    expect(s.slot.isSlotWellFormed, 'left exactly as it was').toBe(true);
  });

  it('refuses to merge a defining joint into the block riding its own slot', () => {
    // The assembly would then slide on a link it is part of: the slot's
    // direction is measured from two joints, one of which has become the block.
    // Found by dragging a block 25 px, which snapped it onto the nearer end of
    // its own carrier and left it non-dangling and unflagged.
    const s = slottedLever();

    expect(s.service.mergeJoints(s.d, s.b)).toBe('own-carrier');
    expect(s.slot.isFloating, 'the slot is left alone').toBe(true);
    expect(s.service.joints.map((joint) => joint.id)).toContain('D');
  });

  it('dangles when a defining joint is deleted outright', () => {
    // Deleting a joint is the one route to a stranded slot that goes through
    // neither mergeJoints nor deleteLink -- it used to end at updateMechanism,
    // which reconciles nothing.
    const s = slottedLever();
    s.active.updateSelectedObj(s.d);

    s.service.deleteJoint();

    expect(s.service.joints.map((joint) => joint.id)).not.toContain('D');
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.isDangling).toBe(true);
    expect(s.slot.carrier).toBeUndefined();
  });

  it('does not leave a slider pointing at a link that is gone', () => {
    // The failure this exists to prevent: the pointer stays valid, so nothing
    // throws -- the slider just reads geometry from an object no longer in the
    // mechanism, and solves against a link that is not there.
    const s = slottedLever();
    s.active.updateSelectedObj(s.cd);

    s.service.deleteLink();

    expect(s.service.links.map((link) => link.id)).not.toContain('CD');
    expect(s.slot.carrier).toBeUndefined();
  });
});

describe('a slot whose carrier is welded into a compound', () => {
  /** CD and DE welded at D: the carrier becomes a member of a compound. */
  function weldableCarrier() {
    const s = slottedLever();
    const e = new RevJoint('E', 0, 3);
    const de = new RealLink('DE', [s.d, e], 1, 1, new Coord(0.5, 2.5));
    s.service.joints.push(e);
    s.service.links.push(de);
    wireGraph(s.service);
    s.service.updateMechanism();
    return { ...s, e, de };
  }

  it('actually welds, so the tests below are about a compound', () => {
    // Guard on the fixture itself: an unwired joint declines every weld, and
    // the assertions further down would then hold because nothing happened.
    const s = weldableCarrier();
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    expect(s.d.isWelded).toBe(true);
    expect(s.service.links.map((link) => link.id)).not.toContain('CD');
  });

  it('remaps the carrier to the compound rather than regrounding', () => {
    const s = weldableCarrier();
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    // The slot survives: the compound is a real body and still holds both
    // defining joints, so there is nothing to give up.
    expect(s.slot.isFloating).toBe(true);
    expect(s.service.links).toContain(s.slot.carrier);
    expect(s.slot.carrier!.joints.map((joint) => joint.id)).toEqual(
      expect.arrayContaining(['C', 'D'])
    );
  });

  it('keeps the slot pointing the same way through the weld', () => {
    const s = weldableCarrier();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.d);

    s.service.weldJoint();

    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });
});

describe('grounding a floating slot', () => {
  it('converts it in place instead of dismantling the slider', () => {
    const s = slottedLever();
    s.service.updateMechanism();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.slot);

    s.service.toggleGround();

    expect(s.service.joints.map((joint) => joint.id)).toContain('P');
    expect(s.service.links.map((link) => link.id)).toContain('BP');
    expect(s.slot.ground).toBe(true);
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });
});
