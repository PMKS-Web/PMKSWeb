import { Joint } from './joint';

/** The shape both callers need: anything with an id and a joint list. */
interface JointedBody {
  id: string;
  joints: Joint[];
}

/**
 * How many joints two bodies hold in common.
 *
 * Two is the number that matters. Two rigid bodies pinned to each other at two
 * points cannot move relative to each other — the second pin constrains nothing
 * the first did not already — so they are one body, and the pin is redundant.
 * That single fact drives both consequences in this file.
 */
export function sharedJointCount(a: JointedBody, b: JointedBody): number {
  return a.joints.filter((joint) => b.joints.some((other) => other.id === joint.id)).length;
}

/**
 * Map every body to the rigid body it belongs to, merging any pair that shares
 * two or more joints.
 *
 * Mobility is counted over these groups rather than over links. Gruebler's
 * equation cannot tell a redundant pin from a real one and subtracts for it
 * anyway, reporting a mobility one lower than the assembly has: an ordinary
 * four-bar whose coupler is drawn as two overlapping links then counts as DOF 0
 * and refuses to simulate.
 */
export function groupRigidBodies<T extends JointedBody>(bodies: T[]): Map<string, string> {
  const parent = new Map<string, string>();
  bodies.forEach((body) => parent.set(body.id, body.id));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  };

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (sharedJointCount(bodies[i], bodies[j]) >= 2) {
        parent.set(find(bodies[i].id), find(bodies[j].id));
      }
    }
  }

  return new Map(bodies.map((body) => [body.id, find(body.id)]));
}

/**
 * The first pair of bodies holding the same two joints, if there is one.
 *
 * The kinematics of such an assembly are fine — that is what groupRigidBodies
 * is for — but its statics are not. A redundant pin carries a share of the load
 * that rigid-body equilibrium alone cannot determine, so the force solver has
 * no unique answer to give. Callers use this to decline an edit that would
 * create the condition rather than let the user reach an analysis panel that
 * can only apologise.
 */
export function findRedundantlyPinnedPair<T extends JointedBody>(bodies: T[]): [T, T] | undefined {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (sharedJointCount(bodies[i], bodies[j]) >= 2) return [bodies[i], bodies[j]];
    }
  }
  return undefined;
}
