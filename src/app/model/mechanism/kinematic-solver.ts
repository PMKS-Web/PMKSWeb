import { Joint, PrisJoint, RealJoint } from '../joint';
import { Piston, Link, RealLink } from '../link';
import { matLinearSystem } from '../utils';
import { InstantCenter } from '../instant-center';

export class KinematicsSolver {
  static jointIndexMap = new Map<string, number>();
  static jointVelMap = new Map<string, [number, number]>();
  static jointAccMap = new Map<string, [number, number]>();

  static linkIndexMap = new Map<string, number>();
  static linkAngPosMap = new Map<string, number>();
  static linkAngVelMap = new Map<string, number>();
  static linkAngAccMap = new Map<string, number>();
  static linkCoMMap = new Map<string, [number, number]>();
  static linkVelMap = new Map<string, [number, number]>();
  static linkAccMap = new Map<string, [number, number]>();

  static A_matrix_AngVel: Array<Array<number>> = [];
  static B_matrix_AngVel: Array<Array<number>> = [];
  static A_matrix_AngAcc: Array<Array<number>> = [];
  static B_matrix_AngAcc: Array<Array<number>> = [];
  static LinVelJointEq = new Map<string, [string, string]>();
  static LinVelLinkEq = new Map<string, [string, string]>();
  static LinAccJointEq = new Map<string, [string, string]>();
  static LinAccLinkEq = new Map<string, [string, string]>();
  static requiredLoops: string[];

  static loopIndexMap = new Map<string, number>();
  private static linkContainsInputMap = new Map<string, boolean>();
  static unknownLinkIndexMap = new Map<string, number>();
  private static groundJointIndexMap = new Map<string, number>();
  static realJointIndexMap = new Map<string, number>();
  static desiredAngleMap = new Map<string, number>();
  private static inputJointIndex: number;
  static inputLinkIndex: number;

  static resetVariables() {
    this.jointIndexMap = new Map<string, number>();
    this.jointVelMap = new Map<string, [number, number]>();
    this.jointAccMap = new Map<string, [number, number]>();

    this.linkIndexMap = new Map<string, number>();
    this.linkAngPosMap = new Map<string, number>();
    this.linkAngVelMap = new Map<string, number>();
    this.linkAngAccMap = new Map<string, number>();
    this.linkCoMMap = new Map<string, [number, number]>();
    this.linkVelMap = new Map<string, [number, number]>();
    this.linkAccMap = new Map<string, [number, number]>();

    this.loopIndexMap = new Map<string, number>();
    this.linkContainsInputMap = new Map<string, boolean>();
    this.unknownLinkIndexMap = new Map<string, number>();
    this.groundJointIndexMap = new Map<string, number>();
    this.realJointIndexMap = new Map<string, number>();

    this.A_matrix_AngVel = [];
    this.B_matrix_AngVel = [];
    this.A_matrix_AngAcc = [];
    this.B_matrix_AngAcc = [];

    this.LinVelJointEq = new Map<string, [string, string]>();
    this.LinVelLinkEq = new Map<string, [string, string]>();
    this.LinAccJointEq = new Map<string, [string, string]>();
    this.LinAccLinkEq = new Map<string, [string, string]>();
  }

  static determineKinematics(simJoints: Joint[], simLinks: Link[], initialAngularVelocity: number) {
    this.kinematicsInitializer(simJoints, simLinks, initialAngularVelocity);

    // TODO: Determine logic for when mechanism is one physical link and one ground
    // if (this.requiredLoops.length === 0) { // assume there is just one link
    // const fixed_joint = simLinks[0].joints.find(j => j.input);
    // this.linkAngVelMap.set(linkOrJoint.id, X[i][0]);
    // this.linkAngAccMap.set(linkOrJoint.id, X[i][0]);
    // this.linkAngVelMap.set(linkOrJoint.id, X[i][0]);
    // this.jointAccMap.set(linkOrJoint.id, [X[i][0] * Math.cos(linkOrJoint.angle), X[i][0] * Math.sin(linkOrJoint.angle)]);
    // this.jointVelMap.set(desiredID, [arr[0] + this.jointVelMap.get(firstJointID)[0], arr[1] + this.jointVelMap.get(firstJointID)[1]]);
    // this.LinVelJointEq.set(desiredID, [firstValue + secondSign + secondValue, thirdValue + fourthSign + fourthValue]);
    // return
    // }

    this.determineAng(simJoints, simLinks, 'Velocity');
    this.determineAng(simJoints, simLinks, 'Acceleration');
    this.determineLin(simJoints, simLinks);
  }

