import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';

/**
 * A Slide: a slider whose rider is welded to its block, so the pair cannot
 * rotate relative to each other (docs/joint-types-plan.md §2.1, §2.10).
 *
 * A Slide is not an object in the model — it is three objects arranged a
 * certain way, and `isWelded` on the RevJoint is the only record of it. Eight
 * places need to know which bodies a weld makes rigid: the weld dispatcher, the
 * reconcile rules, the mobility count, the position solver, the kinematic
 * solver's three registration paths, and the panel guard. Each answering for
 * itself is how they drift, which is the same reason `rigid-bodies.ts` exists.
 */
export interface SlideAssembly {
  /** The welded RevJoint that binds rider to block. */
  weldJoint: RealJoint;
  /** The zero-length block (§2.10 item 1). */
  block: SliderBlock;
  /** The sliding joint at the block's far end. */
  slider: PrisJoint;
  /**
   * Every RealLink the weld holds rigid. Exactly one once the mechanism has
   * settled — see the note on repair below.
   */
  riders: RealLink[];
  /** The slot is fixed in the world, so the assembly cannot rotate. */
  grounded: boolean;
}

/**
 * Resolve the Slide at a joint, or `undefined` if there is not one.
 *
 * `riders` may hold more than one link, and that is deliberate. A completed
 * weld fuses the RealLinks at the joint into a single compound, so the settled
 * value is always one — but the flag can outrun the compound mid-edit, because
 * `mergeJoints` takes a weld apart and rebuilds it around the survivor, and a
 * deletion that collapses a compound leaves the flag behind. Refusing here
 * would make the reconcile pass read "not a Slide" and destroy a weld the user
 * made; the reconcile repairs it instead, which is the rule `reconcileSlots`
 * already set for slots.
 */
export function slideAssemblyAt(joint: Joint): SlideAssembly | undefined {
  if (!(joint instanceof RealJoint) || !joint.isWelded) {
    return undefined;
  }
  const blocks = joint.links.filter((link): link is SliderBlock => link instanceof SliderBlock);
  // Two blocks on one pin is a different joint type, refused at the drag (§1.2).
  if (blocks.length !== 1) {
    return undefined;
  }
  const block = blocks[0];
  const slider = block.joints.find((member): member is PrisJoint => member instanceof PrisJoint);
  if (!slider || !block.joints.some((member) => member.id === joint.id)) {
    return undefined;
  }
  const riders = joint.links.filter((link): link is RealLink => link instanceof RealLink);
  if (riders.length === 0) {
    return undefined;
  }
  return { weldJoint: joint, block, slider, riders, grounded: slider.ground };
}

/** Every Slide in a mechanism. */
export function slideAssemblies(joints: Joint[]): SlideAssembly[] {
  return joints
    .map((joint) => slideAssemblyAt(joint))
    .filter((assembly): assembly is SlideAssembly => assembly !== undefined);
}

/**
 * Every body the weld fuses: the block and the riders.
 *
 * Derived rather than stored. A cached copy would be a second answer to the one
 * question this module exists to have a single answer for.
 */
export function assemblyBodyIds(assembly: SlideAssembly): string[] {
  return [assembly.block.id, ...assembly.riders.map((rider) => rider.id)];
}

/**
 * Whether a link's orientation is held fixed by a weld to a grounded guide.
 *
 * The kinematic solver has three separate places that hand a body an angular
 * unknown, and every one of them has to ask this. Gating only the one the
 * Scotch yoke happens to use would pass Gate 3 while leaving a welded rider
 * reached through an ordinary link edge with a spurious column — which the
 * matrix then solves and writes over the seeded zero, producing a wrong number
 * rather than a singular system.
 */
export function hasFixedOrientation(link: Link, assemblies: SlideAssembly[]): boolean {
  return assemblies.some(
    (assembly) =>
      assembly.grounded && assemblyBodyIds(assembly).some((id) => id === link.id)
  );
}
