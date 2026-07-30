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
import { NewGridComponent } from '../component/new-grid/new-grid.component';

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

/** Turn `joint` into a slider: a coincident PrisJoint joined by a block. */
function addSlider(service: MechanismService, joint: RevJoint, prisId: string): PrisJoint {
  const prismatic = new PrisJoint(prisId, joint.x, joint.y, false, true);
  joint.connectedJoints.push(prismatic);
  prismatic.connectedJoints.push(joint);
  const block = new SliderBlock(joint.id + prisId, [joint, prismatic]);
  joint.links.push(block);
  prismatic.links.push(block);
  service.joints.push(prismatic);
  service.links.push(block);
  return prismatic;
}

describe('MechanismService merging onto sliders and welds', () => {
  function scene() {
    const harness = createHarness();
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 2, 0);
    const c = new RevJoint('C', 3, 2);
    const x = new RevJoint('X', 6, 6);
    const y = new RevJoint('Y', 8, 6);
    // A second free bar whose near end is grounded, for the case where the
    // survivor of a merge can no longer be welded.
    const z = new RevJoint('Z', 10, 10, false, true);
    const w = new RevJoint('W', 12, 10);
    const wire = (id: string, joints: RevJoint[]) => {
      const link = new RealLink(id, joints);
      joints.forEach((joint) => {
        joint.links.push(link);
        joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
      });
      return link;
    };
    harness.service.joints = [a, b, c, x, y, z, w];
    harness.service.links = [
      wire('AB', [a, b]),
      wire('BC', [b, c]),
      wire('XY', [x, y]),
      wire('ZW', [z, w]),
    ];
    return { ...harness, a, b, c, x, y, z, w };
  }

  // Dropping a pin onto a slider's pin is how a pin-in-slot gets built.
  it('pins a dragged joint onto a slider without disturbing the block', () => {
    const s = scene();
    const prismatic = addSlider(s.service, s.c, 'P');

    expect(s.service.mergeJoints(s.x, s.c)).toBeUndefined();

    expect(s.service.joints.map((joint) => joint.id).sort()).toEqual([
      'A',
      'B',
      'C',
      'P',
      'W',
      'Y',
      'Z',
    ]);
    expect(s.c.links.map((link) => link.id).sort()).toEqual(['BC', 'CP', 'CY']);
    expect([prismatic.x, prismatic.y]).toEqual([s.c.x, s.c.y]);
    expect(s.c.connectedJoints.some((joint) => joint instanceof PrisJoint)).toBe(true);
  });

  it('carries a slider across when the dragged joint is the one riding it', () => {
    const s = scene();
    const prismatic = addSlider(s.service, s.x, 'P');

    expect(s.service.mergeJoints(s.x, s.c)).toBeUndefined();

    expect(s.service.joints.map((joint) => joint.id).sort()).toEqual([
      'A',
      'B',
      'C',
      'P',
      'W',
      'Y',
      'Z',
    ]);
    // The block followed its pin, so the slot now rides the survivor.
    expect([prismatic.x, prismatic.y]).toEqual([s.c.x, s.c.y]);
    expect(s.c.connectedJoints.some((joint) => joint.id === 'P')).toBe(true);
    expect(s.c.links.some((link) => link instanceof SliderBlock)).toBe(true);
  });

  it('refuses to put two sliders on one pin', () => {
    const s = scene();
    addSlider(s.service, s.x, 'P');
    addSlider(s.service, s.c, 'Q');

    expect(s.service.mergeJoints(s.x, s.c)).toBe('two-sliders');
    expect(s.service.joints.some((joint) => joint.id === 'X')).toBe(true);
  });

  // "Snap onto a welded joint" has to mean the arriving link joins the compound,
  // not that the joint keeps a welded flag with a loose link beside it.
  it('re-welds the survivor so the arriving link joins the compound', () => {
    const s = scene();
    s.service.weldJoint(s.b);
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['ABC', 'XY', 'ZW']);

    expect(s.service.mergeJoints(s.x, s.b)).toBeUndefined();

    expect(s.b.isWelded).toBe(true);
    const compound = s.service.links.find(
      (link) => (link as RealLink).subset.length > 0
    ) as RealLink;
    expect(compound.subset.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'BY']);
    expect(compound.joints.map((joint) => joint.id).sort()).toEqual(['A', 'B', 'C', 'Y']);
  });

  // A weld cannot form on a grounded joint, so a merge that grounds the
  // survivor takes the weld away. Losing it silently would leave the user with
  // a different linkage than the one they dropped.
  it('leaves the survivor unwelded when the merge makes it unweldable', () => {
    const s = scene();
    s.service.weldJoint(s.b);
    expect(s.b.isWelded).toBe(true);

    expect(s.service.mergeJoints(s.z, s.b)).toBeUndefined();

    expect(s.b.ground).toBe(true);
    expect(s.b.isWelded).toBe(false);
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC', 'BW', 'XY']);
    expect(s.service.links.every((link) => (link as RealLink).subset.length === 0)).toBe(true);
  });

  // The defect the exact-duplicate test missed: B and C are already fixed
  // relative to each other by the ternary body.
  it('refuses a bar that would double a pair a ternary link already holds', () => {
    const harness = createHarness();
    const b = new RevJoint('B', -2.7, 0.9);
    const c = new RevJoint('C', 2.9, 2.2);
    const g = new RevJoint('G', 0.7, 0.8);
    const f = new RevJoint('F', 1, 4);
    const wire = (id: string, joints: RevJoint[]) => {
      const link = new RealLink(id, joints);
      joints.forEach((joint) => {
        joint.links.push(link);
        joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
      });
      return link;
    };
    harness.service.joints = [b, c, g, f];
    harness.service.links = [wire('BCG', [b, c, g]), wire('BF', [b, f])];

    expect(harness.service.mergeJoints(f, c)).toBe('over-constrained');
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['BCG', 'BF']);
  });
});

