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
import { Line } from './line';

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

  public externalLines: Line[] = [];

  //For debugging:
  public unqiqueRandomID: string =
    Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

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
      // this.subset = [];
    } else {
      this.subset = subSet;
    }
    this._d = this.getPathString();
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  public reComputeDPath() {
    this._d = this.getPathString();
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  getCompoundPathString() {
    const offset: number = SettingsService.objectScale.value / 4;
    let linkSubset: RealLink[] = this.subset as RealLink[];

    linkSubset.forEach((l) => {
      l.reComputeDPath();
    });
    let path: string = '';

    const allLines: Line[] = generateAllLines(linkSubset);

    let thisLine: Line = pickRandomExternalLine(allLines);
    let nextLine: Line;
    let veryFirstPoint: Coord = thisLine.startPosition;
    console.log(
      'Starting at ' +
        veryFirstPoint.x.toFixed(2) +
        ', ' +
        veryFirstPoint.y.toFixed(2) +
        ' ' +
        thisLine.startJoint.id +
        ' ' +
        thisLine.endJoint.id
    );
    path += 'M ' + veryFirstPoint.x + ' ' + veryFirstPoint.y;
    let penLocation: Coord = new Coord(0, 0);

    let thisLink: RealLink;
    let nextLink: RealLink;

    let counter: number = 0;

    try {
      while (!sameLocation(penLocation, veryFirstPoint) && counter < 5) {
        counter++;
        thisLink = linkContainingAandB(thisLine.startJoint, thisLine.endJoint, linkSubset);
        console.log('thisLink: ' + thisLink.id);
        console.log('thisLine: ' + thisLine.startJoint.id + ' ' + thisLine.endJoint.id);
        console.log('thisLine.endJoint:', thisLine.endJoint);
        if ((thisLine.endJoint as RealJoint).isWelded) {
          console.log(thisLine.endJoint.id + ' is welded');
          nextLink = linkContainingAbutNotB(thisLine.endJoint, thisLine.startJoint, linkSubset);
          console.log('nextLink: ' + nextLink.id);
          console.log(
            'thisLine.endPos: ' +
              thisLine.endPosition.x.toFixed(2) +
              ', ' +
              thisLine.endPosition.y.toFixed(2)
          );
          if (NewGridComponent.isInsideLink(nextLink, thisLine.endPosition)) {
            console.log('thisLine is inside nextLink');
            //Endjoint must inside, this is an internal (<180) intersection
            let intersectionPoint: Coord;
            [intersectionPoint, nextLine] = findInterSectionBetween(thisLine, nextLink, thisLink);
            let arcStartPoint: Coord = offsetAlongLineNotInLink(
              thisLine,
              intersectionPoint,
              nextLink
            );
            let arcEndPoint: Coord = offsetAlongLineNotInLink(
              nextLine,
              intersectionPoint,
              thisLink
            );
            console.log(
              '(Internal) Drawing line to ' +
                arcStartPoint.x.toFixed(2) +
                ', ' +
                arcStartPoint.y.toFixed(2) +
                ' ' +
                thisLine.endJoint.id
            );
            path += 'L ' + arcStartPoint.x + ' ' + arcStartPoint.y;
            nextLine.startPosition = arcEndPoint;
          } else {
            console.log('thisLine is outside nextLink');
            console.log(
              '(External) Drawing line to ' +
                thisLine.endPosition.x.toFixed(2) +
                ', ' +
                thisLine.endPosition.y.toFixed(2) +
                ' ' +
                thisLine.endJoint.id
            );
            //Endjoint must be on link Edge, this is an external (>180) intersection
            path += 'L ' + thisLine.endPosition.x + ' ' + thisLine.endPosition.y;
            nextLine = findClosestLineNotIntersectingLink(thisLine.endJoint, thisLink, nextLink);
          }
        } else {
          //Non-welded joint
          console.log(
            '(Non-Welded) Drawing line to ' +
              thisLine.endPosition.x.toFixed(2) +
              ', ' +
              thisLine.endPosition.y.toFixed(2) +
              ' ' +
              thisLine.endJoint.id
          );

          path += 'L ' + thisLine.endPosition.x + ' ' + thisLine.endPosition.y;
          nextLine = findNextExternalLine(thisLine, thisLink);
        }

        console.log(
          '(Common) Drawing arc to ' +
            nextLine.startPosition.x.toFixed(2) +
            ', ' +
            nextLine.startPosition.y.toFixed(2) +
            ' ' +
            nextLine.startJoint.id +
            ' ' +
            nextLine.endJoint.id
        );

        path +=
          'A ' +
          offset +
          ' ' +
          offset +
          ' 0 0 1 ' +
          nextLine.startPosition.x +
          ' ' +
          nextLine.startPosition.y;
        penLocation = nextLine.startPosition;
        thisLine = nextLine;
      }
      // path += ' Z';
      console.warn('Finished getCompoundPathString');
      return path;
    } catch (error) {
      console.error(error);
      console.error('Error in getCompoundPathString, returning what we have so far');
      // path += ' Z';
      return path;
    }

    function generateAllLines(linkSubset: Link[]) {
      let allLines: Line[] = [];
      linkSubset.forEach((l) => {
        //for each joint of the link, create a line with every other joint
        l.joints.forEach((j) => {
          l.joints.forEach((k) => {
            if (j.id !== k.id) {
              allLines.push(new Line((j.id + k.id).toString(), j, k));
            }
          });
        });
      });
      return allLines;
    }

    function pickRandomExternalLine(allLines: Line[]): Line {
      return allLines[0];
    }

    function sameLocation(penLocation: Coord, veryFirstPoint: Coord) {
      //Refund true if the two points are within 0.01 of each other
      const tolerance = 0.01;
      return (
        Math.abs(penLocation.x - veryFirstPoint.x) < tolerance &&
        Math.abs(penLocation.y - veryFirstPoint.y) < tolerance
      );
    }

    function linkContainingAandB(
      startJoint: Joint,
      endJoint: Joint,
      linkSubset: RealLink[]
    ): RealLink {
      //Filter links that contain both joints, and return the first one (there should only be one)
      return linkSubset.filter((l) => {
        return l.joints.includes(startJoint) && l.joints.includes(endJoint);
      })[0];
    }

    function linkContainingAbutNotB(endJoint: Joint, startJoint: Joint, linkSubset: RealLink[]) {
      //Filter links that contain the endJoint but not the startJoint, and return the first one (there should only be one)
      return linkSubset.filter((l) => {
        return l.joints.includes(endJoint) && !l.joints.includes(startJoint);
      })[0];
    }

    function findInterSectionBetween(
      thisLine: Line,
      nextLink: RealLink,
      thisLink: RealLink
    ): [Coord, Line] {
      //Get all the external lines of the next link
      let nextLinkExternalLines: Line[] = nextLink.externalLines;
      //Check to make sure that the next link has external lines
      if (nextLinkExternalLines.length === 0) {
        throw new Error('The next link has no external lines');
      }

      console.log('NextLinkExternalLines: ', nextLinkExternalLines);
      //For each external line, check to see if it intersects with thisLine
      for (let i = 0; i < nextLinkExternalLines.length; i++) {
        let nextLine: Line = nextLinkExternalLines[i];
        let intersectionPoint: Coord | null = RealLink.getLineIntersection(thisLine, nextLine);
        if (intersectionPoint !== null) {
          console.log('Intersection found between ' + thisLine.id + ' and ' + nextLine.id);
          if (NewGridComponent.isInsideLink(thisLink, nextLine.startPosition)) {
            console.log('Intersection point is inside thisLink, returning nextLine');
            return [intersectionPoint, nextLine];
          }
        }
      }
      //If it doesn't, throw an error
      console.error('No intersection found between ' + thisLine.id + ' and ' + nextLink.id);
      throw new Error('No intersection found');
    }

    function offsetAlongLineNotInLink(line: Line, intersectionPoint: Coord, otherLink: RealLink) {
      //Find two points along this line that is 'offset' distance away from the intersection point
      //Find the one that is not inside the other link

      //First find the two points
      let point1: Coord = new Coord(
        intersectionPoint.x + offset * Math.cos(line.angleRad),
        intersectionPoint.y + offset * Math.sin(line.angleRad)
      );
      let point2: Coord = new Coord(
        intersectionPoint.x - offset * Math.cos(line.angleRad),
        intersectionPoint.y - offset * Math.sin(line.angleRad)
      );

      //Then check to see which one is inside the other link
      if (NewGridComponent.isInsideLink(otherLink, point1)) {
        return point2;
      } else if (NewGridComponent.isInsideLink(otherLink, point2)) {
        return point1;
      } else {
        throw new Error('Neither point is inside the other link');
      }
    }

    function findClosestLineNotIntersectingLink(
      endOfThisLine: Joint,
      thisLink: RealLink,
      nextLink: RealLink
    ): Line {
      //Finds the closest line of the nextLink that does not intersect with thisLink
      //First, get all the external lines of the next link
      let nextLinkExternalLines: Line[] = nextLink.externalLines;
      //Check to make sure that the next link has external lines
      if (nextLinkExternalLines.length === 0) {
        throw new Error('The next link has no external lines');
      }

      //Find the closest line
      let closestLine: Line;
      let closestDistance: number = Number.MAX_VALUE;
      for (let i = 0; i < nextLinkExternalLines.length; i++) {
        let nextLine: Line = nextLinkExternalLines[i];
        //Check to see if the next line intersects with thisLink by checking for all external lines of thisLink
        let intersects: boolean = false;
        thisLink.externalLines.forEach((line) => {
          if (RealLink.getLineIntersection(line, nextLine) !== null) {
            intersects = true;
          }
        });

        if (!intersects) {
          let distance: number = getDistance(endOfThisLine, nextLine.startJoint);
          if (distance < closestDistance) {
            closestLine = nextLine;
            closestDistance = distance;
          }
        }
      }
      if (closestLine! === undefined) {
        throw new Error('No closest line found');
      }
      return closestLine;
    }

    function findNextExternalLine(thisLine: Line, thisLink: RealLink): Line {
      console.log('Looking inside link: ' + thisLink.id + ' for next external line', thisLine);
      //Find the next external line of thisLink that comes after thisLine
      let thisLinkExternalLines: Line[] = thisLink.externalLines;
      //Check to make sure that the next link has external lines
      if (thisLinkExternalLines.length === 0) {
        throw new Error('The next link has no external lines (findNextExternalLine)');
      }
      //Find the index of thisLine
      let thisLineIndex: number = thisLinkExternalLines.indexOf(thisLine);
      if (thisLineIndex === -1) {
        throw new Error('thisLine not found in thisLinkExternalLines');
      }
      //Find the next line
      let nextLineIndex: number = (thisLineIndex + 1) % thisLinkExternalLines.length;
      return thisLinkExternalLines[nextLineIndex];
    }
  }

  getPathString(): string {
    const link = this as RealLink;
    console.error('Getting path string for link: ' + link.id);
    console.log(link);
    console.log(link.subset.length);
    if (link.subset.length == 0) {
      console.log(this.id + ': Link has no subset, getting simple path');
      return link.getSimplePathString();
    } else {
      //Compound link
      console.log(this.id + ': Link has subset, getting compound path');
      return link.getCompoundPathString();
    }
  }

  getSimplePathString(): string {
    this.externalLines = [];
    let l = this;
    // Draw link given the desiredJointIDs
    const allJoints = l.joints;

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
        const [ammendedD, point1, point2] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
        d = ammendedD;
        const lineToAdd = new Line(
          'externalLine',
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
        lineToAdd.startPosition = point1;
        lineToAdd.endPosition = point2;
        this.externalLines.push(lineToAdd);
      } else {
        const k = (i + 2) % desiredJointsIDs.length;
        const [ammendedD, point1, point2] = determineL(
          d,
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[k])!]
        );
        d = ammendedD;
        const lineToAdd = new Line(
          'externalLine',
          allJoints[jointIDtoIndex.get(desiredJointsIDs[i])!],
          allJoints[jointIDtoIndex.get(desiredJointsIDs[j])!]
        );
        lineToAdd.startPosition = point1;
        lineToAdd.endPosition = point2;
        this.externalLines.push(lineToAdd);
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

    this.externalLines.forEach((line) => {
      //Create the corresponding external line that travels in the opposite direction
      const newLine = new Line('oppositeExternalLine', line.endJoint, line.startJoint);
      newLine.startPosition = line.endPosition;
      newLine.endPosition = line.startPosition;
      this.externalLines.push(newLine);
      // console.warn(line, newLine);
    });

    return d;

    function determineL(
      d: string,
      coord1: Joint,
      coord2: Joint,
      coord3?: Joint
    ): [string, Coord, Coord] {
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
      return [d, point1, point2];

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

  static getLineIntersection(thisLine: Line, nextLine: Line): Coord | null {
    const [x, y] = line_intersect(
      thisLine.startPosition.x,
      thisLine.startPosition.y,
      thisLine.endPosition.x,
      thisLine.endPosition.y,
      nextLine.startPosition.x,
      nextLine.startPosition.y,
      nextLine.endPosition.x,
      nextLine.endPosition.y
    );
    if (x === null || y === null) {
      console.warn('Lines do not intersect');
      return null;
    }
    return new Coord(x, y);
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
    console.error('setting subset to:', value, 'for link:', this.id);
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
