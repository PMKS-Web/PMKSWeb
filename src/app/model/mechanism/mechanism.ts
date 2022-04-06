import {Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {ImagLink, Link, RealLink} from "../link";
import {Force} from "../force";
// import {LoopSolver} from "./loop-solver";
import {PositionSolver} from "./position-solver";
import {IcSolver} from "./ic-solver";
import {InstantCenter} from "../instant-center";
import {LoopSolver} from "./loop-solver";
import {Coord} from "../coord";

export class Mechanism {
  private _joints: Joint[][] = [[]];
  private _links: Link[][] = [[]];
  private _forces: Force[][] = [[]];
  private _ics: InstantCenter[][] = [[]];
  private _internalTriangleSimLinkMap = new Map<string, number[]>();

  private _gravity: boolean;
  private _unit: string
  private _requiredLoops: string[] = [];
  private _allLoops: string[] = [];

  constructor(joints: Joint[], links: Link[], forces: Force[], ics: InstantCenter[], gravity: boolean, unit: string) {
    joints.forEach(j => { this._joints[0].push(j); });
    links.forEach(l => { this._links[0].push(l); });
    forces.forEach(f => { this._forces[0].push(f); });
    ics.forEach(ic => { this._ics[0].push(ic); });
    this._gravity = gravity;
    this._unit = unit;
    const dof = this.determineDegreesOfFreedom();
    // no index found for input Joint
    if (dof === 1 && joints.findIndex(j => { if (!(j instanceof RealJoint)) {return} return j.input}) !== -1) {
      [this._allLoops, this._requiredLoops] = LoopSolver.determineLoops(joints, links);
      this.findFullMovementPos();
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
  determineDegreesOfFreedom() {
    let N = 0; // start with 1 to account for ground link
    let J1 = 0;
    const J2 = 0;
    let groundNotFound = true;
    this.links[0].forEach(l => {
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

    this.joints[0].forEach(j => {
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

  private findFullMovementPos() {
    let inputAngularVelocity = 10;
    let simForward = true;
    let falseTwice = 0;
    let inputAngVelDirection = inputAngularVelocity > 0;
    let currentTimeStamp = 0;
    const TOLERANCE = 0.008;
    let max_counter = 0;
    this.joints[0].forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      if (!j.ground) {
        max_counter++;
      }
    });

    PositionSolver.resetStaticVariables();
    PositionSolver.determineJointOrder(this.joints[0], this.links[0]);
    PositionSolver.setUpSolvingForces(this.forces[0]);

    const desiredJointID = PositionSolver.jointNumOrderSolverMap.get(1);
    const desiredJointIndex =this.joints[0].findIndex(j => j.id === desiredJointID);
    if (desiredJointIndex === undefined) {return}
    const desiredJoint = this.joints[0][desiredJointIndex]
    const startingPositionX = desiredJoint.x;
    const startingPositionY = desiredJoint.y;
    let xDiff = Math.abs(startingPositionX - (Math.round(desiredJoint.x * 100) / 100));
    let yDiff = Math.abs(startingPositionY - (Math.round(desiredJoint.y * 100) / 100));

    while (!simForward || currentTimeStamp === 0 || xDiff > TOLERANCE || yDiff > TOLERANCE) {
      const possible = PositionSolver.determinePositionAnalysis(this._joints[currentTimeStamp],
        this._links[currentTimeStamp], this._forces[currentTimeStamp], max_counter, inputAngVelDirection);
      if (possible) {
        this._joints.push([]);
        this._links.push([]);
        this._forces.push([]);
        // Joint order matters at the moment
        this.joints[0].forEach(j => {
          const jointCoord = PositionSolver.jointMapPositions.get(j.id);
          if (jointCoord === undefined) {return}
          this._joints[currentTimeStamp + 1].push(new Joint(j.id, jointCoord[0], jointCoord[1]));
        });
        // TODO: Redo the logic here
        this.links[0].forEach(l => {
          const connectedJoints: Joint[] = [];
          // TODO: think of possible way to reduce this if there is time
          l.joints.forEach(j => {
            const joint = this._joints[currentTimeStamp + 1].find(jt => jt.id === j.id);
            if (joint === undefined) {return}
            connectedJoints.push(joint);
          });
          this._links[currentTimeStamp + 1].push(new RealLink(l.id, connectedJoints));
        });
        this.forces[0].forEach(f => {
          const link = this._links[currentTimeStamp + 1].find(l => l.id === f.link.id);
          if (link === undefined || (!(link instanceof RealLink))) {return}
          this._forces[currentTimeStamp + 1].push(new Force(
            f.id, link, PositionSolver.forcePositionMap.get(f.id + 'start')!, PositionSolver.forcePositionMap.get(f.id + 'end')!, f.local, f.arrowOutward));
        });
        // this.links[0].forEach(l => {
        //   if (l instanceof RealLink) {
        //     l.determineCenterOfMass(l.joints, 'x');
        //     l.determineCenterOfMass(l.joints, 'y');
        //     this._links[currentTimeStamp + 1].push(l as Link);
        //     // this.determineLinkCoMLocations(links);
        //   }
        // });
        // for (const entry of desiredMap.entries()) {
        //   const joint_index = jointIDToJointIndexMap.get(entry[0]);
        //   if (joint_index === undefined) {return}
        //   const joint = joints[joint_index];
        //   // const joint = this.SimulationJoints.find(j => j.id === entry[0]);
        //   joint.x = entry[1][0];
        //   joint.y = entry[1][1];
        //   this._joints[currentTimeStamp + 1].push(joint as Joint);
        // }
        falseTwice = 0;
        currentTimeStamp++;
        // TODO: Create own function to determine this. Probably just utilize tracer joint logic
        // const ffs = this.calculateForces(this.SimulationLinks, this.SimulationForces);
        // adjust for linkAngle (for center of mass)
        // TODO: arguments passed in has to come from mechanism ICs and not from IC
        // const determined_ics = IcSolver.determineICPositions(ics, joints);
      } else {
        if ((!simForward && currentTimeStamp === 0) || (falseTwice === 2)) {
          this.setMechanismInvalid();
          return;
        }
        falseTwice += 1;
        simForward = !simForward;
        inputAngularVelocity = inputAngularVelocity * -1;
        inputAngVelDirection = !inputAngVelDirection;
      }
      xDiff = Math.abs(startingPositionX - (Math.round(this._joints[currentTimeStamp][desiredJointIndex].x * 100) / 100));
      yDiff = Math.abs(startingPositionY - (Math.round(this._joints[currentTimeStamp][desiredJointIndex].y * 100) / 100));
      if (currentTimeStamp === 750) {
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
    this.allLoops = [];
    this.requiredLoops = [];
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

  get joints(): Joint[][] {
    return this._joints;
  }

  set joints(value: Joint[][]) {
    this._joints = value;
  }
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

  get ics(): InstantCenter[][] {
    return this._ics;
  }

  set ics(value: InstantCenter[][]) {
    this._ics = value;
  }
}
