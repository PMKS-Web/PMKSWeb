import '../model/joint';
import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { PrisJoint, RevJoint } from '../model/joint';
import { RealLink, SliderBlock } from '../model/link';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { DragStateService } from './drag-state.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';

// Option A (docs/joint-types-plan.md §2.3) keeps a slot's carrier and its two
// defining joints outside `links` and `connectedJoints`. Nothing that rebuilds
// those structures can see them, so every way of destroying one is its own
// regression — §4.2.

function createHarness() {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  const svg = new SvgGridService(settings, new DragStateService());
  const synthesis = new SynthesisBuilderService(parser, settings);
  let service!: MechanismService;
  const grid = new GridUtilsService(synthesis, svg, {
    get: () => service,
  } as unknown as Injector);
  const active = new ActiveObjService();
  const injector = { get: () => ({ save: () => {} }) } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);
  return { service, active };
}

/**
 * Crank AB drives a block riding in a slot along the lever CD. The whole point
 * of this shape is that the slider depends on CD without appearing anywhere in
 * CD's joint list.
 */
function slottedLever() {
  const harness = createHarness();
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

/**
 * Fill in `links` and `connectedJoints` from link membership.
 *
 * Not optional bookkeeping: canBeWelded reads `links.length`, so a joint left
 * unwired declines every weld — and a test that welds nothing passes for
 * reasons that have nothing to do with what it claims to check.
 */
function wireGraph(service: MechanismService): void {
  const real = service.joints.filter(
    (joint) => joint instanceof RevJoint || joint instanceof PrisJoint
  );
  real.forEach((joint) => {
    (joint as RevJoint).links = [];
    (joint as RevJoint).connectedJoints = [];
  });
  service.links.forEach((link) => {
    link.joints.forEach((joint) => {
      (joint as RevJoint).links.push(link);
      link.joints.forEach((other) => {
        if (other.id !== joint.id) (joint as RevJoint).connectedJoints.push(other);
      });
    });
  });
}

describe('a slot losing what defines it', () => {
  it('starts out floating on its carrier', () => {
    const s = slottedLever();
    s.service.updateMechanism();

    expect(s.slot.isFloating).toBe(true);
    expect(s.slot.carrier).toBe(s.cd);
    expect(s.slot.slotAngle).toBeCloseTo(Math.atan2(2, -2), 9);
  });

  it('regrounds at its last direction when the carrier is deleted', () => {
    const s = slottedLever();
    const wasPointing = s.slot.slotAngle;
    s.active.updateSelectedObj(s.cd);

    s.service.deleteLink();

    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.carrier).toBeUndefined();
    expect(s.slot.ground).toBe(true);
    // The guide keeps pointing where the slot last did, so the drawing does
    // not jump when the link under it disappears.
    expect(s.slot.slotAngle).toBeCloseTo(wasPointing, 9);
  });

  it('regrounds when a defining joint is merged away by a snap', () => {
    const s = slottedLever();

    // D snaps onto the crank pin, so the carrier no longer has a joint D at all.
    expect(s.service.mergeJoints(s.d, s.b)).toBeUndefined();

    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.ground).toBe(true);
  });

  it('regrounds when a defining joint is deleted outright', () => {
    // Deleting a joint is the one route to a stranded slot that goes through
    // neither mergeJoints nor deleteLink -- it used to end at updateMechanism,
    // which reconciles nothing.
    const s = slottedLever();
    s.active.updateSelectedObj(s.d);

    s.service.deleteJoint();

    expect(s.service.joints.map((joint) => joint.id)).not.toContain('D');
    expect(s.slot.isFloating).toBe(false);
    expect(s.slot.ground).toBe(true);
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
