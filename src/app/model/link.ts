import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { Force } from './force';
import {
  degToRad,
  determineSlope,
  determineYIntersect,
  find_slope,
  find_y_intercept,
  findBiggestAngle,
  getAngle,
  getDistance,
  getPosition,
  getXDistance,
  getYDistance,
  insertStringWithinString,
  isLeft,
  line_intersect,
  pullStringWithinString,
  radToDeg,
  roundNumber,
} from './utils';
import hull from 'hull.js/dist/hull.js';
import { SettingsService } from '../services/settings.service';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { BehaviorSubject } from 'rxjs';
import * as path from 'path';
import { Z } from '@angular/cdk/keycodes';

export enum Shape {
  line = 'line',
  bar = 'bar',
  eTriangle = 'eTriangle',
  rTriangle = 'rTriangle',
  rectangle = 'rectangle',
  square = 'square',
  circle = 'circle',
  cShape = 'cShape',
  tShape = 'tShape',
  lShape = 'lShape',
  horizontalLine = 'horizontalLine',
  verticalLine = 'verticalLine',
  slantedLineForward = 'slantedLineForward',
  slantedLineBackward = 'slantedLineBackward',
  beanShape = 'beanShape',
  infinityShape = 'infinityShape',
  eightShape = 'eightShape',
  customShape = 'customShape',
}

export interface Bound {
  b1: Coord;
  b2: Coord;
  b3: Coord;
  b4: Coord;
  arrow: Coord;
}

export class Link {
  private _id: string;
  private _mass: number;
  private _joints: Joint[];
  private _forces: Force[] = [];
  private _showHighlight: boolean = false;
  fixedLocations = [{ id: 'com', label: 'com' }];
  fixedLocation = {
    fixedPoint: 'com',
  };

  constructor(id: string, joints: Joint[], mass?: number) {
    this._id = id;
    this._joints = joints;
    this._mass = mass !== undefined ? mass : 1;
    joints.forEach((j) => {
      this.fixedLocations.push({ id: j.id, label: j.id });
    });
  }

  get showHighlight(): boolean {
    return this._showHighlight;
  }

  set showHighlight(value: boolean) {
    this._showHighlight = value;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    this._id = value;
  }

  get mass(): number {
    return this._mass;
  }

  set mass(value: number) {
    this._mass = value;
  }

  get joints(): Joint[] {
    return this._joints;
  }

  set joints(value: Joint[]) {
    this._joints = value;
  }

  get forces(): Force[] {
    return this._forces;
  }

  set forces(value: Force[]) {
    this._forces = value;
  }
}

export class RealLink extends Link {
  private _fill: string = RealLink.colorOptions[0]; //The fill color
  // private _shape: Shape; //Shape is the shape of the link
  // private _bound: Bound; //The rectengualr area the link is encompassed by
  private _d: string; //SVG path
  // private _mass: number;
  private _massMoI: number; //The value passed in from the linakge table
  private _CoM: Coord; //Same passed in from the linkage table
  private _CoM_d1: string = ''; //
  private _CoM_d2: string = '';
  private _CoM_d3: string = '';
  private _CoM_d4: string = '';

  private _length: number = 0;
  private _angle: number = 0;
  private _subset: Link[] = []; // this is not connectedLinks but links that make up this link

  private static colorOptions = [
    '#0d125a',
    // '#283493',
    '#303e9f',
    // '#3948ab',
    // '#3f50b5',
    '#5c6ac0',
    // '#7986cb',
    // '#9fa8da',
    '#c5cae9',
  ].reverse();

  // TODO: Have an optional argument of forces

  public static debugDesiredJointsIDs: any;

