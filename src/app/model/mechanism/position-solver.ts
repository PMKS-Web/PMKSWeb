import {ImagJoint, Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {Link} from "../link";
import {roundNumber} from "../utils";
import {Force} from "../force";
import {Coord} from "../coord";
import {core} from "@angular/compiler";

export class PositionSolver {
  static desiredIndexWithinPosAnalysisMap = new Map<string, number>();
  static jointMapPositions = new Map<string, Array<number>>();
  static desiredJointGroundIndexMap = new Map<string, number>();
  static unknownJointsIndicesMap = new Map<string, number[]>();
  static desiredLinkIndexMap = new Map<string, number>();
  static jointNumOrderSolverMap = new Map<number, string>();
  private static internalTriangleValuesMap = new Map<string, number[]>();
  private static desiredConnectedJointIndicesMap = new Map<string, number[]>();
  private static desiredAnalysisJointMap = new Map<string, string>();
  private static jointDistMap = new Map<string, number>();
  private static initialJointPosMap = new Map<string, [number, number]>();
  private static m_Map = new Map<string, number>();
  private static b_Map = new Map<string, number>();
  static forcePositionMap = new Map<string, Coord>();
  static forceMagnitudeMap = new Map<string, number>();

  static resetStaticVariables() {
    this.desiredIndexWithinPosAnalysisMap = new Map<string, number>();
    this.jointMapPositions = new Map<string, Array<number>>();
    this.desiredJointGroundIndexMap = new Map<string, number>();
    this.unknownJointsIndicesMap = new Map<string, number[]>();
    this.desiredLinkIndexMap = new Map<string, number>();
    this.internalTriangleValuesMap = new Map<string, number[]>();
    this.jointNumOrderSolverMap = new Map<number, string>();
    this.desiredConnectedJointIndicesMap = new Map<string, number[]>();
    this.desiredAnalysisJointMap = new Map<string, string>();
    this.jointDistMap = new Map<string, number>();
    this.initialJointPosMap = new Map<string, [number, number]>();
    this.m_Map = new Map<string, number>();
    this.b_Map = new Map<string, number>();
  }

  static determineJointOrder(joints: Joint[], links: Link[]) {
    const knownJointsIds: string[] =  [];
    let orderNum = 1;
    // pre-condition: Save all the joints as initial Values
    joints.forEach(j => {
      this.initialJointPosMap.set(j.id, [j.x, j.y]);
    });

    // 1st: store all ground joints as known joints
    joints.forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      if (j.ground) {
        knownJointsIds.push(j.id);
      }
    });
    // 2nd: determine joints that neighbor the input joint
    const inputJointIndex = joints.findIndex(j => {
      if (!(j instanceof RealJoint)) {return}
      return j.input;});
    const inputJoint = joints[inputJointIndex];
    if (!(inputJoint instanceof RealJoint)) {return}
    const tracer_joints: Joint[] = [];
    inputJoint.connectedJoints.forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      if (j.ground) {
        return;
      }
      // store the solved number
      this.jointNumOrderSolverMap.set(orderNum++, j.id);
      // store desired joints as input joint and current_joint
      // const currentJointIndex = simJoints.findIndex(jt => jt.id === current_joint.id);
      this.desiredConnectedJointIndicesMap.set(j.id, [inputJointIndex]);
      // store the solve type from the input solver
      switch (inputJoint.constructor) {
        case RevJoint: {
          this.desiredAnalysisJointMap.set(j.id, 'incrementRevInput');
          this.jointDistMap.set(inputJoint.id + ',' + j.id, this.euclideanDistance(inputJoint.x, inputJoint.y, j.x, j.y));
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
    tracer_joints.forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      orderNum = this.detJointOrder(joints, links, j, orderNum, knownJointsIds);
    });
  }

  // TODO: Change the names from simJoints, simLinks to just joints and links
  static detJointOrder(simJoints: Joint[], simLinks: Link[], prev_joint: RealJoint, orderNum: number, knownJointArray: string[]) {
    prev_joint.connectedJoints.forEach(cur_joint => {
      if (!(cur_joint instanceof RealJoint)) {return}
      // TODO: Within future, have a method to determine the index based on list of joints and desired ID
      if (knownJointArray.findIndex(j_id => j_id === cur_joint.id) !== -1) {
        return;
      }
      const prev_joint_index = simJoints.findIndex(j => j.id === prev_joint.id);
      // let desired_joint_type = 'R';
      // if (prev_joint.jointType === 'P' || cur_joint.jointType === 'P') {
      //   desired_joint_type = 'P';
      // }
      switch (cur_joint.constructor) {
        case RevJoint:
          const known_joint = this.findKnownJoint(cur_joint, prev_joint, knownJointArray);
          if (known_joint === undefined) {
            return;
          }
          knownJointArray.push(cur_joint.id);
          const known_joint_index = simJoints.findIndex(j => j.id === known_joint.id);
          this.desiredConnectedJointIndicesMap.set(cur_joint.id, [prev_joint_index, known_joint_index]);
          this.desiredAnalysisJointMap.set(cur_joint.id, 'twoCircleIntersectionPoints');
          this.jointNumOrderSolverMap.set(orderNum++, cur_joint.id);
          this.jointDistMap.set(cur_joint.id + ',' + prev_joint.id, this.euclideanDistance(cur_joint.x, cur_joint.y, prev_joint.x, prev_joint.y));
          this.jointDistMap.set(cur_joint.id + ',' + known_joint.id, this.euclideanDistance(cur_joint.x, cur_joint.y, known_joint.x, known_joint.y));
          // TODO: Set the necessary m's within distMap
          // TODO: Set the necessary n's within distMap
          // TODO: Set the necessary b's within distMap
          const desiredTracerJoints = [];
          desiredTracerJoints.push(cur_joint);
          cur_joint.connectedJoints.forEach(tracer_joint => {
            if (!(tracer_joint instanceof RevJoint)) {return}
            const cur_joint_index = simJoints.findIndex(j => j.id === cur_joint.id);
            if (tracer_joint instanceof PrisJoint) {
              this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index]);
              this.desiredAnalysisJointMap.set(tracer_joint.id, 'circleLineIntersectionPoints');
              this.jointNumOrderSolverMap.set(orderNum++, tracer_joint.id);
              this.jointDistMap.set(tracer_joint.id + ',' + tracer_joint.id, this.euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y));
              // TODO: Set the necessary m's within distMap
              this.m_Map.set(tracer_joint.id, Math.tan(tracer_joint.angle));
              // TODO: Set the necessary b's within distMap
              this.b_Map.set(tracer_joint.id, tracer_joint.y - this.m_Map.get(tracer_joint.id)! * tracer_joint.x);
              return;
            }
            const desired_link = simLinks.find(l => {
              return l.joints.findIndex(l_joint => l_joint.id === prev_joint.id) !== -1 &&
                l.joints.findIndex(l_joint => l_joint.id === cur_joint.id) !== -1;
            });
            if (desired_link === undefined) {return}
            if (knownJointArray.findIndex(j_id => j_id === tracer_joint.id) !== -1) {
              return;
            }
            // tracer joint is not connected on the same link as prev joint and curr joint
            // if (tracer_joint.connectedLinks.findIndex(ll => ll.id === desired_link.id) !== -1) {
            if (tracer_joint.links.findIndex(ll => ll.id === desired_link.id) === -1) {
              return;
            }
            // const tracer_joint_index = 0;
            // this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [cur_joint_index, known_joint_index]);
            this.desiredConnectedJointIndicesMap.set(tracer_joint.id, [prev_joint_index, cur_joint_index]);
            this.desiredAnalysisJointMap.set(tracer_joint.id, 'determineTracerJoint');
            this.jointNumOrderSolverMap.set(orderNum++, tracer_joint.id);
            knownJointArray.push(tracer_joint.id);
            desiredTracerJoints.push(tracer_joint);
            this.jointDistMap.set(tracer_joint.id + ',' + prev_joint.id, this.euclideanDistance(tracer_joint.x, tracer_joint.y, prev_joint.x, prev_joint.y));
            this.jointDistMap.set(tracer_joint.id + ',' + cur_joint.id, this.euclideanDistance(tracer_joint.x, tracer_joint.y, cur_joint.x, cur_joint.y));
            this.jointDistMap.set(cur_joint.id + ',' + prev_joint.id, this.euclideanDistance(cur_joint.x, cur_joint.y, prev_joint.x, prev_joint.y));
            // TODO: Set the necessary m's within distMap
            // TODO: Set the necessary n's within distMap
            // TODO: Set the necessary b's within distMap
          });
          desiredTracerJoints.forEach(jt => {
            orderNum = this.detJointOrder(simJoints, simLinks, jt, orderNum, knownJointArray);
          });
          break;
        case PrisJoint:
          if (!(cur_joint instanceof PrisJoint)) {return}
          this.desiredConnectedJointIndicesMap.set(cur_joint.id, [prev_joint_index]);
          this.desiredAnalysisJointMap.set(cur_joint.id, 'circleLineIntersectionPoints');
          this.jointNumOrderSolverMap.set(orderNum++, cur_joint.id);
          this.jointDistMap.set(cur_joint.id + ',' + prev_joint.id, this.euclideanDistance(cur_joint.x, cur_joint.y, prev_joint.x, prev_joint.y));
          // TODO: Set the necessary m's within distMap
          this.m_Map.set(cur_joint.id, Math.tan(cur_joint.angle));
          // TODO: Set the necessary b's within distMap
          this.b_Map.set(cur_joint.id, cur_joint.y - this.m_Map.get(cur_joint.id)! * cur_joint.x);
          // TODO: Set the necessary n's within distMap
          break;
      }
    });
    return orderNum;
  }

  static findKnownJoint(joint: RealJoint, prev_joint: Joint, knownJointArray: string[]) {
    return joint.connectedJoints.find(jt => {
      const knownJointIndex = knownJointArray.findIndex(j_id => j_id === jt.id);
      return (knownJointIndex !== -1 && jt.id !== prev_joint.id);
      // return knownJointArray.findIndex(j_id => j_id === jt.id) !== -1 && jt.id !== prev_joint.id;
    });
  }

  static determinePositionAnalysis(joints: Joint[], links: Link[], forces: Force[], max_counter: number, angVelDir: boolean): boolean {
    let counter = 1;
    while (counter <= max_counter) {
      const joint_id = this.jointNumOrderSolverMap.get(counter)!;
      const joint = joints.find(j => j.id === joint_id)!;
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
          possible = this.twoCircleIntersectionPoints(joints[connected_joint_indices[0]], joints[connected_joint_indices[1]], joint);
          break;
        case 'circleLineIntersectionPoints':
          possible = this.circleLineIntersectionPoints(joints[connected_joint_indices[0]], joints[connected_joint_indices[1]], joint);
          break;
        case 'determineTracerJoint':
          this.determineTracerJoint(joints[connected_joint_indices[0]], joints[connected_joint_indices[1]], joint);
          possible = true;
          break;
      }
      if (!possible) {
        return false;
      }
      counter++;
    }
    forces.forEach(f => {
      this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'start');
      // Logic is backwards
      if (!f.local) {
        const x_calc = f.endCoord.x + (this.forcePositionMap.get(f.id + 'start')!.x - f.startCoord.x);
        const y_calc = f.endCoord.y + (this.forcePositionMap.get(f.id + 'start')!.y - f.startCoord.y);
        this.forcePositionMap.set(f.id + 'end', new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3)));
        this.forceMagnitudeMap.set(f.id + 'x', f.xMag);
        this.forceMagnitudeMap.set(f.id + 'y', f.yMag);
      } else {
        this.determineTracerForce(f.link.joints[0], f.link.joints[1], f, 'end');
        // TODO: Check this later... I think the user has to make sure the angle is correct and the values are correct
        const absMag = Math.sqrt(Math.pow(f.xMag, 2) + Math.pow(f.yMag , 2));
        const startCoord = this.forcePositionMap.get(f.id + 'start')!;
        const endCoord = this.forcePositionMap.get(f.id + 'end')!;
        // TODO: Be sure this function is put within utils
        const angle = Math.tan((startCoord.y - endCoord.y) / (startCoord.x - endCoord.x ));
        this.forceMagnitudeMap.set(f.id + 'x', Math.cos(angle) * absMag);
        this.forceMagnitudeMap.set(f.id + 'y', Math.cos(angle) * absMag);
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
    this.jointMapPositions.set(inputJoint.id, [roundNumber(inputJoint.x, 3), roundNumber(inputJoint.y, 3)]);
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 3), roundNumber(y, 3)]);
  }

  private static incrementPrisInput(inputJoint: Joint, unknownJoint: Joint, angVelDir: boolean) {
    const increment = angVelDir ? 0.1 : -0.1; // 0.01 : -0.01;
    // TODO: Have a map to get unknownJoint.angle
    // const xIncrement = increment * Math.cos(unknownJoint.angle);
    // const yIncrement = increment * Math.sin(unknownJoint.angle);
    const xIncrement = increment * Math.cos(0);
    const yIncrement = increment * Math.sin(0);
    const x = unknownJoint.x + xIncrement;
    const y = unknownJoint.y + yIncrement;
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 3), roundNumber(y, 3)]);
  }

