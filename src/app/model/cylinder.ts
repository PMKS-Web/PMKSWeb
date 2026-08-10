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
import { CYLINDER, MARK } from './joint-marks';
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
 * How far clear of the barrel's own mount the head sits when the ram is shut.
 *
 * The whole of the closed end. The head's back edge travels from here to the
 * barrel's mouth — at 0% it stands this far off the mount joint, so the two
 * never collide on screen, and at 100% it has come **entirely out of the
 * barrel** and rides the exposed rod. Those two ends are the stops, drawn
 * rather than annotated, which is why the barrel carries no notches.
 *
 * Everything else about the part follows from it and the stroke:
 *
 *     barrel = rod = stroke + CLEARANCE      (equal by construction)
 *     along  = CLEARANCE + headHalf + stroke × start   (pin, from the mount)
 *     span   = stroke × (1 + start) + LOCK
 *
 * `LOCK` is not a third constant; it falls out of barrel = rod, which is the
 * point of holding them equal. A cylinder is one size number and one position
 * number, and closed and open stop being free to disagree with the stroke —
 * there is no longer any such thing as an impossible cylinder, only one that is
 * too small.
 *
 * This used to be a *bore*: twice `MARK.slotInset + MARK.blockAlongHalf`, on
 * the reading that the head stays wholly inside the barrel and the slot keeps
 * its margin at each end. Both halves of that were wrong for a sealed part. The
 * barrel is a closed body and the drawing never shows a slot, so the inset
 * bought nothing; and a head that never leaves the barrel gives full extension
 * no silhouette of its own — closed and open differed only in how much rod was
 * outside. It also made the shortest ram the app could draw more than three
 * times longer than it needs to be.
 */
export const HEAD_CLEARANCE_R = 1.4;

/**
 * The head's half-length on a barrel of this length.
 *
 * Full size — a bare slider's whole block — on any ram with room for it, which
 * is every ram of a normal size. It only shrinks when it has to: the head has
 * to fit inside the barrel at full retraction, so on a short ram it is half the
 * barrel and no more, and it grows back to full the moment the barrel does.
 * That is the *only* reason it is a function and not a constant.
 *
 * Floored at square (`headAlongHalfMin`), which is what stops a ram shrinking
 * without limit and is therefore the real bottom of the whole part:
 * `MIN_STROKE_R` is read straight off it.
 */
export function cylinderHeadHalf(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): number {
  const wanted = Math.min(CYLINDER.headAlongHalfMax * r, barrelLength / 2);
  return Math.max(CYLINDER.headAlongHalfMin * r, wanted);
}

/**
 * The span a ram carries beyond its stroke terms: a clearance at each end of
 * the barrel, plus the head's own half-length. Derived, never chosen —
 * `span - lock` is what a mount drag has left to spend on stroke.
 *
 * A function of the stroke rather than a constant, because the head is: on a
 * ram long enough to hold a full-size block it is flat, and below that it
 * follows the barrel down.
 */
export function cylinderLock(stroke: number, r: number): number {
  return 2 * HEAD_CLEARANCE_R * r + cylinderHeadHalf(stroke + HEAD_CLEARANCE_R * r, r);
}

/**
 * The shortest stroke a cylinder may have: the one whose barrel is exactly a
 * square head.
 *
 * Derived, not chosen. `barrel = stroke + CLEARANCE` and the head is at most
 * half the barrel, so this is the stroke at which the barrel measures twice the
 * shortest head that still reads as one — closed, the head is just inside it;
 * open, just outside. Any less and the head hangs out of both ends of a barrel
 * shorter than itself.
 *
 * It was a flat 0.34 R, deliberately far below anything worth building, on the
 * reasoning that a *readable* minimum is a separate question and stopping a
 * drag at a visible size would feel arbitrary. Under the old bore that was
 * nearly harmless: the barrel still measured 13 R at the floor, because the
 * bore was doing the work. With the clearance at 1.4 R there is nothing else
 * holding it up, and the floor produced a black block with a stub of barrel
 * behind it. The head is what sets the floor now.
 */
