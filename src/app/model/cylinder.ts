/**
 * The atomic cylinder primitive.
 *
 * A cylinder used to be an inferred pattern — any Slide whose rod and barrel
 * happened to line up earned the skin, with a per-session picker to override
 * it. It is now a first-class, menu-created, permanent part: the prismatic
 * pin carries a `isSealed` bit that lives in the URL codec (so it survives
 * undo/redo, which replays URLs), and sealed ⇔ skinned, always. The geometric
 * test below still runs — it is what keeps the drawing honest — but only a
 * sealed assembly is ever drawn as the part, and a hand-built slide is never
 * skinned at all.
 */

import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink, SliderBlock } from './link';
import { slideAssemblyAt } from './slide-assembly';
import { MARK, slotHalfLength } from './joint-marks';
import { SettingsService } from '../services/settings.service';

export interface Cylinder {
  slider: PrisJoint;
  pin: RealJoint;
  /** The zero-length block binding pin to slider. */
  block: SliderBlock;
  /** The carrier, drawn as the barrel. A leaf when welded into a compound. */
  barrel: Link;
  /** The rider, drawn as the rod. A leaf when welded into a compound. */
  rod: RealLink;
  /** The barrel's outer end — mount A, the joint the cylinder rotates about. */
  barrelFar: Joint;
  /**
   * The barrel's inner end, buried where the rod overlaps the barrel. Sealed
   * cylinders never reveal, so this joint has no hitbox, hover or selection.
   */
  barrelNear: Joint;
  /** The rod's outer end — mount C, the other attachment point. */
  rodFar: Joint;
}

/**
 * How far off the slot line a joint may sit and still read as in line with it.
 *
 * Half the block's own width across, so the test is "does this look straight"
 * rather than "is this exactly straight". The URL codec quantizes coordinates
 * to 1/1000 of a user unit, which is orders of magnitude inside this bound —
 * a cylinder cannot decode into a shape that no longer qualifies.
 */
export function cylinderCollinearTolerance(): number {
  return MARK.blockAcrossHalf * 0.15 * SettingsService.objectScale;
}

/**
 * The two-joint leaf of a possibly-compound link that satisfies `keep`.
 *
 * A mount welded into a neighbouring link absorbs the barrel (or rod) into a
 * compound; the member bar still exists as a subset leaf, and the skin has to
 * keep describing that bar rather than the whole compound.
 */
function twoJointLeaf(root: Link, keep: (leaf: Link) => boolean): Link | undefined {
  if (root.joints.length === 2 && keep(root)) return root;
  if (!(root instanceof RealLink)) return undefined;
  return root.subset.find((leaf) => leaf.joints.length === 2 && keep(leaf));
}

/** Whether this joint's assembly is shaped like a cylinder. */
export function resolveCylinder(joint: Joint, tolerance?: number): Cylinder | undefined {
  const found = describeCylinder(joint, tolerance);
  return typeof found === 'string' ? undefined : found;
}

/**
 * The structural half of the cylinder test: the members and mounts, with no
 * geometry asked of them at all.
 *
 * Split from the geometric half deliberately. Everything that *protects* a
 * sealed assembly — drag routing, permanence guards, the delete cascade, the
 * normalization pass — has to keep recognising it even while its geometry is
 * momentarily wrong, or the guards fail open at exactly the moment they are
 * needed and a stray write tears the part for good. That is how a fast mount
 * drag used to break a cylinder: one clamped frame stopped resolving, the
 * next pointermove fell into the free-move path, and the tear stuck.
 */
