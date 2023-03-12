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
  line_intersect,
  pullStringWithinString,
  radToDeg,
  roundNumber,
} from './utils';
import hull from 'hull.js/dist/hull.js';
import { SettingsService } from '../services/settings.service';
import { NewGridComponent } from '../component/new-grid/new-grid.component';

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

export enum editorID {
  b1 = 'b1',
  b2 = 'b2',
  b3 = 'b3',
  b4 = 'b4',
  arrow = 'arrow',
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
  private _fill: string; //The fill color
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

  private colorOptions = [
    '#1a227e',
    // '#283493',
    '#303e9f',
    // '#3948ab',
    // '#3f50b5',
    '#5c6ac0',
    // '#7986cb',
    // '#9fa8da',
    '#c5cae9',
  ];

  // TODO: Have an optional argument of forces

  public static debugDesiredJointsIDs: any;

  constructor(
    id: string,
    joints: Joint[],
    mass?: number,
    massMoI?: number,
    shape?: Shape,
    bound?: Bound,
    CoM?: Coord
  ) {
    super(id, joints, mass);
    // this._mass = mass !== undefined ? mass : 1;
    this._massMoI = massMoI !== undefined ? massMoI : 1;
    // this._shape = shape !== undefined ? shape : Shape.line;
    // this._fill = '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6);
    this._fill = this.colorOptions[Math.floor(Math.random() * this.colorOptions.length)];
    // this._bound =
    //   bound !== undefined
    //     ? bound
    //     : RealLink.getBounds(
    //         new Coord(joints[0].x, joints[0].y),
    //         new Coord(joints[1].x, joints[1].y),
    //         Shape.line
    //       );
    // this._d = RealLink.getPointsFromBounds(this._bound, this._shape);
    this._d = RealLink.getD(this.joints);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  static getBounds(coord1: Coord, coord2: Coord, shape: Shape) {
    let bound: Bound = new (class implements Bound {
      arrow: Coord = new Coord(0, 0);
      b1: Coord = new Coord(coord1.x, coord1.y);
      b2: Coord = new Coord(coord2.x, coord2.y);
      b3: Coord = new Coord(coord2.x, coord2.y);
      b4: Coord = new Coord(coord1.x, coord1.y);
    })();

    const coordDist = getDistance(coord1, coord2);
    const coordAng = getAngle(coord1, coord2);

    if (shape === Shape.line) {
      const xChange = Math.cos(coordAng) * coordDist;
      bound.b1.x += xChange;
      bound.b3.x -= xChange;
      return bound;
    }

    // Adjust p3 and p4 for certain conditions
    function determineRectPoint(ratio: number, p3: Coord, p4: Coord): [p3: Coord, p4: Coord] {
      const distBound = ratio * coordDist; // Math.cos(Math.PI / 6) * dist;
      const xChangeBound = Math.sin(coordAng) * distBound;
      const yChangeBound = Math.cos(coordAng) * distBound;

      p3.x += xChangeBound;
      p3.y -= yChangeBound;
      p4.x += xChangeBound;
      p4.y -= yChangeBound;
      return [p3, p4];
    }

    switch (shape) {
      case Shape.eTriangle: {
        [bound.b3, bound.b4] = determineRectPoint(Math.cos(Math.PI / 6), bound.b3, bound.b4);
        break;
      }
      case Shape.rTriangle: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.rectangle: {
        [bound.b3, bound.b4] = determineRectPoint(1 / 2, bound.b3, bound.b4);
        break;
      }
      case Shape.square: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.circle: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.cShape: {
        [bound.b3, bound.b4] = determineRectPoint(2 / 3, bound.b3, bound.b4);
        break;
      }
      case Shape.tShape: {
        [bound.b3, bound.b4] = determineRectPoint(1, bound.b3, bound.b4);
        break;
      }
      case Shape.lShape: {
        [bound.b3, bound.b4] = determineRectPoint(2 / 3, bound.b3, bound.b4);
        break;
      }
      // case Shape.horizontalLine: {
      //   this.getRectBoundsByRatio(coord1, coord2, 0);
      //   // bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.verticalLine: {
      //   return this.getRectBoundsByRatio(coord1, coord2, 0);
      //   // bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.slantedLineForward: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 0);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.slantedLineBackward: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 0);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.beanShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.eightShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.infinityShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
      // case Shape.customShape: {
      //   bounds = this.getRectBoundsByRatio(refCoord1, refCoord2, 1);
      //   bounds = this.applyPadding(refCoord1, refCoord2, bounds, { padding: SVGSettings.jointRadius * 2 });
      //   break;
      // }
    }

    // Adjust points
    function firstAdjustment(c1: Coord, c2: Coord, angle: number) {
      const dist = getDistance(c1, c2);
      const ang1 = getAngle(c1, c2);
      const angDiff = ang1 - angle;
      return new Coord(Math.cos(angDiff) * dist, Math.sin(angDiff) * dist);
    }

    bound.b1 = firstAdjustment(coord1, bound.b1, coordAng);
    bound.b2 = firstAdjustment(coord1, bound.b2, coordAng);
    bound.b3 = firstAdjustment(coord1, bound.b3, coordAng);
    bound.b4 = firstAdjustment(coord1, bound.b4, coordAng);
    // apply offset
    let leftRightPad: number;
    let topBotPad: number;
    // TODO: Maybe put jointRadius within AppConstants? (Unless it has to be part of grid)
    const jointRadius = 5;

    function offset(offsetX: number, offsetY: number, coord: Coord) {
      coord = new Coord(coord.x + offsetX, coord.y + offsetY);
      return coord;
    }

    switch (shape) {
      case Shape.eTriangle:
        leftRightPad = (5 * 2) / Math.tan(Math.PI / 6);
        topBotPad = (leftRightPad / 2) * Math.sqrt(3);
        bound.b1 = offset(
          -leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b1
        );
        bound.b2 = offset(
          leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b2
        );
        bound.b3 = offset(
          leftRightPad * AppConstants.scaleFactor,
          (5 * 2 - topBotPad * 2) * AppConstants.scaleFactor,
          bound.b3
        );
        bound.b4 = offset(
          -leftRightPad * AppConstants.scaleFactor,
          (5 * 2 - topBotPad * 2) * AppConstants.scaleFactor,
          bound.b4
        );
        break;
      case Shape.rTriangle:
        leftRightPad = (5 * 2) / Math.tan(Math.PI / 8);
        bound.b1 = offset(
          -5 * 2 * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b1
        );
        bound.b2 = offset(
          leftRightPad * AppConstants.scaleFactor,
          5 * 2 * AppConstants.scaleFactor,
          bound.b2
        );
        bound.b3 = offset(
          leftRightPad * AppConstants.scaleFactor,
          -leftRightPad * AppConstants.scaleFactor,
          bound.b3
        );
        bound.b4 = offset(
          -5 * 2 * AppConstants.scaleFactor,
          -leftRightPad * AppConstants.scaleFactor,
          bound.b4
        );
        break;
      case Shape.circle:
        const dx = bound.b2.x - bound.b1.x;
        const dy = bound.b2.y - bound.b1.y;
        const r = Math.sqrt(dx * dx + dy * dy) / AppConstants.scaleFactor;
        bound.b1 = offset(-r * AppConstants.scaleFactor, r * AppConstants.scaleFactor, bound.b1);
        bound.b2 = offset(0, r * AppConstants.scaleFactor, bound.b2);
        bound.b3 = offset(0, 0, bound.b3);
        bound.b4 = offset(-r * AppConstants.scaleFactor, 0, bound.b4);
        break;
    }

    // apply padding
    function padding(pad: number, bound: Bound) {
      bound.b1.x -= pad;
      bound.b1.y += pad;
      bound.b2.x += pad;
      bound.b2.y += pad;
      bound.b3.x += pad;
      bound.b3.y -= pad;
      bound.b4.x -= pad;
      bound.b4.y -= pad;
      return bound;
    }

    switch (shape) {
      case Shape.bar:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.rectangle:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.square:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.circle:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.cShape:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.tShape:
        bound = padding((2 * 5) / 50, bound);
        break;
      case Shape.lShape:
        bound = padding((2 * 5) / 50, bound);
        break;
    }

    // apply final adjustment
    function finalAdjustment(c1: Coord, c2: Coord, angle: number) {
      const d = Math.sqrt(Math.pow(c2.x, 2) + Math.pow(c2.y, 2));
      // const d = getDistance(c1, c2);
      const added_angle = angle + Math.atan2(c2.y, c2.x);
      const rx = d * Math.cos(added_angle);
      const ry = d * Math.sin(added_angle);
      return new Coord(c1.x + rx, c1.y + ry);
    }

    bound.b1 = finalAdjustment(coord1, bound.b1, coordAng);
    bound.b2 = finalAdjustment(coord1, bound.b2, coordAng);
    bound.b3 = finalAdjustment(coord1, bound.b3, coordAng);
    bound.b4 = finalAdjustment(coord1, bound.b4, coordAng);
    return bound;
  }

  static rotateBounds(
    oldJoint1: Coord,
    oldJoint2: Coord,
    newJoint1: Coord,
    newJoint2: Coord,
    oldBound: Bound
  ) {
    const theta =
      Math.atan2(newJoint2.y - newJoint1.y, newJoint2.x - newJoint1.x) -
      Math.atan2(oldJoint2.y - oldJoint1.y, oldJoint2.x - oldJoint1.x);
    const x_diff = newJoint1.x - (Math.cos(theta) * oldJoint1.x - Math.sin(theta) * oldJoint1.y);
    const y_diff = newJoint1.y - (Math.sin(theta) * oldJoint1.x + Math.cos(theta) * oldJoint1.y);

    function determineTransformation(
      oldBound: Coord,
      x_diff: number,
      y_diff: number,
      theta: number
    ) {
      let newCoord = new Coord(0, 0);
      newCoord.x = Math.cos(theta) * oldBound.x - Math.sin(theta) * oldBound.y + x_diff;
      newCoord.y = Math.sin(theta) * oldBound.x + Math.cos(theta) * oldBound.y + y_diff;
      return newCoord;
    }

    let bound: Bound = new (class implements Bound {
      arrow: Coord = new Coord(0, 0);
      b1: Coord = new Coord(0, 0);
      b2: Coord = new Coord(0, 0);
      b3: Coord = new Coord(0, 0);
      b4: Coord = new Coord(0, 0);
    })();

    bound.b1 = determineTransformation(oldBound.b1, x_diff, y_diff, theta);
    bound.b2 = determineTransformation(oldBound.b2, x_diff, y_diff, theta);
    bound.b3 = determineTransformation(oldBound.b3, x_diff, y_diff, theta);
    bound.b4 = determineTransformation(oldBound.b4, x_diff, y_diff, theta);
    return bound;
  }

  static getD(allJoints: Joint[]) {
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
    this.debugDesiredJointsIDs = desiredJointsIDs;

    const jointIDtoIndex = new Map<string, number>();
    allJoints.forEach((j, ind) => {
      jointIDtoIndex.set(j.id, ind);
    });

    let width: number = NewGridComponent.getLinkWidthSettingStaticly();
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

  static getRectBoundsByRatio(refCoord1: Coord, refCoord2: Coord, ratio: number) {
    const x1 = refCoord1.x;
    const y1 = refCoord1.y;
    const x2 = refCoord2.x;
    const y2 = refCoord2.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const rotation = Math.atan2(dy, dx);

    const dist = Math.sqrt(dx * dx + dy * dy);
    const distBound = ratio * dist; // Math.cos(Math.PI / 6) * dist;
    const xChangeBound = Math.sin(rotation) * distBound;
    const yChangeBound = Math.cos(rotation) * distBound;

    const xVal = (x1 + x2 + x1 + x2 + xChangeBound + xChangeBound) / 4;
    const yVal = (y1 + y2 + y2 - yChangeBound + y1 - yChangeBound) / 4;

    return {
      b1: new Coord(x1, y1),
      b2: new Coord(x2, y2),
      b3: new Coord(x2 + xChangeBound, y2 - yChangeBound),
      b4: new Coord(x1 + xChangeBound, y1 - yChangeBound),
      arrow: new Coord(xVal, yVal),
      // arrow: {x: 1, y: 1}
      // arrow: {x: 0, y: 0}
    };
  }

  // static applyPadding(refCoord1: Coord, refCoord2: Coord, bounds: Bound, paddingOptions: PaddingOptions): Bound {
  //   const originalRC = SVGFuncs.getBoundsRelativeCoords(refCoord1, refCoord2, bounds);
  //   if (paddingOptions.offset) {
  //     const keyArray = [editorID.b1, editorID.b2, editorID.b3, editorID.b4, editorID.arrow];
  //     keyArray.forEach(key => {
  //       const val = paddingOptions.offset[key];
  //       if (!val) { return; }
  //       originalRC[key].x += val.x * AppConstants.scaleFactor;
  //       originalRC[key].y += val.y * AppConstants.scaleFactor;
  //     });
  //   }
  //   if (paddingOptions.padding) {
  //     originalRC.b1.x -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b1.y += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b2.x += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b2.y += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b3.x += paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b3.y -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b4.x -= paddingOptions.padding * AppConstants.scaleFactor;
  //     originalRC.b4.y -= paddingOptions.padding * AppConstants.scaleFactor;
  //     // do i have to put info about arrow as well??
  //   }
  //   return SVGFuncs.getBoundsByRelativeCoords(refCoord1, refCoord2, originalRC);
  // }
}

export class Piston extends Link {
  constructor(id: string, joints: Joint[], mass?: number) {
    super(id, joints, mass);
  }
}

// export class BinaryLink extends RealLink {}

// export class NonBinaryLink extends RealLink {}