// https://www.petercollingridge.co.uk/tutorials/computational-geometry/circle-circle-intersections/
  private static twoCircleIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    let desiredIndex = this.desiredIndexWithinPosAnalysisMap.get(unknownJoint.id);
    if (desiredIndex === undefined || desiredIndex === -1) {
      // TODO: Have this be determined within setting up stuff
      desiredIndex = this.determineDesiredIndexTwoCircleIntersection(j1, j2, unknownJoint);
      this.desiredIndexWithinPosAnalysisMap.set(unknownJoint.id, desiredIndex);
    }
    const sols = this.TwoCircleIntersectionMethod(j1, j2, unknownJoint);
    if (!sols) {
      return false;
    }
    const x = sols[desiredIndex][0];
    const y = sols[desiredIndex][1];
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 3), roundNumber(y, 3)]);
    return true;
  }

  private static determineDesiredIndexTwoCircleIntersection(tempJ1: Joint, tempJ2: Joint,
                                                            tempUnknownJoint: Joint) {
    const sols = this.TwoCircleIntersectionMethod(tempJ1, tempJ2, tempUnknownJoint);
    if (sols === false || sols === undefined) {
      return -1;
    }
    if (sols.length === 1) {
      return 0; // index is 0;
    }
    const intersection1Diff = (Math.abs(Math.sqrt(Math.pow(sols[0][0] - tempUnknownJoint.x, 2)
      + Math.pow(sols[0][1] - tempUnknownJoint.y, 2))));
    const intersection2Diff = (Math.abs(Math.sqrt(Math.pow(sols[1][0] - tempUnknownJoint.x, 2)
      + Math.pow(sols[1][1] - tempUnknownJoint.y, 2))));
    return intersection1Diff < intersection2Diff ?  0 : 1;
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
    if (x0 === undefined || y0 === undefined) {return}
    const r0 = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    const r1 = this.jointDistMap.get(unknownJoint.id + ',' + j2.id)!;
    let dx = x1 - x0;
    let dy = y1 - y0;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Circles too far apart
    if (d > r0 + r1) {
      return false;
    }

// One circle completely inside the other
    if (d < Math.abs(r0 - r1)) {
      return false;
    }

    // const TOLERANCE = 0.001;
    if (d <= 0.001) {
      return false;
    }
    // if (d === 0) {
    //   return false;
    // }

    dx /= d;
    dy /= d;

    const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
    const px = x0 + a * dx;
    const py = y0 + a * dy;

    const h = Math.sqrt(r0 * r0 - a * a);

    const p1x = px + h * dy;
    const p1y = py - h * dx;
    const p2x = px - h * dy;
    const p2y = py + h * dx;
    return [[p1x, p1y], [p2x, p2y]];
  }

