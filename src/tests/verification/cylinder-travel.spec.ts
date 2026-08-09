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
import { BORE_R, cylinderStrokeAlong } from '../../app/model/cylinder';
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
 * The ground anchor moves out so the boom's own reach narrows while the ram
 * keeps a full stroke: extended, the ram asks for a span the linkage cannot
 * assemble, and it turns back before its own stop.
 */
function overRammedBoom(): MechanismFixture {
  const base = cylinderBoomFixture();
  const mount = { x: 3.6, y: 0 };
  const tip = base.joints.find((joint) => joint.id === 'C')!;
  const { barrelEnd, pin } = cylinderBetween(mount, { x: tip.x, y: tip.y }, 0);
  return {
    ...base,
    joints: base.joints.map((joint) => {
      if (joint.id === 'G') return { ...joint, ...mount };
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
    const under = cylinderStrokeAlong(BORE_R * r * 0.5, r);

    expect(under.usable).toBe(false);
    expect(under.max).toBeGreaterThanOrEqual(under.min);
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
    const starved: MechanismFixture = shrunkBoom(BORE_R * 0.15 * 0.6);
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

  it('marks both stops, and puts them where the head actually bottoms out', () => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const urls = TestBed.inject(UrlProcessorService);
    const marks = new SliderMarkService();
    urls.updateFromURL(fixturePayload(cylinderBoomFixture()), false, true, false);

    const r = 0.15 * SettingsService.objectScale;
    const [mark] = marks.cylinderMarks(mechanism.joints, r, true);
    // Two stops, two edges each.
    expect(mark.stops.length).toBe(4);

    const at = [...new Set(mark.stops.map((stop) => Math.round(stop.x1 * 1e6) / 1e6))].sort(
      (a, b) => a - b
    );
    expect(at.length).toBe(2);
    // The gap between them is the stroke itself -- one definition, so the mark
    // on the barrel cannot disagree with the travel the simulation runs.
    const xs = numbers(mark.barrel).filter((_, i) => i % 2 === 0);
    const barrelLength = Math.max(...xs) - Math.min(...xs);
    const travel = cylinderStrokeAlong(barrelLength, r);
    expect(at[1] - at[0]).toBeCloseTo(travel.max - travel.min, 4);
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
