// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import {
  assemblyBodyIds,
  hasFixedOrientation,
  slideAssemblies,
  slideAssemblyAt,
} from '../../app/model/slide-assembly';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { scotchYokeFixture } from '../../test-utils/verification/slot-fixtures';

// The resolver is the single answer to "which bodies does this weld make
// rigid?" (docs/phase-3-slide-spec.md §3.0). Everything downstream reads it, so
// the states it must and must not recognise are asserted here rather than
// rediscovered by each consumer.

function jointNamed(built: ReturnType<typeof buildMechanism>, id: string): RealJoint {
  return built.joints.find((joint) => joint.id === id) as RealJoint;
}

describe('resolving a slide assembly', () => {
  it('sees the Scotch yoke welded at C', () => {
    const built = buildMechanism(scotchYokeFixture());

    const assembly = slideAssemblyAt(jointNamed(built, 'C'));

    expect(assembly).toBeDefined();
    expect(assembly!.slider.id).toBe('F');
    expect(assembly!.grounded).toBe(true);
    expect(assembly!.riders.map((rider) => rider.id)).toEqual(['CD']);
    expect(assemblyBodyIds(assembly!).sort()).toEqual(['CD', 'CF']);
  });

  it('finds exactly one assembly in the mechanism', () => {
    const built = buildMechanism(scotchYokeFixture());

    // B carries a block too, but it is not welded -- it is a Slot, not a Slide.
    expect(slideAssemblies(built.joints).map((a) => a.weldJoint.id)).toEqual(['C']);
  });

  it('declines a welded joint that carries no block', () => {
    // An ordinary compound weld. Sharing a resolver with the compound path is
    // exactly the confusion this must not create.
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 0);
    const left = new RealLink('AB', [a, b], 1, 1);
    const right = new RealLink('BC', [b, c], 1, 1);
    b.links = [left, right];
    b.isWelded = true;

    expect(slideAssemblyAt(b)).toBeUndefined();
  });

  it('declines a slider whose pin is not welded', () => {
    const built = buildMechanism(scotchYokeFixture());

    expect(slideAssemblyAt(jointNamed(built, 'B'))).toBeUndefined();
  });

  it('declines a pin carrying two blocks', () => {
    // Two blocks on one pin is a different joint type, refused at the drag
    // (§1.2). Resolving it as a Slide would pick one block arbitrarily.
    const pin = new RevJoint('A', 0, 0);
    const first = new PrisJoint('P', 0, 0, false, true);
    const second = new PrisJoint('Q', 0, 0, false, true);
    const rider = new RealLink('AB', [pin, new RevJoint('B', 1, 0)], 1, 1);
    pin.links = [
      rider,
      new SliderBlock('AP', [pin, first], 1),
      new SliderBlock('AQ', [pin, second], 1),
    ];
    pin.isWelded = true;

    expect(slideAssemblyAt(pin)).toBeUndefined();
  });

  it('declines a block that does not join exactly two joints', () => {
    // §2.10 item 1. A block with a third joint is not the zero-length
    // coincidence the solvers assume, and picking two of the three arbitrarily
    // would make the answer depend on declaration order.
    const pin = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('P', 0, 0, false, true);
    const stray = new RevJoint('S', 0, 0);
    const rider = new RealLink('AB', [pin, new RevJoint('B', 1, 0)], 1, 1);
    pin.links = [rider, new SliderBlock('APS', [pin, slider, stray], 1)];
    pin.isWelded = true;

    expect(slideAssemblyAt(pin)).toBeUndefined();
  });

  it('declines a block that holds a different joint of the same id', () => {
    // Matching by id would accept this and then read `grounded` off a slider
    // the joint is not actually on.
    const pin = new RevJoint('A', 0, 0);
    const impostor = new RevJoint('A', 5, 5);
    const slider = new PrisJoint('P', 5, 5, false, true);
    const rider = new RealLink('AB', [pin, new RevJoint('B', 1, 0)], 1, 1);
    pin.links = [rider, new SliderBlock('AP', [impostor, slider], 1)];
    pin.isWelded = true;

    expect(slideAssemblyAt(pin)).toBeUndefined();
  });

  it('declines a block with no sliding joint at all', () => {
    const pin = new RevJoint('A', 0, 0);
    const rider = new RealLink('AB', [pin, new RevJoint('B', 1, 0)], 1, 1);
    pin.links = [rider, new SliderBlock('AC', [pin, new RevJoint('C', 0, 0)], 1)];
    pin.isWelded = true;

    expect(slideAssemblyAt(pin)).toBeUndefined();
  });

  it('declines the sliding joint even when it carries the flag', () => {
    // The weld belongs to the pin. Resolving from the far end would report the
    // same assembly twice and double-count it in the mobility merge.
    const built = buildMechanism(scotchYokeFixture());
    const slider = built.joints.find((joint) => joint.id === 'F') as PrisJoint;
    slider.isWelded = true;

    expect(slideAssemblyAt(slider)).toBeUndefined();
    expect(slideAssemblies(built.joints).map((a) => a.weldJoint.id)).toEqual(['C']);
  });

  it('declines a welded pin with a block but no rider link', () => {
    const pin = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('P', 0, 0, false, true);
    pin.links = [new SliderBlock('AP', [pin, slider], 1)];
    pin.isWelded = true;

    expect(slideAssemblyAt(pin)).toBeUndefined();
  });

  it('resolves a rider that is not yet compounded, so a reconcile can repair it', () => {
    // Mid-edit the flag can outrun the compound: mergeJoints takes a weld apart
    // and rebuilds it. Refusing here would make the reconcile read "not a
    // Slide" and destroy a weld the user made.
    const pin = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('P', 0, 0, false, true);
    const first = new RealLink('AB', [pin, new RevJoint('B', 1, 0)], 1, 1);
    const second = new RealLink('AC', [pin, new RevJoint('C', 0, 1)], 1, 1);
    pin.links = [first, second, new SliderBlock('AP', [pin, slider], 1)];
    pin.isWelded = true;

    const assembly = slideAssemblyAt(pin);

    expect(assembly).toBeDefined();
    expect(assembly!.riders.map((rider) => rider.id)).toEqual(['AB', 'AC']);
  });
});

