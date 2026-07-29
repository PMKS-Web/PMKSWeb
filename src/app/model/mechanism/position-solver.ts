import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link } from '../link';
import {
  circleCircleIntersection,
  circleLineIntersection,
  determineUnknownJointUsingTriangulation,
  euclideanDistance,
  roundNumber,
} from '../utils';
import { Force } from '../force';
import { Coord } from '../coord';
import { core } from '@angular/compiler';

/**
 * How close two solve-circle centres must be to count as coincident. Joint
 * positions are rounded to four decimals each timestep, so the bound is absolute
 * rather than mechanism-scale relative — matching circleCircleIntersection's own
 * tangent tolerance.
 */
const CONCENTRIC_TOLERANCE = 0.001;

export class PositionSolver {
  static desiredIndexWithinPosAnalysisMap = new Map<string, number>();
  static jointMapPositions = new Map<string, Array<number>>();
  /** One step behind jointMapPositions; see concentricSolution. */
  private static priorJointPositions = new Map<string, Array<number>>();
  static sliderAngleMap = new Map<string, number>();
  static desiredJointGroundIndexMap = new Map<string, number>();
  static unknownJointsIndicesMap = new Map<string, number[]>();
  static desiredLinkIndexMap = new Map<string, number>();
  static jointNumOrderSolverMap = new Map<number, string>();
  private static internalTriangleValuesMap = new Map<string, number[]>();
  private static desiredConnectedJointIndicesMap = new Map<string, number[]>();
  private static desiredAnalysisJointMap = new Map<string, string>();
  private static jointDistMap = new Map<string, number>();
  private static initialJointPosMap = new Map<string, [number, number]>();
  /** A point on each sliding joint's slot line. */
  private static slotPointMap = new Map<string, [number, number]>();
  /** Unit direction of each sliding joint's slot line. */
  private static slotDirectionMap = new Map<string, [number, number]>();
  static forcePositionMap = new Map<string, Coord>();
  static forceMagnitudeMap = new Map<string, number>();

  static resetStaticVariables() {
    this.desiredIndexWithinPosAnalysisMap = new Map<string, number>();
    this.jointMapPositions = new Map<string, Array<number>>();
    this.priorJointPositions = new Map<string, Array<number>>();
    this.sliderAngleMap = new Map<string, number>();
    this.desiredJointGroundIndexMap = new Map<string, number>();
    this.unknownJointsIndicesMap = new Map<string, number[]>();
    this.desiredLinkIndexMap = new Map<string, number>();
    this.internalTriangleValuesMap = new Map<string, number[]>();
    this.jointNumOrderSolverMap = new Map<number, string>();
    this.desiredConnectedJointIndicesMap = new Map<string, number[]>();
    this.desiredAnalysisJointMap = new Map<string, string>();
    this.jointDistMap = new Map<string, number>();
    this.initialJointPosMap = new Map<string, [number, number]>();
    this.slotPointMap = new Map<string, [number, number]>();
    this.slotDirectionMap = new Map<string, [number, number]>();
  }