function describeCylinderStructure(joint: Joint): Cylinder | string {
  const assembly = slideAssemblyAt(joint);
  if (!assembly) return 'A cylinder is a slider welded to what it carries.';
  if (!assembly.slider.isFloating || !assembly.slider.isSlotWellFormed) {
    return 'The slot has to be cut into a link — the barrel — rather than fixed to the ground.';
  }
  if (assembly.riders.length !== 1) return 'A cylinder has exactly one rod on its block.';

  const pin = assembly.weldJoint;
  const slotA = assembly.slider.slotJointA!;
  const slotB = assembly.slider.slotJointB!;
  // A mount welded into a neighbouring link turns the carrier (or rider) into
  // a compound; the member bar survives as a subset leaf and stays the thing
  // the skin describes.
  const rod = twoJointLeaf(assembly.riders[0], (leaf) =>
    leaf.joints.some((member) => member.id === pin.id)
  );
  const barrel = twoJointLeaf(
    assembly.slider.carrier!,
    (leaf) =>
      leaf.joints.some((member) => member.id === slotA.id) &&
      leaf.joints.some((member) => member.id === slotB.id)
  );
  if (!rod || !(rod instanceof RealLink) || !barrel) {
    return 'The rod and the barrel each have to be a two-joint bar.';
  }

  const rodFar = rod.joints.find((member) => member.id !== pin.id);
  if (!rodFar) return 'The rod needs a far end.';

  // The barrel's far end — mount A — is the barrel joint further from the
  // rod's mount. By Euclidean distance from the rod mount, deliberately NOT
  // by distance from the block: at full retraction the pin sits nearer the
  // barrel's far end than its near end, and the distance-from-block rule
  // then swapped the two, which is what made a deep-retraction frame stop
  // resolving.
  const barrelFar = barrel.joints.reduce((far, member) => {
    const memberDistance = Math.hypot(member.x - rodFar.x, member.y - rodFar.y);
    const farDistance = Math.hypot(far.x - rodFar.x, far.y - rodFar.y);
    return memberDistance > farDistance ? member : far;
  });
  const barrelNear = barrel.joints.find((member) => member.id !== barrelFar.id)!;

  return {
    slider: assembly.slider,
    pin,
    block: assembly.block,
    barrel,
    rod,
    barrelFar,
    barrelNear,
    rodFar,
  };
}

/** The same test, but saying *why* when the answer is no. */
export function describeCylinder(joint: Joint, tolerance?: number): Cylinder | string {
  const structure = describeCylinderStructure(joint);
  if (typeof structure === 'string') return structure;
  const allowed = tolerance ?? cylinderCollinearTolerance();
  const { slider, pin, barrel, rodFar, barrelFar } = structure;

  const angle = slider.slotAngle;
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

  // The barrel's far end has to be on the other side of the block from the
  // rod, or the rod would be drawn disappearing into thin air.
  if (along(rodFar) * along(barrelFar) >= 0) {
    return 'The rod and the barrel have to reach out from opposite sides of the block.';
  }

  return structure;
}

/** The sealed cylinder whose pin this is, or nothing. Geometry-checked. */
export function sealedCylinderAt(joint: Joint, tolerance?: number): Cylinder | undefined {
  const found = resolveCylinder(joint, tolerance);
  return found?.slider.isSealed ? found : undefined;
}

/**
 * The sealed cylinder whose pin this is, by structure alone — the resolution
 * every guard and routing decision uses, so protection cannot lapse while
 * the geometry is mid-repair.
 */
export function structuralCylinderAt(joint: Joint): Cylinder | undefined {
  const found = describeCylinderStructure(joint);
  return typeof found !== 'string' && found.slider.isSealed ? found : undefined;
}

/** Every sealed cylinder in the mechanism, geometry-checked. Sealed ⇔ skinned. */
export function sealedCylinders(joints: Joint[], tolerance?: number): Cylinder[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => sealedCylinderAt(joint, tolerance))
    .filter((found): found is Cylinder => found !== undefined);
}

/** Every sealed cylinder by structure alone, however its geometry stands. */
export function sealedCylinderStructures(joints: Joint[]): Cylinder[] {
  return joints
    .filter((joint): joint is RealJoint => joint instanceof RealJoint)
    .map((joint) => structuralCylinderAt(joint))
    .filter((found): found is Cylinder => found !== undefined);
}