export const MIN_STROKE_R = 2 * CYLINDER.headAlongHalfMin - HEAD_CLEARANCE_R;

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
 * A mount welded into a neighbouring link would absorb the barrel (or rod) into
 * a compound; the member bar still exists as a subset leaf, and the skin has to
 * keep describing that bar rather than the whole compound.
 *
 * **Nothing in the app can currently produce that**, and this is defence rather
 * than a supported shape. Two rules close it: `canToggleWeld` greys the Weld
 * control on a mount, and `refuseJointMerge` answers `welded-mount` to a merge
 * that would carry a weld onto one. `cylinder-weld-guards.spec.ts` pins both,
 * because if either is relaxed this path starts running for real — and it is
 * not fully built. `applyCylinderPose` moves the cylinder's own five joints and
 * no others, so a compound's remaining joints would be left behind and the
 * body recomputed as though it had deformed.
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

  // Barrel and rod are the same length, always. Every path that builds or moves
  // a cylinder goes through the layout, which makes them equal by construction,
  // so this is a tripwire rather than a rule anyone can break from the app: it
  // catches a part assembled joint-by-joint — a fixture, a hand-written URL —
  // that would otherwise be drawn and solved as a ram it is not.
  const barrelLength = Math.abs(along(structure.barrelNear) - along(barrelFar));
  if (Math.abs(Math.abs(along(rodFar)) - barrelLength) > allowed) {
    return 'A cylinder’s barrel and rod are the same length; this one’s are not.';
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
  return cylinderOfJointIn(sealedCylinderStructures(joints), joint);
}

