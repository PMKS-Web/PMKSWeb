import { Joint, PrisJoint, RealJoint } from './joint';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { Force } from './force';
import { degToRad, determineSlope, getAngle, getDistance, radToDeg } from './utils';
import hull from 'hull.js';
import { SettingsService } from '../services/settings.service';
import { Arc, Line } from './line';
import { buildCompoundPath, transformRigidCoord, transformRigidPath } from './compound-link-path';
import { outlineSweepFlag, withoutCollinearVertices } from './outline-winding';

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
  private _name: string = ''; //The name of the link
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

  get name(): string {
    if (this._name === '') {
      return this.id;
    }
    return this._name;
  }

  set name(value: string) {
    this._name = value;
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
  private _fill: string = 'Set Later';
  // private _shape: Shape; //Shape is the shape of the link
  // private _bound: Bound; //The rectengualr area the link is encompassed by
  private _d: string = ''; //SVG path
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
  private _isVisualGeometryCurrent = false;

  public externalLines: Line[] = [];

  public initialExternalLines: Line[] = [];

  //For debugging:
  public unqiqueRandomID: string =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  // TODO: Have an optional argument of forces

  public static debugDesiredJointsIDs: any;
  public lastSelectedSublink: Link | null = null;

  constructor(
    id: string,
    joints: Joint[],
    mass?: number,
    massMoI?: number,
    CoM?: Coord,
    subSet?: Link[],
    visualSource?: RealLink
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
    // setTimeout(() => {
    // this._fill = ColorService.instance.getNextLinkColor();
    // });
    this._fill = '#555555'; //Set later

    if (subSet === undefined || subSet.length === 0) {
      // this.subset = [];
    } else {
      this.subset = subSet;
    }
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    if (
      visualSource?.isVisualGeometryCurrent &&
      visualSource.joints.length >= 2 &&
      this.joints.length >= 2
    ) {
      this.copyVisualGeometryFrom(visualSource);
    } else {
      this._d = this.getPathString();
    }
    this._isVisualGeometryCurrent = true;
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  public reComputeDPath() {
    this._d = this.getPathString();
    this._isVisualGeometryCurrent = true;
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  private copyVisualGeometryFrom(source: RealLink): void {
    const [sourceStart, sourceEnd] = source.joints;
    const [targetStart, targetEnd] = this.joints;
    this._d = transformRigidPath(source.d, sourceStart, sourceEnd, targetStart, targetEnd);
    this.externalLines = this.transformVisualLines(
      source.externalLines,
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd
    );
    this.initialExternalLines = this.transformVisualLines(
      source.initialExternalLines,
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd
    );
  }

  private transformVisualLines(
    lines: Line[],
    sourceStart: Joint,
    sourceEnd: Joint,
    targetStart: Joint,
    targetEnd: Joint
  ): Line[] {
    const transformed = lines.map((line) => {
      const start = transformRigidCoord(
        line.startPosition,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd
      );
      const end = transformRigidCoord(
        line.endPosition,
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd
      );
      let copy: Line;
      if (line instanceof Arc) {
        const center = transformRigidCoord(
          line.center,
          sourceStart,
          sourceEnd,
          targetStart,
          targetEnd
        );
        copy = new Arc(new Coord(...start), new Coord(...end), new Coord(...center));
      } else {
        copy = new Line(new Coord(...start), new Coord(...end));
      }
      copy.color = line.color;
      copy.parentLink = this;
      return copy;
    });
    transformed.forEach((line, index) => {
      line.next = transformed[(index + 1) % transformed.length];
    });
    return transformed;
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  getCompoundPathString(): string {
    // A sealed cylinder's rod welded into this compound is drawn by the skin,
    // above the block; the compound repeating it drew the same bar twice, one
    // copy on the wrong side of the block. The leaf is recognised through its
    // pin: the joint that shares a SliderBlock with a sealed slider.
    const isSealedRodLeaf = (leaf: RealLink) =>
      leaf.joints.length === 2 &&
      leaf.joints.some(
        (joint) =>
          joint instanceof RealJoint &&
          joint.links.some(
            (l) =>
              l instanceof SliderBlock && l.joints.some((j) => j instanceof PrisJoint && j.isSealed)
          )
      );
    const linkSubset = this.subset.filter(
      (link): link is RealLink =>
        link instanceof RealLink && !(this.subset.length > 1 && isSealedRodLeaf(link))
    );
    linkSubset.forEach((link) => link.reComputeDPath());
    const geometry = buildCompoundPath(
      linkSubset.map((link) => link.d),
      SettingsService.objectScale / 4
    );
    this.externalLines = geometry.rings.flatMap((ring) =>
      ring.slice(0, -1).map((point, index) => {
        const next = ring[index + 1];
        const line = new Line(new Coord(point[0], point[1]), new Coord(next[0], next[1]));
        line.parentLink = this;
        return line;
      })
    );
    this.initialExternalLines = this.externalLines.map((line) => line.clone());
    return geometry.path;
  }

  getPathString(): string {
    return this.subset.length === 0 ? this.getSimplePathString() : this.getCompoundPathString();
  }

  getHullPoints(): number[][] {
    const allJoints = this.joints;

    //Convert joints to simple x, y array
    const points = allJoints.map((j) => [j.x, j.y]);
    return hull(points, Infinity) as number[][];
  }

  // whether (x,y) is inside the hull. To calculate this, create a new
  // hull with the point added to allJoints, and determine if the new hull
  // contains the added (x,y) point
  isPointInsideHull(x: number, y: number): boolean {
    let points = this.joints.map((j) => [j.x, j.y]);
    points.push([x, y]);
    const hullPoints = hull(points, Infinity) as number[][];

    let hullContainsPoint = false;
    hullPoints.forEach((point: any) => {
      if (point[0] === x && point[1] === y) {
        hullContainsPoint = true;
      }
    });

    return !hullContainsPoint;
  }

  getSimplePathString(): string {
    this.externalLines = [];
    let l = this;
    // Draw link given the desiredJointIDs
    const allJoints = l.joints;

    //Convert joints to simple x, y array
    const points = allJoints.map((j) => [j.x, j.y]);
    const hullPoints = hull(points, Infinity) as number[][]; //Hull points find the convex hull (largest fence)

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

    let width: number = SettingsService.objectScale / 4;
    // A joint sitting on the line between two others is not a corner of the
    // outline, however defensible it is as a hull vertex: the offset edge would
    // arrive, turn through a semicircle it does not need, and leave along the
    // same line, folding the outline back over itself. Even-odd fill then
    // cancels the doubled region and draws it white, which is the thin white
    // sliver that flickers in and out as a joint is dragged past its neighbours.
    desiredJointsIDs = withoutCollinearVertices(desiredJointsIDs, allJoints, jointIDtoIndex, width);
    let d = '';

    // Which way every corner arc bulges follows from the winding of the outline
    // being traced, and nothing else. It used to be guessed from one coordinate
    // of the first corner and then flipped for links with more than three
    // joints, which is not a property of the outline at all: `hull` does not
    // return a consistent winding, so on the hulls where the guess disagreed
    // the arcs took the short way round the *other* circle and drew a concave
    // notch into every corner instead of rounding it.
    const clockWise = outlineSweepFlag(desiredJointsIDs, allJoints, jointIDtoIndex, width);

    let j: number;
    for (let i = 0; i < desiredJointsIDs.length; i++) {
      j = (i + 1) % desiredJointsIDs.length;
      if (desiredJointsIDs.length === 2) {
        const [updatedD, newLines] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
        d = updatedD;
        this.externalLines = this.externalLines.concat(newLines);
      } else {
        const k = (i + 2) % desiredJointsIDs.length;
        const [updatedD, newLines] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[k])!]
        );
        d = updatedD;
        this.externalLines = this.externalLines.concat(newLines);
      }
    }

    const splitPath = d.split(' ');

    //Get the final joint
    const finalJoint = allJoints[jointIDtoIndex.get(desiredJointsIDs[j!])!];
    let lastPos = this.externalLines[this.externalLines.length - 1].endPosition;
    let startPos = this.externalLines[0].startPosition;
    lastPos = new Coord(lastPos.x, lastPos.y);
    startPos = new Coord(startPos.x, startPos.y);
    d +=
      ' A ' +
      width.toString() +
      ' ' +
      width.toString() +
      ' 0 0 ' +
      clockWise +
      ' ' +
      startPos.x +
      ' ' +
      startPos.y;

    this.externalLines.push(new Arc(lastPos, startPos, finalJoint));

    if (!RealLink.isClockwise(this.externalLines[0], this.CoM)) {
      // console.log('Link is not clockwise');
      this.externalLines.reverse();
      //If the link is not clockwise, reverse the order of the external lines
      for (let i = 0; i < this.externalLines.length; i++) {
        const line = this.externalLines[i];
        //Swap start and end positions
        const temp = line.startPosition;
        line.startPosition = line.endPosition;
        line.endPosition = temp;
        line.resetInitialPosition();
      }
    }

    //Now set the next external line for each line
    this.externalLines.forEach((line, ind) => {
      const nextLine = this.externalLines[(ind + 1) % this.externalLines.length];
      line.next = nextLine;
    });

    this.initialExternalLines = this.externalLines.map((line) => line.clone());

    d += ' Z ';
    return d;

    function determineL(d: string, coord1: Joint, coord2: Joint, coord3?: Joint): [string, Line[]] {
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

      const returnLines: Line[] = [];

      if (d === '') {
        d += 'M ' + point1.x.toString() + ' ' + point1.y.toString();
        d += ' L ' + point2.x.toString() + ' ' + point2.y.toString();
        returnLines.push(new Line(point1, point2));
      } else {
        // The end position is being inserted here
        // Get the last position by splitting the string
        const splitPath = d.split(' ');
        const lastX = splitPath[splitPath.length - 2];
        const lastY = splitPath[splitPath.length - 1];
        const lastPosition = new Coord(Number(lastX), Number(lastY));
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
        //Get the current joint we are arcing around
        const currentJoint = allJoints[jointIDtoIndex.get(coord1.id)!];
        returnLines.push(new Arc(lastPosition, point1, currentJoint));
        returnLines.push(new Line(point1, point2));
      }
      return [d, returnLines];

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
    }
  }

  static isClockwise(l: Line, center: Coord) {
    const lineStart: Coord = l.startPosition;
    const lineEnd: Coord = l.endPosition;

    const vectorStartToCenter = {
      x: center.x - lineStart.x,
      y: center.y - lineStart.y,
    };

    const vectorEndToCenter = {
      x: center.x - lineEnd.x,
      y: center.y - lineEnd.y,
    };

    const crossProduct =
      vectorStartToCenter.x * vectorEndToCenter.y - vectorStartToCenter.y * vectorEndToCenter.x;

    return crossProduct > 0;
  }

  // static getLineIntersection(thisLine: Line, nextLine: Line): Coord | null {
  //   const [x, y] = line_intersect(
  //     thisLine.startPosition.x,
  //     thisLine.startPosition.y,
  //     thisLine.endPosition.x,
  //     thisLine.endPosition.y,
  //     nextLine.startPosition.x,
  //     nextLine.startPosition.y,
  //     nextLine.endPosition.x,
  //     nextLine.endPosition.y
  //   );
  //   if (x === null || y === null) {
  //     return null;
  //   }
  //   return new Coord(x, y);
  // }

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
    this._isVisualGeometryCurrent = true;
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

  get isWelded(): boolean {
    return this.subset.length >= 1;
  }

  updateCoMDs() {
    //This is such a bad way of doing this. Just import the SVG file from the assets folder and use that instead of constructing the exact same thing every time.
    const radius = SettingsService.objectScale * 0.2;
    this._CoM_d1 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x - radius) +
      ' ' +
      this.CoM.y +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      this.CoM.x +
      ' ' +
      (this.CoM.y + radius);
    this._CoM_d2 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y + radius) +
      ' ' +
      `A ${radius} ${radius} 0 0 0` +
      (this.CoM.x + radius) +
      ' ' +
      this.CoM.y;
    this._CoM_d3 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      (this.CoM.x + radius) +
      ' ' +
      this.CoM.y +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      this.CoM.x +
      ' ' +
      (this.CoM.y - radius);
    this._CoM_d4 =
      'M' +
      this.CoM.x +
      ' ' +
      this.CoM.y +
      ' ' +
      this.CoM.x +
      ' ' +
      (this.CoM.y - radius) +
      ' ' +
      `A ${radius} ${radius} 0 0 0 ` +
      (this.CoM.x - radius) +
      ' ' +
      this.CoM.y;
  }

  get subset(): Link[] {
    return this._subset;
  }

  get isVisualGeometryCurrent(): boolean {
    return this._isVisualGeometryCurrent;
  }

  get isCompound(): boolean {
    return this._subset.length > 0;
  }

  set subset(value: Link[]) {
    this._subset = value;
    this._isVisualGeometryCurrent = false;
  }
}

/**
 * The body a slider rides on: a zero-length link joining a PrisJoint to the
 * coincident RevJoint that the sliding link pins to. It is a real body so it can
 * carry mass and take reaction forces, but it has no extent of its own.
 *
 * Named for the block, not the actuator — a hydraulic piston is a different
 * concept built from a prismatic joint, and reusing the word for both would make
 * the codebase ambiguous.
 */
export class SliderBlock extends Link {
  constructor(id: string, joints: Joint[], mass?: number) {
    super(id, joints, mass);
  }
}

// export class BinaryLink extends RealLink {}

// export class NonBinaryLink extends RealLink {}
