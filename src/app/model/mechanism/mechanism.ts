import {Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {ImagLink, Link, RealLink} from "../link";
import {Force} from "../force";
// import {LoopSolver} from "./loop-solver";
import {PositionSolver} from "./position-solver";
import {IcSolver} from "./ic-solver";
import {InstantCenter} from "../instant-center";
import {LoopSolver} from "./loop-solver";

export class Mechanism {
  get links(): Link[][] {
    return this._links;
  }

  set links(value: Link[][]) {
    this._links = value;
  }

  get forces(): Force[][] {
    return this._forces;
  }

  set forces(value: Force[][]) {
    this._forces = value;
  }
  get joints(): Joint[][] {
    return this._joints;
  }

  set joints(value: Joint[][]) {
    this._joints = value;
  }
  private _internalTriangleSimLinkMap = new Map<string, number[]>();
  private _joints: Joint[][] = [[]];
  private _links: Link[][] = [[]];
  private _forces: Force[][] = [[]];
  private _gravity: boolean;
  private _unit: string
  private _requiredLoops: string[] = [];
  private _allLoops: string[] = [];

  constructor(joints: Joint[], links: Link[], forces: Force[], ics: InstantCenter[], gravity: boolean, unit: string) {
    joints.forEach(j => {
      this._joints[0].push(j as Joint);
    });
    links.forEach(l => {
      this._links[0].push(l as RealLink);
    });
    forces.forEach(f => {
      this._forces[0].push(f);
    });
    this._gravity = gravity;
    this._unit = unit;
    const dof = this.determineDegreesOfFreedom(joints, links);
    const inputJointIndex = joints.findIndex(j => {
      if (!(j instanceof RealJoint)) {return}
      return j.input});
    if (dof === 1 && inputJointIndex !== -1) {
      [this._allLoops, this._requiredLoops] = LoopSolver.determineLoops(joints, links);
      this.findFullMovementPos(joints, links, forces, ics, gravity, unit, 10);
    } else {
      this.setMechanismInvalid();
    }
  }

  /**
   * steps to determine DOF (Gruebler's Criteron with Exceptions):
   1.determine number of links + ground
   1a. If mechanismn contains parallel linkage, remove from the number of links(N) and number of joints (J1)
   2.determine number of ground joints
   3.determine number of slider joints
   */
  determineDegreesOfFreedom(joints: Joint[], links: Link[]) {
    let N = 0; // start with 1 to account for ground link
    let J1 = 0;
    const J2 = 0;
    let groundNotFound = true;
    links.forEach(l => {
      if (l instanceof ImagLink) {
        return;
      }
      N++;
      // TODO: Account for this case later
      // if (this.determineParallelLinkage(l)) {
      //   N -= l.joints.length - 2;
      //   J1 -= (l.joints.length - 2) * 2;
      // }
    });

    joints.forEach(j => {
      // TODO: Account for this instance later
      // if (j instanceof ImagJoint) {
      //   return;
      // }
      switch (j.constructor) {
        case RevJoint:
          if (!(j instanceof RevJoint)) {return}
          if (j.ground) {
            J1 += j.links.length;
            if (groundNotFound) {
              N++;
              groundNotFound = false;
            }
          } else {
            J1 += j.links.length - 1;
          }
          break;
        case PrisJoint:
          // N++;
          if (!(j instanceof  PrisJoint)) {return}
          J1 += j.links.length;
          // J2++;
          break;
      }
    });
    // TODO: Check later to see if this is needed...
    // this.realLinks = N;
    // this.realJoints = J1;
    if (groundNotFound) {
      return NaN;
    }
    return (3 * (N - 1)) - (2 * J1) - J2;
  }

  private findFullMovementPos(joints: Joint[], links: Link[], forces: Force[], ics: InstantCenter[],
                              gravity: boolean, unit: string, inputAngularVelocity: number) {
    this._internalTriangleSimLinkMap = new Map<string, number[]>();
    const jointIDToJointIndexMap = new Map<string, number>();
    joints.forEach((j, i) => {
      jointIDToJointIndexMap.set(j.id, i);
    });
    // determine center of mass for link
    // links.forEach((l, i) => {
    //   if (l instanceof ImagLink) {
    //     return;
    //   }
    //   const link = l as RealLink;
    //   const joint1 = l.joints[0];
    //   const joint2 = l.joints[1];
    //   const a = Math.sqrt(Math.pow(joint2.x - link.CoMX, 2) + Math.pow(joint2.y - link.CoMY, 2));
    //   const b = Math.sqrt(Math.pow(joint1.x - link.CoMX, 2) + Math.pow(joint1.y - link.CoMY, 2));
    //   const c = Math.sqrt(Math.pow(joint1.x - joint2.x, 2) + Math.pow(joint1.y - joint2.y, 2));
    //   link.internal_CoM_angle = Math.acos( (Math.pow(b, 2) + (Math.pow(c, 2)) - (Math.pow(a, 2))) / (2 * b * c));
    //   if (isNaN(link.internal_CoM_angle)) {
    //     const angle1 = Math.atan2(link.CoMY - joint1.y, link.CoMX - joint1.x);
    //     const angle2 = Math.atan2(link.CoMY - joint2.y, link.CoMX - joint2.x);
    //     link.internal_CoM_angle = Math.abs(angle1 - angle2);
    //   }
    //   link.internal_distance = b;
    // });
    let increment = 0;
    let simForward = true;
    let falseTwice = 0;
    let inputAngVelDirection = inputAngularVelocity > 0;
    let currentTimeStamp = 0;
    const timeIncrement = 1;
    const inputJoint = joints.find(j => {
      if (!(j instanceof RealJoint)) {return}
      return j.input;
    }) as RealJoint;
    if (inputJoint === undefined) {return}
    const desiredJoint = inputJoint.connectedJoints[0];
    const startingPositionX = desiredJoint.x;
    const startingPositionY = desiredJoint.y;
    const TOLERANCE = 0.008;
    let xDiff = Math.abs(startingPositionX - (Math.round(desiredJoint.x * 100) / 100));
    let yDiff = Math.abs(startingPositionY - (Math.round(desiredJoint.y * 100) / 100));
    // TODO: Put within the mechanism valid joint, link, force, ic positions
    PositionSolver.resetStaticVariables();
    // determine order in which joints are determined
    PositionSolver.determineJointOrder(joints, links);
    while (!simForward || currentTimeStamp === 0 || xDiff > TOLERANCE || yDiff > TOLERANCE) {
      // maybe instead of using simForward, just put in angular Velocity and use that value
      // const [desiredMap, possible] = PositionSolver.determinePositionAnalysis(joints, links, inputAngVelDirection);
      const [desiredMap, possible] = PositionSolver.determinePositionAnalysis(this._joints[currentTimeStamp],
        this._links[currentTimeStamp], inputAngVelDirection);
      if (possible) {
        this._joints.push([]);
        this._links.push([]);
        this._forces.push([]);
        for (const entry of desiredMap.entries()) {
          const joint_index = jointIDToJointIndexMap.get(entry[0]);
          if (joint_index === undefined) {return}
          const joint = joints[joint_index];
          // const joint = this.SimulationJoints.find(j => j.id === entry[0]);
          joint.x = entry[1][0];
          joint.y = entry[1][1];
          this._joints[currentTimeStamp + 1].push(joint as Joint);
        }
        falseTwice = 0;
        currentTimeStamp += timeIncrement;
        // TODO: Create own function to determine this. Probably just utilize tracer joint logic
        // const ffs = this.calculateForces(this.SimulationLinks, this.SimulationForces);
        // increment++;
        // adjust for linkAngle (for center of mass)
        // TODO: arguments passed in has to come from mechanism ICs and not from IC
        // const determined_ics = IcSolver.determineICPositions(ics, joints);
        links.forEach(l => {
          if (l instanceof RealLink) {
            l.determineCenterOfMass(l.joints, 'x');
            l.determineCenterOfMass(l.joints, 'y');
            this._links[currentTimeStamp].push(l as Link);
            // this.determineLinkCoMLocations(links);
          }
        });
      } else {
        if ((!simForward && increment === 0) || (falseTwice === 2)) {
          this.setMechanismInvalid();
          return;
        }
        falseTwice += 1;
        simForward = !simForward;
        inputAngularVelocity = inputAngularVelocity * -1;
        inputAngVelDirection = !inputAngVelDirection;
      }
      xDiff = Math.abs(startingPositionX - (Math.round(desiredJoint.x * 100) / 100));
      yDiff = Math.abs(startingPositionY - (Math.round(desiredJoint.y * 100) / 100));
      if (increment === 750) {
        this.setMechanismInvalid();
        return;
      }
    }
    const hello = 'hi';
  }

  private setMechanismInvalid() {
    // TODO: Set all of the joints, links, force, instant center positions as empty
    this.joints = [[]];
    this.links = [[]];
    this.forces = [[]];
  }


  get internalTriangleSimLinkMap(): Map<string, number[]> {
    return this._internalTriangleSimLinkMap;
  }

  set internalTriangleSimLinkMap(value: Map<string, number[]>) {
    this._internalTriangleSimLinkMap = value;
  }

  get gravity(): boolean {
    return this._gravity;
  }

  set gravity(value: boolean) {
    this._gravity = value;
  }

  get unit(): string {
    return this._unit;
  }

  set unit(value: string) {
    this._unit = value;
  }

  get requiredLoops(): string[] {
    return this._requiredLoops;
  }

  set requiredLoops(value: string[]) {
    this._requiredLoops = value;
  }

  get allLoops(): string[] {
    return this._allLoops;
  }

  set allLoops(value: string[]) {
    this._allLoops = value;
  }

  private static setMechanismInvalid() {
    // TODO: Set all of the joints, links, force, instant center positions as empty
  }
}