/** Same membership question against a precomputed structure list. */
export function cylinderOfJointIn(
  cylinders: Cylinder[],
  joint: Joint | undefined
): Cylinder | undefined {
  if (!joint) return undefined;
  return cylinders.find((cylinder) =>
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

/** The link-membership question against a precomputed structure list. */
export function cylinderOfLinkIn(
  cylinders: Cylinder[],
  link: Link | undefined
): Cylinder | undefined {
  if (!link) return undefined;
  const memberIds = (cylinder: Cylinder) => [
    cylinder.barrel.id,
    cylinder.rod.id,
    cylinder.block.id,
  ];
  return cylinders.find(
    (cylinder) =>
      memberIds(cylinder).includes(link.id) ||
      (link instanceof RealLink &&
        link.subset.some((leaf) => memberIds(cylinder).includes(leaf.id)))
  );
}

/** The joints of a cylinder that get no hitbox, hover or selection at all. */
export function isCylinderInterior(cylinder: Cylinder, joint: Joint): boolean {
  return [cylinder.barrelNear.id, cylinder.pin.id, cylinder.slider.id].includes(joint.id);
}

/** A freshly drawn cylinder opens at mid-travel, so it has room to go either way. */
export const CYLINDER_CREATION_START = 0.5;

export interface CylinderCreation extends CylinderPose {
  angleRad: number;
  /** Mount-to-mount distance actually used, after the minimum is applied. */
  span: number;
  barrelLength: number;
  pinFromMount: number;
  rodLength: number;
}

/**
 * The smallest cylinder a creation gesture will draw, in objectScale.
 *
 * Larger than the smallest cylinder that can *exist* (`SPAN_MIN_R`, which is
 * the fully-retracted floor) because a new ram opens at mid-travel: a span at
 * the retracted floor would give it two thirds of the floor stroke and land
 * under the minimum. Drawn at this span it gets exactly the floor stroke with
 * half of it already used.
 */
export const CYLINDER_MIN_SPAN_SCALE =
  0.15 * 1.5 * MIN_STROKE_R + cylinderLock(0.15 * MIN_STROKE_R, 0.15);

/**
 * Lay out a new cylinder from the two points of the creation gesture: the
 * start point is the barrel-side mount, `end` is where the rod finishes.
 *
 * The ram opens at mid-travel, so the drawn span is `1.5 × stroke + lock` and
 * the stroke is two thirds of what is left after the lock. Inverted through the
 * same span rule a mount drag uses rather than by hand, because the lock is not
 * a constant: on a short ram the head follows the barrel down and takes the
 * lock with it. A span below the minimum clamps (a zero-length click cannot
 * make a degenerate part), keeping the drawn direction — or +x when there is
 * none.
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
  const r = 0.15 * objectScale;
  const flex = cylinderSpanLayoutFrom(drawn, CYLINDER_CREATION_START, r);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const at = (along: number) => ({ x: start.x + along * ux, y: start.y + along * uy });
  return {
    angleRad,
    span: flex.span,
    barrelLength: flex.barrel,
    pinFromMount: flex.pinAlong,
    rodLength: flex.rod,
    barrelFar: at(0),
    barrelNear: at(flex.barrel),
    pin: at(flex.pinAlong),
    rodFar: at(flex.span),
  };
}

/**
 * How far from the barrel's mount the pin may sit: the head's own travel.
 *
 * Measured to the *pin*, so both ends carry the head's half-length. Closed, the
 * head's back edge stands `HEAD_CLEARANCE_R` off the mount; open, that same
 * back edge has reached the mouth and the head is entirely outside the barrel —
 * which is why `max` runs past the barrel's own length rather than stopping
 * short of it.
 *
 * One definition, read by everything that would otherwise disagree — the
 * drawing places the head by it and the simulation treats the interval as the
 * cylinder's stroke. A driven cylinder can therefore only reach poses the part
 * can actually be drawn in, and it reverses at the ends of its own travel
 * rather than telescoping out of its barrel.
 *
 * `usable` is the answer to "is there anywhere to go", and it is a flag rather
 * than an inverted interval on purpose. A barrel shorter than the clearance has
 * no travel, and every caller here clamps or samples against `[min, max]` —
 * handed `max < min` they would silently do something. Object Scale can walk a
 * legal barrel under it at any moment (it changes R and rebuilds), so this is a
 * state the app reaches, not a defensive branch: the interval collapses to the
 * one point the head can occupy and the flag says so out loud.
 */
export function cylinderStrokeAlong(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): { min: number; max: number; usable: boolean } {
  const head = cylinderHeadHalf(barrelLength, r);
  const min = HEAD_CLEARANCE_R * r + head;
  const max = barrelLength + head;
  if (!(max - min >= MIN_STROKE_R * r)) {
    const collapsed = barrelLength / 2 + head;
    return { min: collapsed, max: collapsed, usable: false };
  }
  return { min, max, usable: true };
}

/** The stroke a barrel of this length has, floored at nothing rather than going negative. */
export function cylinderStroke(
  barrelLength: number,
  r: number = 0.15 * SettingsService.objectScale
): number {
  return Math.max(0, barrelLength - HEAD_CLEARANCE_R * r);
}

/** The shortest mount-to-mount span a ram can have: fully retracted, at the floor. */
export function cylinderMinimumSpan(r: number): number {
  return MIN_STROKE_R * r + cylinderLock(MIN_STROKE_R * r, r);
}

/** Mount-to-mount span at each end of the travel, for a given stroke. */
export function cylinderSpanRange(
  stroke: number,
  r: number
): { retracted: number; extended: number } {
  const lock = cylinderLock(stroke, r);
  return { retracted: stroke + lock, extended: 2 * stroke + lock };
}

/**
 * Re-derive a cylinder's member positions from its two mounts — the
 * invariant-enforcement pose (§ cylinder 1-fix).
 *
 * The mounts are the user's handles and stay exactly where they are, the buried
 * barrel end goes back on the axis at the barrel's length, and the pin follows
 * from those two: barrel and rod are equal, so the rod reaches back exactly one
 * barrel from the rod's mount and the pin can only be at `span - barrel`. There
 * is nothing to choose. For a valid assembly this is the identity (every drag
 * already rounds to the same 6 decimals), so running it on every mechanism
 * update costs a no-op — and any code path that wrote a member joint without
 * going through the parametric layout gets silently straightened before
 * anything downstream can read the bent state.
 *
 * It used to *project* the pin onto the axis and clamp it into the travel,
 * which is a different thing and only looked like the same one while the bore
 * left barely any travel to clamp into. Straightening a flung pin that way put
 * it wherever its own stray coordinates happened to project — and a pin off
 * `span - barrel` is a rod that no longer matches its barrel, so the repair
 * produced exactly the state the equality tripwire exists to reject, and the
 * skin vanished instead of being fixed.
 *
 * No clamp, deliberately. Raising Object Scale grows the bore under a part
 * nobody touched and can leave `span - barrel` outside the travel; snapping the
 * pin in would move a joint with no undo entry, break the equality, and destroy
 * the geometry that scaling back down would otherwise restore. Left alone the
 * part stays exactly as drawn and the solver refuses to run it, which is what
 * the panel already says.
 */
export function normalizedCylinderPose(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  barrelLength: number,
  r: number
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9 || !(barrelLength > 1e-9)) return undefined;
  const ux = dx / distance;
  const uy = dy / distance;

  const along = distance - barrelLength;

  return {
    barrelFar: { x: barrelMount.x, y: barrelMount.y },
    barrelNear: { x: barrelMount.x + barrelLength * ux, y: barrelMount.y + barrelLength * uy },
    pin: { x: barrelMount.x + along * ux, y: barrelMount.y + along * uy },
    rodFar: { x: rodMount.x, y: rodMount.y },
  };
}

/** Where each joint of a re-posed cylinder lands. */
export interface CylinderPose {
  /** True when the layout had to hold the ram at its shortest. */
  atMinimum?: boolean;
  barrelFar: { x: number; y: number };
  barrelNear: { x: number; y: number };
  /** The pin and its coincident slider both go here. */
  pin: { x: number; y: number };
  rodFar: { x: number; y: number };
}

/**
 * Re-pose a cylinder from its two mounts — the parametric drag (§ cylinder 6).
 *
 * The span between the mounts drives the layout: inside the ram's own travel
 * only the pin moves, and past either end of it the ram resizes. The `anchor`
 * mount stays exactly where it is in every case, and collinearity holds by
 * construction: every returned point is on the axis. `barrelLength` is read —
 * it is what the current stroke is measured from, and the whole point of the
 * rule is that a span inside the travel does *not* change it.
 */
/** Barrel, rod and pin for a given size and position. The one place they are built. */
export function cylinderMembers(stroke: number, start: number, r: number): CylinderMembers {
  const held = Math.max(stroke, MIN_STROKE_R * r);
  const at = Math.min(Math.max(start, 0), 1);
  // Equal by construction. Everything below is addition along the axis.
  const barrel = held + HEAD_CLEARANCE_R * r;
  const pinAlong = HEAD_CLEARANCE_R * r + cylinderHeadHalf(barrel, r) + held * at;
  return {
    span: pinAlong + barrel,
    barrel,
    pinAlong,
    rod: barrel,
    stroke: held,
    start: at,
    // Reported rather than merely applied: a gesture that has stopped following
    // the cursor should be able to say why, and only the layout knows.
    atMinimum: held > stroke,
  };
}

/** A ram's members, and whether making it took the floor. */
export interface CylinderMembers {
  span: number;
  barrel: number;
  pinAlong: number;
  rod: number;
  stroke: number;
  start: number;
  atMinimum: boolean;
}

/**
 * Pose first, then size — the rule a mount drag follows, and the one the panel
 * follows when a length is typed into *Starts at*.
 *
 * Inside the ram's own travel the size is untouched and the piston simply
 * slides to where it was asked for. Push past a stop and the ram resizes, with
 * barrel and rod staying equal: pulling past fully-extended grows it, and
 * because *both* halves grow the mount travels twice as fast as the stroke
 * does; pushing past fully-retracted shrinks it one-for-one until the floor.
 *
 * The ordering is the point. Posing is the common intent and resizing the rare
 * one, so the cheap half of the gesture does the common thing and you have to
 * push through a detent — the ram's own stop — to reach the expensive one. A
 * drag that stays inside the travel is therefore guaranteed non-destructive:
 * the ram you sized cannot be resized by accident.
 */
export function cylinderSpanLayout(
  span: number,
  currentStroke: number,
  r: number
): CylinderMembers {
  const stroke = Math.max(currentStroke, MIN_STROKE_R * r);
  const { retracted, extended } = cylinderSpanRange(stroke, r);
  if (span >= retracted && span <= extended) {
    return cylinderMembers(stroke, (span - retracted) / stroke, r);
  }
  return cylinderSpanLayoutFrom(span, span > extended ? 1 : 0, r);
}

/**
 * The stroke that puts a ram of the given start exactly at this span.
 *
 * Bisected rather than rearranged. `span = stroke × (1 + start) + lock`, and the
 * lock is a constant only while the head is: below that the head is half the
 * barrel and follows the stroke down, so an inverted formula needs a case per
 * regime and a test for which one lands — three chances to be subtly wrong at
 * the seams, on the path a drag runs every pointermove. `span` is strictly
 * increasing in `stroke` throughout, so bisection needs none of that and
 * converges to well under the six decimals every coordinate is rounded to.
 */
export function cylinderSpanLayoutFrom(span: number, start: number, r: number): CylinderMembers {
  const floor = MIN_STROKE_R * r;
  let low = floor;
  // A stroke can never exceed the span it has to fit inside, lock or no lock.
  let high = Math.max(floor, span);
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (cylinderMembers(mid, start, r).span > span) high = mid;
    else low = mid;
  }
  return cylinderMembers(low, start, r);
}

