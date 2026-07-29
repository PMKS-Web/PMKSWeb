import '../model/joint';
import { Injector } from '@angular/core';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { SliderBlock, RealLink } from '../model/link';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { LengthUnit } from '../model/unit-enums';
import { ActiveObjService } from './active-obj.service';
import { ColorService } from './color.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';
import { SvgGridService } from './svg-grid.service';
import { DragStateService } from './drag-state.service';
import { UrlGenerationService } from './url-generation.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';

interface Harness {
  service: MechanismService;
  active: ActiveObjService;
  settings: SettingsService;
  grid: GridUtilsService;
  saveCount: () => number;
}

function createHarness(): Harness {
  if (!ColorService.instance) new ColorService();
  const settings = new SettingsService();
  const parser = new NumberUnitParserService();
  const svg = new SvgGridService(settings, new DragStateService());
  const synthesis = new SynthesisBuilderService(parser, settings);
  // GridUtilsService resolves MechanismService at call time, so it has to be
  // handed an injector that reads the binding below rather than a finished one.
  let service!: MechanismService;
  const grid = new GridUtilsService(synthesis, svg, {
    get: () => service,
  } as unknown as Injector);
  const active = new ActiveObjService();
  let saves = 0;
  const injector = { get: () => ({ save: () => saves++ }) } as unknown as Injector;
  service = new MechanismService(grid, active, injector, settings, parser);
  return { service, active, settings, grid, saveCount: () => saves };
}

function createChain(jointCount = 3) {
  const harness = createHarness();
  const joints = Array.from(
    { length: jointCount },
    (_, index) => new RevJoint(String.fromCharCode(65 + index), index, 0)
  );
  const links = joints.slice(0, -1).map((joint, index) => {
    const link = new RealLink(joint.id + joints[index + 1].id, [joint, joints[index + 1]]);
    joint.links.push(link);
    joints[index + 1].links.push(link);
    joint.connectedJoints.push(joints[index + 1]);
    joints[index + 1].connectedJoints.push(joint);
    return link;
  });
  harness.service.joints = joints;
  harness.service.links = links;
  return { ...harness, joints, links };
}

function attachForce(service: MechanismService, link: RealLink, id: string, x: number): Force {
  const force = new Force(id, link, new Coord(x, 0), new Coord(x, 1), false, true, 10);
  link.forces.push(force);
  service.forces.push(force);
  return force;
}