  constructor(
    id: string,
    joints: Joint[],
    mass?: number,
    massMoI?: number,
    CoM?: Coord,
    subSet?: Link[]
  ) {
    super(id, joints, mass);

    // SettingsService.objectScale.subscribe((value) => {
    //   this._d = RealLink.getD(this.joints);
    //   //TODO: Unsubsribe from this when link gets deleted
    // });
    // console.log('new subscription');
    // this._mass = mass !== undefined ? mass : 1;
    this._massMoI = massMoI !== undefined ? massMoI : 1;
    // this._shape = shape !== undefined ? shape : Shape.line;
    // this._fill = '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6);
    // this._fill = RealLink.colorOptions[Math.floor(Math.random() * RealLink.colorOptions.length)];

    //Find the colors of the other links connected
    let colors: string[] = [];
    joints.forEach((j) => {
      //Check if the joint is a real joint
      if (j instanceof RealJoint) {
        //Cast to real joint
        let rj = j as RealJoint;
        rj.links.forEach((l) => {
          if (l.id !== this.id) {
            colors.push((l as RealLink)._fill);
          }
        });
      }
    });

    if (colors.length > 0) {
      //Set the color to the first color that is not already used
      let found = false;
      for (let i = 0; i < RealLink.colorOptions.length; i++) {
        if (!colors.includes(RealLink.colorOptions[i])) {
          this._fill = RealLink.colorOptions[i];
          found = true;
          break;
        }
      }
    } else {
      // console.log('No colors found');
      this._fill = RealLink.colorOptions[0];
    }
    if (subSet === undefined || subSet.length === 0) {
      this._subset = [];
    } else {
      this._subset = subSet;
    }
    this._d = RealLink.getPathString(this);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  public reComputeDPath() {
    this._d = RealLink.getPathString(this);
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  // getCompoundPathPesudoCode(link: Link) {
  //   linkSubset: link[] = link.subset;
  //   path = '';
  //   // startJoint = linkSubset[0].joints[0];
  //   // endJoint = linkSubset[0.joints[1];
  //   // startPoint = determinePointWithNormalOffset(startJoint, pos)
  //   // endPoint = determinePointWithNormalOffset(endJoint, pos)
  //   thisLine = pickRandomExternalLine(linkSubset);
  //   veryFirstPoint = thisLine.startPoint;
  //   path += M to veryFirstPoint
  //
  //   while penLocation != veryFirstPoint{
  //     thisLink = linkContainingAandB(thisLine.startJoint,thisLine.endJoint,linkSubset)
  //     if(thisLine.endJoint is weldedJoint){
  //       nextLink = linkContainingAbutNotB(thisLine.endJoint,thisLine.startJoint,linkSubset)
  //       if(thisLine.endPoint is inside nextLink){
  //         [intersectionPoint, nextLine] = findInterSectionBetween(thisLine,nextLink)
  //         arcStartPoint = offsetAlongLineNotInLink(thisLine,intersectionPoint,nextLink);
  //         arcEndPoint = offsetAlongLineNotInLink(nextLine,intersectionPoint,thisLink);
  //         path += LINE to arcStartPoint
  //         nextLine.startPoint = arcEndPoint
  //       }else(){ //Endjoint must be on link Edge, this is an external (>180) intersection
  //         path += LINE to thisLine.endPoint
  //         nextLine = findClosestLineNotIntersectingLink(endJoint, thisLink, nextLink);
  //       }
  //     }else{ //Non-welded joint
  //       path += LINE to thisLine.endPoint
  //       nextLine = findOtherExternalLine(thisLine, thisLink);
  //     }
  //
  //     path += ARC to nextLine.startPoint
  //     penLocation = nextLine.startPoint
  //     thisLine = nextLine
  //   }
  //   path+= Z
  //   return path
  //
  // }

  static getPathString(l: Link): string {
    const link = l as RealLink;
    if (link.subset.length === 0) {
      return RealLink.getSimplePathString(l);
    } else {
      //Compound link
      return RealLink.getCompoundPathString(l);
    }
  }

  static getCompoundPathString(l: Link): string {
    return '';
  }

  static getSimplePathString(l: Link): string {
    const allJoints = l.joints;

    // Draw link given the desiredJointIDs
    function determineL(d: string, coord1: Joint, coord2: Joint, coord3?: Joint) {
      function determinePoint(angle: number, c1: Coord, c2: Coord, dir: string) {
        // Maybe it is atan2 that is desired...
        if (dir === 'neg') {
          return [
            new Coord(
              width * Math.cos(angle + Math.PI) + c1.x,
              width * Math.sin(angle + Math.PI) + c1.y
            ),
            new Coord(
              width * Math.cos(angle + Math.PI) + c2.x,
              width * Math.sin(angle + Math.PI) + c2.y
            ),
          ];
        } else {
          return [
            new Coord(width * Math.cos(angle) + c1.x, width * Math.sin(angle) + c1.y),
            new Coord(width * Math.cos(angle) + c2.x, width * Math.sin(angle) + c2.y),
          ];
        }
      }

      // find slope between two points
      const m = determineSlope(coord1.x, coord1.y, coord2.x, coord2.y);
      // find normal slope of given slope
      let normal_m: number;
      if (m === 0) {
        normal_m = 99999;
      } else {
        normal_m = -1 / m;
      }

      const normal_angle = Math.atan(normal_m); // in degrees

      // determine the point further away from third point
      let point1: Coord;
      let point2: Coord;

      // TODO: think of better way to create this more universally

      if (coord3 === undefined) {
        if (d === '') {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'neg');
        } else {
          [point1, point2] = determinePoint(normal_angle, coord1, coord2, 'pos');
        }
      } else {
        const [point1a, point1b] = determinePoint(normal_angle, coord1, coord2, 'pos');
        const point1c = new Coord((point1a.x + point1b.x) / 2, (point1a.y + point1b.y) / 2);
        const [point2a, point2b] = determinePoint(normal_angle, coord1, coord2, 'neg');
        const point2c = new Coord((point2a.x + point2b.x) / 2, (point2a.y + point2b.y) / 2);

        if (getDistance(coord3, point1c) > getDistance(coord3, point2c)) {
          [point1, point2] = [point1a, point1b];
        } else {
          [point1, point2] = [point2a, point2b];
        }
      }
      if (d === '') {
        clockWise = coord1.y > point1.y ? '1' : '0';
        if (allJoints.length > 3) {
          clockWise = clockWise == '1' ? '0' : '1';
        }
        d += 'M ' + point1.x.toString() + ' ' + point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
      } else {
        // The end position is being inserted here
        d +=
          ' A ' +
          width.toString() +
          ' ' +
          width.toString() +
          ' 0 0 ' +
          clockWise +
          ' ' +
          point1.x.toString() +
          ' ' +
          point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
      }
      return d;
    }

    //MAIN FUNCTION STARTS HERE
    //MAIN FUNCTION STARTS HERE
    //MAIN FUNCTION STARTS HERE

    //Convert joints to simple x, y array
    const points = allJoints.map((j) => [j.x, j.y]);
    const hullPoints = hull(points, Infinity); //Hull points find the convex hull (largest fence)

    //Match resuling x,y points to joints
    let desiredJointsIDs: string = '';
    hullPoints.forEach((point: any) => {
      const joint = allJoints.find((j) => j.x === point[0] && j.y === point[1]);
      if (joint) desiredJointsIDs += joint.id;
    });

    //Cut off the last once since it is the same as the first
    desiredJointsIDs = desiredJointsIDs.substring(0, desiredJointsIDs.length - 1);

    //This is just for debugging display
    // l.debugDesiredJointsIDs = desiredJointsIDs;
    // RealLink.debugDesiredJointsIDs = desiredJointsIDs;

    const jointIDtoIndex = new Map<string, number>();
    allJoints.forEach((j, ind) => {
      jointIDtoIndex.set(j.id, ind);
    });

    let width: number = SettingsService.objectScale.value / 4;
    let d = '';

    let clockWise = 'Will be set later';

    for (let i = 0; i < desiredJointsIDs.length; i++) {
      const j = (i + 1) % desiredJointsIDs.length;
      if (desiredJointsIDs.length === 2) {
        d = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
      } else {
        const k = (i + 2) % desiredJointsIDs.length;
        d = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[k])!]
        );
      }
    }

    const splitPath = d.split(' ');

    const startX = splitPath[1];
    const startY = splitPath[2];
    d +=
      ' A ' +
      width.toString() +
      ' ' +
      width.toString() +
      ' 0 0 ' +
      clockWise +
      ' ' +
      startX +
      ' ' +
      startY;

    return d;
  }

  static determineCenterOfMass(joints: Joint[]) {
    let com_x = 0;
    let com_y = 0;
    // TODO: Logic isn't exactly right but can change this once other logic is fully finished
    joints.forEach((j) => {
      com_x += j.x;
      com_y += j.y;
    });
    return new Coord(com_x / joints.length, com_y / joints.length);
  }

  get d(): string {
    return this._d;
  }

  set d(value: string) {
    this._d = value;
  }

  get length(): number {
    return this._length;
  }

  set length(value: number) {
    this._length = value;
  }

  get angleRad(): number {
    return this._angle;
  }

  set angleRad(value: number) {
    this._angle = value;
  }

  get angleDeg(): number {
    return radToDeg(this._angle);
  }

  set angleDeg(value: number) {
    this._angle = degToRad(value);
  }

  get fill(): string {
    return this._fill;
  }

  set fill(value: string) {
    this._fill = value;
  }

  get massMoI(): number {
    return this._massMoI;
  }

  set massMoI(value: number) {
    this._massMoI = value;
  }

  get CoM(): Coord {
    return this._CoM;
  }

  set CoM(value: Coord) {
    this._CoM = value;
  }

  get CoM_d1(): string {
    return this._CoM_d1;
  }

  set CoM_d1(value: string) {
    this._CoM_d1 = value;
  }

  get CoM_d2(): string {
    return this._CoM_d2;
  }

  set CoM_d2(value: string) {
    this._CoM_d2 = value;
  }

  get CoM_d3(): string {
    return this._CoM_d3;
  }

  set CoM_d3(value: string) {
    this._CoM_d3 = value;
  }

  get CoM_d4(): string {
    return this._CoM_d4;
  }

  set CoM_d4(value: string) {
    this._CoM_d4 = value;
  }

  updateCoMDs() {
    this._CoM_d1 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x - 0.25) +
      ' ' +
      this.CoM.y +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + 0.25);
    this._CoM_d2 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + 0.25) +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      (this.CoM.x + 0.25) +
      ' ' +
      this.CoM.y;
    this._CoM_d3 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x + 0.25) +
      ' ' +
      this.CoM.y +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - 0.25);
    this._CoM_d4 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - 0.25) +
      ' ' +
      'A0.25 0.25 0 0 0 ' +
      (this.CoM.x - 0.25) +
      ' ' +
      this.CoM.y;
  }

  get subset(): Link[] {
    return this._subset;
  }

  set subset(value: Link[]) {
    this._subset = value;
  }
}

export class Piston extends Link {
  constructor(id: string, joints: Joint[], mass?: number) {
    super(id, joints, mass);
  }
}

// export class BinaryLink extends RealLink {}

// export class NonBinaryLink extends RealLink {}