describe('MechanismService declining a weld that pins a pair twice', () => {
  /** A triangle: bars A-B, B-C and A-C. Welding at B closes A and C twice. */
  function triangle() {
    const harness = createHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 2, 3);
    const wire = (id: string, joints: RevJoint[]) => {
      const link = new RealLink(id, joints);
      joints.forEach((joint) => {
        joint.links.push(link);
        joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
      });
      return link;
    };
    harness.service.joints = [a, b, c];
    harness.service.links = [wire('AB', [a, b]), wire('BC', [b, c]), wire('AC', [a, c])];
    return { ...harness, a, b, c };
  }

  // Welding B fuses AB and BC into ABC, which then holds A and C — the pair the
  // existing AC bar already holds. Clicking Weld is deliberate, so the edit goes
  // through and the user is told; only a drag onto the same geometry is refused,
  // because a drop is far more easily done by accident.
  it('welds anyway, because pressing the button is a deliberate act', () => {
    const scene = triangle();

    scene.service.weldJoint(scene.b);

    expect(scene.b.isWelded).toBe(true);
    expect(scene.service.links.map((link) => link.id)).toEqual(['AC', 'ABC']);
    expect(scene.saveCount()).toBe(1);
  });

  it('names the pair it just pinned twice', () => {
    const scene = triangle();
    const notify = vi.spyOn(NewGridComponent, 'sendNotification').mockImplementation(() => {});

    scene.service.weldJoint(scene.b);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatch(/\bA and C\b/);
    notify.mockRestore();
  });

  // A mechanism may legitimately arrive already holding a redundant pin — that
  // is what makes those simulate — so an unrelated weld must not be blamed for
  // it, or every later edit would warn about joints nowhere near the click.
  it('says nothing about redundancy that was already there', () => {
    const harness = createHarness();
    const wire = (id: string, joints: RevJoint[]) => {
      const link = new RealLink(id, joints);
      joints.forEach((joint) => {
        joint.links.push(link);
        joints.filter((o) => o !== joint).forEach((o) => joint.connectedJoints.push(o));
      });
      return link;
    };
    // P and Q are held twice before anything is welded.
    const [p, q, r] = [new RevJoint('P', 0, 0), new RevJoint('Q', 2, 0), new RevJoint('R', 1, 2)];
    // An unrelated chain, where welding Y is perfectly ordinary.
    const [x, y, z] = [new RevJoint('X', 9, 0), new RevJoint('Y', 11, 0), new RevJoint('Z', 13, 1)];
    harness.service.joints = [p, q, r, x, y, z];
    harness.service.links = [
      wire('PQ', [p, q]),
      wire('PQR', [p, q, r]),
      wire('XY', [x, y]),
      wire('YZ', [y, z]),
    ];
    const notify = vi.spyOn(NewGridComponent, 'sendNotification').mockImplementation(() => {});

    harness.service.weldJoint(y);

    expect(y.isWelded).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    notify.mockRestore();
  });

  // The mechanism still has to move — that is the whole reason for allowing it.
  it('leaves the welded result mobile', () => {
    const scene = triangle();
    scene.a.ground = true;
    scene.service.weldJoint(scene.b);
    scene.service.updateMechanism();

    expect(scene.service.mechanisms[0].dof).toBeGreaterThanOrEqual(0);
  });

  it('still welds where no pair would be pinned twice', () => {
    const scene = triangle();
    scene.service.links = scene.service.links.filter((link) => link.id !== 'AC');
    scene.a.links = scene.a.links.filter((link) => link.id !== 'AC');
    scene.c.links = scene.c.links.filter((link) => link.id !== 'AC');

    scene.service.weldJoint(scene.b);

    expect(scene.b.isWelded).toBe(true);
    expect(scene.service.links.map((link) => link.id)).toEqual(['ABC']);
    expect(scene.saveCount()).toBe(1);
  });
});

describe('MechanismService un-grounding one slider among several', () => {
  function twoSliders() {
    const harness = createHarness();
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const ab = new RealLink('AB', [a, b]);
    [a, b].forEach((joint) => joint.links.push(ab));
    a.connectedJoints.push(b);
    b.connectedJoints.push(a);
    harness.service.joints.push(a, b);
    harness.service.links.push(ab);
    const first = addSlider(harness.service, a, 'P');
    const second = addSlider(harness.service, b, 'Q');
    return { ...harness, a, b, first, second };
  }

  it('takes apart only the selected slider', () => {
    // toggleGround used to reach for the first SliderBlock in the mechanism
    // rather than the selected joint's own, so un-grounding the second slider
    // dismantled the first one instead.
    const s = twoSliders();
    s.active.updateSelectedObj(s.second);

    s.service.toggleGround();

    expect(s.service.joints.map((joint) => joint.id).sort()).toEqual(['A', 'B', 'P']);
    expect(s.service.links.map((link) => link.id).sort()).toEqual(['AB', 'AP']);
  });

  it('leaves the untouched slider fully connected', () => {
    const s = twoSliders();
    s.active.updateSelectedObj(s.second);

    s.service.toggleGround();

    expect(s.a.links.some((link) => link instanceof SliderBlock)).toBe(true);
    expect(s.a.connectedJoints.some((joint) => joint.id === 'P')).toBe(true);
    expect(s.first.links).toHaveLength(1);
  });

  it('grounds the pin the removed slider was riding', () => {
    const s = twoSliders();
    s.active.updateSelectedObj(s.second);

    s.service.toggleGround();

    expect(s.b.ground).toBe(true);
    expect(s.b.links.some((link) => link instanceof SliderBlock)).toBe(false);
  });
});