// https://cscheng.info/2016/06/09/calculate-circle-line-intersection-with-javascript-and-p5js.html
  private static circleLineIntersectionPoints(j1: Joint, j2: Joint, unknownJoint: Joint) {
    if (!this.desiredIndexWithinPosAnalysisMap.has(unknownJoint.id)) {
      this.desiredIndexWithinPosAnalysisMap.set(unknownJoint.id, this.determineDesiredIndexCircleLineIntersection(j1, j2, unknownJoint));
    }
    const desiredIndex = this.desiredIndexWithinPosAnalysisMap.get(unknownJoint.id);
    const [a, b, c, d] = this.circleLineIntersectionMethod(j1, j2, unknownJoint);
    let x, y, r, curr_known_x, curr_unknown_y, curr_unknown_x, a_temp, b_temp, c_temp, curr_known_y, d_temp, y_1, y_2: number;
    if (isNaN(d) || !isFinite(d)) {
      r = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
      curr_known_x = this.jointMapPositions.get(j1.id)![0];
      // const curr_unknown_x = this.jointMapPositions.get(unknownJoint.id)[0];
      curr_unknown_x = unknownJoint.x;
      curr_known_y = this.jointMapPositions.get(j1.id)![1];
      curr_unknown_y = unknownJoint.y;
      // const curr_unknown_y = this.jointMapPositions.get(unknownJoint.id)[1];
      a_temp = 1;
      b_temp = -2 * curr_known_y;
      c_temp = Math.pow(curr_known_y, 2) + Math.pow(curr_known_x - curr_unknown_x, 2) - Math.pow(r, 2);
      d_temp = Math.pow(b_temp, 2) - (4 * a_temp * c_temp);
      // utilize quadratic formula to solve for both y values
      if (d_temp < 0) {
        return false;
      }
      y_1 = (-b_temp + Math.sqrt(Math.pow(b_temp, 2) - (4 * a_temp * c_temp))) / (2 * a_temp);
      y_2 = (-b_temp - Math.sqrt(Math.pow(b_temp, 2) - (4 * a_temp * c_temp))) / (2 * a_temp);

      // y_1 = Math.abs((-b_temp + Math.sqrt(Math.pow(b_temp, 2) - (4 * a_temp * c_temp))) / (2 * a_temp));
      // y_2 = Math.abs((-b_temp - Math.sqrt(Math.pow(b_temp, 2) - (4 * a_temp * c_temp))) / (2 * a_temp));
      // determine which y is closer and use this y value
      if (Math.abs(curr_unknown_y - y_1) <= Math.abs(curr_unknown_y - y_2)) {
        y = y_1;
      } else {
        y = y_2;
      }
      x = curr_unknown_x;
    } else {
      if (d >= 0) {
        const sign = desiredIndex === 0 ? 1 : -1;
        x = (-b + sign * Math.sqrt(Math.pow(b, 2) - 4 * a * c)) / (2 * a);
        const vertical_line = 90 * Math.PI / 180;
        const horizontal_line = 180 * Math.PI / 180;
        // TODO: Have map for determining m
        // const m = Math.tan(unknownJoint.angle);
        const m = this.m_Map.get(unknownJoint.id)!;
        // TODO: have map for determining b_intersection
        const b_intersect = this.b_Map.get(unknownJoint.id)!;
        // const b_intersect = unknownJoint.yInitial - m * unknownJoint.xInitial;
        y = m * x + b_intersect;
      } else {
        return false;
      }
    }
    // const y = Math.tan(unknownJoint.angle) * unknownJoint.x + unknownJoint.y;
    this.jointMapPositions.set(unknownJoint.id, [roundNumber(x, 3), roundNumber(y, 3)]);
    return true;
  }

  private static determineDesiredIndexCircleLineIntersection(j1: Joint, j2: Joint, unknownJoint: Joint) {
    const [a, b, c, _] = this.circleLineIntersectionMethod(j1, j2, unknownJoint);
    // const x_1 = Math.abs((-b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a));
    // const x_2 = Math.abs((-b - Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a));
    const x_1 = ((-b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a));
    const x_2 = ((-b - Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a));
    // TODO: have map for determining m
    const m = this.m_Map.get(unknownJoint.id)!;
    // const m = Math.sin(unknownJoint.angle) / Math.cos(unknownJoint.angle);
    // TODO: have map for determining b_intersect
    const b_intersect = this.b_Map.get(unknownJoint.id)!;
    // const b_intersect = unknownJoint.yInitial - m * unknownJoint.xInitial;
    const y_1 = m * x_1 + b_intersect;
    const y_2 = m * x_2 + b_intersect;
    const intersection1Diff = Math.sqrt(Math.pow(x_1 - this.initialJointPosMap.get(unknownJoint.id)![0], 2) +
      Math.pow(y_1 - this.initialJointPosMap.get(unknownJoint.id)![1], 2));
    const intersection2Diff = Math.sqrt(Math.pow(x_2 - this.initialJointPosMap.get(unknownJoint.id)![0], 2) +
      Math.pow(y_2 - this.initialJointPosMap.get(unknownJoint.id)![1], 2));
    return intersection1Diff < intersection2Diff ? 0 : 1;
  }

  private static circleLineIntersectionMethod(j1: Joint, j2: Joint, unknownJoint: Joint) {
    // circle: (x - h)^2 + (y - k)^2 = r^2
    // line: y = m * x + n
    // r: circle radius
    // const unknown_joint_x = this.jointMapPositions.get(unknownJoint.id)[0];
    // const unknown_joint_y = this.jointMapPositions.get(unknownJoint.id)[1];
    // const j1_x = this.jointMapPositions.get(j1.id)[0];
    // const j1_y = this.jointMapPositions.get(j1.id)[1];
    // const r = Math.sqrt(Math.pow(unknown_joint_x - j1_x, 2) + Math.pow(unknown_joint_y - j1_y, 2));
    const r = this.jointDistMap.get(unknownJoint.id + ',' + j1.id)!;
    // h: x value of circle centre
    // const h = j1.x;
    const h = this.jointMapPositions.get(j1.id)![0];
    // k: y value of circle centre
    // const k = j1.y;
    const k = this.jointMapPositions.get(j1.id)![1];
    // m: slope
    const radToDeg = 180 / Math.PI;
    // TODO: Have map for determining m
    let m = this.m_Map.get(unknownJoint.id)!;
    // let m = Math.tan(unknownJoint.angle);
    if (m > 1000 || m < -1000) {
      m = Number.MAX_VALUE;
    }
    // const m = (Math.round(unknownJoint.angle * radToDeg) % 90  === 0 && Math.round(unknownJoint.angle * radToDeg) % 180 !== 0) ?
    //   99999999999 : Math.tan(unknownJoint.angle);
    // const m = Math.tan(unknownJoint.angle);
    // n: y-intercept
    // const n = unknown_joint_y - m * unknown_joint_x;
    // TODO: Have map for determining n
    // const n = this.n_Map.get(unknownJoint.id);
    // const n = unknownJoint.yInitial - m * unknownJoint.xInitial;
    const n = this.b_Map.get(unknownJoint.id)!;
    // const n = unknownJoint.y;
    // const n = j2.y;
    // get a, b, c values
    const a = 1 + Math.pow(m, 2);
    const b = -h * 2 + (m * (n - k)) * 2;
    const c = Math.pow(h, 2) + Math.pow(n - k, 2) - Math.pow(r, 2);

    // get discriminant
    const d = Math.pow(b, 2) - (4 * a * c);
    return [a, b, c, d];
  }

  // TODO: Get rid of this and utilize roundNumber
  // private static roundToHundredThousandth(num: number) {
  //   return Math.round(num * 10000) / 10000;
  // }

