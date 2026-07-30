// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here.
import './joint';
import { Joint, PrisJoint, RevJoint } from './joint';
import { Coord } from './coord';
import { RealLink } from './link';

function carrierWith(ax: number, ay: number, bx: number, by: number) {
  const a = new RevJoint('A', ax, ay);
  const b = new RevJoint('B', bx, by);
  const carrier = new RealLink('AB', [a, b], 1, 1, new Coord((ax + bx) / 2, (ay + by) / 2));
  return { a, b, carrier };
}

describe('PrisJoint slot binding', () => {
  it('starts grounded and reports its world angle', () => {
    const slot = new PrisJoint('P', 0, 0, false, true);
    slot.angle_rad = Math.PI / 3;

    expect(slot.isFloating).toBe(false);
    expect(slot.slotAngle).toBeCloseTo(Math.PI / 3, 12);
  });

  it('measures a floating slot from its own defining joints', () => {
    const { a, b, carrier } = carrierWith(1, 1, 2, 2);
    const slot = new PrisJoint('P', 1.5, 1.5);
    // A stale angle that would be plainly visible if slotAngle ever read it.
    slot.angle_rad = 0;
    slot.slideOn(carrier, a, b);

    expect(slot.isFloating).toBe(true);
    expect(slot.slotAngle).toBeCloseTo(Math.PI / 4, 12);
  });

  it('follows the carrier when its joints move, without being told', () => {
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);
    expect(slot.slotAngle).toBeCloseTo(0, 12);

    b.y = 1;
    b.x = 0;

    expect(slot.slotAngle).toBeCloseTo(Math.PI / 2, 12);
  });

  it('is grounded or floating and never both', () => {
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0, false, true);
    slot.angle_rad = 1.2;

    slot.slideOn(carrier, a, b);
    expect(slot.ground).toBe(false);
    expect(slot.isFloating).toBe(true);

    slot.groundAt(1.2);
    expect(slot.ground).toBe(true);
    expect(slot.isFloating).toBe(false);
    expect(slot.carrier).toBeUndefined();
    expect(slot.slotJointA).toBeUndefined();
    expect(slot.slotJointB).toBeUndefined();
    // Grounded again means the world angle is authoritative again.
    expect(slot.slotAngle).toBeCloseTo(1.2, 12);
  });
});

describe('PrisJoint slot well-formedness', () => {
  it('accepts two distinct, separated joints of the carrier', () => {
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);

    expect(slot.isSlotWellFormed).toBe(true);
  });

  it('rejects a slot whose joints have collapsed onto each other', () => {
    // Reachable from a Phase 1.2 snap that stops just short of merging: the
    // ids still differ, so an id-only check would call this slot fine while
    // its direction is undefined.
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);

    b.x = 0;
    b.y = 0;

    expect(slot.isSlotWellFormed).toBe(false);
  });

  it('rejects a joint that is not a member of the carrier', () => {
    const { a, carrier } = carrierWith(0, 0, 1, 0);
    const stranger = new RevJoint('Z', 5, 5);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, stranger);

    expect(slot.isSlotWellFormed).toBe(false);
  });

  it('rejects a carrier that has taken the slider in as a member', () => {
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);
    // Option A keeps the slider out of carrier.joints (§2.3); a link's hull and
    // reference angle both come from that array, so a slider inside it would
    // deform the carrier as it slides.
    carrier.joints.push(slot);

    expect(slot.isSlotWellFormed).toBe(false);
  });
});

describe('PrisJoint slot rebinding', () => {
  function copyOf(joints: Joint[], links: RealLink[]) {
    const copies = joints.map((joint) => new RevJoint(joint.id, joint.x, joint.y));
    const linkCopies = links.map(
      (link) =>
        new RealLink(
          link.id,
          link.joints.map((joint) => copies.find((copy) => copy.id === joint.id)!),
          link.mass,
          link.massMoI,
          new Coord(link.CoM.x, link.CoM.y)
        )
    );
    return { copies, linkCopies };
  }

  it('moves the binding onto equivalent objects from another copy', () => {
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);

    const { copies, linkCopies } = copyOf([a, b], [carrier]);
    slot.rebindSlot(linkCopies, copies);

    expect(slot.carrier).toBe(linkCopies[0]);
    expect(slot.slotJointA).toBe(copies[0]);
    expect(slot.slotJointB).toBe(copies[1]);
    expect(slot.slotJointA).not.toBe(a);
  });

  it('reads the copy rather than the original once rebound', () => {
    // The whole point: an unrebound slot would keep measuring the editable
    // mechanism and report the same angle at every timestep.
    const { a, b, carrier } = carrierWith(0, 0, 1, 0);
    const slot = new PrisJoint('P', 0.5, 0);
    slot.slideOn(carrier, a, b);

    const { copies, linkCopies } = copyOf([a, b], [carrier]);
    copies[1].x = 0;
    copies[1].y = 1;
    slot.rebindSlot(linkCopies, copies);

    expect(slot.slotAngle).toBeCloseTo(Math.PI / 2, 12);
  });

  it('leaves a grounded slot alone', () => {
    const slot = new PrisJoint('P', 0, 0, false, true);
    slot.groundAt(0.75);

    slot.rebindSlot([], []);

    expect(slot.isFloating).toBe(false);
    expect(slot.slotAngle).toBeCloseTo(0.75, 12);
  });
});
