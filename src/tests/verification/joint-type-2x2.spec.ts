// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';

// Gate 4: every cell of the 2x2 reachable from every other in at most two
// clicks, and each control change altering exactly one thing.
//
// The 2x2 is {no slider, slider} x {not welded, welded} = Pin, compound, Slot,
// Slide (§2.1). It is a hypercube rather than a type list, which is the whole
// argument for two independent toggles over a three-way picker: neighbours are
// one click, diagonals are two, and no combination is unreachable.

interface Scene {
  service: ReturnType<typeof createMechanismHarness>['service'];
  active: ReturnType<typeof createMechanismHarness>['active'];
  b: RevJoint;
}

/** A---B---C, so B has two links and can therefore be welded. */
function bentBar(): Scene {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 3, 2);
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
  harness.service.joints = [a, b, c];
  harness.service.links = [wire('AB', [a, b]), wire('BC', [b, c])];
  harness.active.updateSelectedObj(b);
  return { service: harness.service, active: harness.active, b };
}

/** Which cell of the 2x2 joint B is in, read off the model rather than the UI. */
function cellOf(scene: Scene): { slider: boolean; welded: boolean } {
  return {
    slider: scene.b.links.some((link) => link instanceof SliderBlock),
    welded: scene.b.isWelded,
  };
}

function setSlider(scene: Scene, on: boolean): void {
  if (cellOf(scene).slider === on) return;
  scene.active.updateSelectedObj(scene.b);
  scene.service.toggleSlider();
}

function setWeld(scene: Scene, on: boolean): void {
  if (cellOf(scene).welded === on) return;
  scene.active.updateSelectedObj(scene.b);
  if (on) scene.service.weldJoint();
  else scene.service.unweldSelectedJoint();
}

const CELLS = [
  { slider: false, welded: false, name: 'Pin' },
  { slider: false, welded: true, name: 'compound' },
  { slider: true, welded: false, name: 'Slot' },
  { slider: true, welded: true, name: 'Slide' },
];

describe('the 2x2 of joint types', () => {
  it('reaches every cell from every other in at most two clicks', () => {
    for (const from of CELLS) {
      for (const to of CELLS) {
        const scene = bentBar();
        setSlider(scene, from.slider);
        setWeld(scene, from.welded);
        expect(cellOf(scene), `starting at ${from.name}`).toEqual({
          slider: from.slider,
          welded: from.welded,
        });

        let clicks = 0;
        if (cellOf(scene).slider !== to.slider) {
          setSlider(scene, to.slider);
          clicks++;
        }
        if (cellOf(scene).welded !== to.welded) {
          setWeld(scene, to.welded);
          clicks++;
        }

        expect(cellOf(scene), `${from.name} -> ${to.name}`).toEqual({
          slider: to.slider,
          welded: to.welded,
        });
        expect(clicks, `${from.name} -> ${to.name} click count`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('changes exactly one axis per control', () => {
    // The reason for two toggles rather than a type picker: unwelding a Slide
    // must give a Slot, not a pin. A control that changed both axes at once
    // would still satisfy the reachability count above.
    const scene = bentBar();
    setSlider(scene, true);
    setWeld(scene, true);
    expect(cellOf(scene)).toEqual({ slider: true, welded: true });

    setWeld(scene, false);
    expect(cellOf(scene), 'unwelding a Slide leaves a Slot').toEqual({
      slider: true,
      welded: false,
    });

    setWeld(scene, true);
    setSlider(scene, false);
    expect(cellOf(scene), 'un-slidering a Slide leaves a weld or nothing to weld').toEqual({
      slider: false,
      welded: cellOf(scene).welded,
    });
  });
});

describe('the Slider toggle', () => {
  it('leaves a new slider dangling rather than deciding where it is grounded', () => {
    // Slider and Ground are independent axes, so switching one must not decide
    // the other. A floating slot needs a carrier, which is geometry the drop
    // gesture supplies -- no toggle can invent one, and silently grounding it
    // would put the slot somewhere nobody chose.
    const scene = bentBar();

    setSlider(scene, true);

    const slider = scene.service.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;
    expect(slider).toBeDefined();
    expect(slider.isDangling).toBe(true);
    expect(slider.ground).toBe(false);
  });

  it('gives back the slot it had, rather than building a different one', () => {
    // Turning Slider off destroys the block, and with it every trace of where
    // the slot pointed. Without the stash, turning it back on rebuilds a
    // different mechanism wearing the same controls.
    const scene = bentBar();
    setSlider(scene, true);
    const first = scene.service.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;
    first.groundAt(1.1);
    scene.service.finishStructuralEdit(false);

    setSlider(scene, false);
    expect(scene.service.joints.some((joint) => joint instanceof PrisJoint)).toBe(false);

    setSlider(scene, true);
    const restored = scene.service.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;

    expect(restored.ground, 'grounded again, as it was').toBe(true);
    expect(restored.slotAngle).toBeCloseTo(1.1, 9);
  });

  it('dangles again when the carrier it remembers is gone', () => {
    // The stash holds ids rather than object references precisely so this case
    // is answerable: a carrier deleted while the slider was off simply does not
    // resolve, and the answer is the same one reconcileSlots gives.
    const scene = bentBar();
    setSlider(scene, true);
    const slider = scene.service.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;
    const carrier = scene.service.links.find((link) => link.id === 'BC')!;
    slider.slideOn(carrier, scene.service.joints[1], scene.service.joints[2]);

    setSlider(scene, false);
    scene.service.links = scene.service.links.filter((link) => link.id !== 'BC');
    setSlider(scene, true);

    const restored = scene.service.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;
    expect(restored.isDangling).toBe(true);
  });
});

describe('welding and the slider', () => {
  it('offers Weld to a joint that carries a slider', () => {
    // The Phase 3 change that made a Slide reachable at all: canBeWelded used
    // to exclude anything prismatic, so the fourth cell of the 2x2 had no door.
    const scene = bentBar();
    setSlider(scene, true);

    expect((scene.b as RealJoint).canBeWelded()).toBe(true);
  });

  it('stops offering Weld once the joint is welded', () => {
    const scene = bentBar();
    setSlider(scene, true);
    setWeld(scene, true);

    expect((scene.b as RealJoint).canBeWelded()).toBe(false);
  });
});