// https://www.mathsisfun.com/algebra/trig-solving-sss-triangles.html
  private static determineTracerJoint(lastJoint: Joint, joint_with_neighboring_ground: Joint, unknown_joint: Joint) {
    let r1, r2, r3, internal_angle: number;
    if (!this.internalTriangleValuesMap.has(lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id)) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(unknown_joint.id + ',' + lastJoint.id)!;
      r2 = this.jointDistMap.get(unknown_joint.id + ',' + joint_with_neighboring_ground.id)!;
      r3 = this.jointDistMap.get(lastJoint.id  + ',' + joint_with_neighboring_ground.id)!;
      internal_angle = Math.acos((Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3));
      this.internalTriangleValuesMap.set(lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id,
        [r1, internal_angle]);
    }

    r1 = this.internalTriangleValuesMap.get(lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id)![0];
    internal_angle = this.internalTriangleValuesMap.get(lastJoint.id + joint_with_neighboring_ground.id + unknown_joint.id)![1];
    const x1 = this.jointMapPositions.get(lastJoint.id)![0];
    const y1 = this.jointMapPositions.get(lastJoint.id)![1];
    const x2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![0];
    const y2 = this.jointMapPositions.get(joint_with_neighboring_ground.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    let x_calc: number;
    let y_calc: number;
    let x_calc1: number;
    let y_calc1: number;
    let x_calc2: number;
    let y_calc2: number;
    if (x1 > x2) { // A to the right of B
      if (y1 > y2) { // A on top of B (good)
        x_calc1 = x1 + r1 * Math.cos( (Math.PI) + (internal_angle + (Math.PI + angle)));
        y_calc1 = y1 + r1 * Math.sin( (Math.PI) + (internal_angle + (Math.PI + angle)));
        x_calc2 = x1 + r1 * Math.cos((Math.PI) - (internal_angle - (Math.PI + angle)));
        y_calc2 = y1 + r1 * Math.sin((Math.PI) - (internal_angle - (Math.PI + angle)));
      } else { // A below B (good)
        x_calc1 = x1 + r1 * Math.cos((Math.PI) + (internal_angle - (Math.PI - angle)));
        y_calc1 = y1 + r1 * Math.sin((Math.PI) + (internal_angle - (Math.PI - angle)));
        x_calc2 = x1 + r1 * Math.cos(Math.PI - (internal_angle + (Math.PI - angle)));
        y_calc2 = y1 + r1 * Math.sin(Math.PI - (internal_angle + (Math.PI - angle)));
      }
    } else { // A to the left of B
      if (y1 > y2) { // A on top of B (good)
        x_calc1 = x1 + r1 * Math.cos((2 * Math.PI) - (Math.abs(angle) + internal_angle));
        y_calc1 = y1 + r1 * Math.sin((2 * Math.PI) - (Math.abs(angle) + internal_angle));
        x_calc2 = x1 + r1 * Math.cos(internal_angle - Math.abs(angle));
        y_calc2 = y1 + r1 * Math.sin(internal_angle - Math.abs(angle));
      } else { // A below B (good)
        x_calc1 = x1 + r1 * Math.cos((2 * Math.PI) - (angle - internal_angle));
        y_calc1 = y1 + r1 * Math.sin(angle - internal_angle);
        x_calc2 = x1 + r1 * Math.cos(internal_angle + angle);
        y_calc2 = y1 + r1 * Math.sin(internal_angle + angle);
      }
    }
    const prevJoint_x = unknown_joint.x;
    const prevJoint_y = unknown_joint.y;
    // TODO: Should this also call euclidean distance? Also, shouldn't this be sqrt instead of abs
    const dist1 = Math.abs(Math.pow(x_calc1 - prevJoint_x, 2) + Math.pow(y_calc1 - prevJoint_y, 2));
    const dist2 = Math.abs(Math.pow(x_calc2 - prevJoint_x, 2) + Math.pow(y_calc2 - prevJoint_y, 2));
    if (dist1 < dist2) {
      x_calc = x_calc1;
      y_calc = y_calc1;
    } else {
      x_calc = x_calc2;
      y_calc = y_calc2;
    }
    this.jointMapPositions.set(unknown_joint.id, [roundNumber(x_calc, 3), roundNumber(y_calc, 3)]);
  }

  static setUpSolvingForces(forces: Force[]) {
    forces.forEach(f => {
      const joint1 = f.link.joints[0];
      const joint2 = f.link.joints[1];
      PositionSolver.jointDistMap.set(f.id + 'start' + ',' + joint1.id, PositionSolver.euclideanDistance(f.startCoord.x, f.startCoord.y, joint1.x, joint1.y));
      PositionSolver.jointDistMap.set(f.id + 'start' + ',' + joint2.id, PositionSolver.euclideanDistance(f.startCoord.x, f.startCoord.y, joint2.x, joint2.y));
      PositionSolver.jointDistMap.set(f.id + 'end' + ',' + joint1.id, PositionSolver.euclideanDistance(f.endCoord.x, f.endCoord.y, joint1.x, joint1.y));
      PositionSolver.jointDistMap.set(f.id + 'end' + ',' + joint2.id, PositionSolver.euclideanDistance(f.endCoord.x, f.endCoord.y, joint2.x, joint2.y));
      PositionSolver.jointDistMap.set(joint1.id + ',' + joint2.id, PositionSolver.euclideanDistance(joint1.x, joint1.y, joint2.x, joint2.y));

    });
  }

  //TODO: merge this with logic for determining tracer points
  private static determineTracerForce(joint: Joint, joint2: Joint, force: Force, startOrEnd: string) {
    let r1, r2, r3, internal_angle: number;
    if (!this.internalTriangleValuesMap.has(joint.id + joint2.id + force.id + startOrEnd)) {
      // TODO: Have map for determining r1, r2, r3
      r1 = this.jointDistMap.get(force.id + startOrEnd + ',' + joint.id)!;
      r2 = this.jointDistMap.get(force.id + startOrEnd  + ',' + joint2.id)!;
      r3 = this.jointDistMap.get(joint.id + ',' + joint2.id)!;
      internal_angle = Math.acos((Math.pow(r1, 2) + Math.pow(r3, 2) - Math.pow(r2, 2)) / (2 * r1 * r3));
      this.internalTriangleValuesMap.set(joint.id + joint2.id + startOrEnd,
        [r1, internal_angle]);
    }

    r1 = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![0];
    internal_angle = this.internalTriangleValuesMap.get(joint.id + joint2.id + startOrEnd)![1];
    const x1 = this.jointMapPositions.get(joint.id)![0];
    const y1 = this.jointMapPositions.get(joint.id)![1];
    const x2 = this.jointMapPositions.get(joint2.id)![0];
    const y2 = this.jointMapPositions.get(joint2.id)![1];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    let x_calc: number;
    let y_calc: number;
    let x_calc1: number;
    let y_calc1: number;
    let x_calc2: number;
    let y_calc2: number;
    if (x1 > x2) { // A to the right of B
      if (y1 > y2) { // A on top of B (good)
        x_calc1 = x1 + r1 * Math.cos( (Math.PI) + (internal_angle + (Math.PI + angle)));
        y_calc1 = y1 + r1 * Math.sin( (Math.PI) + (internal_angle + (Math.PI + angle)));
        x_calc2 = x1 + r1 * Math.cos((Math.PI) - (internal_angle - (Math.PI + angle)));
        y_calc2 = y1 + r1 * Math.sin((Math.PI) - (internal_angle - (Math.PI + angle)));
      } else { // A below B (good)
        x_calc1 = x1 + r1 * Math.cos((Math.PI) + (internal_angle - (Math.PI - angle)));
        y_calc1 = y1 + r1 * Math.sin((Math.PI) + (internal_angle - (Math.PI - angle)));
        x_calc2 = x1 + r1 * Math.cos(Math.PI - (internal_angle + (Math.PI - angle)));
        y_calc2 = y1 + r1 * Math.sin(Math.PI - (internal_angle + (Math.PI - angle)));
      }
    } else { // A to the left of B
      if (y1 > y2) { // A on top of B (good)
        x_calc1 = x1 + r1 * Math.cos((2 * Math.PI) - (Math.abs(angle) + internal_angle));
        y_calc1 = y1 + r1 * Math.sin((2 * Math.PI) - (Math.abs(angle) + internal_angle));
        x_calc2 = x1 + r1 * Math.cos(internal_angle - Math.abs(angle));
        y_calc2 = y1 + r1 * Math.sin(internal_angle - Math.abs(angle));
      } else { // A below B (good)
        x_calc1 = x1 + r1 * Math.cos((2 * Math.PI) - (angle - internal_angle));
        y_calc1 = y1 + r1 * Math.sin(angle - internal_angle);
        x_calc2 = x1 + r1 * Math.cos(internal_angle + angle);
        y_calc2 = y1 + r1 * Math.sin(internal_angle + angle);
      }
    }
    let prevJoint_x: number;
    let prevJoint_y: number;
    if (startOrEnd === 'start') {
      prevJoint_x = force.startCoord.x;
      prevJoint_y = force.startCoord.y;
    } else {
      prevJoint_x = force.endCoord.x;
      prevJoint_y = force.endCoord.y;
    }
    const dist1 = this.euclideanDistance(x_calc1, y_calc1, prevJoint_x, prevJoint_y);
    const dist2 = this.euclideanDistance(x_calc2, y_calc2, prevJoint_x, prevJoint_y);
    if (dist1 < dist2) {
      x_calc = x_calc1;
      y_calc = y_calc1;
    } else {
      x_calc = x_calc2;
      y_calc = y_calc2;
    }
    this.forcePositionMap.set(force.id + startOrEnd, new Coord(roundNumber(x_calc, 3), roundNumber(y_calc, 3)));
  }

  // TODO: Put this within Utils class
  private static euclideanDistance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  }
}