  static determineJointOrder(joints: Joint[], links: Link[]) {
    const knownJointsIds: string[] = [];
    let orderNum = 1;
    // pre-condition: Save all the joints as initial Values
    joints.forEach((j) => {
      this.initialJointPosMap.set(j.id, [j.x, j.y]);
    });

    // 1st: store all ground joints as known joints
    joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (j instanceof PrisJoint) {
        this.sliderAngleMap.set(j.id, j.angle_rad);
      }
      if (!j.ground) {
        return;
      }
      knownJointsIds.push(j.id);
    });
    // 2nd: determine joints that neighbor the input joint
    const inputJointIndex = joints.findIndex((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      return j.input;
    });
    const inputJoint = joints[inputJointIndex];
    if (!(inputJoint instanceof RealJoint)) {
      return;
    }
    const tracer_joints: Joint[] = [];
    inputJoint.connectedJoints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      if (j.ground) {
        return;
      }
      // if (j.ground && j.constructor !== PrisJoint) {
      //   return;
      // }
      // store the solved number
      this.jointNumOrderSolverMap.set(orderNum++, j.id);
      // store desired joints as input joint and current_joint
      // const currentJointIndex = simJoints.findIndex(jt => jt.id === current_joint.id);
      this.desiredConnectedJointIndicesMap.set(j.id, [inputJointIndex]);
      // store the solve type from the input solver
      switch (inputJoint.constructor) {
        case RevJoint: {
          this.desiredAnalysisJointMap.set(j.id, 'incrementRevInput');
          this.jointDistMap.set(
            inputJoint.id + ',' + j.id,
            euclideanDistance(inputJoint.x, inputJoint.y, j.x, j.y)
          );
          break;
        }
        case PrisJoint: {
          this.desiredAnalysisJointMap.set(j.id, 'incrementPrisInput');
          break;
        }
      }
      knownJointsIds.push(j.id);
      tracer_joints.push(j);
    });
    tracer_joints.forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      orderNum = this.detJointOrder(joints, links, j, orderNum, knownJointsIds);
    });
  }

  // TODO: Change the names from simJoints, simLinks to just joints and links
  static detJointOrder(
    joints: Joint[],
    links: Link[],
    prevJoint: RealJoint,
    orderNum: number,
    knownJointArray: string[]
  ) {
    prevJoint.connectedJoints.forEach((cur_joint) => {
      if (!(cur_joint instanceof RealJoint)) {
        return;
      }
      // TODO: Within future, have a method to determine the index based on list of joints and desired ID
      if (knownJointArray.findIndex((j_id) => j_id === cur_joint.id) !== -1) {
        return;
      }
      const prev_joint_index = joints.findIndex((j) => j.id === prevJoint.id);
      let connectedToSlider = false;
      cur_joint.connectedJoints.forEach((j) => {
        if (j.constructor === PrisJoint) {
          connectedToSlider = true;
        }
      });
      if (connectedToSlider) {
        const sliderJoint = cur_joint.connectedJoints.find(
          (j): j is PrisJoint => j.constructor === PrisJoint
        );
        if (sliderJoint === undefined) {
          return;
        }
        const sliderJointIndex = joints.findIndex((j) => j.id === sliderJoint.id);
        this.desiredConnectedJointIndicesMap.set(cur_joint.id, [
          prev_joint_index,
          sliderJointIndex,
        ]);
        this.desiredAnalysisJointMap.set(cur_joint.id, 'circleLineIntersectionPoints');
        this.jointNumOrderSolverMap.set(orderNum++, cur_joint.id);
        this.jointDistMap.set(
          cur_joint.id + ',' + prevJoint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
        );
        this.setSlot(cur_joint.id, cur_joint.x, cur_joint.y, sliderJoint.angle_rad);
        // Like the revolute branch below, the solved slider joint becomes a
        // known joint and its other neighbors still need solve orders --
        // otherwise a tracer point on the slider's link can never resolve.
        knownJointArray.push(cur_joint.id);
        orderNum = this.detJointOrder(joints, links, cur_joint, orderNum, knownJointArray);
      } else {
        const known_joint = this.findKnownJoint(cur_joint, prevJoint, knownJointArray);
        if (known_joint === undefined) {
          return;
        }
        knownJointArray.push(cur_joint.id);
        const known_joint_index = joints.findIndex((j) => j.id === known_joint.id);
        this.desiredConnectedJointIndicesMap.set(cur_joint.id, [
          prev_joint_index,
          known_joint_index,
        ]);
        this.desiredAnalysisJointMap.set(cur_joint.id, 'twoCircleIntersectionPoints');
        this.jointNumOrderSolverMap.set(orderNum++, cur_joint.id);
        this.jointDistMap.set(
          cur_joint.id + ',' + prevJoint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
        );
        this.jointDistMap.set(
          cur_joint.id + ',' + known_joint.id,
          euclideanDistance(cur_joint.x, cur_joint.y, known_joint.x, known_joint.y)
        );
        const desiredTracerJoints = [];
        desiredTracerJoints.push(cur_joint);
        cur_joint.connectedJoints.forEach((tracer_joint) => {
          if (!(tracer_joint instanceof RevJoint)) {
            return;
          }
          const cur_joint_index = joints.findIndex((j) => j.id === cur_joint.id);
          if (tracer_joint instanceof PrisJoint) {
            this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index]);
            this.desiredAnalysisJointMap.set(tracer_joint.id, 'circleLineIntersectionPoints');
            this.jointNumOrderSolverMap.set(orderNum++, tracer_joint.id);
            this.jointDistMap.set(
              tracer_joint.id + ',' + tracer_joint.id,
              euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y)
            );
            this.setSlot(tracer_joint.id, tracer_joint.x, tracer_joint.y, tracer_joint.angle_rad);
            return;
          }
          const desired_link = links.find((l) => {
            return (
              l.joints.findIndex((l_joint) => l_joint.id === prevJoint.id) !== -1 &&
              l.joints.findIndex((l_joint) => l_joint.id === cur_joint.id) !== -1
            );
          });
          if (desired_link === undefined) {
            return;
          }
          if (knownJointArray.findIndex((j_id) => j_id === tracer_joint.id) !== -1) {
            return;
          }
          // tracer joint is not connected on the same link as prev joint and curr joint
          // if (tracer_joint.connectedLinks.findIndex(ll => ll.id === desired_link.id) !== -1) {
          if (tracer_joint.links.findIndex((ll) => ll.id === desired_link.id) === -1) {
            return;
          }
          // const tracer_joint_index = 0;
          // this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index, known_joint_index]);
          this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [
            prev_joint_index,
            cur_joint_index,
          ]);
          this.desiredAnalysisJointMap.set(tracer_joint.id, 'determineTracerJoint');
          this.jointNumOrderSolverMap.set(orderNum++, tracer_joint.id);
          knownJointArray.push(tracer_joint.id);
          desiredTracerJoints.push(tracer_joint);
          this.jointDistMap.set(
            tracer_joint.id + ',' + prevJoint.id,
            euclideanDistance(tracer_joint.x, tracer_joint.y, prevJoint.x, prevJoint.y)
          );
          this.jointDistMap.set(
            tracer_joint.id + ',' + cur_joint.id,
            euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y)
          );
          this.jointDistMap.set(
            cur_joint.id + ',' + prevJoint.id,
            euclideanDistance(cur_joint.x, cur_joint.y, prevJoint.x, prevJoint.y)
          );
        });
        desiredTracerJoints.forEach((jt) => {
          orderNum = this.detJointOrder(joints, links, jt, orderNum, knownJointArray);
        });
      }
    });
    return orderNum;
  }

  static findKnownJoint(joint: RealJoint, prev_joint: Joint, knownJointArray: string[]) {
    return joint.connectedJoints.find((jt) => {
      const knownJointIndex = knownJointArray.findIndex((j_id) => j_id === jt.id);
      return knownJointIndex !== -1 && jt.id !== prev_joint.id;
      // return knownJointArray.findIndex(j_id => j_id === jt.id) !== -1 && jt.id !== prev_joint.id;
    });
  }

  static determinePositionAnalysis(
    joints: Joint[],
    links: Link[],
    forces: Force[],
    max_counter: number,
    angVelDir: boolean
  ): boolean {
    let counter = 1;
    while (counter <= max_counter) {
      const joint_id = this.jointNumOrderSolverMap.get(counter)!;
      const joint = joints.find((j) => j.id === joint_id)!;
      const connected_joint_indices = this.desiredConnectedJointIndicesMap.get(joint_id)!;
      const desired_analysis = this.desiredAnalysisJointMap.get(joint_id)!;
      let possible: boolean = true; // Doesn't need to be defined
      switch (desired_analysis) {
        case 'incrementRevInput':
          this.incrementRevInput(joints[connected_joint_indices[0]], joint, angVelDir);
          possible = true;
          break;
        case 'incrementPrisInput':
          this.incrementPrisInput(joints[connected_joint_indices[0]], joint, angVelDir);
          possible = true;
          break;
        case 'twoCircleIntersectionPoints':
          possible = this.twoCircleIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          break;
        case 'circleLineIntersectionPoints':
          possible = this.circleLineIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          break;
        case 'determineTracerJoint':
          this.twoCircleIntersectionPoints(
            joints[connected_joint_indices[0]],
            joints[connected_joint_indices[1]],
            joint
          );
          // this.determineTracerJoint(
          //   joints[connected_joint_indices[0]],
          //   joints[connected_joint_indices[1]],
          //   joint
          // );
          possible = true;
          break;
        default:
          // TODO: Should never get here...
          return false;
      }
      if (!possible) {
        return false;
      }
      counter++;
    }
    forces.forEach((f) => {
      this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
      this.forceMagnitudeMap.set(f.id + 'x', f.mag);
      if (!f.local) {
        const x_calc =
          f.endCoord.x + (this.forcePositionMap.get(f.id + 'start')!.x - f.startCoord.x);
        const y_calc =
          f.endCoord.y + (this.forcePositionMap.get(f.id + 'start')!.y - f.startCoord.y);
        this.forcePositionMap.set(
          f.id + 'end',
          new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3))
        );
      } else {
        this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
      }
    });
    return true;
  }

  private static incrementRevInput(inputJoint: Joint, unknownJoint: Joint, angVelDir: boolean) {
    const r = this.jointDistMap.get(inputJoint.id + ',' + unknownJoint.id)!;
    const increment = angVelDir ? Math.PI / 180.0 : -Math.PI / 180.0;
    const angle = Math.atan2(unknownJoint.y - inputJoint.y, unknownJoint.x - inputJoint.x);
    const x = Math.cos(angle + increment) * r + inputJoint.x;
    const y = Math.sin(angle + increment) * r + inputJoint.y;
    this.jointMapPositions.set(inputJoint.id, [
      roundNumber(inputJoint.x, 4),
      roundNumber(inputJoint.y, 4),
    ]);
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  private static incrementPrisInput(inputJoint: Joint, unknownJoint: Joint, angVelDir: boolean) {
    const increment = angVelDir ? 0.1 : -0.1; // 0.01 : -0.01;
    const inputJointAngle = this.sliderAngleMap.get(inputJoint.id)!;
    const xIncrement = increment * Math.cos(inputJointAngle);
    const yIncrement = increment * Math.sin(inputJointAngle);
    const x = unknownJoint.x + xIncrement;
    const y = unknownJoint.y + yIncrement;
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    this.jointMapPositions.set(inputJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  // https://www.petercollingridge.co.uk/tutorials/computational-geometry/circle-circle-intersections/
  private static twoCircleIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    const solution =
      this.concentricSolution(j1, j2, unknownJoint) ??
      (() => {
        const sols = this.TwoCircleIntersectionMethod(j1, j2, unknownJoint);
        return sols ? this.solutionNearestCurrent(sols, unknownJoint) : undefined;
      })();
    if (!solution) {
      return false;
    }
    this.recordJointPosition(unknownJoint.id, solution[0], solution[1]);
    return true;
  }

  /** Remember where the joint was before this step, for extrapolating through a singularity. */
  private static recordJointPosition(id: string, x: number, y: number) {
    const previous = this.jointMapPositions.get(id);
    if (previous) {
      this.priorJointPositions.set(id, previous);
    }
    this.jointMapPositions.set(id, [roundNumber(x, 4), roundNumber(y, 4)]);
  }

  /**
   * Solve a joint whose two reference joints have landed on top of each other.
   *
   * When a crank is as long as the ground link, the moving pivot passes exactly
   * through the far ground pivot once a revolution. Both circles that locate the
   * next joint then share a centre, so every point on that circle satisfies the
   * link lengths and the intersection is undefined — the solver used to report
   * "no solution", which findFullMovementPos reads as a toggle and answers by
   * reversing the input. A parallelogram has no toggle there; it rotates straight
   * through. Momentum is what disambiguates, so extrapolate the joint's motion and
   * project the prediction back onto the circle it has to stay on.
   *
   * Returns undefined when the centres are apart, i.e. the ordinary case.
   */
  private static concentricSolution(
    j1: Joint,
    j2: Joint,
    unknownJoint: Joint
  ): number[] | undefined {
    const centre1 = this.jointMapPositions.get(j1.id) ?? [j1.x, j1.y];
    const centre2 = this.jointMapPositions.get(j2.id) ?? [j2.x, j2.y];
    if (Math.hypot(centre2[0] - centre1[0], centre2[1] - centre1[1]) > CONCENTRIC_TOLERANCE) {
      return undefined;
    }

    const radius = this.jointDistMap.get(unknownJoint.id + ',' + j1.id);
    const current = this.jointMapPositions.get(unknownJoint.id);
    if (radius === undefined || !current) {
      return undefined;
    }

    // Constant-velocity guess from the last two solved positions; with no history
    // yet, hold the current heading.
    const prior = this.priorJointPositions.get(unknownJoint.id) ?? current;
    const predicted = [2 * current[0] - prior[0], 2 * current[1] - prior[1]];

    let towardX = predicted[0] - centre1[0];
    let towardY = predicted[1] - centre1[1];
    let reach = Math.hypot(towardX, towardY);
    if (reach < 1e-9) {
      // The prediction landed on the centre; fall back to the current heading.
      towardX = current[0] - centre1[0];
      towardY = current[1] - centre1[1];
      reach = Math.hypot(towardX, towardY);
      if (reach < 1e-9) {
        return undefined;
      }
    }
    return [centre1[0] + (towardX / reach) * radius, centre1[1] + (towardY / reach) * radius];
  }

  /**
   * Pick which circle-circle root the joint moves to.
   *
   * Both roots satisfy the link lengths — they are the linkage's two assembly
   * modes — so the choice has to follow the joint step by step. Caching one index
   * for the whole simulation cannot work: the roots trade places as the linkage
   * passes through a collinear pose, so a fixed index silently becomes the *other*
   * assembly mode and the joint jumps across the mechanism.
   *
   * Comparing against the joint's current position is not enough either. Where the
   * circles are tangent the two roots meet, so at that sample both are equidistant
   * and the choice is a coin flip — and once the roots separate again the wrong one
   * is the crossed mode. A parallelogram meets a tangency every revolution. So
   * extrapolate the joint's motion and compare against where it was heading: the
   * velocity carries through the singularity even though position alone does not.
   */
  private static solutionNearestCurrent(sols: number[][], unknownJoint: Joint): number[] {
    if (sols.length === 1) {
      return sols[0];
    }
    const current = this.jointMapPositions.get(unknownJoint.id) ?? [unknownJoint.x, unknownJoint.y];
    const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    // Constant-velocity guess. Comparing against the joint's *current* position is
    // not good enough: coming off a tangency the crossed root can sit nearer than
    // the true one, because it barely moves, so nearest-position quietly prefers
    // the degenerate branch. Where the joint was heading does distinguish them.
    // With no history — the first sample, or just after a reversal dropped it —
    // this reduces to the current point, which picks the starting assembly mode.
    const prior = this.priorJointPositions.get(unknownJoint.id) ?? current;
    const predicted = [2 * current[0] - prior[0], 2 * current[1] - prior[1]];
    return distance(sols[0], predicted) <= distance(sols[1], predicted) ? sols[0] : sols[1];
  }

  /**
   * Forget how the joints were moving. Extrapolation is only meaningful while
   * motion continues in one direction, so a rocker reversing at a toggle must not
   * keep predicting forward past the dead point.
   */
  static clearMotionHistory() {
    this.priorJointPositions = new Map<string, Array<number>>();
  }

  private static TwoCircleIntersectionMethod(j1: Joint, j2: Joint, unknownJoint: Joint) {
    if (!this.jointMapPositions.has(j1.id)) {
      this.jointMapPositions.set(j1.id, [j1.x, j1.y]);
    }
    if (!this.jointMapPositions.has(j2.id)) {
      this.jointMapPositions.set(j2.id, [j2.x, j2.y]);
    }
    const x0 = this.jointMapPositions.get(j1.id)![0];
    const y0 = this.jointMapPositions.get(j1.id)![1];
    const x1 = this.jointMapPositions.get(j2.id)![0];
    const y1 = this.jointMapPositions.get(j2.id)![1];
    if (x0 === undefined || y0 === undefined) {
      return;
    }
    const r0 = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    const r1 = this.jointDistMap.get(unknownJoint.id + ',' + j2.id)!;
    return circleCircleIntersection(x0, y0, r0, x1, y1, r1);
  }

  /**
   * Place a joint that rides a slot: it sits where the slot line meets a circle
   * of the connecting link's length about an already-solved joint.
   *
   * Both roots are on the slot and both satisfy the link length, so they are
   * the linkage's two assembly modes. The branch is chosen once, by whichever
   * root the joint started nearest, and then held.
   */
  private static circleLineIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    const solutions = this.slotSolutions(j1, unknownJoint);
    if (!solutions) {
      return false;
    }

    if (!this.desiredIndexWithinPosAnalysisMap.has(unknownJoint.id)) {
      const initial = this.initialJointPosMap.get(unknownJoint.id)!;
      const distanceToInitial = (point: [number, number]) =>
        Math.hypot(point[0] - initial[0], point[1] - initial[1]);
      this.desiredIndexWithinPosAnalysisMap.set(
        unknownJoint.id,
        distanceToInitial(solutions[0]) <= distanceToInitial(solutions[1]) ? 0 : 1
      );
    }

    // TODO (Phase 2): a held index is not safe through a tangency, where the two
    // roots merge and trade places -- the same failure solutionNearestCurrent
    // fixes for the circle-circle case. Preserved as-is here so this rewrite
    // changes only the line representation.
    const [x, y] = solutions[this.desiredIndexWithinPosAnalysisMap.get(unknownJoint.id)!];
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    this.jointMapPositions.set(j2.id, [roundNumber(x, 4), roundNumber(y, 4)]);
    return true;
  }

  /** Intersections of the joint's slot line with the circle centred on `j1`. */
  private static slotSolutions(j1: Joint, unknownJoint: Joint): [number, number][] | undefined {
    const radius = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    const [centreX, centreY] = this.jointMapPositions.get(j1.id)!;
    const [pointX, pointY] = this.slotPointMap.get(unknownJoint.id)!;
    const [dirX, dirY] = this.slotDirectionMap.get(unknownJoint.id)!;
    return circleLineIntersection(radius, centreX, centreY, pointX, pointY, dirX, dirY);
  }

  /**
   * Record the slot a joint slides along: a point it passes through and a unit
   * direction. Stored as a direction rather than a slope so that vertical and
   * near-vertical guides need no special case.
   */
  private static setSlot(jointID: string, throughX: number, throughY: number, angleRad: number) {
    this.slotPointMap.set(jointID, [throughX, throughY]);
    this.slotDirectionMap.set(jointID, [Math.cos(angleRad), Math.sin(angleRad)]);
  }

  // https://www.mathsisfun.com/algebra/trig-solving-sss-triangles.html
  private static determineTracerJoint(
    lastJoint: Joint,
    joint_with_neighboring_ground: Joint,
    unknown_joint: Joint
  ) {
    let r1, r2, r3, internal_angle: number;
    if (
      !this.internalTriangleValuesMap.has(
        lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
      )
    ) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(unknown_joint.id + ',' + lastJoint.id)!;
      r2 = this.jointDistMap.get(unknown_joint.id + ',' + joint_with_neighboring_ground.id)!;
      r3 = this.jointDistMap.get(joint_with_neighboring_ground.id + ',' + lastJoint.id)!;
      internal_angle = Math.acos(
        (Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3)
      );
      this.internalTriangleValuesMap.set(
        lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id,
        [r1, internal_angle]
      );
    }

    r1 = this.internalTriangleValuesMap.get(
      lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
    )![0];
    internal_angle = this.internalTriangleValuesMap.get(
      lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id
    )![1];
    const x1 = this.jointMapPositions.get(lastJoint.id)![0];
    const y1 = this.jointMapPositions.get(lastJoint.id)![1];
    const x2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![0];
    const y2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const prevJoint_x = unknown_joint.x;
    const prevJoint_y = unknown_joint.y;
    let [x_calc, y_calc] = determineUnknownJointUsingTriangulation(
      x1,
      y1,
      x2,
      y2,
      r1,
      prevJoint_x,
      prevJoint_y,
      angle,
      internal_angle
    );
    this.jointMapPositions.set(unknown_joint.id, [roundNumber(x_calc, 4), roundNumber(y_calc, 4)]);
  }

  static setUpSolvingForces(forces: Force[]) {
    forces.forEach((f) => {
      const joint1 = f.link.joints[0];
      const joint2 = f.link.joints[1];
      PositionSolver.jointDistMap.set(
        f.id + 'start' + ',' + joint1.id,
        euclideanDistance(f.startCoord.x, f.startCoord.y, joint1.x, joint1.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'start' + ',' + joint2.id,
        euclideanDistance(f.startCoord.x, f.startCoord.y, joint2.x, joint2.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'end' + ',' + joint1.id,
        euclideanDistance(f.endCoord.x, f.endCoord.y, joint1.x, joint1.y)
      );
      PositionSolver.jointDistMap.set(
        f.id + 'end' + ',' + joint2.id,
        euclideanDistance(f.endCoord.x, f.endCoord.y, joint2.x, joint2.y)
      );
      PositionSolver.jointDistMap.set(
        joint1.id + ',' + joint2.id,
        euclideanDistance(joint1.x, joint1.y, joint2.x, joint2.y)
      );
    });
  }

  static setUpInitialJointLocations(joints: Joint[]) {
    joints.forEach((j) => {
      this.jointMapPositions.set(j.id, [roundNumber(j.x, 4), roundNumber(j.y, 4)]);
    });
  }

  //TODO: merge this with logic for determining tracer points
  static determineTracerForce(joint: Joint, joint2: Joint, force: Force, startOrEnd: string) {
    let r1, r2, r3, internal_angle: number;
    if (!this.internalTriangleValuesMap.has(joint.id + joint2.id + force.id + startOrEnd)) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(force.id + startOrEnd + ',' + joint.id)!;
      r2 = this.jointDistMap.get(force.id + startOrEnd + ',' + joint2.id)!;
      r3 = this.jointDistMap.get(joint.id + ',' + joint2.id)!;
      internal_angle = Math.acos(
        (Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3)
      );
      this.internalTriangleValuesMap.set(joint.id + joint2.id + startOrEnd, [r1, internal_angle]);
    }

    r1 = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![0];
    internal_angle = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![1];
    const x1 = this.jointMapPositions.get(joint.id)![0];
    const y1 = this.jointMapPositions.get(joint.id)![1];
    const x2 = this.jointMapPositions.get(joint2.id)![0];
    const y2 = this.jointMapPositions.get(joint2.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);

    let prevJoint_x: number;
    let prevJoint_y: number;
    if (startOrEnd === 'start') {
      prevJoint_x = force.startCoord.x;
      prevJoint_y = force.startCoord.y;
    } else {
      prevJoint_x = force.endCoord.x;
      prevJoint_y = force.endCoord.y;
    }

    let [x_calc, y_calc] = determineUnknownJointUsingTriangulation(
      x1,
      y1,
      x2,
      y2,
      r1,
      prevJoint_x,
      prevJoint_y,
      angle,
      internal_angle
    );
    this.forcePositionMap.set(
      force.id + startOrEnd,
      new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3))
    );
  }
}
