import { Joint, PrisJoint, RealJoint } from '../joint';
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

/** A joint the walk may step to, and how it would get there. */
interface Neighbour {
  joint: RealJoint;
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
    const slotNeighbours = this.slotAdjacency(joints);
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
      this.neighboursOf(desiredGround, slotNeighbours).forEach((next) => {
        this.findGround(
          next.joint,
          groundJoints,
          [next.joint.id],
          [
            { jointId: desiredGround.id },
            { jointId: next.joint.id, viaSliderId: next.viaSliderId },
          ],
          loops,
          desiredGround.input,
          links,
          slotNeighbours
        );
      });
    }
    return this.deduplicate(loops);
  }

  /**
   * Where a sliding joint may be crossed to reach the link it slides in.
   *
   * The carrier stays out of `PrisJoint.links` and `connectedJoints` — the
   * position solver depends on it being absent, and putting it there was the
   * option this design rejected. So the adjacency lives here instead, built
   * fresh for each walk.
   *
   * A slider is joined to exactly one of its carrier's joints, the same anchor
   * the equations measure travel from. One sliding pair is one constraint;
   * offering every carrier joint would let a single slot appear as two
   * different loop closures, and since the carrier is rigid the walk can still
   * reach its other joints by ordinary link steps.
   */
  private static slotAdjacency(joints: Joint[]): Map<string, Neighbour[]> {
    const adjacency = new Map<string, Neighbour[]>();
    const add = (fromId: string, joint: RealJoint, viaSliderId: string) => {
      const existing = adjacency.get(fromId) ?? [];
      existing.push({ joint, viaSliderId });
      adjacency.set(fromId, existing);
    };
    for (const joint of joints) {
      if (!(joint instanceof PrisJoint) || !joint.isFloating || !joint.isSlotWellFormed) {
        continue;
      }
      const anchor = joint.slotJointA;
      if (!(anchor instanceof RealJoint)) {
        continue;
      }
      add(joint.id, anchor, joint.id);
      add(anchor.id, joint, joint.id);
    }
    return adjacency;
  }

  private static neighboursOf(
    joint: RealJoint,
    slotNeighbours: Map<string, Neighbour[]>
  ): Neighbour[] {
    const linked = joint.connectedJoints
      .filter((candidate): candidate is RealJoint => candidate instanceof RealJoint)
      .map((candidate) => ({ joint: candidate }) as Neighbour);
    return [...linked, ...(slotNeighbours.get(joint.id) ?? [])];
  }

  /**
   * Drop loops that describe a circuit another loop already describes.
   *
   * Two walks that traverse the same set of bodies and sliding pairs are the
   * same constraint written two ways; keeping both would over-determine the
   * velocity system, which sizes its matrix from the loop count.
   */
  private static deduplicate(loops: Loop[]): Loop[] {
    const bySignature = new Map<string, Loop>();
    for (const loop of loops) {
      const signature = loop.edges
        .map((edge) => (edge.kind === 'slot' ? edge.sliderId : edge.linkId))
        .sort()
        .join(',');
      const existing = bySignature.get(signature);
      if (!existing || loop.id < existing.id) {
        bySignature.set(signature, loop);
      }
    }
    return loops.filter(
      (loop) =>
        bySignature.get(
          loop.edges
            .map((edge) => (edge.kind === 'slot' ? edge.sliderId : edge.linkId))
            .sort()
            .join(',')
        ) === loop
    );
  }

  /** Walk outward until another ground joint is reached. */
  private static findGround(
    joint: Joint,
    groundJoints: Joint[],
    visited: string[],
    path: PathStep[],
    loops: Loop[],
    storeJointPath: boolean,
    links: Link[],
    slotNeighbours: Map<string, Neighbour[]>
  ): void {
    if (!(joint instanceof RealJoint)) {
      return;
    }
    for (const next of this.neighboursOf(joint, slotNeighbours)) {
      const j = next.joint;
      if (visited.includes(j.id)) {
        continue;
      }
      const step: PathStep = { jointId: j.id, viaSliderId: next.viaSliderId };
      if (j.ground) {
        if (groundJoints.indexOf(j) === -1 || !storeJointPath) {
          continue;
        }
        const edges = this.edgesAlong([...path, step], links);
        if (edges) {
          loops.push({ id: loopId(edges), edges });
        }
      } else {
        this.findGround(
          j,
          groundJoints,
          [...visited, j.id],
          [...path, step],
          loops,
          storeJointPath,
          links,
          slotNeighbours
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