describe('which links a weld holds at a fixed orientation', () => {
  it('names the rider but not its block', () => {
    const built = buildMechanism(scotchYokeFixture());
    const assemblies = slideAssemblies(built.joints);
    const linkNamed = (id: string) => built.links.find((link) => link.id === id)!;

    expect(hasFixedOrientation(linkNamed('CD'), assemblies)).toBe(true);
    // The block CF is genuinely held at a fixed orientation too, and it is
    // still part of the same rigid body for mobility. But the solver never
    // gives a block an angular unknown -- its column is how fast it slides --
    // so answering "true" here would delete the assembly's one real freedom and
    // leave the velocity matrix a row short of its loops.
    expect(hasFixedOrientation(linkNamed('CF'), assemblies)).toBe(false);
    expect(assemblyBodyIds(assemblies[0]).sort()).toEqual(['CD', 'CF']);
    // The crank turns, and the Slot's block is free to turn in its slot.
    expect(hasFixedOrientation(linkNamed('AB'), assemblies)).toBe(false);
    expect(hasFixedOrientation(linkNamed('BE'), assemblies)).toBe(false);
  });

  it('does not hold a floating assembly fixed', () => {
    // A Slide on a moving carrier tracks that carrier rather than standing
    // still, and Phase 3 does not solve it (§4). Claiming zero here would be a
    // wrong number rather than an honest refusal.
    const built = buildMechanism(scotchYokeFixture());
    const slider = built.joints.find((joint) => joint.id === 'F') as PrisJoint;
    const carrier = built.links.find((link) => link.id === 'AB')!;
    slider.slideOn(carrier, built.joints[0], built.joints[1]);

    const assemblies = slideAssemblies(built.joints);
    expect(assemblies[0].grounded).toBe(false);
    expect(
      hasFixedOrientation(
        built.links.find((l) => l.id === 'CD')!,
        assemblies
      )
    ).toBe(false);
  });
});
