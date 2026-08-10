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
   * An independent set of loops running from one ground joint to another.
   *
   * Every such walk is enumerated, then reduced to a cycle basis: see
   * `independent` for why the extras have to go rather than merely being
   * harmless.
   *
   * Loops are **open chains**: the returned edges stop at the second ground
   * joint. The closing ground-to-ground step is not represented, because no
   * `Link` joins two ground joints and no consumer ever asked for one — the old
   * letter format appended the starting letter back on and then every walk
   * stopped one short of it.
   *
   * Every pair of ground joints is walked, not only the pairs containing the
   * input. A closure that touches no ground pivot the input sits on is still a
   * closure: a shaper's output stage — lever tip, connecting link, ram on its
   * own guide — runs between the lever's pivot and the ram's guide, and both
   * are ground. Enumerating only the input's own chains left that stage in no
   * loop at all, so the velocity walk never reached the ram and the graph drew
   * a joint that travels three units as standing still.
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
          links,
          slotNeighbours
        );
      });
    }
    return this.independent(this.deduplicate(loops));
  }

  /**
   * Keep only the loops that say something the earlier ones did not.
   *
   * `deduplicate` removes a loop that repeats another one's bodies, but a
   * mechanism can enumerate more distinct walks than it has independent
   * closures. Jansen's leg yields four — `O-A-B-G`, `O-A-B-C-E-D-G`,
   * `O-A-D-G`, `O-A-D-E-C-G` — and the fourth is the sum of the other three.
   * The velocity system sizes its matrix from the unknown count (six here) but
   * indexes its rows by loop, so a fourth loop writes past the last row.
   *
   * Independence is settled here, on topology, rather than in the solver: the
   * loops are enumerated once per mechanism and the solver rebuilds its
   * matrices every timestep, and every consumer of `requiredLoops` — the
   * velocity solver, the force solver, the instant centres — has to be looking
   * at the same set or they disagree about what the mechanism is.
   *
   * The test is elimination over GF(2) in the mechanism's cycle space. A loop
   * is the set of (body, joint) incidences it uses; a walk that reduces to the
   * empty set is a sum of loops already kept, and so adds no equation. What
   * survives is a cycle basis, and because the scan is greedy in order, a
   * mechanism whose loops were already independent comes back untouched.
   */
  private static independent(loops: Loop[]): Loop[] {
    const basis = new Map<string, Set<string>>();
    const kept: Loop[] = [];
    for (const loop of loops) {
      let vector = this.incidences(loop);
      // Reduce against the basis, smallest remaining incidence first.
      for (let pivot = this.lowest(vector); pivot !== undefined; pivot = this.lowest(vector)) {
        const row = basis.get(pivot);
        if (!row) {
          break;
        }
        for (const bit of row) {
          if (vector.has(bit)) {
            vector.delete(bit);
          } else {
            vector.add(bit);
          }
        }
      }
      const pivot = this.lowest(vector);
      if (pivot === undefined) {
        continue;
      }
      basis.set(pivot, vector);
      kept.push(loop);
    }
    return kept;
  }

  /**
   * A loop as the (body, joint) incidences it uses, one bit each.
   *
   * Bodies and joints both become nodes and an incidence becomes an edge, so a
   * pin shared by three bodies contributes three edges rather than a triangle
   * that would count as an extra cycle. Prefixes keep the three kinds of body
   * apart: a link, a sliding pair, and the frame that closes the walk — loops
   * are returned as open ground-to-ground chains, and without that closing
   * step they would not be cycles at all.
   */
  private static incidences(loop: Loop): Set<string> {
    const bits = new Set<string>();
    const toggle = (bodyId: string, jointId: string) => {
      const bit = `${bodyId}|${jointId}`;
      if (bits.has(bit)) {
        bits.delete(bit);
      } else {
        bits.add(bit);
      }
    };
    for (const edge of loop.edges) {
      const bodyId = edge.kind === 'slot' ? `S:${edge.sliderId}` : `L:${edge.linkId}`;
      toggle(bodyId, edge.fromId);
      toggle(bodyId, edge.toId);
    }
    if (loop.edges.length > 0) {
      toggle('F:', loop.edges[0].fromId);
      toggle('F:', loop.edges[loop.edges.length - 1].toId);
    }
    return bits;
  }

  private static lowest(bits: Set<string>): string | undefined {
    let lowest: string | undefined;
    for (const bit of bits) {
      if (lowest === undefined || bit < lowest) {
        lowest = bit;
      }
    }
    return lowest;
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
        if (groundJoints.indexOf(j) === -1) {
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