describe('MechanismService welded links and force ownership', () => {
  it('welds transactionally, aggregates physical properties, and migrates forces', () => {
    const harness = createChain();
    harness.links[0].fill = '#112233';
    harness.links[1].fill = '#445566';
    harness.links[0].mass = 2;
    harness.links[0].massMoI = 3;
    harness.links[0].CoM = new Coord(0.5, 0);
    harness.links[1].mass = 1;
    harness.links[1].massMoI = 4;
    harness.links[1].CoM = new Coord(1.5, 0);
    const force = attachForce(harness.service, harness.links[0], 'F1', 0.25);

    harness.service.weldJoint(harness.joints[1]);

    expect(harness.service.links).toHaveLength(1);
    const compound = harness.service.links[0] as RealLink;
    expect(compound.id).toBe('ABC');
    expect(compound.fill).toBe('#112233');
    expect(compound.subset.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
    expect(compound.mass).toBe(3);
    expect(compound.CoM.x).toBeCloseTo(5 / 6, 12);
    expect(compound.CoM.y).toBe(0);
    expect(compound.massMoI).toBeCloseTo(23 / 3, 12);
    compound.reComputeDPath();
    expect(compound.CoM.x).toBeCloseTo(5 / 6, 12);
    expect(force.link).toBe(compound);
    expect(compound.forces).toEqual([force]);
    expect(harness.links.every((link) => link.forces.length === 0)).toBe(true);
    expect(harness.joints[1].isWelded).toBe(true);
    expect(harness.saveCount()).toBe(1);

    for (const joint of harness.joints) {
      expect(joint.links).toEqual([compound]);
      expect(new Set(joint.connectedJoints.map((candidate) => candidate.id)).size).toBe(
        joint.connectedJoints.length
      );
    }
  });

  it('partially and fully unwelds adjacent welds with one save per command', () => {
    const harness = createChain(4);
    harness.service.weldJoint(harness.joints[1]);
    harness.service.weldJoint(harness.joints[2]);
    expect(harness.service.links.map((link) => link.id)).toEqual(['ABCD']);
    expect(harness.saveCount()).toBe(2);

    harness.service.unWeldJoint(harness.joints[1]);
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BCD']);
    expect(harness.joints[1].isWelded).toBe(false);
    expect(harness.joints[2].isWelded).toBe(true);
    expect(harness.saveCount()).toBe(3);

    harness.service.unWeldJoint(harness.joints[2]);
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'CD']);
    expect(harness.joints.every((joint) => !joint.isWelded)).toBe(true);
    expect(harness.saveCount()).toBe(4);
  });

  it('unwelds all joints as a single undoable edit', () => {
    const harness = createChain(4);
    harness.service.weldJoint(harness.joints[1]);
    harness.service.weldJoint(harness.joints[2]);
    harness.service.unweldAll();
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'CD']);
    expect(harness.saveCount()).toBe(3);
  });

  it('reassigns a compound force to the nearest resulting link without moving it', () => {
    const harness = createChain();
    const force = attachForce(harness.service, harness.links[0], 'F1', 0.25);
    harness.service.weldJoint(harness.joints[1]);
    const start = force.startCoord.clone();

    harness.service.unWeldJoint(harness.joints[1]);

    expect(force.link.id).toBe('AB');
    expect(force.startCoord).toEqual(start);
    expect((harness.service.links.find((link) => link.id === 'AB') as RealLink).forces).toEqual([
      force,
    ]);
    expect((harness.service.links.find((link) => link.id === 'BC') as RealLink).forces).toEqual([]);
  });

  it('removes both force references and does not delete unrelated forces with a link', () => {
    const harness = createChain();
    const first = attachForce(harness.service, harness.links[0], 'F1', 0.25);
    const secondLink = harness.links[1];
    const second = attachForce(harness.service, secondLink, 'F2', 1.75);
    harness.active.updateSelectedObj(first);
    harness.service.deleteForce();
    expect(harness.service.forces).toEqual([second]);
    expect(harness.links[0].forces).toEqual([]);

    harness.active.updateSelectedObj(harness.links[0]);
    harness.service.deleteLink();
    expect(harness.service.forces).toEqual([second]);
    expect(second.link).toBe(secondLink);
    expect(secondLink.forces).toEqual([second]);
  });

  it('preserves piston connectivity when rebuilding after a weld', () => {
    const harness = createChain();
    const slider = new PrisJoint('P', 2, 0, false, true);
    const piston = new SliderBlock('CP', [harness.joints[2], slider]);
    harness.joints[2].links.push(piston);
    harness.joints[2].connectedJoints.push(slider);
    slider.links.push(piston);
    slider.connectedJoints.push(harness.joints[2]);
    harness.service.joints.push(slider);
    harness.service.links.push(piston);

    harness.service.weldJoint(harness.joints[1]);

    const c = harness.joints[2] as RealJoint;
    expect(c.links.map((link) => link.id).sort()).toEqual(['ABC', 'CP']);
    expect(c.connectedJoints).toContain(slider);
    expect(slider.links).toEqual([piston]);
    expect(slider.connectedJoints).toContain(c);
  });

  it('converts all physical properties together with one undo checkpoint', () => {
    const harness = createChain();
    const link = harness.links[0];
    link.mass = 2;
    link.massMoI = 3;
    link.CoM = new Coord(0.5, 0);
    const force = attachForce(harness.service, link, 'F1', 0.25);

    harness.settings.lengthUnit.next(LengthUnit.METER);
    harness.service.updateLinkageUnits(LengthUnit.CM, LengthUnit.METER);

    expect(harness.joints[1].x).toBeCloseTo(0.01, 12);
    expect(link.mass).toBeCloseTo(0.002, 12);
    expect(link.massMoI).toBeCloseTo(0.0003, 12);
    expect(link.CoM.x).toBeCloseTo(0.005, 12);
    expect(force.startCoord.x).toBeCloseTo(0.0025, 12);
    expect(force.mag).toBe(10);
    expect(harness.saveCount()).toBe(1);

    harness.settings.lengthUnit.next(LengthUnit.INCH);
    harness.service.updateLinkageUnits(LengthUnit.METER, LengthUnit.INCH);

    expect(harness.joints[1].x).toBeCloseTo(0.01 / 0.0254, 12);
    expect(link.mass).toBeCloseTo(0.002 / 0.45359237, 12);
    expect(link.massMoI).toBeCloseTo(0.0003 / (0.45359237 * 0.0254 * 0.0254), 12);
    // Force converts N -> lbf as the exact reciprocal of NEWTONS_PER_LBF.
    expect(force.mag).toBeCloseTo(10 / 4.4482216152605, 12);
    expect(harness.saveCount()).toBe(2);

    harness.service.updateLinkageUnits(LengthUnit.INCH, LengthUnit.INCH);
    expect(harness.saveCount()).toBe(2);
  });

  it('round-trips cm -> in -> cm back to the original physical values', () => {
    const harness = createChain();
    const link = harness.links[0];
    link.mass = 2;
    link.massMoI = 3;
    link.CoM = new Coord(0.5, 0);
    const force = attachForce(harness.service, link, 'F1', 0.25);
    const original = {
      x: harness.joints[1].x,
      mass: link.mass,
      massMoI: link.massMoI,
      comX: link.CoM.x,
      startX: force.startCoord.x,
      mag: force.mag,
    };

    harness.service.updateLinkageUnits(LengthUnit.CM, LengthUnit.INCH);
    harness.service.updateLinkageUnits(LengthUnit.INCH, LengthUnit.CM);

    expect(harness.joints[1].x).toBeCloseTo(original.x, 12);
    expect(link.mass).toBeCloseTo(original.mass, 12);
    expect(link.massMoI).toBeCloseTo(original.massMoI, 12);
    expect(link.CoM.x).toBeCloseTo(original.comX, 12);
    expect(force.startCoord.x).toBeCloseTo(original.startX, 12);
    expect(force.mag).toBeCloseTo(original.mag, 12);
  });

  it('converts the RPM setting once at the mechanism boundary and preserves direction', () => {
    const harness = createChain();
    harness.settings.inputSpeed.next(60);
    harness.settings.lengthUnit.next(LengthUnit.METER);
    harness.settings.isInputCW.next(false);
    harness.service.updateMechanism();
    expect(harness.service.mechanisms[0].inputAngularVelocities[0]).toBeCloseTo(2 * Math.PI, 12);
    expect(harness.service.mechanisms[0].unit).toBe('m');

    harness.settings.isInputCW.next(true);
    harness.service.updateMechanism();
    expect(harness.service.mechanisms[0].inputAngularVelocities[0]).toBeCloseTo(-2 * Math.PI, 12);
  });
});

