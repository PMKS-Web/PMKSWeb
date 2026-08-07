/**
 * What a driven joint actually names (§2.9).
 *
 * `input: boolean` on a joint cannot say what an input is. An input prescribes
 * a *relative* freedom between **two bodies**, and a boolean names neither of
 * them. It survives because a grounded crank has an obvious answer and the
 * solvers guess: the kinematic solver reaches for the input joint's first link,
 * the force solver for the first incident real body. Both are already wrong for
 * a grounded input joint carrying more than one link — and a driven *floating*
 * pin, where neither body is the world, makes the guess impossible rather than
 * merely lucky.
 *
 * The record is derived, never stored. `joint.links` order is the serialization
 * order, so deriving from it is what makes the pairing survive a URL round-trip
 * without adding anything to the codec.
 */

import { Joint, PrisJoint, RealJoint } from './joint';
import { Link } from './link';

/** The world, as a body an actuator can be measured against. */
export const GROUND_BODY = 'ground';

export interface Actuator {
  joint: RealJoint;
  /** What the driven body's freedom is measured *against*. */
  referenceBody: Link | typeof GROUND_BODY;
  /** The body the input moves. */
  drivenBody: Link | typeof GROUND_BODY;
  /** An angle between two bodies, or a length along a slot. */
  kind: 'angle' | 'length';
}

/**
 * Every distinct body meeting at a joint.
 *
 * The far side of a sliding joint is whatever its slot is cut into — the world
 * for a fixed guide, the carrier for a floating one — and that body is not in
 * `links`, so it is added here. Getting this wrong would let a cylinder's own
 * slider look like a one-body joint and pass a restriction meant to catch
 * ambiguity.
 */
export function incidentBodies(joint: RealJoint): (Link | typeof GROUND_BODY)[] {
  const bodies: (Link | typeof GROUND_BODY)[] = [];
  const seen = new Set<string>();
  if (joint.ground) {
    bodies.push(GROUND_BODY);
    seen.add(GROUND_BODY);
  }
  for (const link of joint.links) {
    if (!seen.has(link.id)) {
      bodies.push(link);
      seen.add(link.id);
    }
  }
  if (joint instanceof PrisJoint && joint.carrier && !seen.has(joint.carrier.id)) {
    bodies.push(joint.carrier);
    seen.add(joint.carrier.id);
  }
  return bodies;
}

/**
 * The actuator this joint would be, or why it cannot be one.
 *
 * The v1 restriction is exactly two incident bodies. With three, "the angle
 * between the bodies" names no particular pair, and every answer the solvers
 * could pick is a guess the user never made. Refused with a reason rather than
 * driven wrongly.
 */
export function describeActuator(joint: Joint): Actuator | string {
  if (!(joint instanceof RealJoint)) {
    return 'Only a joint can be driven.';
  }
  // A weld is the statement that these bodies do *not* move relative to each
  // other, so there is no freedom at this joint for an input to prescribe.
  // Most welds fuse their links into one compound and are caught by the count
  // below; a Slide's weld does not -- its block stays a separate link -- so
  // the flag has to be asked directly. Driving one would put a commanded angle
  // on top of the weld's own constraint, and the mechanism would report itself
  // unsolvable rather than saying what was wrong.
  if (joint.isWelded) {
    return 'This joint is welded, so the bodies it joins cannot move relative to each other. Unweld it, or drive a joint that has a freedom.';
  }
  const bodies = incidentBodies(joint);
  if (bodies.length < 2) {
    return 'A driven joint needs two bodies to move relative to each other.';
  }
  if (bodies.length > 2) {
    return `This joint joins ${bodies.length} bodies, so "driven" would not say which pair moves. Drive a joint where exactly two meet.`;
  }

  // Ground first when it is there: a crank's angle is read from the world, not
  // the world's angle from the crank. `incidentBodies` already puts it first.
  return {
    joint,
    referenceBody: bodies[0],
    drivenBody: bodies[1],
    kind: joint instanceof PrisJoint ? 'length' : 'angle',
  };
}

/** The actuator this joint would be, or nothing. */
export function resolveActuator(joint: Joint): Actuator | undefined {
  const found = describeActuator(joint);
  return typeof found === 'string' ? undefined : found;
}

/** Whether this joint could be driven at all — the panel's enable rule. */
export function canDrive(joint: Joint): boolean {
  return resolveActuator(joint) !== undefined;
}

/**
 * A joint on `body` other than the actuator's own, giving the direction the
 * body's angle is measured along.
 *
 * Canonical rather than clever: the body's first other joint, in the order the
 * link serializes its joints. Any consistent choice works — the angle between
 * two bodies does not depend on which of their points you measure it from,
 * only on staying with the same points from one sample to the next.
 */
export function angleReference(
  body: Link | typeof GROUND_BODY,
  joint: RealJoint
): Joint | undefined {
  if (body === GROUND_BODY) return undefined;
  return body.joints.find((member) => member.id !== joint.id);
}
