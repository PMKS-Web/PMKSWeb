import '../model/joint';
import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { PrisJoint, RevJoint } from '../model/joint';
import { SliderBlock, RealLink } from '../model/link';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { DragStateService } from './drag-state.service';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';

function createHarness() {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  // GridUtilsService resolves MechanismService at call time, so it has to be
  // handed an injector that reads the binding below rather than a finished one.
  let service!: MechanismService;
  const grid = new GridUtilsService(
    new SynthesisBuilderService(parser, settings),
    new SvgGridService(settings, new DragStateService()),
    { get: () => service } as unknown as Injector
  );
  const active = new ActiveObjService();
  let saves = 0;
  const injector = { get: () => ({ save: () => saves++ }) } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);
  return { service, grid, active, settings, saveCount: () => saves };
}

function wire(id: string, joints: RevJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => {
    joint.links.push(link);
    joints.filter((other) => other !== joint).forEach((other) => joint.connectedJoints.push(other));
  });
  return link;
}

/** A grounded four-bar: A and D pinned, B-C the coupler that gets dragged. */
function createFourBar() {
  const harness = createHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 2);
  const c = new RevJoint('C', 4, 3);
  const d = new RevJoint('D', 5, 0, false, true);
  const ab = wire('AB', [a, b]);
  const bc = wire('BC', [b, c]);
  const cd = wire('CD', [c, d]);
  harness.service.joints = [a, b, c, d];
  harness.service.links = [ab, bc, cd];
  harness.service.updateMechanism();
  return { ...harness, a, b, c, d, ab, bc, cd };
}

describe('GridUtilsService.dragLink', () => {
  it('translates every joint of the dragged link by the same offset', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.b.x, scene.b.y]).toEqual([1.5, 1.5]);
    expect([scene.c.x, scene.c.y]).toEqual([5.5, 2.5]);
  });

  it('leaves the joints of neighbouring links where they were', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.a.x, scene.a.y]).toEqual([0, 0]);
    expect([scene.d.x, scene.d.y]).toEqual([5, 0]);
  });

  // A translation is rigid, so the body's own centre of mass moves with it. A
  // link whose CoM the user placed by hand must not have it silently re-derived.
  it('carries a hand-placed centre of mass along instead of recomputing it', () => {
    const scene = createFourBar();
    scene.bc.CoM = new Coord(1, 2.9);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([scene.bc.CoM.x, scene.bc.CoM.y]).toEqual([2.5, 2.4]);
  });

  it('recomputes a neighbouring link, which was deformed rather than moved', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect(scene.ab.CoM.x).toBeCloseTo((scene.a.x + scene.b.x) / 2, 12);
    expect(scene.ab.CoM.y).toBeCloseTo((scene.a.y + scene.b.y) / 2, 12);
    expect(scene.ab.length).toBeCloseTo(Math.hypot(scene.b.x, scene.b.y), 12);
  });

  it('moves a force on the dragged link with the body', () => {
    const scene = createFourBar();
    const force = new Force('F1', scene.bc, new Coord(2, 2.5), new Coord(2, 3.5), false, true, 10);
    scene.bc.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([force.startCoord.x, force.startCoord.y]).toEqual([3.5, 2]);
    expect([force.endCoord.x, force.endCoord.y]).toEqual([3.5, 3]);
  });

  // A load is fixed to the body it acts on. Leaving it at its old world
  // position while the link deforms under it would silently move it to a
  // different point of the link, and the drag saves that as the real load.
  it('carries a force on a neighbouring link with the link it is attached to', () => {
    const scene = createFourBar();
    // Halfway along AB, which runs from A(0,0) to B(0,2).
    const force = new Force('F1', scene.ab, new Coord(0, 1), new Coord(1, 1), false, true, 10);
    scene.ab.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 0, 2);

    // B moved to (0,4), so the midpoint of AB is now (0,2).
    expect(force.startCoord.x).toBeCloseTo(0, 6);
    expect(force.startCoord.y).toBeCloseTo(2, 6);
  });

  it('leaves a force alone on a link no joint of which moved', () => {
    const scene = createFourBar();
    const e = new RevJoint('E', 20, 20);
    const f = new RevJoint('F', 22, 20);
    const idle = wire('EF', [e, f]);
    scene.service.joints.push(e, f);
    scene.service.links.push(idle);
    const force = new Force('F2', idle, new Coord(21, 20), new Coord(21, 21), false, true, 10);
    idle.forces.push(force);
    scene.service.forces.push(force);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([force.startCoord.x, force.startCoord.y]).toEqual([21, 20]);
  });

  it('leaves the mechanism solvable after the drag', () => {
    const scene = createFourBar();

    scene.grid.dragLink(scene.bc, 0.3, 0.2);

    expect(scene.service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(scene.service.mechanisms[0].dof).toBe(1);
  });

  it('does nothing at all for a zero-length drag', () => {
    const scene = createFourBar();
    const rebuild = vi.spyOn(scene.service, 'updateMechanism');

    scene.grid.dragLink(scene.bc, 0, 0);

    expect([scene.b.x, scene.b.y]).toEqual([0, 2]);
    expect(rebuild).not.toHaveBeenCalled();
  });

  // Drags are continuous; the undo entry belongs to the release, not to each
  // pointer-move along the way.
  it('rebuilds without saving, once per call', () => {
    const scene = createFourBar();
    const rebuild = vi.spyOn(scene.service, 'updateMechanism');

    scene.grid.dragLink(scene.bc, 0.3, 0.2);
    scene.grid.dragLink(scene.bc, 0.3, 0.2);

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild).toHaveBeenCalledWith(false);
    expect(scene.saveCount()).toBe(0);
  });

  it('keeps a slider block coincident with the pin it rides', () => {
    const scene = createFourBar();
    const prismatic = new PrisJoint('E', scene.c.x, scene.c.y, false, true);
    scene.c.connectedJoints.push(prismatic);
    prismatic.connectedJoints.push(scene.c);
    const block = new SliderBlock('CE', [scene.c, prismatic]);
    scene.c.links.push(block);
    prismatic.links.push(block);
    scene.service.joints.push(prismatic);
    scene.service.links.push(block);

    scene.grid.dragLink(scene.bc, 1.5, -0.5);

    expect([prismatic.x, prismatic.y]).toEqual([scene.c.x, scene.c.y]);
  });
});