/**
 * An open chain A-B-C plus a short stub D-E parked next to C. Dragging E onto C
 * is the gesture that closes it into a four-bar, which is the shape Gate 1 asks
 * a merge to produce.
 */
function createOpenFourBar() {
  const harness = createHarness();
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 1, 2);
  const c = new RevJoint('C', 4, 2);
  const d = new RevJoint('D', 5, 0, false, true);
  const e = new RevJoint('E', 4.05, 2.05);

  const wire = (id: string, joints: RevJoint[]) => {
    const link = new RealLink(id, joints);
    joints.forEach((joint) => {
      joint.links.push(link);
      joints
        .filter((other) => other !== joint)
        .forEach((other) => joint.connectedJoints.push(other));
    });
    return link;
  };

  const links = [wire('AB', [a, b]), wire('BC', [b, c]), wire('DE', [d, e])];
  harness.service.joints = [a, b, c, d, e];
  harness.service.links = links;
  harness.service.updateMechanism();
  return { ...harness, a, b, c, d, e };
}

describe('MechanismService joint merging', () => {
  it('closes an open chain into a solvable four-bar', () => {
    const scene = createOpenFourBar();

    expect(scene.service.mergeJoints(scene.e, scene.c)).toBeUndefined();

    expect(scene.service.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(scene.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'CD']);
    expect(scene.service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(scene.service.mechanisms[0].dof).toBe(1);
  });

  it('rebuilds the joint graph so the survivor carries the merged connections', () => {
    const scene = createOpenFourBar();

    scene.service.mergeJoints(scene.e, scene.c);

    expect(scene.c.links.map((link) => link.id).sort()).toEqual(['BC', 'CD']);
    expect(scene.c.connectedJoints.map((joint) => joint.id).sort()).toEqual(['B', 'D']);
    expect(scene.d.connectedJoints.map((joint) => joint.id)).toEqual(['C']);
    expect(
      scene.service.joints.some((joint) =>
        (joint as RealJoint).connectedJoints.some((candidate) => candidate.id === 'E')
      )
    ).toBe(false);
  });

  // Ground and input are things the user set deliberately. Dropping either on
  // the floor would quietly change what the mechanism is.
  it('carries ground and input onto the survivor', () => {
    const scene = createOpenFourBar();
    scene.e.ground = true;

    scene.service.mergeJoints(scene.e, scene.c);

    expect(scene.c.ground).toBe(true);
    expect(scene.c.input).toBe(false);
  });

  it('renames the link and its fixed-location entries to the surviving joint', () => {
    const scene = createOpenFourBar();
    const de = scene.service.links.find((link) => link.id === 'DE')!;
    de.fixedLocation.fixedPoint = 'E';

    scene.service.mergeJoints(scene.e, scene.c);

    expect(de.id).toBe('CD');
    expect(de.fixedLocations.map((location) => location.id).sort()).toEqual(['C', 'D', 'com']);
    expect(de.fixedLocation.fixedPoint).toBe('C');
  });

  it('refuses an illegal merge and leaves the mechanism untouched', () => {
    const scene = createOpenFourBar();

    expect(scene.service.mergeJoints(scene.b, scene.c)).toBe('shares-a-link');

    expect(scene.service.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(scene.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'DE']);
  });

  // The merge is the tail of a drag, and the gesture owns the single undo entry
  // it earns. Saving here as well would push two states for one drop.
  it('does not save on its own', () => {
    const scene = createOpenFourBar();

    scene.service.mergeJoints(scene.e, scene.c);

    expect(scene.saveCount()).toBe(0);
  });

  it('moves the selection to the surviving joint', () => {
    const scene = createOpenFourBar();
    scene.active.updateSelectedObj(scene.e);

    scene.service.mergeJoints(scene.e, scene.c);

    expect(scene.active.selectedJoint).toBe(scene.c);
  });

  it('round-trips the merged mechanism through the URL', () => {
    const scene = createOpenFourBar();
    scene.service.mergeJoints(scene.e, scene.c);

    const encoded = new UrlGenerationService(
      scene.service,
      scene.settings,
      scene.active
    ).generateUrlQuery();
    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    const restored = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(restored, decoder, new SettingsService(), new ActiveObjService()).build(
      true
    );

    expect(restored.joints.map((joint) => joint.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(restored.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'CD']);
    expect(restored.joints.map((joint) => [joint.x, joint.y])).toEqual(
      scene.service.joints.map((joint) => [joint.x, joint.y])
    );
  });
});
