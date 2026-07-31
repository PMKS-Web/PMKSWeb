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
 *
 * `extraMerges` names groups of body ids the caller already knows to be rigid
 * for a reason no joint count can see. A Slide is the case: its rider and block
 * share exactly one joint, and it is the *weld* there rather than a second pin
 * that stops them turning. Passing it in rather than letting `Mechanism` merge
 * afterwards keeps one definition of "one rigid body", which is the whole point
 * of this module.
 */
export function groupRigidBodies<T extends JointedBody>(
  bodies: T[],
  extraMerges: string[][] = []
): Map<string, string> {
  const parent = new Map<string, string>();
  bodies.forEach((body) => parent.set(body.id, body.id));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  };
  const union = (left: string, right: string): void => {
    parent.set(find(left), find(right));
  };

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (sharedJointCount(bodies[i], bodies[j]) >= 2) {
        union(bodies[i].id, bodies[j].id);
      }
    }
  }

  // Ids the caller names that are not bodies here are skipped rather than
  // seeded: `find` walks the parent map, so inventing an entry for a body this
  // count does not contain would put a group root on nothing.
  extraMerges.forEach((group) => {
    const present = group.filter((id) => parent.has(id));
    present.slice(1).forEach((id) => union(present[0], id));
  });

  return new Map(bodies.map((body) => [body.id, find(body.id)]));
}

/**
 * Every set of joints that two bodies both hold rigidly, keyed by the joint ids
 * so the same redundancy is recognisable across an edit that renames bodies.
 *
 * Callers compare the set before an edit with the set after it. Asking only
 * "is anything redundant now?" would blame an edit for a condition the
 * mechanism already had — and since a mechanism may legitimately arrive with
 * one, that would make every later edit look like the culprit.
 */
export function redundantlyHeldJointSets<T extends JointedBody>(bodies: T[]): Set<string> {
  const held = new Set<string>();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const shared = bodies[i].joints
        .filter((joint) => bodies[j].joints.some((other) => other.id === joint.id))
        .map((joint) => joint.id)
        .sort();
      if (shared.length >= 2) held.add(shared.join('|'));
    }
  }
  return held;
}