/** All five joints of a cylinder: mounts, buried barrel end, pin, slider. */
export function cylinderJoints(cylinder: Cylinder): Joint[] {
  return [cylinder.barrelFar, cylinder.barrelNear, cylinder.pin, cylinder.slider, cylinder.rodFar];
}

/**
 * The sealed cylinder this joint is a member of, from any of its five joints.
 * Structural on purpose: membership is what every permanence guard and drag
 * route asks, and it must hold even while the geometry is momentarily wrong.
 */
export function cylinderOfJoint(joints: Joint[], joint: Joint | undefined): Cylinder | undefined {
  if (!joint) return undefined;
  return sealedCylinderStructures(joints).find((cylinder) =>
    cylinderJoints(cylinder).some((member) => member.id === joint.id)
  );
}

/** The sealed cylinder this link is a member of — barrel, rod or block. */
export function cylinderOfLink(joints: Joint[], link: Link | undefined): Cylinder | undefined {
  if (!link) return undefined;
  const containsMember = (candidate: Link, cylinder: Cylinder): boolean => {
    const memberIds = [cylinder.barrel.id, cylinder.rod.id, cylinder.block.id];
    if (memberIds.includes(candidate.id)) return true;
    // A compound that swallowed the barrel (a mount welded into a neighbour)
    // still owns a member, so deleting it cascades the same way.
    return (
      candidate instanceof RealLink && candidate.subset.some((leaf) => memberIds.includes(leaf.id))
    );
  };
  return sealedCylinderStructures(joints).find((cylinder) => containsMember(link, cylinder));
}

/** The joints of a cylinder that get no hitbox, hover or selection at all. */
export function isCylinderInterior(cylinder: Cylinder, joint: Joint): boolean {
  return [cylinder.barrelNear.id, cylinder.pin.id, cylinder.slider.id].includes(joint.id);
}

/**
 * The proportions of a freshly drawn cylinder, mirroring the fixture
 * gallery's hydraulic cylinder (barrel 3 : rod 4 over a span of 6 from the
 * barrel mount to the rod's end, pin at 2 — i.e. barrel = span/2, pin at
 * span/3, rod = 2·span/3, which keeps the pin inside the slot's span at any
 * size).
 */
export interface CylinderCreation extends CylinderPose {
  angleRad: number;
  /** Mount-to-mount distance actually used, after the minimum is applied. */
  span: number;
  barrelLength: number;
  pinFromMount: number;
  rodLength: number;
}

/** The smallest cylinder the two-point gesture will draw, in objectScale. */
export const CYLINDER_MIN_SPAN_SCALE = 1;

/**
 * Lay out a new cylinder from the two points of the creation gesture: the
 * start point is the barrel-side mount, `end` is where the rod finishes.
 * The drawn span sets every member length; a span below the minimum clamps
 * (so a zero-length click cannot make a degenerate part), keeping the drawn
 * direction — or +x when there is none yet.
 */
export function cylinderCreationLayout(
  start: { x: number; y: number },
  end: { x: number; y: number },
  objectScale: number
): CylinderCreation {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const drawn = Math.hypot(dx, dy);
  const angleRad = drawn < 1e-9 ? 0 : Math.atan2(dy, dx);
  const span = Math.max(drawn, CYLINDER_MIN_SPAN_SCALE * objectScale);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const barrelLength = span / 2;
  const pinFromMount = span / 3;
  const rodLength = span - pinFromMount;
  const at = (along: number) => ({ x: start.x + along * ux, y: start.y + along * uy });
  return {
    angleRad,
    span,
    barrelLength,
    pinFromMount,
    rodLength,
    barrelFar: at(0),
    barrelNear: at(barrelLength),
    pin: at(pinFromMount),
    rodFar: at(span),
  };
}

