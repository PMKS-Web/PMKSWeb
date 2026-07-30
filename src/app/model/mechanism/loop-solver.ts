import { Joint, RealJoint } from '../joint';
import { Link } from '../link';

/**
 * One step of a kinematic loop.
 *
 * Everything is an id. Loops are enumerated once from timestep 0 but consumed
 * against per-timestep deep copies, so an edge holding `Joint`/`Link` objects
 * would read timestep 0's geometry forever while claiming to solve timestep 27.
 * The codebase has been bitten by exactly that twice already — see the comment
 * in `kinematic-solver.ts` about identity `indexOf` against copied joints, and
 * `PrisJoint.rebindSlot`, which exists solely to re-resolve slot references by
 * id on each copy.
 */
export type LoopEdge =
  | { kind: 'link'; fromId: string; toId: string; linkId: string }
  | { kind: 'slot'; fromId: string; toId: string; sliderId: string };

export interface Loop {
  /** Deterministic signature, used as the Map key everywhere. */
  id: string;
  edges: LoopEdge[];
}

/**
 * A loop's signature: the first joint, then each step.
 *
 * The separators keep multi-character joint ids unambiguous, which the old
 * letter-string format could not do — it keyed link lookups by concatenating
 * two joint ids and so could not tell `AB`+`C` from `A`+`BC`.
 */
export function loopId(edges: LoopEdge[]): string {
  if (edges.length === 0) {
    return '';
  }
  return edges.reduce(
    (signature, edge) =>
      signature + (edge.kind === 'slot' ? `~${edge.sliderId}~${edge.toId}` : `-${edge.toId}`),
    edges[0].fromId
  );
}

/** How the walk reached a joint: through a link, or across a slot. */
interface PathStep {
  jointId: string;
  /** Set when this step crossed a sliding pair rather than a link. */
  viaSliderId?: string;
}

export class LoopSolver {
  /**
   * Every loop that runs from one ground joint to another.
   *
   * Loops are **open chains**: the returned edges stop at the second ground
   * joint. The closing ground-to-ground step is not represented, because no
   * `Link` joins two ground joints and no consumer ever asked for one — the old
   * letter format appended the starting letter back on and then every walk
   * stopped one short of it.
   */
  static determineLoops(joints: Joint[], links: Link[]): Loop[] {
    const loops: Loop[] = [];
    const groundJoints: Joint[] = [];
    joints.forEach((j) => {
      if (!(j instanceof RealJoint) || !j.ground) {
        return;
      }
      // Ground joints carrying the input are walked first, so the loops that
      // define the input's own chain come out ahead of the rest.
      if (j.input) {
        groundJoints.unshift(j);
      } else {
        groundJoints.push(j);
      }
    });

    while (groundJoints.length >= 2) {
      const desiredGround = groundJoints.shift()!;
      if (!(desiredGround instanceof RealJoint)) {
        continue;
      }
      desiredGround.connectedJoints.forEach((cj) => {
        this.findGround(
          cj,
          groundJoints,
          [cj.id],
          [{ jointId: desiredGround.id }, { jointId: cj.id }],
          loops,
          desiredGround.input,
          links
        );
      });
    }
    return loops;
  }

  /** Walk outward until another ground joint is reached. */
  private static findGround(
    joint: Joint,
    groundJoints: Joint[],
    visited: string[],
    path: PathStep[],
    loops: Loop[],
    storeJointPath: boolean,
    links: Link[]
  ): void {
    if (!(joint instanceof RealJoint)) {
      return;
    }
    for (const j of joint.connectedJoints) {
      if (!(j instanceof RealJoint)) {
        continue;
      }
      if (visited.includes(j.id)) {
        continue;
      }
      if (j.ground) {
        if (groundJoints.indexOf(j) === -1 || !storeJointPath) {
          continue;
        }
        const edges = this.edgesAlong([...path, { jointId: j.id }], links);
        if (edges) {
          loops.push({ id: loopId(edges), edges });
        }
      } else {
        this.findGround(
          j,
          groundJoints,
          [...visited, j.id],
          [...path, { jointId: j.id }],
          loops,
          storeJointPath,
          links
        );
      }
    }
  }

  /**
   * Turn a walked path into edges, or reject it.
   *
   * A path is a *required* loop only if every step is a real connection and no
   * connection is used twice: a loop that re-traverses one body is implied by
   * shorter loops rather than independent of them.
   */
  private static edgesAlong(path: PathStep[], links: Link[]): LoopEdge[] | undefined {
    const edges: LoopEdge[] = [];
    const traveled: string[] = [];
    for (let index = 1; index < path.length; index++) {
      const step = path[index];
      const fromId = path[index - 1].jointId;
      // A slot counts in the traveled bookkeeping exactly as a link does.
      const connectionId = step.viaSliderId ?? this.linkBetween(fromId, step.jointId, links)?.id;
      if (connectionId === undefined || traveled.includes(connectionId)) {
        return undefined;
      }
      traveled.push(connectionId);
      edges.push(
        step.viaSliderId
          ? { kind: 'slot', fromId, toId: step.jointId, sliderId: step.viaSliderId }
          : { kind: 'link', fromId, toId: step.jointId, linkId: connectionId }
      );
    }
    return edges;
  }

  private static linkBetween(fromId: string, toId: string, links: Link[]): Link | undefined {
    return links.find(
      (link) =>
        link.joints.some((joint) => joint.id === fromId) &&
        link.joints.some((joint) => joint.id === toId)
    );
  }
}