export function layoutCylinder(
  barrelMount: { x: number; y: number },
  rodMount: { x: number; y: number },
  /** The barrel as it stands, which is what the current stroke is read from. */
  barrelLength: number,
  r: number,
  anchor: 'barrel' | 'rod',
  /**
   * The axis direction before this move. A drag that crosses the anchor
   * would otherwise flip the part 180° the instant the direction reverses;
   * with the hint, the crossing clamps at the minimum span on the side the
   * part was already on.
   */
  axisHint?: { x: number; y: number }
): CylinderPose | undefined {
  const dx = rodMount.x - barrelMount.x;
  const dy = rodMount.y - barrelMount.y;
  let distance = Math.hypot(dx, dy);
  let ux: number;
  let uy: number;
  const hintLen = axisHint ? Math.hypot(axisHint.x, axisHint.y) : 0;
  if (distance < 1e-9) {
    // Coincident mounts define no axis; the hint does, if there is one.
    if (!(hintLen > 1e-9)) return undefined;
    ux = axisHint!.x / hintLen;
    uy = axisHint!.y / hintLen;
    distance = 0;
  } else {
    ux = dx / distance;
    uy = dy / distance;
    if (hintLen > 1e-9 && ux * axisHint!.x + uy * axisHint!.y < 0) {
      // The dragged mount crossed the anchor: hold the old axis and let the
      // span clamp at its minimum rather than flipping the part.
      ux = axisHint!.x / hintLen;
      uy = axisHint!.y / hintLen;
      distance = 0;
    }
  }

  const flex = cylinderSpanLayout(distance, cylinderStroke(barrelLength, r), r);

  const a =
    anchor === 'barrel'
      ? { x: barrelMount.x, y: barrelMount.y }
      : { x: rodMount.x - flex.span * ux, y: rodMount.y - flex.span * uy };
  const c =
    anchor === 'barrel'
      ? { x: barrelMount.x + flex.span * ux, y: barrelMount.y + flex.span * uy }
      : { x: rodMount.x, y: rodMount.y };

  return {
    barrelFar: a,
    barrelNear: { x: a.x + flex.barrel * ux, y: a.y + flex.barrel * uy },
    pin: { x: a.x + flex.pinAlong * ux, y: a.y + flex.pinAlong * uy },
    rodFar: c,
    atMinimum: flex.atMinimum,
  };
}