/**
 * Re-derive a cylinder's member positions from its two mounts — the
 * invariant-enforcement pose (§ cylinder 1-fix).
 *
 * The mounts are the user's handles and stay exactly where they are; the
 * buried barrel end goes back on the axis at the barrel's length, and the
 * pin's current position is projected onto the axis and clamped into the
 * slot. For a valid assembly this is the identity (every drag already rounds
 * to the same 6 decimals), so running it on every mechanism update costs a
 * no-op — and any code path that wrote a member joint without going through
 * the parametric layout gets silently straightened before anything
 * downstream can read the bent state.
 */
export function normalizedCylinderPose(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  barrelLength: number,
  pinPoint: { x: number; y: number },
  r: number
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || !(barrelLength > 1e-9)) return undefined;
  const ux = dx / distance;
  const uy = dy / distance;

  const half = slotHalfLength(r, barrelLength);
  const mid = barrelLength / 2;
  const projection = (pinPoint.x - barrelMount.x) * ux + (pinPoint.y - barrelMount.y) * uy;
  const along = Math.min(Math.max(projection, Math.max(mid - half, 0)), mid + half);

  return {
    barrelFar: { x: barrelMount.x, y: barrelMount.y },
    barrelNear: { x: barrelMount.x + barrelLength * ux, y: barrelMount.y + barrelLength * uy },
    pin: { x: barrelMount.x + along * ux, y: barrelMount.y + along * uy },
    rodFar: { x: rodMount.x, y: rodMount.y },
  };
}

/** Where each joint of a re-posed cylinder lands. */
export interface CylinderPose {
  barrelFar: { x: number; y: number };
  barrelNear: { x: number; y: number };
  /** The pin and its coincident slider both go here. */
  pin: { x: number; y: number };
  rodFar: { x: number; y: number };
}

/**
 * Re-pose a cylinder from its two mounts — the parametric drag (§ cylinder 6).
 *
 * The axis is the line between the mounts; the barrel's joints stay rigid
 * relative to mount A, and the pin is re-derived on the axis. Inside the
 * slot's span the rod is rigid and the pin strokes; beyond either end the rod
 * resizes to follow the gesture — a mount drag has no maximum length, and its
 * minimum is one block-length of rod. The `anchor` mount stays exactly where
 * it is in every case.
 *
 * Collinearity holds by construction: every returned point is on the axis.
 */
export function layoutCylinder(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  barrelLength: number,
  rodLength: number,
  r: number,
  anchor: 'barrel' | 'rod'
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  const distance = Math.hypot(dx, dy);
  // Coincident mounts leave the axis undefined; the caller ignores the move.
  if (distance < 1e-9) return undefined;
  const ux = dx / distance;
  const uy = dy / distance;

  const half = slotHalfLength(r, barrelLength);
  const slotMid = barrelLength / 2;
  const minAlong = Math.max(slotMid - half, 0);
  const maxAlong = slotMid + half;
  // Inside the stroke the rod is rigid and the pin slides. Beyond it, the rod
  // resizes instead of the mount stopping dead: dragged past full extension it
  // grows without bound, and dragged shorter than full retraction it shrinks —
  // down to one block-length, the only hard floor, so a mount drag can make
  // the part any length the gesture asks for.
  const rodMin = MARK.blockAlongHalf * r;
  const along = Math.min(Math.max(distance - rodLength, minAlong), maxAlong);
  const effectiveRod = Math.max(distance - along, rodMin);
  const separation = Math.max(distance, minAlong + rodMin);

  const a =
    anchor === 'barrel'
      ? { x: barrelMount.x, y: barrelMount.y }
      : { x: rodMount.x - separation * ux, y: rodMount.y - separation * uy };
  const c =
    anchor === 'barrel'
      ? { x: barrelMount.x + separation * ux, y: barrelMount.y + separation * uy }
      : { x: rodMount.x, y: rodMount.y };

  return {
    barrelFar: a,
    barrelNear: { x: a.x + barrelLength * ux, y: a.y + barrelLength * uy },
    pin: { x: c.x - effectiveRod * ux, y: c.y - effectiveRod * uy },
    rodFar: c,
  };
}
