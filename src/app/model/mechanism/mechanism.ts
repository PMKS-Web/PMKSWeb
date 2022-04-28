import {Joint, PrisJoint, RealJoint, RevJoint} from "../joint";
import {Piston, Link, RealLink} from "../link";
import {Force} from "../force";
// import {LoopSolver} from "./loop-solver";
import {PositionSolver} from "./position-solver";
// import {IcSolver} from "./ic-solver";
import {InstantCenter} from "../instant-center";
import {LoopSolver} from "./loop-solver";
import {Coord} from "../coord";
import {KinematicsSolver} from "./kinematic-solver";
import {ForceSolver} from "./force-solver";
import {roundNumber} from "../utils";
import {GridComponent} from "../../component/grid/grid.component";

export class Mechanism {
  private _joints: Joint[][] = [[]];
  private _links: Link[][] = [[]];
  private _forces: Force[][] = [[]];
  private _ics: InstantCenter[][] = [[]];
  private _internalTriangleSimLinkMap = new Map<string, number[]>();

  private _gravity: boolean;
  private _unit: string
  private _dof: number;
  private _requiredLoops: string[] = [];
  private _allLoops: string[] = [];

  constructor(joints: Joint[], links: Link[], forces: Force[], ics: InstantCenter[], gravity: boolean, unit: string) {
    // this._joints.push([]);
    // this._links.push([]);
    // this._forces.push([]);

    joints.forEach(j => {
      switch (j.constructor) {
        case RealJoint:
          if (!(j instanceof RealJoint)) {return}
          this._joints[0].push(new RealJoint(j.id, j.x, j.y, j.input, j.ground, j.links, j.connectedJoints));
          break;
        case RevJoint:
          if (!(j instanceof RevJoint)) {return}
          this._joints[0].push(new RevJoint(j.id, j.x, j.y, j.input, j.ground, j.links, j.connectedJoints));
          break;
        case PrisJoint:
          if (!(j instanceof PrisJoint)) {return}
          this._joints[0].push(new PrisJoint(j.id, j.x, j.y, j.input, j.ground, j.links, j.connectedJoints));
          break;
        default:
          break;
      }
    });
    links.forEach(l => {
      switch (l.constructor) {
        case RealLink:
          if (!(l instanceof RealLink)) {return}
          const newLink = new RealLink(l.id, l.joints);
          newLink.shape = l.shape;
          newLink.bound = l.bound;
          newLink.d = l.d;
          newLink.CoM = l.CoM;
          newLink.forces = l.forces;
          this._links[0].push(newLink);
          break;
        case Piston:
          if (!(l instanceof Piston)) {return}
          this._links[0].push(new Piston(l.id, l.joints));
          break;
      }
    });
    forces.forEach(f =>{
      this._forces[0].push(new Force(f.id, f.link, f.startCoord, f.endCoord, f.local, f.arrowOutward, f.mag));
    });
    // joints.forEach(j => { this._joints[0].push(j); });
    // links.forEach(l => { this._links[0].push(l); });
    // forces.forEach(f => { this._forces[0].push(f); });
    // ics.forEach(ic => { this._ics[0].push(ic); });
    this._gravity = gravity;
    this._unit = unit;
    this._dof = this.determineDegreesOfFreedom();
    // no index found for input Joint
    if (this._dof === 1 && joints.findIndex(j => { if (!(j instanceof RealJoint)) {return} return j.input}) !== -1) {
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
      N++;
      // TODO: Account for this case later
      // if (this.determineParallelLinkage(l)) {
      //   N -= l.joints.length - 2;
      //   J1 -= (l.joints.length - 2) * 2;
      // }
    });