  private static kinematicsInitializer(
    joints: Joint[],
    links: Link[],
    initialAngularVelocity: number
  ) {
    if (this.groundJointIndexMap.size === 0) {
      joints.forEach((j, j_index) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.ground) {
          this.groundJointIndexMap.set(j.id, j_index);
        }
      });
    }

    if (this.inputJointIndex === undefined) {
      this.inputJointIndex = joints.findIndex((j) => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        return j.input;
      });
      const inputJoint = joints[this.inputJointIndex];
      if (!(inputJoint instanceof RealJoint)) {
        return;
      }
      // this.inputLinkIndex = links.findIndex(l => l.id === inputJoint.links[0])
      // this.inputLinkIndex = links.indexOf(inputJoint.links[0]);
      this.inputLinkIndex = links.findIndex((l) => l.id === inputJoint.links[0].id);
    }

    for (const entry of this.groundJointIndexMap.entries()) {
      this.jointVelMap.set(entry[0], [0.0, 0.0]);
      this.jointAccMap.set(entry[0], [0.0, 0.0]);
    }

    switch (links[this.inputLinkIndex].constructor) {
      case RealLink:
        this.linkAngVelMap.set(links[this.inputLinkIndex].id, initialAngularVelocity);
        this.linkAngAccMap.set(links[this.inputLinkIndex].id, 0);
        break;
      case Piston:
        if (!this.realJointIndexMap.has(links[this.inputLinkIndex].id)) {
          const inputLink = links[this.inputLinkIndex];
          if (!(inputLink instanceof RealLink)) {
            return;
          }
          if (inputLink.joints === undefined) {
            return;
          }
          const realJoint = inputLink.joints.find((j) => j instanceof RealJoint);
          if (realJoint === undefined) {
            return;
          }
          this.realJointIndexMap.set(links[this.inputLinkIndex].id, joints.indexOf(realJoint));
          const prisJoint = links[this.inputLinkIndex].joints.find(jt => jt instanceof PrisJoint) as PrisJoint;
          this.desiredAngleMap.set(links[this.inputLinkIndex].id, prisJoint.angle_rad);
        }
        const inputLink = links[this.inputLinkIndex].id;
        if (inputLink === undefined) {
          return;
        }
        const realJoint = joints[this.realJointIndexMap.get(inputLink)!];
        if (!(realJoint instanceof PrisJoint)) {
          return;
        }
        this.jointVelMap.set(realJoint.id, [
          initialAngularVelocity * Math.cos(realJoint.angle_rad),
          initialAngularVelocity * Math.sin(realJoint.angle_rad),
        ]);
        this.jointAccMap.set(realJoint.id, [0.0, 0.0]);
        break;
      default:
        break;
    }

    links.forEach((l) => {
      if (l instanceof Piston) {
        return;
      }
      const angle = Math.atan2(l.joints[1].y - l.joints[0].y, l.joints[1].x - l.joints[0].x);
      const RadToDeg = 180 / Math.PI;
      this.linkAngPosMap.set(l.id, angle * RadToDeg);
    });

    if (this.linkIndexMap.size === 0) {
      this.requiredLoops.forEach((loop) => {
        // initialize the jointIndexMap and linkIndexMap
        for (let i = 1; i < loop.length - 1; i++) {
          if (!this.linkIndexMap.has(loop[i] + loop[i - 1])) {
            this.setLinkIndexMap(loop[i], loop[i - 1], links);
          }
        }
      });
    }
    joints.forEach((joint) => {
      this.setJointIndexMap(joint.id, joints);
    });

    if (this.unknownLinkIndexMap.size === 0) {
      this.requiredLoops.forEach((loop) => {
        for (let i = 1; i < loop.length - 1; i++) {
          const link = links[this.linkIndexMap.get(loop[i] + loop[i - 1])!];
          switch (link.constructor) {
            case RealLink:
              if (!(link instanceof RealLink)) {
                return;
              }
              if (!this.linkContainsInputMap.has(link.id)) {
                this.linkContainsInputMap.set(
                  link.id,
                  link.joints.findIndex((j) => {
                    if (!(j instanceof RealJoint)) {
                      return;
                    }
                    return j.input;
                  }) !== -1
                );
              }
              if (
                !this.unknownLinkIndexMap.has(link.id) &&
                !this.linkContainsInputMap.get(link.id)
              ) {
                this.unknownLinkIndexMap.set(link.id, this.unknownLinkIndexMap.size);
              }
              break;
            case Piston:
              if (!this.realJointIndexMap.has(link.id)) {
                const connectedJoint = link.joints.find((j) => j instanceof RealJoint)!;
                this.realJointIndexMap.set(link.id, joints.indexOf(connectedJoint));
                const prisJoint = link.joints.find(jt => jt instanceof PrisJoint) as PrisJoint;
                this.desiredAngleMap.set(connectedJoint.id, prisJoint.angle_rad);
              }

              const desiredJoint = joints[this.realJointIndexMap.get(link.id)!];
              if (!this.linkContainsInputMap.has(desiredJoint.id)) {
                this.linkContainsInputMap.set(
                  desiredJoint.id,
                  link.joints.findIndex((j) => {
                    if (!(j instanceof RealJoint)) {
                      return;
                    }
                    return j.input;
                  }) !== -1
                );
              }
              if (
                !this.unknownLinkIndexMap.has(desiredJoint.id) &&
                !this.linkContainsInputMap.get(desiredJoint.id)
              ) {
                this.unknownLinkIndexMap.set(desiredJoint.id, this.unknownLinkIndexMap.size);
              }
              break;
          }
        }
      });
    }

    this.A_matrix_AngVel = [];
    this.B_matrix_AngVel = [];
    this.A_matrix_AngAcc = [];
    this.B_matrix_AngAcc = [];
  }

  private static determineAng(simJoints: Joint[], simLinks: Link[], analysisType: string) {
    // 1st, determine arrays from loops and put that within their respective arrays
    const unknownLinks = this.determineArrays(simJoints, simLinks, analysisType);
    // 2nd, store determine unknown Angular Velocities
    let X: Array<Array<number>> = [];
    switch (analysisType) {
      case 'Velocity':
        X = matLinearSystem(this.A_matrix_AngVel, this.B_matrix_AngVel);
        break;
      case 'Acceleration':
        X = matLinearSystem(this.A_matrix_AngAcc, this.B_matrix_AngAcc);
        break;
    }
    // const X = lusolve(this.A_matrix_AngVel, this.B_matrix_AngVel);
    // 3rd, store unknown values to respected links
    for (let i = 0; i < X.length; i++) {
      const linkOrJoint = unknownLinks[i];
      if (linkOrJoint instanceof RealLink) {
        // Link
        switch (analysisType) {
          case 'Velocity':
            this.linkAngVelMap.set(linkOrJoint.id, X[i][0]);
            break;
          case 'Acceleration':
            this.linkAngAccMap.set(linkOrJoint.id, X[i][0]);
        }
      } else {
        // Joint
        const desiredAngle = this.desiredAngleMap.get(linkOrJoint.id)!;
        switch (analysisType) {
          case 'Velocity':
            this.jointVelMap.set(linkOrJoint.id,
                [
                  X[i][0] * Math.cos(desiredAngle),
                  X[i][0] * Math.sin(desiredAngle),
              // X[i][0] * Math.cos(linkOrJoint.angle),
              // X[i][0] * Math.sin(linkOrJoint.angle),
            ]
            );
            break;
          case 'Acceleration':
            this.jointAccMap.set(linkOrJoint.id,
                [
                  X[i][0] * Math.cos(desiredAngle),
                  X[i][0] * Math.sin(desiredAngle),
              // X[i][0] * Math.cos(linkOrJoint.angle),
              // X[i][0] * Math.sin(linkOrJoint.angle),
            ]
            );
            break;
        }
      }
    }
  }

  private static determineLin(simJoints: Joint[], simLinks: Link[]) {
    // this.setUpLinkAndJointIndexMap(simJoints, simLinks, requiredLoops);
    const desired_links_used: Array<string> = [];
    this.requiredLoops.forEach((loop) => {
      for (let i = 1; i < loop.length - 1; i++) {
        // cannot find velocity of a joint on an imaginary link
        if (simLinks[this.linkIndexMap.get(loop[i] + loop[i - 1])!] instanceof Piston) {
          continue;
        }
        const desiredLink = simLinks[this.linkIndexMap.get(loop[i] + loop[i - 1])!];
        if (!(desiredLink instanceof RealLink)) {
          return;
        }
        const firstJoint = simJoints[this.jointIndexMap.get(loop[i - 1])!];
        // determine the velocity/accel of each link's joint that is not the first joint
        for (let index = 0; index < desiredLink.id.length; index++) {
          const joint_id = desiredLink.id[index];
          const desiredJoint = simJoints[this.jointIndexMap.get(joint_id)!];
          if (joint_id === firstJoint.id) {
            continue;
          }
          // determine the distance for the left side of the equation
          const leftXDist = desiredJoint.x - firstJoint.x;
          const leftYDist = desiredJoint.y - firstJoint.y;

          // velocity and acceleration for joint
          this.determineVelAndAccel(
            desiredLink.id,
            firstJoint.id,
            leftXDist,
            leftYDist,
            desiredJoint.id,
            'joint'
          );
        }

        // set for where link's center of mass is located
        if (desired_links_used.findIndex((id) => id === desiredLink.id) !== -1) {
          continue;
        }
        this.linkCoMMap.set(desiredLink.id, [desiredLink.CoM.x, desiredLink.CoM.y]);
        // determine velocity and acceleration for link's center of mass
        this.determineVelAndAccel(
          desiredLink.id,
          firstJoint.id,
          desiredLink.CoM.x - firstJoint.x,
          desiredLink.CoM.y - firstJoint.y,
          desiredLink.id,
          'link'
        );
        desired_links_used.push(desiredLink.id);
      }
    });
    // determine the velocity and acceleration of tracer joints
  }

  // determine AX = B
  private static determineArrays(
    simJoints: Joint[],
    simLinks: Link[],
    analysisType: string
  ): any[] {
    const unknownLinksOrJoints: Array<any> = [];
    // first, determine variable locations (X)
    this.requiredLoops.forEach((loop) => {
      for (let i = 1; i < loop.length - 1; i++) {
        const link = simLinks[this.linkIndexMap.get(loop[i] + loop[i - 1])!];
        switch (link.constructor) {
          case RealLink:
            if (
              this.unknownLinkIndexMap.has(link.id) &&
              unknownLinksOrJoints.findIndex((l) => l.id === link.id) === -1
            ) {
              unknownLinksOrJoints.push(link);
            }
            break;
          case Piston:
            const desiredJoint = simJoints[this.realJointIndexMap.get(link.id)!];
            if (this.unknownLinkIndexMap.has(desiredJoint.id)) {
              unknownLinksOrJoints.push(desiredJoint);
            }
            break;
        }
      }
    });
    for (let i = 0; i < unknownLinksOrJoints.length; i++) {
      const row = [];
      for (let j = 0; j < unknownLinksOrJoints.length; j++) {
        row.push(0);
      }
      switch (analysisType) {
        case 'Velocity':
          this.A_matrix_AngVel.push(row);
          this.B_matrix_AngVel.push([0]);
          break;
        case 'Acceleration':
          this.A_matrix_AngAcc.push(row);
          this.B_matrix_AngAcc.push([0]);
          break;
      }
    }

    if (!this.loopIndexMap.has(this.requiredLoops[0])) {
      this.requiredLoops.forEach((loop) => {
        this.loopIndexMap.set(loop, this.requiredLoops.indexOf(loop));
      });
    }

    // second, set up the known and unknown matrix (A and B)
    this.requiredLoops.forEach((loop) => {
      for (let i = 1; i < loop.length - 1; i++) {
        const link = this.getLink(simLinks, loop[i] + loop[i - 1]);
        const firstJoint = this.getJoint(simJoints, loop[i - 1]);
        const secondJoint = this.getJoint(simJoints, loop[i]);
        // right side of the equation (B)
        const rightXDist = firstJoint.x - secondJoint.x;
        const rightYDist = firstJoint.y - secondJoint.y;
        // left side of the equation (A)
        const leftXDist = secondJoint.x - firstJoint.x;
        const leftYDist = secondJoint.y - firstJoint.y;
        let sol: Array<number>;
        let arr: Array<number>;
        switch (
          analysisType // clean later
        ) {
          case 'Velocity':
            if (link === simLinks[this.inputLinkIndex]) {
              // part of input link (B matrix)
              switch (link.constructor) {
                case RealLink:
                  // v = w x r
                  arr = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  break;
                case Piston:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // // slider crank x, y
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  arr = [Math.cos(desiredAngle), Math.sin(desiredAngle), 0];
                  // arr = [Math.cos(realJoint.angle_rad), Math.sin(realJoint.angle_rad), 0];
                  break;
                default:
                  return;
              }
              // insert value within B matrix
              const rowIndex = 2 * this.loopIndexMap.get(loop)!;
              this.B_matrix_AngVel[rowIndex][0] += arr[0];
              this.B_matrix_AngVel[rowIndex + 1][0] += arr[1];
            } else {
              // not an input Link (A matrix)
              let colIndex: number;
              switch (link.constructor) {
                case RealLink:
                  arr = this.crossProduct(1, [leftXDist, leftYDist, 0]);
                  colIndex = this.unknownLinkIndexMap.get(link.id)!;
                  break;
                case Piston:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  // arr = [-Math.cos(realJoint.angle_rad), -Math.sin(realJoint.angle_rad), 0];
                  colIndex = this.unknownLinkIndexMap.get(realJoint.id)!;
                  break;
                default:
                  return;
              }

              // insert value within A matrix
              const rowIndex = 2 * this.loopIndexMap.get(loop)!;
              this.A_matrix_AngVel[rowIndex][colIndex] += arr[0];
              this.A_matrix_AngVel[rowIndex + 1][colIndex] += arr[1];
            }
            break;
          case 'Acceleration':
            if (link === simLinks[this.inputLinkIndex]) {
              // input link
              const rowIndex = 2 * this.loopIndexMap.get(loop)!;
              switch (link.constructor) {
                case RealLink:
                  arr = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  const transAccel = this.crossProduct(this.linkAngVelMap.get(link.id)!, arr);
                  const angularAccel = this.crossProduct(this.linkAngAccMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  sol = this.addTwoArrays(transAccel, angularAccel);
                  break;
                case Piston:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  // arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  sol = [Math.cos(desiredAngle), Math.sin(desiredAngle)];
                  break;
                default:
                  return;
              }
              this.B_matrix_AngAcc[rowIndex][0] += sol[0];
              this.B_matrix_AngAcc[rowIndex + 1][0] += sol[1];
            } else {
              const rowIndex = 2 * this.loopIndexMap.get(loop)!;
              let colIndex: number;
              switch (link.constructor) {
                case RealLink:
                  const arr2 = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    rightXDist,
                    rightYDist,
                    0,
                  ]);
                  const transAccel = this.crossProduct(this.linkAngVelMap.get(link.id)!, [
                    arr2[0],
                    arr2[1],
                    arr2[2],
                  ]);
                  sol = this.crossProduct(1, [leftXDist, leftYDist, 0]); // angularAccel
                  this.B_matrix_AngAcc[rowIndex][0] += transAccel[0];
                  this.B_matrix_AngAcc[rowIndex + 1][0] += transAccel[1];
                  colIndex = this.unknownLinkIndexMap.get(link.id)!;
                  break;
                case Piston:
                  const realJoint = simJoints[this.realJointIndexMap.get(link.id)!];
                  // if (!(realJoint instanceof PrisJoint)) {
                  //   return;
                  // }
                  const desiredAngle = this.desiredAngleMap.get(realJoint.id)!;
                  // arr = [-Math.cos(desiredAngle), -Math.sin(desiredAngle), 0];
                  sol = [-Math.cos(desiredAngle), -Math.sin(desiredAngle)];
                  colIndex = this.unknownLinkIndexMap.get(realJoint.id)!;
                  break;
                default:
                  return;
              }
              this.A_matrix_AngAcc[rowIndex][colIndex] += sol[0];
              this.A_matrix_AngAcc[rowIndex + 1][colIndex] += sol[1];
            }
            break;
        }
      }
    });
    return unknownLinksOrJoints;
  }

  static determineVelocitiesInstantCenters(
    simJoints: Joint[],
    simLinks: Link[],
    simICS: InstantCenter[],
    requiredLoops: string[],
    initialAngularVelocity: number
  ) {
    this.kinematicsInitializer(simJoints, simLinks, initialAngularVelocity);
    // this.kinematicsInitializer(simJoints, simLinks, requiredLoops, initialAngularVelocity);
  }

  private static setLinkIndexMap(joint_id1: string, joint_id2: string, simLinks: Link[]) {
    this.linkIndexMap.set(
      joint_id1 + joint_id2,
      simLinks.findIndex((l) => l.id.includes(joint_id1) && l.id.includes(joint_id2))
    );
  }

  private static setJointIndexMap(joint_id1: string, simJoints: Joint[]) {
    this.jointIndexMap.set(
      joint_id1,
      simJoints.findIndex((j) => j.id === joint_id1)
    );
  }

  static getLink(simLinks: Link[], link_id: string) {
    return simLinks[this.linkIndexMap.get(link_id)!];
  }

  private static getJoint(simJoints: Joint[], joint_id: string) {
    return simJoints[this.jointIndexMap.get(joint_id)!];
  }

  private static addTwoArrays(first_array: any, second_array: any) {
    return first_array.map(function (num: number, idx: number) {
      // may have to caste num and second_array[idx]
      return num + second_array[idx];
    });
  }

  private static determineVelAndAccel(
    desiredLinkID: string,
    firstJointID: string,
    xDist: number,
    yDist: number,
    desiredID: string,
    linkOrJoint: string
  ) {
    // Velocity calculation
    // w x r
    const arr = this.crossProduct(this.linkAngVelMap.get(desiredLinkID)!, [xDist, yDist, 0]);
    // Acceleration calculation
    // w x (w x r)
    const angularAccel = this.crossProduct(this.linkAngVelMap.get(desiredLinkID)!, arr);
    // alpha x r
    const transAccel = this.crossProduct(this.linkAngAccMap.get(desiredLinkID)!, [xDist, yDist, 0]);
    // add both accelerations together
    const knownAng = this.addTwoArrays(angularAccel, transAccel);
    let firstValue = '';
    let firstSign = '';
    let secondValue = '';
    let secondSign = '';
    let thirdValue = '';
    let thirdSign = '';
    let fourthValue = '';
    let fourthSign = '';
    let fifthValue = '';
    let fifthSign = '';
    let sixthValue = '';
    let sixthSign = '';
    let seventhValue = '';
    let seventhSign = '';
    let eighthValue = '';
    let eighthSign = '';
    // set link's acceleration
    if (linkOrJoint === 'joint') {
      // set joint velocity
      firstValue = (Math.round(arr[0] * 1000) / 1000).toString();
      secondValue = (Math.round(this.jointVelMap.get(firstJointID)![0] * 1000) / 1000).toString();
      thirdValue = (Math.round(arr[1] * 1000) / 1000).toString();
      fourthValue = (Math.round(this.jointVelMap.get(firstJointID)![1] * 1000) / 1000).toString();
      fifthValue = (Math.round(knownAng[0] * 1000) / 1000).toString();
      sixthValue = (Math.round(this.jointAccMap.get(firstJointID)![0] * 1000) / 1000).toString();
      seventhValue = (Math.round(knownAng[1] * 1000) / 1000).toString();
      eighthValue = (Math.round(this.jointAccMap.get(firstJointID)![1] * 1000) / 1000).toString();
      [firstSign, firstValue, secondSign, secondValue] = this.determineValStrings(
        firstValue,
        secondValue
      );
      [thirdSign, thirdValue, fourthSign, fourthValue] = this.determineValStrings(
        thirdValue,
        fourthValue
      );
      [fifthSign, fifthValue, sixthSign, sixthValue] = this.determineValStrings(
        fifthValue,
        sixthValue
      );
      [seventhSign, seventhValue, eighthSign, eighthValue] = this.determineValStrings(
        seventhValue,
        eighthValue
      );

      this.jointVelMap.set(desiredID, [
        arr[0] + this.jointVelMap.get(firstJointID)![0],
        arr[1] + this.jointVelMap.get(firstJointID)![1],
      ]);
      this.LinVelJointEq.set(desiredID, [
        firstValue + secondSign + secondValue,
        thirdValue + fourthSign + fourthValue,
      ]);

      // set joint acceleration
      this.jointAccMap.set(desiredID, [
        knownAng[0] + this.jointAccMap.get(firstJointID)![0],
        knownAng[1] + this.jointAccMap.get(firstJointID)![1],
      ]);
      this.LinAccJointEq.set(desiredID, [
        fifthValue + sixthSign + sixthValue,
        seventhValue + eighthSign + eighthValue,
      ]);
    } else {
      // link
      firstValue = (Math.round(arr[0] * 1000) / 1000).toString();
      secondValue = (Math.round(this.jointVelMap.get(firstJointID)![0] * 1000) / 1000).toString();
      thirdValue = (Math.round(arr[1] * 1000) / 1000).toString();
      fourthValue = (Math.round(this.jointVelMap.get(firstJointID)![1] * 1000) / 1000).toString();
      fifthValue = (Math.round(knownAng[0] * 1000) / 1000).toString();
      sixthValue = (Math.round(this.jointAccMap.get(firstJointID)![0] * 1000) / 1000).toString();
      seventhValue = (Math.round(knownAng[1] * 1000) / 1000).toString();
      eighthValue = (Math.round(this.jointAccMap.get(firstJointID)![1] * 1000) / 1000).toString();
      [firstSign, firstValue, secondSign, secondValue] = this.determineValStrings(
        firstValue,
        secondValue
      );
      [thirdSign, thirdValue, fourthSign, fourthValue] = this.determineValStrings(
        thirdValue,
        fourthValue
      );
      [fifthSign, fifthValue, sixthSign, sixthValue] = this.determineValStrings(
        fifthValue,
        sixthValue
      );
      [seventhSign, seventhValue, eighthSign, eighthValue] = this.determineValStrings(
        seventhValue,
        eighthValue
      );
      // set link's center of mass Velocity
      this.linkVelMap.set(desiredID, [
        arr[0] + this.jointVelMap.get(firstJointID)![0],
        arr[1] + this.jointVelMap.get(firstJointID)![1],
      ]);
      this.LinVelLinkEq.set(desiredID, [
        firstValue + secondSign + secondValue,
        thirdValue + fourthSign + fourthValue,
      ]);
      // set link's center of mass Acceleration
      this.linkAccMap.set(desiredID, [
        knownAng[0] + this.jointAccMap.get(firstJointID)![0],
        knownAng[1] + this.jointAccMap.get(firstJointID)![1],
      ]);
      this.LinAccLinkEq.set(desiredID, [
        fifthValue + sixthSign + sixthValue,
        seventhValue + eighthSign + eighthValue,
      ]);
    }
  }

  private static crossProduct(ang_vel: number, pos: number[]) {
    return [-ang_vel * pos[1], ang_vel * pos[0], 0];
  }

  private static determineValStrings(firstValue: string, secondValue: string) {
    let firstSign = '';
    let secondSign = '';
    switch (firstValue[0]) {
      case '-':
        firstSign = '-';
        break;
      case '0':
        firstSign = '';
        firstValue = '';
        break;
      default:
        firstSign = '+';
        break;
    }
    if (firstValue !== '') {
      switch (secondValue[0]) {
        case '-':
          secondSign = ' - ';
          secondValue = secondValue.substring(1);
          break;
        case '0':
          secondSign = '';
          secondValue = '';
          break;
        default:
          secondSign = ' + ';
          break;
      }
    }
    return [firstSign, firstValue, secondSign, secondValue];
  }
}
