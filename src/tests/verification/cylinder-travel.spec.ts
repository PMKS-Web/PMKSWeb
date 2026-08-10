// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app/app.module';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { SettingsService } from '../../app/services/settings.service';
import { SliderMarkService } from '../../app/services/slider-mark.service';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import {
  HEAD_CLEARANCE_R,
  MIN_STROKE_R,
  cylinderHeadHalf,
  cylinderMembers,
  cylinderSizeOf,
  cylinderStroke,
  cylinderStrokeAlong,
  sealedCylinders,
} from '../../app/model/cylinder';
import { CYLINDER, rodBodyPath } from '../../app/model/joint-marks';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { cylinderBetween, cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { RealJoint } from '../../app/model/joint';
import { Coord } from '../../app/model/coord';

/**
 * The boom, with its ram given a stroke the boom cannot follow to the end.
 *
 * Same mounts as the plain boom — the ram is simply drawn fully retracted
 * rather than at mid-stroke, which spends the whole mount-to-mount span on
 * stroke instead of half of it. Extended, it asks for a span the linkage cannot
 * assemble and turns back before its own stop.
 *
 * The anchor used to be moved out to 3.6 as well, narrowing the boom's reach on
 * top of the longer stroke. That was tuned against a ram whose bore ate 13 R of
 * its own barrel; with the clearance at 1.4 R the retracted draw alone is
 * enough, and both together lock the linkage outright — the mechanism reports a
 * toggle rather than a ram that outruns it, which is a different case.
 */
function overRammedBoom(): MechanismFixture {
  const base = cylinderBoomFixture();
  const mount = base.joints.find((joint) => joint.id === 'G')!;
  const tip = base.joints.find((joint) => joint.id === 'C')!;
  const { barrelEnd, pin } = cylinderBetween({ x: mount.x, y: mount.y }, { x: tip.x, y: tip.y }, 0);
  return {
    ...base,
    joints: base.joints.map((joint) => {
      if (joint.id === 'N') return { ...joint, ...barrelEnd };
      if (joint.id === 'P') return { ...joint, ...pin };
      return joint;
    }),
  };
}

/**
 * What a cylinder does at the ends of its travel, and what the app says about
 * it — the cases an adversarial read of the plan said nothing covered.
 *
 * Each of these is a state the app reaches on its own: Object Scale walks a
 * barrel under its own bore without anyone touching the mechanism, two rams
 * share a mount because that is how an excavator is drawn, and a ram sized
 * generously outruns the linkage it drives.
 */

const numbers = (path: string): number[] =>
  (path.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);

describe('a cylinder with no travel', () => {
  const r = 0.15 * MODEL_SCALE;

  it('collapses its interval rather than inverting it', () => {
    // Every consumer clamps or samples against [min, max]. Handed max < min
    // they would each quietly do something, and something different.
    const under = cylinderStrokeAlong(HEAD_CLEARANCE_R * r * 0.5, r);

    expect(under.usable).toBe(false);
    expect(under.max).toBeGreaterThanOrEqual(under.min);
  });

  it('reports no stroke to the panel either, not a sliver the solver will refuse', () => {
    // Two definitions of "how long is the stroke" that disagree in a band: the
    // raw subtraction says a barrel a hair over its bore has 0.05 cm, while the
    // travel interval calls anything under the floor unusable. The panel read
    // the first and the solver the second, so Travel showed a number beside a
    // mechanism reporting the ram had no travel at all. Object Scale walks a
    // part into that band without anyone touching it.
    const r = 0.15 * MODEL_SCALE;
    const sliver = HEAD_CLEARANCE_R * r + (MIN_STROKE_R * r) / 2;
    expect(cylinderStroke(sliver, r)).toBeGreaterThan(0);
    expect(cylinderStrokeAlong(sliver, r).usable).toBe(false);

    const built = buildMechanism(cylinderBoomFixture(MODEL_SCALE));
    const cylinder = sealedCylinders(built.joints)[0];
    if (cylinder) {
      const size = cylinderSizeOf(cylinder, r);
      expect(size.stroke).toBeGreaterThan(0);
    }
  });

  it('is refused as a drive rather than driven as an ordinary slider', () => {
    // The trap this closes: registerCylinderDrive returning false means "not
    // handled", not "invalid", and the generic prismatic drive downstream will
    // take any driven PrisJoint at all. It would have commanded this pin along
    // its slot with no stroke bound -- animating the ram by telescoping the rod
    // out of its own barrel, which is the one thing sealing it forbids.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);

    // Bore-sized barrel, so there is nothing left over to be stroke.
    const starved: MechanismFixture = shrunkBoom(HEAD_CLEARANCE_R * 0.15 * 0.6);
    urls.updateFromURL(fixturePayload(starved), false, true, false);

    expect(mechanism.oneValidMechanismExists()).toBe(false);
    expect(PositionSolver.unusableCylinderDrive).toBeDefined();
    expect(mechanism.invalidReason()).toContain('no travel');
  });
});

describe('the drawn barrel', () => {
  it('keeps its own length while the ram cycles', () => {
    // The regression this whole change exists for. The barrel used to be drawn
    // from the piston back to the anchor, so the one rigid part of the
    // assembly was the one part visibly changing length -- and the stroke was
    // invisible, because nothing marked where the bore ended.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    const marks = new SliderMarkService();
    urls.updateFromURL(fixturePayload(cylinderBoomFixture()), false, true, false);

    const solved = mechanism.mechanisms[0];
    expect(solved?.joints.length ?? 0).toBeGreaterThan(50);

    const r = 0.15 * SettingsService.objectScale;
    const lengths: number[] = [];
    const exposed: number[] = [];
    for (const t of [0, 30, 90, Math.floor(solved.joints.length / 2)]) {
      const [mark] = marks.cylinderMarks(solved.joints[t], r, true);
      expect(mark).toBeDefined();
      // barrelPath runs mouth -> anchor -> mouth, so its extreme x values are
      // the two ends of the member.
      const xs = numbers(mark.barrel).filter((_, i) => i % 2 === 0);
      const mouth = Math.max(...xs);
      lengths.push(mouth - Math.min(...xs));
      // The rod is rigid too, so its own length never changes either -- what a
      // ram does is put more or less of it outside the mouth.
      exposed.push(Math.max(...numbers(mark.rod)) - mouth);
    }

    // Solved positions are rounded to six decimals and a long sweep carries a
    // little of that along, so the barrel is constant to about nine significant
    // figures rather than exactly. The bound is set against what this is
    // actually distinguishing: drawn the old way the barrel changed by the
    // whole stroke, some 268 model units, and 0.01 is four orders below one
    // screen pixel at any zoom this app allows.
    for (const length of lengths) {
      expect(Math.abs(length - lengths[0])).toBeLessThan(0.01);
    }
    // And the thing that *does* change is the rod standing out of the mouth.
    expect(Math.max(...exposed) - Math.min(...exposed)).toBeGreaterThan(r);
  });

  it('stops the head clear of the mount at one end and clean outside at the other', () => {
    // What replaced the two stop notches, and it is the head's own edges that
    // say it. Closed, the head's back edge stands a clearance off the barrel's
    // mount, so the two never collide on screen; open, that same back edge has
    // reached the mouth and the head is entirely out of the barrel. Both are
    // visible in the silhouette, which is why nothing is drawn to mark them.
    const r = 0.15 * MODEL_SCALE;
    const barrelLength = 40 * r;
    const travel = cylinderStrokeAlong(barrelLength, r);
    const head = cylinderHeadHalf(barrelLength, r);
    expect(travel.usable).toBe(true);
    // Both bounds are the pin, so both carry the head's half-length.
    expect(travel.min - head).toBeCloseTo(HEAD_CLEARANCE_R * r, 9);
    expect(travel.max - head).toBeCloseTo(barrelLength, 9);

    // And the drawing measures the head the same way the travel does: the rod
    // body starts at the head's back edge, so the two constants agreeing is
    // what puts the head where the model says on screen.
    const inner = Math.min(...numbers(rodBodyPath(r, 12 * r, head)));
    expect(inner).toBeCloseTo(-head, 9);
  });

  it('is shortest when its barrel is exactly its own head', () => {
    // The floor, and why it is where it is: any shorter and the head hangs out
    // of both ends of a barrel shorter than itself.
    const r = 0.15 * MODEL_SCALE;
    const shortest = cylinderMembers(0, 0, r);
    expect(shortest.atMinimum).toBe(true);
    expect(shortest.barrel).toBeCloseTo(2 * CYLINDER.headAlongHalfMin * r, 9);
    expect(shortest.rod).toBeCloseTo(shortest.barrel, 9);
    // And the head it shrank to is exactly that barrel.
    expect(2 * cylinderHeadHalf(shortest.barrel, r)).toBeCloseTo(shortest.barrel, 9);
  });
});

describe('object scale, which changes R under a mechanism nobody touched', () => {
  it('leaves a starved cylinder as drawn instead of silently moving its piston', () => {
    // Raising the scale raises the bore, and a barrel that was comfortable can
    // fall under it. Snapping the piston to the collapsed interval would move a
    // joint with no undo entry and destroy the geometry that scaling back down
    // would otherwise restore.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    const original = SettingsService.objectScale;
    try {
      urls.updateFromURL(fixturePayload(cylinderBoomFixture()), false, true, false);
      const pin = mechanism.joints.find(
        (joint) => joint.id === mechanism.sealedStructures()[0].pin.id
      )!;
      const before = { x: pin.x, y: pin.y };

      // Far enough that no barrel in the mechanism can hold its own bore.
      SettingsService._objectScale.next(original * 8);
      mechanism.updateMechanism(false);

      expect(pin.x).toBeCloseTo(before.x, 6);
      expect(pin.y).toBeCloseTo(before.y, 6);
    } finally {
      SettingsService._objectScale.next(original);
      mechanism.updateMechanism(false);
    }
  });
});

describe('a mount two rams share', () => {
  it('re-poses both of them, not whichever one was found first', () => {
    // Membership was a `.find`, which is right for "what am I looking at" and
    // wrong for "what has to move". The second ram was left to the normalizer,
    // which holds the mounts and can only repair the interior -- so it absorbed
    // a drag meant for the first by quietly changing its own size.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    const grid = TestBed.inject(GridUtilsService);
    urls.updateFromURL(fixturePayload(twoRamsOneMount()), false, true, false);

    const cylinders = mechanism.sealedStructures();
    expect(cylinders.length).toBe(2);
    const barrelOf = (index: number) =>
      Math.hypot(
        cylinders[index].barrelNear.x - cylinders[index].barrelFar.x,
        cylinders[index].barrelNear.y - cylinders[index].barrelFar.y
      );
    const acrossOf = (index: number) => {
      const { barrelFar, rodFar, pin } = cylinders[index];
      const dx = rodFar.x - barrelFar.x;
      const dy = rodFar.y - barrelFar.y;
      const length = Math.hypot(dx, dy);
      return Math.abs((pin.x - barrelFar.x) * -dy + (pin.y - barrelFar.y) * dx) / length;
    };

    const before = [barrelOf(0), barrelOf(1)];
    const shared = mechanism.joints.find((joint) => joint.id === 'D')! as RealJoint;
    grid.dragJoint(shared, new Coord(shared.x, shared.y + 1.2 * MODEL_SCALE));
    mechanism.updateMechanism(false);

    // Both stay straight -- neither was bent by the other's drag.
    expect(acrossOf(0)).toBeLessThan(1e-6);
    expect(acrossOf(1)).toBeLessThan(1e-6);
    // A drag inside each ram's own travel resizes neither of them.
    expect(barrelOf(0)).toBeCloseTo(before[0], 3);
    expect(barrelOf(1)).toBeCloseTo(before[1], 3);
  });
});

describe('two rams a single link carries', () => {
  it('takes both along rigidly when that link is dragged', () => {
    // Not the same case as a shared mount: here the two rams have separate
    // mounts that happen to sit on one bar, so a drag of the bar carries both
    // and each has to be re-posed about the mount that did not ride along.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    const grid = TestBed.inject(GridUtilsService);
    urls.updateFromURL(fixturePayload(twoRamsOneCarrier()), false, true, false);

    const cylinders = mechanism.sealedStructures();
    expect(cylinders.length).toBe(2);
    const measure = () =>
      cylinders.map((cylinder) => ({
        barrel: Math.hypot(
          cylinder.barrelNear.x - cylinder.barrelFar.x,
          cylinder.barrelNear.y - cylinder.barrelFar.y
        ),
        rod: Math.hypot(cylinder.rodFar.x - cylinder.pin.x, cylinder.rodFar.y - cylinder.pin.y),
      }));
    const before = measure();

    const carrier = mechanism.links.find((link) => link.id.includes('D') && link.id.includes('H'))!;
    grid.dragLink(carrier, 0.4 * MODEL_SCALE, 0.3 * MODEL_SCALE);
    mechanism.updateMechanism(false);

    const after = measure();
    for (let i = 0; i < 2; i++) {
      // Rigid bodies stay rigid, and barrel and rod stay equal to each other.
      expect(after[i].barrel).toBeCloseTo(before[i].barrel, 3);
      expect(after[i].rod).toBeCloseTo(after[i].barrel, 3);
    }
  });
});

describe('a ram bigger than the machine it drives', () => {
  it('says how much of its stroke the linkage can actually use', () => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);

    urls.updateFromURL(fixturePayload(cylinderBoomFixture()), false, true, false);
    // A boom sized for its ram uses the whole stroke and says nothing.
    expect(mechanism.cylinderReachWarning()).toBeUndefined();

    urls.updateFromURL(fixturePayload(overRammedBoom()), false, true, false);
    const warning = mechanism.cylinderReachWarning();
    expect(warning, 'a ram that outruns its linkage should say so').toBeDefined();
    expect(warning).toContain('% of its stroke');
    // Warned about, not clamped: the mechanism still runs, and every number it
    // reports is right. Clamping would silently resize a part the user sized
    // and hide the one thing worth knowing.
    expect(mechanism.oneValidMechanismExists()).toBe(true);
  });
});

