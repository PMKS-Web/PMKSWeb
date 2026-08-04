/**
 * The cylinder skin of docs/joint-types-plan.md §2.7.
 *
 * A piston is not a new joint type — it is a Slide whose rod and barrel happen
 * to line up, so it is drawn as the part an engineer would recognise rather
 * than as a block in a channel. Nothing about the mechanism changes: the same
 * assembly solves the same way whichever skin is on it, which is why the
 * override below is a view preference and never enters the URL or the undo
 * stack.
 */

import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink } from './link';
import { slideAssemblyAt } from './slide-assembly';
import { MARK } from './joint-marks';
import { SettingsService } from '../services/settings.service';

/** How the user asked this assembly to be drawn. `auto` lets the shape decide. */
export type SkinPreference = 'auto' | 'cylinder' | 'slotted';

export interface Cylinder {
  slider: PrisJoint;
  pin: RealJoint;
  /** The carrier, drawn as the barrel. */
  barrel: Link;
  /** The rider, drawn as the rod. */
  rod: RealLink;
  /** The barrel's other end — hidden while the skin is collapsed. */
  barrelFar: Joint;
  rodFar: Joint;
}

/**
 * How far off the slot line a joint may sit and still read as in line with it.
 *
 * Half the block's own width across, so the test is "does this look straight"
 * rather than "is this exactly straight". It was 1e-6, which is the right bound
 * for the float error a solved position carries and hopeless as a rule for
 * something a person draws: nothing placed with a mouse lands within a
 * millionth of a unit of a line, so a piston could be *opened* from a URL and
 * never *built*. Anything inside this is inside the block that is drawn over
 * it, so the straight part the skin shows is straight on screen either way.
 */
function collinearTolerance(): number {
  return MARK.blockAcrossHalf * 0.15 * SettingsService.objectScale;
}

/**
 * Whether this joint's assembly is shaped like a piston.
 *
 * The test is the shape, not a flag: a Slide on a moving carrier where the
 * barrel and the rod each carry exactly one other joint, those two joints sit
 * on opposite sides of the block, and everything lies along the slot. That is
 * the arrangement whose block-in-a-channel drawing reads as a mistake, because
 * the channel is the barrel's bore and the reader already knows what it is.
 */
export function resolveCylinder(joint: Joint, tolerance?: number): Cylinder | undefined {
  const found = describeCylinder(joint, tolerance);
  return typeof found === 'string' ? undefined : found;
}

/**
 * The same test, but saying *why* when the answer is no.
 *
 * The panel offers the skin picker to any Slide, not only to one that already
 * qualifies — a control that appears only once you have succeeded cannot help
 * anyone succeed, and "Cylinder" was exactly that: invisible until it had
 * nothing left to do. Shown greyed with the reason beside it, the same control
 * becomes the only place in the app that says what a piston is made of.
 */
export function describeCylinder(joint: Joint, tolerance?: number): Cylinder | string {
  const allowed = tolerance ?? collinearTolerance();
  const assembly = slideAssemblyAt(joint);
  if (!assembly) return 'A cylinder is a slider welded to what it carries.';
  if (!assembly.slider.isFloating || !assembly.slider.isSlotWellFormed) {
    return 'The slot has to be cut into a link — the barrel — rather than fixed to the ground.';
  }
  if (assembly.riders.length !== 1) return 'A cylinder has exactly one rod on its block.';

  const pin = assembly.weldJoint;
  const rod = assembly.riders[0];
  const barrel = assembly.slider.carrier!;
  if (rod.joints.length !== 2 || barrel.joints.length !== 2) {
    return 'The rod and the barrel each have to be a two-joint bar.';
  }

  const rodFar = rod.joints.find((member) => member.id !== pin.id);
  if (!rodFar) return 'The rod needs a far end.';

  const angle = assembly.slider.slotAngle;
  const along = (point: Joint) =>
    (point.x - pin.x) * Math.cos(angle) + (point.y - pin.y) * Math.sin(angle);
  const across = (point: Joint) =>
    -(point.x - pin.x) * Math.sin(angle) + (point.y - pin.y) * Math.cos(angle);

  // Everything has to lie on the slot, or the drawing would claim a straight
  // part where the mechanism has a bent one.
  const members = [rodFar, ...barrel.joints];
  if (members.some((member) => Math.abs(across(member)) > allowed)) {
    return 'The rod and the barrel have to line up with the slot.';
  }

  // The barrel's far end is whichever of its joints is further from the block;
  // it has to be on the other side of the block from the rod, or the rod would
  // be drawn disappearing into thin air.
  const barrelFar = barrel.joints.reduce((far, member) =>
    Math.abs(along(member)) > Math.abs(along(far)) ? member : far
  );
  if (along(rodFar) * along(barrelFar) >= 0) {
    return 'The rod and the barrel have to reach out from opposite sides of the block.';
  }

  return { slider: assembly.slider, pin, barrel, rod, barrelFar, rodFar };
}

/** Every cylinder in the mechanism. */
export function cylinders(joints: Joint[], tolerance?: number): Cylinder[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => resolveCylinder(joint, tolerance))
    .filter((found): found is Cylinder => found !== undefined);
}