    this.joints[0].forEach(j => {
      // TODO: Account for this instance later
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
          if (!(j instanceof  PrisJoint)) {return}
          // N++;
          J1 += j.links.length;
          break;
      }
    });
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

    const connectedJointMapIndices = new Map<string, number[]>();
    this.links[0].forEach(l => {
      const numArray: number[] = [];
      // if (!(l instanceof RealLink)) {return}
      l.joints.forEach(j => {
        const jointIndex = this.joints[0].findIndex(jt => jt.id === j.id);
        numArray.push(jointIndex);
      });
      connectedJointMapIndices.set(l.id, numArray);
    });

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
          const jointCoord = PositionSolver.jointMapPositions.get(j.id)!;
          this._joints[currentTimeStamp + 1].push(new Joint(j.id, jointCoord[0], jointCoord[1]));
        });
        // TODO: Redo the logic here
        this.links[0].forEach((l, l_index) => {
          if (!(l instanceof RealLink)) {return}
          const connectedJointIndices = connectedJointMapIndices.get(l.id)!;
          const connectedJoints: Joint[] = [];
          connectedJointIndices.forEach((ji: number) => {
            connectedJoints.push(this._joints[currentTimeStamp + 1][ji]);
          });
          // const connectedJoints: Joint[] = [];
          // TODO: think of possible way to reduce this if there is time
          // l.joints.forEach(j => {
          //   const joint = this._joints[currentTimeStamp + 1].find(jt => jt.id === j.id);
          //   if (joint === undefined) {return}
          //   connectedJoints.push(joint);
          // });
          const pushLink = new RealLink(l.id, connectedJoints);
          pushLink.shape = l.shape;
          pushLink.bound = RealLink.getBounds(new Coord(connectedJoints[0].x, connectedJoints[0].y),
            new Coord(connectedJoints[1].x, connectedJoints[1].y), l.shape);
          pushLink.d = RealLink.getPointsFromBounds(pushLink.bound, pushLink.shape);
          // TODO: When you insert a joint onto a link, be sure to utilize this function call
          pushLink.CoM = RealLink.determineCenterOfMass(pushLink.joints);
          pushLink.forces = l.forces;
          this._links[currentTimeStamp + 1].push(pushLink);
        });
        // TODO: If forces are a part of links, is all of this info needed? Or just the positions?
        this.forces[0].forEach(f => {
          const link = this._links[currentTimeStamp + 1].find(l => l.id === f.link.id);
          if (link === undefined || (!(link instanceof RealLink))) {return}
          // TODO: Don't have forceMagnitudeMap within Position Solver
          this._forces[currentTimeStamp + 1].push(new Force(
            f.id, link, PositionSolver.forcePositionMap.get(f.id + 'start')!,
            PositionSolver.forcePositionMap.get(f.id + 'end')!, f.local, f.arrowOutward,
            PositionSolver.forceMagnitudeMap.get(f.id + 'x')));
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

  get dof(): number {
    return this._dof;
  }

  set dof(value: number) {
    this._dof = value;
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

  forceTitleRow(analysisType: string) {
    const forceTitleRow = new Array<string>();
    forceTitleRow.push('Current Time');
    let posUnit: string;
    let velUnit: string;
    let accUnit: string;
    let forceUnit: string;
    let torqueUnit: string;
    const angPosUnit = 'deg';
    const angVelUnit = 'rad/s';
    const angAccUnit = 'rad/s^2';
    switch (this._unit) {
      case 'cm':
        posUnit = 'cm';
        velUnit = 'cm/s';
        accUnit = 'cm/s^2';
        forceUnit = 'N';
        torqueUnit = 'N*m';
        break;
      case 'm':
        posUnit = 'm';
        velUnit = 'm/s';
        accUnit = 'm/s^2';
        forceUnit = 'N';
        torqueUnit = 'N*m';
        break;
      default:
        return
      // case 'km':
      //   posUnit = 'km';
      //   forceUnit = 'N';
      //   torqueUnit = 'N*km';
      //   accUnit = 'km/s^2';
      //   break;
      // case 'in':
      //   posUnit = 'in';
      //   forceUnit = 'lbf';
      //   torqueUnit = 'lbf*in';
      //   accUnit = 'in/s^2';
      //   break;
      // case 'ft':
      //   posUnit = 'ft';
      //   forceUnit = 'lbf';
      //   torqueUnit = 'lbf*ft';
      //   accUnit = 'ft/s^2';
      //   break;
    }
    // switch (this._unit) {
    //   case 'Metric':
    //     posUnit = 'cm';
    //     forceUnit = 'N';
    //     torqueUnit = 'N*cm';
    //     accUnit = 'cm/s^2';
    //     break;
    //   case 'English':
    //     posUnit = 'ft';
    //     forceUnit = 'lbm*ft/s^2';
    //     torqueUnit = 'lbm*ft^2/s^2';
    //     accUnit = 'in/s^2';
    //     break;
    // }
    if (analysisType === 'dynamics') {
      // determine kinematic analysis
      KinematicsSolver.requiredLoops = this.requiredLoops;
      // KinematicsSolver.determineKinematics(this.joints, this.links, this.posTSL.TSL[0].angular_velocity);
    }
    ForceSolver.determineDesiredLoopLettersForce(this._requiredLoops);
    ForceSolver.determineForceAnalysis(this.joints[0], this.links[0], analysisType, this.gravity, this.unit);
    for (const entry of ForceSolver.jointIdToJointIndexMap.entries()) {
      forceTitleRow.push('Joint ' + entry[0] + ' Force ' + ' x ' + '(' + forceUnit + ')');
      forceTitleRow.push('Joint ' + entry[0] + ' Force ' + ' y ' + '(' + forceUnit + ')');
    }
    forceTitleRow.push('Torque ' + torqueUnit);
    forceTitleRow.push(' ');
    this.forces[0].forEach(f => {
      forceTitleRow.push('Force ' + f.id + ' x ' + '(' + posUnit + ')');
      forceTitleRow.push('Force ' + f.id + ' y ' + '(' + posUnit + ')');
    });
    forceTitleRow.push(' ');
    switch (analysisType) {
      case 'statics':
        this.joints[0].forEach(j => {
          forceTitleRow.push('Joint ' + j.id + ' x ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' y ' + '(' + posUnit + ')');
        });
        break;
      case 'dynamics':
        this.joints[0].forEach(j => {
          forceTitleRow.push('Joint ' + j.id + ' x ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' y ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Vel x ' + '(' + velUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Vel y ' + '(' + velUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Acc x ' + '(' + accUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Acc y' + '(' + accUnit + ')');
        });
        forceTitleRow.push(' ');
        this.links[0].forEach(l => {
          if (l instanceof Piston) {
            return;
          }
          forceTitleRow.push('Link ' + l.id + ' CoM x ' + posUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM y ' + posUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Vel x ' + velUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Vel y ' + velUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Acc x ' + accUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Acc y ' + accUnit);
        });
        forceTitleRow.push(' ');
        this.links[0].forEach(l => {
          if (l instanceof Piston) {
            return;
          }
          // forceTitleRow.push('Link ' + l.id + ' angPos ' + angAccUnit);
          forceTitleRow.push('Link ' + l.id + ' angPos ' + angPosUnit);
          forceTitleRow.push('Link ' + l.id + ' angVel ' + angVelUnit);
          forceTitleRow.push('Link ' + l.id + ' angAcc ' + angAccUnit);
        });
        break;
    }

    // this.SimulationLinks.forEach(l => {
    //   if (l instanceof ImagLink) {
    //     return;
    //   }
    //   forceTitleRow.push('Link ' + l.id + ' CoM x ' + posUnit);
    //   forceTitleRow.push('Link ' + l.id + ' CoM y ' + posUnit);
    // });

    return forceTitleRow;
  }

  kinematicLoopTitleRow() {
    const kinematicTitleRow = new Array<string>();
    kinematicTitleRow.push('Current Time');
    let posUnit: string;
    let velUnit: string;
    let accUnit: string;
    const angPosUnit = 'degree';
    const angVelUnit = 'rad/s';
    const angAccUnit = 'rad/s^2';
    switch (this._unit) {
      case 'cm':
        posUnit = 'cm';
        velUnit = 'cm/s';
        accUnit = 'cm/s^2';
        break;
      case 'm':
        posUnit = 'm';
        velUnit = 'm/s';
        accUnit = 'm/s^2';
        break;
      // case 'km':
      //   posUnit = 'km';
      //   velUnit = 'km/s';
      //   accUnit = 'km/s^2';
      //   break;
      // case 'in':
      //   posUnit = 'in';
      //   velUnit = 'in/s';
      //   accUnit = 'in/s^2';
      //   break;
      // case 'ft':
      //   posUnit = 'ft';
      //   velUnit = 'ft/s';
      //   accUnit = 'ft/s^2';
      //   break;
    }
    // switch (this._unit) {
    //   case 'Metric':
    //     posUnit = 'cm';
    //     velUnit = 'cm/s';
    //     accUnit = 'cm/s^2';
    //     break;
    //   case 'English':
    //     posUnit = 'in';
    //     velUnit = 'in/s';
    //     accUnit = 'in/s^2';
    //     break;
    // }
    this.joints[0].forEach(j => {
      // if (j instanceof PrisJoint) {
      //   return;
      // }
      kinematicTitleRow.push('Joint ' + j.id + ' x ' + posUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' y ' + posUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' vx ' + velUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' vy ' + velUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' ax ' + accUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' ay ' + accUnit);
    });
    kinematicTitleRow.push(' ');
    this.links[0].forEach(l => {
      // if (l instanceof ImagLink) {
      //   return;
      // }
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'x ' + posUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'y ' + posUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'vx ' + velUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'vy ' + velUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'ax ' + accUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'ay ' + accUnit);
    });
    kinematicTitleRow.push(' ');
    this.links[0].forEach(l => {
      // if (l instanceof ImagLink) {
      //   return;
      // }
      kinematicTitleRow.push('Link ' + l.id + ' angle ' + angPosUnit);
      kinematicTitleRow.push('Link ' + l.id + ' angVel ' + angVelUnit);
      kinematicTitleRow.push('Link ' + l.id + ' angAcc ' + angAccUnit);
    });
    return kinematicTitleRow;
  }

  forceAnalysis(analysisType: string) {
    const forceAnalysis = new Array<Array<string>>();
    let forceUnitConversion: number;
    let torqueUnitConversion: number;
    let posUnitConversion: number;
    let velUnitConversion: number;
    let accUnitConversion: number;
    switch (this._unit) {
      case 'cm':
        forceUnitConversion = 1; // convert from newtons -> newton
        torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
        posUnitConversion = 1;
        velUnitConversion = 1;
        accUnitConversion = 1; // cm/s^2
        break;
      case 'm':
        forceUnitConversion = 1; // convert from newtons -> newton
        torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
        posUnitConversion = 1;
        velUnitConversion = 1;
        accUnitConversion = 1; // cm/s^2
        break;
      // case 'km':
      //   forceUnitConversion = 1; // convert from newtons -> newton
      //   torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
      //   accUnitConversion = 1; // cm/s^2
      //   break;
      // case 'in':
      //   forceUnitConversion = 1; // convert from newtons -> newton
      //   torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
      //   accUnitConversion = 1; // cm/s^2
      //   break;
      // case 'ft':
      //   forceUnitConversion = 1; // convert from newtons -> newton
      //   torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
      //   accUnitConversion = 1; // cm/s^2
      //   break;
    }
    // switch (this._unit) {
    //   case 'Metric':
    //     forceUnitConversion = 1; // convert from newtons -> newton
    //     torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
    //     accUnitConversion = 1; // cm/s^2
    //     break;
    //   case 'English':
    //     forceUnitConversion = 0.2248089431; // convert from newton ->
    //     torqueUnitConversion = 0.73756214728 ; // convert from newton_meter ->
    //     // change this since conversion is starting at cm instead of m
    //     accUnitConversion = 3.2808399;
    //     break;
    // }
    // ForceSolver.resetStaticVariables();
    // Go through each step within the mechanism
    this.joints.forEach((_, index) => {
      // this.insertNewJointPos(tsl);
      const force_row = Array<string>();
      // const A_row = Array<Array<string>>(); // unknown array
      // const B_row = Array<string>(); // known array
      force_row.push((index * 10 * Math.PI / 180).toString());
      // force_row.push((index * tsl.angular_velocity * Math.PI / 180).toString());
      if (analysisType === 'dynamics') {
        // determine kinematic analysis
        KinematicsSolver.requiredLoops = this.requiredLoops;
        KinematicsSolver.determineKinematics(this.joints[index], this.links[index], 10);
      }
      ForceSolver.determineForceAnalysis(this.joints[index], this.links[index], analysisType, this.gravity, this.unit);
      for (let simJointIndex = 0; simJointIndex < this.joints[index].length; simJointIndex++) {
        const joint_id = this.joints[index][simJointIndex].id;
        force_row.push(roundNumber(ForceSolver.unknownVariableForcesMap.get(joint_id)![0] * forceUnitConversion, 3).toString());
        force_row.push(roundNumber(ForceSolver.unknownVariableForcesMap.get(joint_id)![1] * forceUnitConversion, 3).toString());
      }
      force_row.push(roundNumber(ForceSolver.unknownVariableTorque * torqueUnitConversion, 3).toString());
      force_row.push(' ');
      // this.SimulationJoints.forEach(j => {
      //   // force_row.push('(' + j.x.toString() + ',' + j.y.toString() + ')');
      //   force_row.push(j.x.toString());
      //   force_row.push(j.y.toString());
      // });
      // force_row.push(' ');
      // this.SimulationLinks.forEach(l => {
      //   if (l instanceof ImagLink) {
      //     return;
      //   }
      //   const cur_link = l as RealLink;
      //   force_row.push(Simulator.roundToHundredThousandth(cur_link.CoM_x).toString());
      //   force_row.push(Simulator.roundToHundredThousandth(cur_link.CoM_y).toString());
      //   // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.linkCoMMap.get(l.id)[0]).toString());
      //   // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.linkCoMMap.get(l.id)[1]).toString());
      //   // force_row.push('(' + Simulator.roundToHundredThousandth(KinematicsSolver.linkAccMap.get(l.id)[0] * accUnitConversion) +
      //   //   ',' + Simulator.roundToHundredThousandth(KinematicsSolver.linkAccMap.get(l.id)[1] * accUnitConversion) + ')');
      // });
      this.forces[index].forEach(f => {
        force_row.push(roundNumber(f.startCoord.x, 3).toString());
        force_row.push(roundNumber(f.startCoord.y, 3).toString());
        // force_row.push(Simulator.roundToHundredThousandth(f.xLocOfForceOnLink).toString());
        // force_row.push(Simulator.roundToHundredThousandth(f.yLocOfForceOnLink).toString());
      });
      force_row.push(' ');
      switch (analysisType) {
        case 'statics':
          this.joints[index].forEach(j => {
            force_row.push(roundNumber(j.x, 3).toString());
            force_row.push(roundNumber(j.y, 3).toString());
            // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.jointIndexMap.get(j.id)[0] * accUnitConversion).toString());
            // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.jointIndexMap.get(j.id)[1] * accUnitConversion).toString());
          });
          // force_row.push(' ');
          // this.SimulationLinks.forEach(l => {
          //   if (l instanceof ImagLink) {
          //     return;
          //   }
          // force_row.push(Simulator.roundToHundredThousandth())
          // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.linkCoMMap.get(l.id)[0] * accUnitConversion).toString());
          // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.linkCoMMap.get(l.id)[1] * accUnitConversion).toString());
          // });
          // force_row.push(' ');
          break;
        case 'dynamics':
          this.joints[index].forEach(j => {
            force_row.push(roundNumber(j.x,3).toString());
            force_row.push(roundNumber(j.y,3).toString());
            // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.jointIndexMap.get(j.id)[0] * accUnitConversion).toString());
            // force_row.push(Simulator.roundToHundredThousandth(KinematicsSolver.jointIndexMap.get(j.id)[1] * accUnitConversion).toString());
            force_row.push(roundNumber(KinematicsSolver.jointVelMap.get(j.id)![0] * velUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.jointVelMap.get(j.id)![1] * velUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.jointAccMap.get(j.id)![0] * accUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.jointAccMap.get(j.id)![1] * accUnitConversion, 3).toString());
            // force_row.push('(' + Simulator.roundToHundredThousandth(KinematicsSolver.jointAccMap.get(j.id)[0] * accUnitConversion) +
            //   ',' + Simulator.roundToHundredThousandth(KinematicsSolver.jointAccMap.get(j.id)[1] * accUnitConversion) + ')');
          });
          force_row.push(' ');
          this.links[index].forEach(l => {
            if (l instanceof Piston) {
              return;
            }
            force_row.push(roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![0] * posUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![1] * posUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkVelMap.get(l.id)![0] * velUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkVelMap.get(l.id)![1] * velUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAccMap.get(l.id)![0] * accUnitConversion, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAccMap.get(l.id)![1] * accUnitConversion, 3).toString());
            // force_row.push('(' + Simulator.roundToHundredThousandth(KinematicsSolver.linkAccMap.get(l.id)[0] * accUnitConversion) +
            //   ',' + Simulator.roundToHundredThousandth(KinematicsSolver.linkAccMap.get(l.id)[1] * accUnitConversion) + ')');
          });
          force_row.push(' ');
          this.links[index].forEach(l => {
            if (l instanceof Piston) {
              return;
            }
            force_row.push(roundNumber(KinematicsSolver.linkAngPosMap.get(l.id)!, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAngVelMap.get(l.id)!, 3).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAngAccMap.get(l.id)!, 3).toString());
          });
          break;
      }
      forceAnalysis.push(force_row);
    });
    return forceAnalysis;
  }

  kinematicLoopAnalysis() {
    const kinematicAnalysis = Array<Array<string>>();
    // const kinematicAnalysis = Array<Array<number>>();
    // KinematicsSolver.resetVariables();
    this.joints.forEach((_, index) => {
      // const row = Array<number>();
      const row = Array<string>();
      row.push((index * 10 * Math.PI / 180).toString());
      KinematicsSolver.requiredLoops = this.requiredLoops;
      KinematicsSolver.determineKinematics(this.joints[index], this.links[index], 10);
      let posUnitConversion: number;
      let velUnitConversion: number;
      let accUnitConversion: number;
      switch (this._unit) {
        case 'cm':
          posUnitConversion = 1; // cm
          velUnitConversion = 1; // cm/s
          accUnitConversion = 1; // cm/s^2
          break;
        case 'm':
          posUnitConversion = 1; // cm
          velUnitConversion = 1; // cm/s
          accUnitConversion = 1; // cm/s^2
          break;
        // case 'km':
        //   posUnitConversion = 1; // cm
        //   velUnitConversion = 1; // cm/s
        //   accUnitConversion = 1; // cm/s^2
        //   break;
        // case 'in':
        //   posUnitConversion = 1; // cm
        //   velUnitConversion = 1; // cm/s
        //   accUnitConversion = 1; // cm/s^2
        //   break;
        // case 'ft':
        //   posUnitConversion = 1; // cm
        //   velUnitConversion = 1; // cm/s
        //   accUnitConversion = 1; // cm/s^2
        //   break;
      }
      // switch (this._unit) {
      //   case 'Metric':
      //     posUnitConversion = 1; // cm
      //     velUnitConversion = 1; // cm/s
      //     accUnitConversion = 1; // cm/s^2
      //     break;
      //   case 'English':
      //     // change this since conversion is starting at cm instead of m
      //     posUnitConversion = 0.3048;
      //     velUnitConversion = 3.28084;
      //     accUnitConversion = 3.2808399;
      //     break;
      // }

      this.joints[0].forEach(j => {
        // if (j instanceof ImagJoint) {
        //   return;
        // }
        // row.push((this.SimulationJoints[KinematicsSolver.jointIndexMap.get(j.id)].x * posUnitConversion).toString());
        // row.push((this.SimulationJoints[KinematicsSolver.jointIndexMap.get(j.id)].y * posUnitConversion).toString());
        // row.push((KinematicsSolver.jointVelMap.get(j.id)[0] * velUnitConversion).toString());
        // row.push((KinematicsSolver.jointVelMap.get(j.id)[1] * velUnitConversion).toString());
        // row.push((KinematicsSolver.jointAccMap.get(j.id)[0] * accUnitConversion).toString());
        // row.push((KinematicsSolver.jointAccMap.get(j.id)[1] * accUnitConversion).toString());
        row.push(roundNumber(
          this.joints[index][KinematicsSolver.jointIndexMap.get(j.id)!].x * posUnitConversion, 3).toString());
        row.push(roundNumber(
          this.joints[index][KinematicsSolver.jointIndexMap.get(j.id)!].y * posUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.jointVelMap.get(j.id)![0] * velUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.jointVelMap.get(j.id)![1] * velUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.jointAccMap.get(j.id)![0] * accUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.jointAccMap.get(j.id)![1] * accUnitConversion, 3).toString());
      });
      row.push(' ');
      this.links[0].forEach(l => {
        // if (l instanceof ImagLink) {
        //   return;
        // }
        // row.push((KinematicsSolver.linkCoMMap.get(l.id)[0] * posUnitConversion).toString());
        // row.push((KinematicsSolver.linkCoMMap.get(l.id)[1] * posUnitConversion).toString());
        // row.push((KinematicsSolver.linkVelMap.get(l.id)[0] * velUnitConversion).toString());
        // row.push((KinematicsSolver.linkVelMap.get(l.id)[1] * velUnitConversion).toString());
        // row.push((KinematicsSolver.linkAccMap.get(l.id)[0] * accUnitConversion).toString());
        // row.push((KinematicsSolver.linkAccMap.get(l.id)[1] * accUnitConversion).toString());
        row.push(roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![0] * posUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![1] * posUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkVelMap.get(l.id)![0] * velUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkVelMap.get(l.id)![1] * velUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkAccMap.get(l.id)![0] * accUnitConversion, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkAccMap.get(l.id)![1] * accUnitConversion, 3).toString());
      });
      row.push(' ');
      this.links[0].forEach(l => {
        // if (l instanceof ImagLink) {
        //   return;
        // }
        // row.push((KinematicsSolver.linkAngPosMap.get(l.id)).toString());
        // row.push((KinematicsSolver.linkAngVelMap.get(l.id)).toString());
        // row.push((KinematicsSolver.linkAngAccMap.get(l.id)).toString());
        row.push(roundNumber(KinematicsSolver.linkAngPosMap.get(l.id)!, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkAngVelMap.get(l.id)!, 3).toString());
        row.push(roundNumber(KinematicsSolver.linkAngAccMap.get(l.id)!, 3).toString());
      });
      kinematicAnalysis.push(row);
    });
    return kinematicAnalysis;
  }
}