/** Two rams whose rod mounts both sit on one moving bar. */
function twoRamsOneCarrier(): MechanismFixture {
  const leftMount = { x: -8, y: 0 };
  const rightMount = { x: 8, y: 0 };
  const carrierLeft = { x: -2, y: 7 };
  const carrierRight = { x: 2, y: 7 };
  const a = cylinderBetween(leftMount, carrierLeft, 0.5);
  const b = cylinderBetween(rightMount, carrierRight, 0.5);
  return {
    joints: [
      { id: 'A', ...leftMount, ground: true },
      { id: 'B', ...a.barrelEnd },
      { id: 'C', ...a.pin },
      { id: 'D', ...carrierLeft },
      { id: 'H', ...carrierRight },
      { id: 'E', ...rightMount, ground: true },
      { id: 'F', ...b.barrelEnd },
      { id: 'G', ...b.pin },
    ],
    links: [
      { joints: 'AB' },
      { joints: 'CD' },
      { joints: 'DH' },
      { joints: 'EF' },
      { joints: 'GH' },
    ],
    sliders: [
      { at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true },
      { at: 'G', prisId: 'Q', on: { carrier: 'EF', a: 'E', b: 'F' }, sealed: true },
    ],
    welds: ['C', 'G'],
    inputAngVel: 1,
  };
}

