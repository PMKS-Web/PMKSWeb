import {Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {Piston, Link, RealLink} from "../link";
import {matLinearSystem} from "../utils";
import {KinematicsSolver} from "./kinematic-solver";

export class ForceSolver {
  private static loopLettersToLinkIndexMap = new Map<string, number>();
  private static containsInputIndexMap = new Map<string, number>();
  static jointPositiveForceXLinkMap = new Map<string, string>();
  static linkToFixedPositionMap = new Map<string, string>();
  static jointPositiveForceYLinkMap = new Map<string, string>();
  private static jointIDToTracerBooleanMap = new Map<string, boolean>();
  private static unknownVariableNum: number | undefined;
  private static jointIDToUsedBooleanMap = new Map<string, boolean>();

  static jointIdToJointIndexMap = new Map<string, number>();
  static unknownVariableForcesMap = new Map<string, [number, number]>();
  static jointIDToUnknownArrayIndexMap = new Map<string, number>();
  static linkIDToUnknownArrayIndexMap = new Map<string, number>();
  static unknownVariableTorque: number;
  static A_matrix: Array<Array<number>> = [];
  static B_matrix: Array<Array<number>> = [];
  static desiredLoopLetters: Array<Array<string>>;
  static inputLinkIndex: number;

  static resetVariables() {
    this.loopLettersToLinkIndexMap = new Map<string, number>();
    this.containsInputIndexMap = new Map<string, number>();
    this.jointPositiveForceXLinkMap = new Map<string, string>();
    this.jointPositiveForceYLinkMap = new Map<string, string>();
    this.jointIDToTracerBooleanMap = new Map<string, boolean>();
    this.jointIDToUsedBooleanMap = new Map<string, boolean>();

    this.jointIdToJointIndexMap = new Map<string, number>();
    this.unknownVariableForcesMap = new Map<string, [number, number]>();
    this.jointIDToUnknownArrayIndexMap = new Map<string, number>();
    this.A_matrix = [];
    this.B_matrix = [];
    this.desiredLoopLetters = Array<Array<string>>();
    this.unknownVariableNum = undefined;
  }

  static determineForceAnalysis(joints: Joint[], links: Link[], analysisType: string, gravity: boolean, unit: string) {
    // const desiredLoopLetters = this.determineDesiredLoopLettersForce(requiredLoops);
    // const [knownArray, unknownArray] = this.determineArraysForce(simJoints, simLinks, this.desiredLoopLetters, analysisType, gravity);
    this.determineArraysForce(joints, links, analysisType, gravity, unit);
    // I hope this solves problems...
    // maybe also put this within utils
    // https://mathjs.org/docs/datatypes/matrices.html
    const sol = matLinearSystem(this.A_matrix, this.B_matrix);
    joints.forEach(j => {
      this.unknownVariableForcesMap.set(j.id, [0, 0]);
    });
    // for (let i = 0; i < this.JointIDToUnknownArrayIndex.size; i++) {
    // for (const entry of this.JointIDToUnknownArrayIndex.entries()) {
    // this should not be jointIDtoUnknownArray... choose another map
    for (const [jointID, jointIndex] of this.jointIDToUnknownArrayIndexMap.entries()) {
      // const jointIndex = this.jointIDToNotUtilizedYetBooleanMap.get(key);
      this.unknownVariableForcesMap.set(jointID, [sol[jointIndex][0], sol[jointIndex + 1][0]]);
      // this.unknownVariableForces.set(jointID, [sol[2 * jointIndex], sol[2 * jointIndex + 1]]);
    }
    // const joint = simJoints[i]
    // this.unknownVariableForces.set()
    // this.unknownVariableForces[i] = [sol[2 * i], sol[2 * i + 1]];
    // }
    this.unknownVariableTorque = sol[2 * this.jointIDToUnknownArrayIndexMap.size][0];
  }

  private static determineArraysForce(simJoints: Joint[], simLinks: Link[], analysisType: string, gravity: boolean, unit: string) {
    // This should be initialization code done outside of this class, somewhat to have logic be cleaner and easier to follow
    if (this.unknownVariableNum === undefined) {
      let realLinkCount = 0;
      let imagLinkCount = 0;
      let realJointCount = 0;
      simJoints.forEach(j => {
        if (!(j instanceof RealJoint)) {return}
        // if (!(j instanceof RevJoint)) {return}
        const tracerJointBoolean = (j.links.length === 1 && !j.ground);
        this.jointIDToTracerBooleanMap.set(j.id, tracerJointBoolean);
        if (!this.jointIDToTracerBooleanMap.get(j.id)) {
          this.jointIDToUsedBooleanMap.set(j.id, true);
          realJointCount++;
        } else {
          this.jointIDToUsedBooleanMap.set(j.id, false);
        }
      });
      this.unknownVariableNum = (realJointCount * 2) + 1;

      simJoints.forEach(j => {
        if (!(j instanceof RealJoint)) {return}
        if (j.links.length < 2 && !j.ground) {
          return;
        }
        this.jointPositiveForceXLinkMap.set(j.id, j.links[0].id);
        this.jointPositiveForceYLinkMap.set(j.id, j.links[0].id);
      });

      let unknown_variable_index = 0;
      simJoints.forEach((joint, joint_index) => {
        const joint_id = simJoints[joint_index].id;
        this.jointIdToJointIndexMap.set(joint_id, joint_index);
        if (this.jointIDToUsedBooleanMap.get(joint_id)) {
          this.jointIDToUnknownArrayIndexMap.set(joint_id, 2 * unknown_variable_index);
          unknown_variable_index++;
        }
      });
      this.desiredLoopLetters.forEach(letters => {
        const joint1 = simJoints[this.jointIdToJointIndexMap.get(letters[0].charAt(0))!];
        const joint2 = simJoints[this.jointIdToJointIndexMap.get(letters[0].charAt(1))!];
        this.loopLettersToLinkIndexMap.set(letters[0].charAt(0) + letters[0].charAt(1),
          simLinks.findIndex(l => l.id.includes(letters[0].charAt(0)) && l.id.includes(letters[0].charAt(1))));
        const link = simLinks[this.loopLettersToLinkIndexMap.get(letters[0].charAt(0) + letters[0].charAt(1))!];
        this.linkToFixedPositionMap.set(link.id, link.id);
        // commented out this part. Possibly this can be solved by utilizing initializing maps refresh
        // if (!this.linkIDToUnknownArrayIndexMap.has(link.id)) {
        this.linkIDToUnknownArrayIndexMap.set(link.id, 3 * realLinkCount + imagLinkCount);
        if (!(joint1 instanceof RealJoint) || !(joint2 instanceof RealJoint))  {return}
        if (joint1.input || joint2.input) {
          this.inputLinkIndex = 3 * realLinkCount + imagLinkCount + 2;
        }
        if (link instanceof Piston) {
          imagLinkCount++;
        } else {
          realLinkCount++;
        }
      });
    }

    // const knownArray = [];
    // const unknownArray = [];
    // set up the A and B matrices
    this.A_matrix = [];
    this.B_matrix = [];
    for (let i = 0; i < this.unknownVariableNum; i++) {
      const arr = [];
      for (let j = 0; j < this.unknownVariableNum; j++) {
        arr.push(0);
      }
      // unknownArray.push(arr);
      // knownArray.push(0);
      this.A_matrix.push(arr);
      this.B_matrix.push([0]);
    }

    let realLinkCount = 0;
    let imagLinkCount = 0;
    let distance_conversion = 1; // kg
    let mass_conversion = 1;

    if (unit === 'cm') {
      distance_conversion = 1 / 100;
      mass_conversion = 1 / 1000;
    }

    this.desiredLoopLetters.forEach(letters => {
      // TODO: Determine where to insert logic for jointIdToJointIndexMap and loopLettersToLinkIndexMap
      const joint1 = simJoints[this.jointIdToJointIndexMap.get(letters[0].charAt(0))!];
      const joint2 = simJoints[this.jointIdToJointIndexMap.get(letters[0].charAt(1))!];
      const link = simLinks[this.loopLettersToLinkIndexMap.get(letters[0].charAt(0) + letters[0].charAt(1))!];
      let fixedJoint: any;
      if (this.linkToFixedPositionMap.get(link.id)!.length > 1) {
        const linkID = this.linkToFixedPositionMap.get(link.id);
        const li = simLinks.find(l => l.id === linkID);
        if (!(li instanceof RealLink)) {return}
        fixedJoint = {x: li.CoM.x, y: li.CoM.y};
      } else {
        const jointID = this.linkToFixedPositionMap.get(link.id);
        fixedJoint = simJoints.find(j => j.id === jointID);
      }
      link.joints.forEach(j => {
        if (this.jointIDToTracerBooleanMap.get(j.id)) {
          return;
        }
        let xForce: number;
        let yForce: number;
        const xIndex = this.jointIDToUnknownArrayIndexMap.get(j.id)!;
        const yIndex = xIndex + 1;
        xForce = this.jointPositiveForceXLinkMap.get(j.id) === link.id ? 1: -1;
        yForce = this.jointPositiveForceYLinkMap.get(j.id) === link.id ? 1: -1;
        switch (link.constructor) {
          case RealLink:
            const torqueVal = this.determineMoment(fixedJoint, j.x, j.y, xForce, yForce);
            this.A_matrix[3 * realLinkCount + imagLinkCount][xIndex] += xForce;
            this.A_matrix[3 * realLinkCount + imagLinkCount + 1][yIndex] += yForce;
            this.A_matrix[3 * realLinkCount + imagLinkCount + 2][xIndex] += torqueVal[1] * distance_conversion;
            this.A_matrix[3 * realLinkCount + imagLinkCount + 2][yIndex] += torqueVal[0] * distance_conversion;
            break;
          case Piston:
            const mu = 0.1;
            const desiredJoint = joint1;
            if (!(desiredJoint instanceof PrisJoint)) {return}
            const constant = xForce / (-mu * Math.cos(desiredJoint.angle) + Math.sin(desiredJoint.angle));
            this.B_matrix[3 * realLinkCount + imagLinkCount][xIndex] = -mu * constant * Math.sin(desiredJoint.angle) +
              constant * Math.cos(desiredJoint.angle);
            this.B_matrix[3 * realLinkCount + imagLinkCount][yIndex] = yForce;
            break;
        }
      });
      switch (link.constructor) {
        case RealLink:
          if (!(link instanceof RealLink)) {return;}
          if (gravity) {
            // const gravity = 9.80665
            const gravity_val = -9.81;
            const calc_mass = link.mass * mass_conversion;
            // const gravity_val = 980.665; // cm/s^2
            const torque_from_gravity = this.determineMoment(fixedJoint, link.CoM.x, link.CoM.y,
              0, gravity_val * calc_mass);
            this.B_matrix[3 * realLinkCount + imagLinkCount + 1][0] += (gravity_val * calc_mass * -1);
            this.B_matrix[3 * realLinkCount + imagLinkCount + 2][0] += (torque_from_gravity[0] * distance_conversion * -1);
          }
          // if (analysisType === 'dynamic' && consideredLink.findIndex(l => l === link.id) === -1) {
          if (analysisType === 'dynamics') {
            // kg * m / s ^ 2 => kg * cm/s^2
            // TODO: Uncomment when KinSolver is done
            const calc_mass = link.mass * mass_conversion;
            const acc_x = KinematicsSolver.linkAccMap.get(link.id)![0] * distance_conversion;
            const acc_y = KinematicsSolver.linkAccMap.get(link.id)![1] * distance_conversion;
            // const calc_mmoi = link.massMomentOfInertia * Math.pow(distance_conversion, 2);
            const desired_joint_index = this.jointIdToJointIndexMap.get(letters[0].charAt(0))!;
            const desired_joint = simJoints[desired_joint_index];
            const link_com = KinematicsSolver.linkCoMMap.get(link.id)!;
            const dist = Math.sqrt(Math.pow(link_com[0] - desired_joint.x, 2) +
              Math.pow(link_com[1] - desired_joint.y, 2)) * distance_conversion;
            const angular_acc = KinematicsSolver.linkAngAccMap.get(link.id)!;
            const J = link.massMoI * Math.pow(distance_conversion, 2); // calc_mmoi
            const m_d_2 = calc_mass * Math.pow(dist, 2);
            const J_m_d_2 = J + m_d_2;
            const total_mmoi = J_m_d_2 * angular_acc;
            this.B_matrix[3 * realLinkCount + imagLinkCount][0] += calc_mass * acc_x;
            this.B_matrix[3 * realLinkCount + imagLinkCount + 1][0] += calc_mass * acc_y;
            this.B_matrix[3 * realLinkCount + imagLinkCount + 2][0] += total_mmoi;

            // kg * m / s ^ 2 * cm = kg * cm ^2 * (rot)/s^2
          }
          if (link.forces.length === 0) {
            realLinkCount++;
            break;
          }
          // TODO: Be sure force is updated within link
          link.forces.forEach(f => {
            const torqueNum = this.determineMoment(fixedJoint, f.startCoord.x, f.startCoord.y,
              f.mag * Math.cos(f.angle), f.mag * Math.sin(f.angle));
            this.B_matrix[3 * realLinkCount + imagLinkCount][0] += (f.mag * Math.cos(f.angle) * -1);
            this.B_matrix[3 * realLinkCount + imagLinkCount + 1][0] += (f.mag * Math.sin(f.angle) * -1);
            this.B_matrix[3 * realLinkCount + imagLinkCount + 2][0] += (torqueNum[1] * -1 * distance_conversion);
            this.B_matrix[3 * realLinkCount + imagLinkCount + 2][0] += (torqueNum[0] * -1 * distance_conversion);
          });
          realLinkCount++;
          break;
        case Piston:
          imagLinkCount++;
          break;
      }
    });
    this.A_matrix[this.inputLinkIndex][this.unknownVariableNum - 1] += 1;
  }

  // TODO: Put this within Utils
  static determineMoment(joint1: Joint, joint2X: number, joint2Y: number, xMag: number, yMag: number): number[] {
    const xDist = joint2X - joint1.x;
    const yDist = joint2Y - joint1.y;
    if (xDist === 0 && yDist === 0) {
      return [0, 0, 0];
    }
    const arr1 = xDist * yMag;
    const arr2 = -1 * yDist * xMag;
    return [arr1, arr2, 0];
  }

  static determineDesiredLoopLettersForce(requiredLoops: string[]) {
    const desiredForceLoops: Array<Array<string>> = [];
    const utilizedFirstJointMap = new Map <string, number>();
    const utilizedSecondJointMap = new Map <string, number>();
    requiredLoops.forEach(loop => {
      for (let i = 1; i < loop.length - 1; i++) {
        if (utilizedFirstJointMap.has(loop[i - 1]) || utilizedSecondJointMap.has(loop[i])) {
          continue;
        }
        utilizedFirstJointMap.set(loop[i - 1], 1);
        utilizedSecondJointMap.set(loop[i], 1);
        desiredForceLoops.push([loop[i - 1] + loop[i]]);
      }
    });
    this.desiredLoopLetters = desiredForceLoops;
    // return desiredForceLoops;
  }
}