/**
 * Re-pose a cylinder from the size and position themselves — what the panel
 * writes, and the one thing the span rule above cannot express.
 *
 * Size and pose are two different edits. Asked for a longer stroke at the same
 * start, the resulting span usually still lies *inside* the old stroke's own
 * travel — so the span rule, doing exactly what it is meant to, would hold the
 * old size and slide the piston instead. A field labelled Travel would then
 * quietly change the position and not the travel.
 *
 * The barrel mount is held and the rod mount moves, because the barrel mount is
 * the end a ram is anchored by; `angleRad` keeps the part on the axis the panel
 * shows rather than re-deriving it from mounts that are about to move.
 */
export function poseFromStrokeAndStart(
  barrelMount: { x: number; y: number },
  angleRad: number,
  stroke: number,
  start: number,
  r: number
): CylinderPose {
  const members = cylinderMembers(stroke, start, r);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const at = (along: number) => ({
    x: barrelMount.x + along * ux,
    y: barrelMount.y + along * uy,
  });
  return {
    barrelFar: at(0),
    barrelNear: at(members.barrel),
    pin: at(members.pinAlong),
    rodFar: at(members.span),
  };
}

/** The size and position a built cylinder currently has, read back off its joints. */
export function cylinderSizeOf(
  cylinder: Cylinder,
  r: number = 0.15 * SettingsService.objectScale
): { stroke: number; start: number; span: number; barrelLength: number } {
  const barrelLength = Math.hypot(
    cylinder.barrelNear.x - cylinder.barrelFar.x,
    cylinder.barrelNear.y - cylinder.barrelFar.y
  );
  const span = Math.hypot(
    cylinder.rodFar.x - cylinder.barrelFar.x,
    cylinder.rodFar.y - cylinder.barrelFar.y
  );
  // Through the travel interval, not the raw subtraction: a barrel can be long
  // enough to leave a sliver over the bore and still have no *usable* stroke,
  // and reporting that sliver put the panel at odds with the solver -- Travel
  // saying 0.05 cm beside a mechanism saying the ram has no travel at all.
  const travel = cylinderStrokeAlong(barrelLength, r);
  const stroke = travel.usable ? travel.max - travel.min : 0;
  const { retracted } = cylinderSpanRange(stroke, r);
  return {
    stroke,
    start: stroke > 0 ? Math.min(Math.max((span - retracted) / stroke, 0), 1) : 0,
    span,
    barrelLength,
  };
}