/** Two rams reaching the same moving point from two ground anchors. */
function twoRamsOneMount(): MechanismFixture {
  const shared = { x: 0, y: 6 };
  const left = { x: -7, y: 0 };
  const right = { x: 7, y: 0 };
  const a = cylinderBetween(left, shared, 0.5);
  const b = cylinderBetween(right, shared, 0.5);
  return {
    joints: [
      { id: 'A', ...left, ground: true },
      { id: 'B', ...a.barrelEnd },
      { id: 'C', ...a.pin },
      { id: 'D', ...shared },
      { id: 'E', ...right, ground: true },
      { id: 'F', ...b.barrelEnd },
      { id: 'G', ...b.pin },
    ],
    links: [{ joints: 'AB' }, { joints: 'CD' }, { joints: 'EF' }, { joints: 'GD' }],
    sliders: [
      { at: 'C', prisId: 'P', on: { carrier: 'AB', a: 'A', b: 'B' }, sealed: true },
      { at: 'G', prisId: 'Q', on: { carrier: 'EF', a: 'E', b: 'F' }, sealed: true },
    ],
    welds: ['C', 'G'],
    inputAngVel: 1,
  };
}

/** The Gate 5 boom with its ram's barrel forced to `barrel`, in user units. */
function shrunkBoom(barrel: number): MechanismFixture {
  const base = cylinderBoomFixture();
  const mount = base.joints.find((joint) => joint.id === 'G')!;
  const tip = base.joints.find((joint) => joint.id === 'C')!;
  const span = Math.hypot(tip.x - mount.x, tip.y - mount.y);
  const at = (distance: number) => ({
    x: mount.x + ((tip.x - mount.x) * distance) / span,
    y: mount.y + ((tip.y - mount.y) * distance) / span,
  });
  return {
    ...base,
    joints: base.joints.map((joint) => {
      if (joint.id === 'N') return { ...joint, ...at(barrel) };
      if (joint.id === 'P') return { ...joint, ...at(barrel / 2) };
      return joint;
    }),
  };
}

