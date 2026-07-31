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
 * Whether welding this joint would make a Slide — the same structure test as
 * `slideAssemblyAt`, without asking whether the weld has happened yet.
 *
 * The weld path needs this: it has to choose which kind of weld to make
 * *before* setting the flag, and re-deriving "does this carry a block?" there
 * would let a shape the resolver rejects — a pin with two blocks, say — take
 * the assembly path and produce a weld nothing downstream recognises.
 */
export function isSlideCandidate(joint: Joint): boolean {
  return resolveStructure(joint) !== undefined;
}

function resolveStructure(
  joint: Joint
): (Omit<SlideAssembly, 'weldJoint'> & { weldJoint: RealJoint }) | undefined {
  // The weld belongs to the pin, not the sliding joint. A PrisJoint carrying
  // the flag is a malformed record, not the same Slide seen from its far end.
  if (!(joint instanceof RealJoint) || joint instanceof PrisJoint) {
    return undefined;
  }
  const blocks = joint.links.filter((link): link is SliderBlock => link instanceof SliderBlock);
  // Two blocks on one pin is a different joint type, refused at the drag (§1.2).
  if (blocks.length !== 1) {
    return undefined;
  }
  const block = blocks[0];
  // §2.10 item 1: the block joins exactly this joint to exactly one PrisJoint.
  // Membership is by identity rather than id — within a single snapshot the
  // graph holds the same objects, so a same-id impostor is exactly the
  // malformed record this is here to reject.
  if (block.joints.length !== 2 || !block.joints.includes(joint)) {
    return undefined;
  }
  const sliders = block.joints.filter((member): member is PrisJoint => member instanceof PrisJoint);
  if (sliders.length !== 1) {
    return undefined;
  }
  const riders = joint.links.filter((link): link is RealLink => link instanceof RealLink);
  if (riders.length === 0) {
    return undefined;
  }
  return { weldJoint: joint, block, slider: sliders[0], riders, grounded: sliders[0].ground };
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
  return resolveStructure(joint);
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
 * How far a point sits off the slot line — the constraint a Slide's pose has to
 * satisfy, as a pure function of geometry (§2.7a item 3).
 *
 * The position step divides this by the guide-slot cross product to get how far
 * to slide; a test asserts it vanishes at the answer. Both reading it from here
 * is what stops the check from re-deriving the arithmetic it is checking.
 */
export function slotOffset(
  point: { x: number; y: number },
  reference: { x: number; y: number },
  slot: [number, number]
): number {
  return (point.x - reference.x) * slot[1] - (point.y - reference.y) * slot[0];
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
  // Riders only, deliberately — not `assemblyBodyIds`. The block's orientation
  // is fixed too, but the solver never gives a block an angular unknown: its
  // column is how fast it *slides*. Skipping the block edge as "already known"
  // therefore deletes the assembly's one real freedom and leaves the matrix a
  // row short. Mobility wants the whole body set; this wants the turning half.
  return assemblies.some(
    (assembly) => assembly.grounded && assembly.riders.some((rider) => rider.id === link.id)
  );
}