describe('merging a cylinder mount onto another joint', () => {
  it('keeps the cylinder a cylinder', () => {
    // How a ram is attached to the rest of a linkage, and it was silently
    // deleting the part: the merge moves the mount out of every link it was in
    // and rebuilds connectivity, but the slot on the barrel still named the
    // joint that no longer exists — so the slider stopped being well formed,
    // stopped resolving, and the skin vanished with no message at all.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    urls.updateFromURL(fixturePayload(cylinderBoomFixture()), false, true, false);

    expect(mechanism.sealedStructures().length).toBe(1);
    const cylinder = mechanism.sealedStructures()[0];
    const mount = mechanism.joints.find((joint) => joint.id === cylinder.barrelFar.id)!;
    // The boom's own ground pivot: an ordinary joint on an unrelated link.
    const target = mechanism.joints.find((joint) => joint.id === 'O')!;

    const refusal = mechanism.mergeJoints(mount as RealJoint, target as RealJoint);
    expect(refusal, 'a mount is a legal merge target').toBeUndefined();

    const after = mechanism.sealedStructures();
    expect(after.length, 'the cylinder survives its mount being merged').toBe(1);
    expect(after[0].slider.isSlotWellFormed).toBe(true);
    expect(after[0].slider.isFloating).toBe(true);
    // And the slot now names the joint that survived.
    expect([after[0].slider.slotJointA!.id, after[0].slider.slotJointB!.id]).toContain(target.id);
  });
});
