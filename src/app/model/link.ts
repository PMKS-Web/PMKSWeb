import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { Force } from './force';
import {
  degToRad,
  determineSlope,
  determineYIntersect,
  euclideanDistance,
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
import { get } from '@angular/fire/database';

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
  public renderError: boolean = true;

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
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this._d = this.getPathString();
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
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

    //Make a set of two lines (Line,Line) that have been drawn already
    let setOfDrawnInterSections = new Set<String>();

    linkSubset.forEach((l) => {
      l.reComputeDPath();
    });
    let path: string = '';

    let thisLine: Line = pickRandomExternalLine(this.subset as RealLink[]);
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

    let isInternal: boolean = false;
    let internalRadius: number = 0;
    let internalLineStart: Coord = new Coord(0, 0);
    try {
      while (!sameLocation(penLocation, veryFirstPoint) && counter < 100) {
        counter++;
        thisLink = linkContainingAandB(thisLine.startJoint, thisLine.endJoint, linkSubset);
        console.log('thisLink: ' + thisLink.id);
        console.log('thisLine: ' + thisLine.startJoint.id + ' ' + thisLine.endJoint.id);
        console.log('thisLine.endJoint:', thisLine.endJoint);

        if (intersectsAnyLine(thisLine, linkSubset)) {
          //Welded or Non-welded Internal
          isInternal = true;
          nextLink = getLinkThatContainsFirstIntersectingLine(thisLine, linkSubset);
          let intersectionPoint: Coord;
          [intersectionPoint, nextLine] = findFirstInterSectionBetween(
            thisLine,
            nextLink,
            thisLink
          );
          // internalRadius = r ≈ A / (π/2 - θ/2)
          // Angle between lines
          const angleBetweenLines =
            Math.atan2(
              nextLine.endPosition.y - nextLine.startPosition.y,
              nextLine.endPosition.x - nextLine.startPosition.x
            ) -
            Math.atan2(
              thisLine.endPosition.y - thisLine.startPosition.y,
              thisLine.endPosition.x - thisLine.startPosition.x
            );

          internalRadius = 1 * Math.tan((Math.PI - angleBetweenLines) / 2);

          //Find the distance from the intersection point to the tangent point.
          let arcOffsetDistance: number = findArcOffsetDistance(
            intersectionPoint,
            thisLine,
            nextLine,
            internalRadius
          );
          let arcStartPoint: Coord = offsetAlongLineNotInLink(
            thisLine,
            intersectionPoint,
            nextLink,
            arcOffsetDistance
          );
          let arcEndPoint: Coord = offsetAlongLineNotInLink(
            nextLine,
            intersectionPoint,
            thisLink,
            arcOffsetDistance
          );

          // // Find the smaller distance between the intersection point the two points
          // let arcStartDistance: number = getDistance(intersectionPoint, arcStartPoint);
          // let arcEndDistance: number = getDistance(intersectionPoint, arcEndPoint);
          // let realArcDistance: number = Math.min(arcStartDistance, arcEndDistance);
          //
          // let realArcRadius = findArcOffsetDistanceInverse(
          //   intersectionPoint,
          //   thisLine,
          //   nextLine,
          //   realArcDistance
          // );
          //
          // console.error('intersectionPoint', intersectionPoint);
          // console.error('arcStart', arcStartPoint);
          // console.error('arcEnd', arcEndPoint);
          // console.error('realArcDistance', realArcDistance);
          // console.error('realArcRadius', realArcRadius);
          // console.error('internalRadius', internalRadius);
          //
          // if (Math.abs(realArcRadius) < Math.abs(internalRadius)) {
          //   console.error(realArcRadius, internalRadius);
          //   arcOffsetDistance = findArcOffsetDistance(
          //     intersectionPoint,
          //     thisLine,
          //     nextLine,
          //     realArcRadius
          //   );
          //   arcStartPoint = offsetAlongLineNotInLink(
          //     thisLine,
          //     intersectionPoint,
          //     nextLink,
          //     arcOffsetDistance
          //   );
          //   arcEndPoint = offsetAlongLineNotInLink(
          //     nextLine,
          //     intersectionPoint,
          //     thisLink,
          //     arcOffsetDistance
          //   );
          //   internalRadius = realArcRadius;
          // }

          console.log(
            '(Intersection) Drawing line to ' +
              arcStartPoint.x.toFixed(2) +
              ', ' +
              arcStartPoint.y.toFixed(2) +
              ' ' +
              thisLine.endJoint.id
          );
          path += 'L ' + arcStartPoint.x + ' ' + arcStartPoint.y;
          internalLineStart = arcEndPoint;
          // nextLine.startPosition = arcEndPoint;
        } else if ((thisLine.endJoint as RealJoint).isWelded) {
          nextLink = linkContainingAbutNotB(thisLine.endJoint, thisLine.startJoint, linkSubset);
          //Welded External
          isInternal = false;
          console.log('thisLine is outside nextLink');
          console.log(
            '(Weleded External) Drawing line to ' +
              thisLine.endPosition.x.toFixed(2) +
              ', ' +
              thisLine.endPosition.y.toFixed(2) +
              ' ' +
              thisLine.endJoint.id
          );
          //Endjoint must be on link Edge, this is an external (>180) intersection
          path += 'L ' + thisLine.endPosition.x + ' ' + thisLine.endPosition.y;
          nextLine = findClosestLineNotIntersectingLink(thisLine, thisLink, nextLink);
        } else {
          //Non-welded External
          isInternal = false;
          console.log(
            '(Non-Welded External) Drawing line to ' +
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

        if (isInternal) {
          path +=
            'A ' +
            internalRadius +
            ' ' +
            internalRadius +
            ' 0 0 0' +
            internalLineStart.x +
            ' ' +
            internalLineStart.y;
          penLocation = internalLineStart;
        } else {
          path +=
            'A ' +
            offset +
            ' ' +
            offset +
            ' 0 0 1' +
            nextLine.startPosition.x +
            ' ' +
            nextLine.startPosition.y;
          penLocation = nextLine.startPosition;
        }
        thisLine = nextLine;
      }
      path += ' Z';
      console.warn('Finished getCompoundPathString');
      this.renderError = false;
      return path;
    } catch (error) {
      console.error(error);
      this.renderError = true;
      console.error('Error in getCompoundPathString, returning what we have so far');
      path += ' Z';
      return path;
      // As a fallback, return the simple path string of each sublink
      // let stringBuilder = '';
      // for (const link of linkSubset) {
      //   stringBuilder += (link as RealLink).getSimplePathString();
      // }
      // console.error(stringBuilder.split(' '));
      // return stringBuilder;
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

    function findArcOffsetDistance(
      intersectionPoint: Coord,
      thisLine: Line,
      nextLine: Line,
      radiusOfCircle: number
    ): number {
      //Finds the distance to offset the arc from the intersection point
      //Find the angle between the two lines
      const angleBetweenLines =
        Math.atan2(
          nextLine.endPosition.y - nextLine.startPosition.y,
          nextLine.endPosition.x - nextLine.startPosition.x
        ) -
        Math.atan2(
          thisLine.endPosition.y - thisLine.startPosition.y,
          thisLine.endPosition.x - thisLine.startPosition.x
        );

      //d = r * tan(θ/2)
      const distanceToTangentThisLine = radiusOfCircle * Math.tan(angleBetweenLines / 2);
      return distanceToTangentThisLine;
    }

    function findArcOffsetDistanceInverse(
      intersectionPoint: Coord,
      thisLine: Line,
      nextLine: Line,
      distanceFromIntersection: number
    ): number {
      //Finds the distance to offset the arc from the intersection point
      //Find the angle between the two lines
      const angleBetweenLines =
        Math.atan2(
          nextLine.endPosition.y - nextLine.startPosition.y,
          nextLine.endPosition.x - nextLine.startPosition.x
        ) -
        Math.atan2(
          thisLine.endPosition.y - thisLine.startPosition.y,
          thisLine.endPosition.x - thisLine.startPosition.x
        );
      console.error('Angle between lines: ' + radToDeg(angleBetweenLines));

      //r = d / 2 sin (α / 2)
      const radiusOfCircle = distanceFromIntersection / (2 * Math.sin(angleBetweenLines / 2));
      return radiusOfCircle;
    }

    function getCombinedLineString(thisLine: Line, line: Line) {
      return thisLine.startJoint.id + thisLine.endJoint.id + line.startJoint.id + line.endJoint.id;
    }

    function intersectsAnyLine(thisLine: Line, linkSubset: RealLink[]): boolean {
      //Return true if this line intersects any other line in the subset
      for (const link of linkSubset) {
        for (const line of link.externalLines) {
          if (line !== thisLine) {
            if (RealLink.getLineIntersection(thisLine, line) !== null) {
              console.log('Intersects ', setOfDrawnInterSections.values());
              if (!setOfDrawnInterSections.has(getCombinedLineString(thisLine, line))) {
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    function pickRandomExternalLine(subLinks: RealLink[]): Line {
      //For every link, loop until we find a line that is external
      for (const mainLink of subLinks) {
        for (const line of mainLink.externalLines) {
          for (const otherLink of subLinks) {
            if (mainLink.id !== otherLink.id) {
              if (
                !isInsideLink(otherLink, line.startPosition) &&
                !(line.startJoint as RealJoint).isWelded
              ) {
                if (RealLink.isClockwise(line, mainLink._CoM)) {
                  return line;
                }
              }
            }
          }
        }
      }

      throw new Error('No clockWise, external lines found. Not sure where to start tracing from');
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

    function getLinkThatContainsFirstIntersectingLine(thisLine: Line, linkSubset: RealLink[]) {
      //Get the link that contains the first line that intersects with thisLine
      let mapOfIntersectingLinksToDistance: Map<RealLink, number> = new Map();
      for (const link of linkSubset) {
        for (const line of link.externalLines) {
          if (line !== thisLine) {
            const intersectionPoint = RealLink.getLineIntersection(thisLine, line);
            if (intersectionPoint !== null) {
              mapOfIntersectingLinksToDistance.set(
                link,
                euclideanDistance(
                  thisLine.startPosition.x,
                  thisLine.startPosition.x,
                  intersectionPoint.x,
                  intersectionPoint.y
                )
              );
            }
          }
        }
      }
      //Find the link that is closest to the start of thisLine
      let closestLink: RealLink;
      let closestDistance = Infinity;
      for (const [link, distance] of mapOfIntersectingLinksToDistance) {
        if (distance < closestDistance) {
          closestDistance = distance;
          closestLink = link;
        }
      }

      if (closestLink! === undefined) {
        throw new Error('No intersecting links found');
      }
      return closestLink;
    }

    function linkContainingAbutNotB(endJoint: Joint, startJoint: Joint, linkSubset: RealLink[]) {
      //Filter links that contain the endJoint but not the startJoint, and return the first one (there should only be one)
      return linkSubset.filter((l) => {
        return l.joints.includes(endJoint) && !l.joints.includes(startJoint);
      })[0];
    }

    function findFirstInterSectionBetween(
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

      let interSectionPointToNextLine = new Map<Coord, Line>();
      //For each external line, check to see if it intersects with thisLine
      for (let i = 0; i < nextLinkExternalLines.length; i++) {
        let nextLine: Line = nextLinkExternalLines[i];
        let intersectionPoint: Coord | null = RealLink.getLineIntersection(thisLine, nextLine);
        if (intersectionPoint !== null) {
          console.log('Intersection found between two lines', thisLine, nextLine);
          //Add the intersection point and the line to the map
          interSectionPointToNextLine.set(intersectionPoint, nextLine);
        }
      }

      //If there are no intersections, throw an error
      if (interSectionPointToNextLine.size === 0) {
        //If it doesn't, throw an error
        console.error('No intersection found between ' + thisLine.id + ' and ' + nextLink.id);
        throw new Error('No intersection found');
      }

      //Find the closest intersection point and the line that it intersects with
      let closestIntersectionPoint: Coord;
      let closestDistance = Infinity;
      let nextLine: Line;
      for (const [intersectionPoint, line] of interSectionPointToNextLine) {
        let distance: number = euclideanDistance(
          thisLine.startPosition.x,
          thisLine.startPosition.y,
          intersectionPoint.x,
          intersectionPoint.y
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIntersectionPoint = intersectionPoint;
          nextLine = line;
        }
      }

      //Add to the set of lines that have been drawn
      setOfDrawnInterSections.add(getCombinedLineString(thisLine, nextLine!));
      setOfDrawnInterSections.add(getCombinedLineString(nextLine!, thisLine));
      return [closestIntersectionPoint!, nextLine!];
    }

    function forcePointToBeOnLine(point: Coord, line: Line) {
      //Ensure that the point is located on the line, if not, move it to the closest point on the line
      if (point.x < Math.min(line.startPosition.x, line.endPosition.x)) {
        point.x = Math.min(line.startPosition.x, line.endPosition.x);
      } else if (point.x > Math.max(line.startPosition.x, line.endPosition.x)) {
        point.x = Math.max(line.startPosition.x, line.endPosition.x);
      }

      if (point.y < Math.min(line.startPosition.y, line.endPosition.y)) {
        point.y = Math.min(line.startPosition.y, line.endPosition.y);
      } else if (point.y > Math.max(line.startPosition.y, line.endPosition.y)) {
        point.y = Math.max(line.startPosition.y, line.endPosition.y);
      }

      return point;
    }

    function offsetAlongLineNotInLink(
      line: Line,
      intersectionPoint: Coord,
      otherLink: RealLink,
      arcOffset: number
    ) {
      //Find two points along this line that is 'offset' distance away from the intersection point
      //Find the one that is not inside the other link

      //First find the two points
      let point1: Coord = new Coord(
        intersectionPoint.x + arcOffset * Math.cos(line.angleRad),
        intersectionPoint.y + arcOffset * Math.sin(line.angleRad)
      );
      let point2: Coord = new Coord(
        intersectionPoint.x - arcOffset * Math.cos(line.angleRad),
        intersectionPoint.y - arcOffset * Math.sin(line.angleRad)
      );

      let point1Nudge: Coord = new Coord(
        intersectionPoint.x + 0.05 * Math.cos(line.angleRad),
        intersectionPoint.y + 0.05 * Math.sin(line.angleRad)
      );
      let point2Nudge: Coord = new Coord(
        intersectionPoint.x - 0.05 * Math.cos(line.angleRad),
        intersectionPoint.y - 0.05 * Math.sin(line.angleRad)
      );

      //Then check to see which one is inside the other link
      if (isInsideLink(otherLink, point1Nudge)) {
        return forcePointToBeOnLine(point2, line);
      } else if (isInsideLink(otherLink, point2Nudge)) {
        return forcePointToBeOnLine(point1, line);
      } else {
        throw new Error('Neither point is inside the other link');
      }
    }

    function isInsideLink(simpleLink: Link, coord: Coord): boolean {
      console.log(
        'isInsideLinkCalled with: ',
        simpleLink.id,
        coord.x.toFixed(2),
        coord.y.toFixed(2)
      );

      //Check if the point is inside this shape by first extracting all the line segments from the path of the link
      const externalLines = (simpleLink as RealLink).externalLines;
      //Filter out the lines that are mirrros
      const filteredLines = externalLines.filter((line) => line.isMirror === false);

      //These lines aren't connected, so we need to connect them by adding more lines
      const finalLines: Line[] = [];
      for (let i = 0; i < filteredLines.length; i++) {
        const line = filteredLines[i];
        const nextLine = filteredLines[(i + 1) % filteredLines.length];
        finalLines.push(line);
        const newLine = new Line('ConnectingLine', line.endJoint, nextLine.startJoint);
        newLine.startPosition = line.endPosition;
        newLine.endPosition = nextLine.startPosition;
        finalLines.push(newLine);
      }

      // console.log('finalLines: ', finalLines);

      //Check if the point is inside of the shape created by the lines
      //First, draw a line that is infinitely long and check if it intersects with the shape an odd number of times
      const infiniteLine = new Line('InfiniteLine', new Joint('NA', 0, 0), new Joint('NA', 0, 0));
      infiniteLine.startPosition = coord;
      infiniteLine.endPosition = new Coord(10000, coord.y);

      let intersections = 0;
      for (const line of finalLines) {
        if (RealLink.getLineIntersection(infiniteLine, line) != null) {
          intersections++;
        }
      }

      return intersections % 2 === 1;

      //I tried using the SVG.isPointInFill() method, but it doesn't work since it relies on the rendering of the SVG, which is not updated until the next animation frame
      // //Use the SVG.isPointInFill() method to check if the point is inside the link
      // const linkSVG = document.getElementById(
      //   'sub_' + simpleLink.id
      // ) as unknown as SVGGeometryElement;
      // console.log('found SVGElement', linkSVG);
      //
      // if (linkSVG == null) {
      //   console.log('linkSVG is null in isInsideLink');
      //   return false;
      // }
      //
      // const isInFill = linkSVG.isPointInFill(new DOMPoint(coord.x, coord.y));
      // const isInStroke = linkSVG.isPointInStroke(new DOMPoint(coord.x, coord.y));
      // console.log('isPointInFill: ', isInFill);
      // console.log('isPointInStroke: ', isInStroke);
      // return isInFill && !isInStroke;
    }

    function findClosestLineNotIntersectingLink(
      thisLine: Line,
      thisLink: RealLink,
      nextLink: RealLink
    ): Line {
      //Finds the closest line of the nextLink that does not intersect with thisLink, if it can't find one, return thisLink's closest line
      //First, get all the external lines of the next link
      let thisLinkAndNextLinkExtLines: Line[] = nextLink.externalLines;
      //Check to make sure that the next link has external lines
      if (thisLinkAndNextLinkExtLines.length === 0) {
        throw new Error('The next link has no external lines');
      }

      //Also look in thisLink's external lines
      thisLinkAndNextLinkExtLines = thisLinkAndNextLinkExtLines.concat(thisLink.externalLines);
      console.log('(WeldExt) All lines: ', thisLinkAndNextLinkExtLines);
      console.log('(WeldExt) thisLine: ', thisLine.endPosition);
      //Find the closest line
      let closestLine: Line;
      let closestDistance: number = Number.MAX_VALUE;
      for (let i = 0; i < thisLinkAndNextLinkExtLines.length; i++) {
        let nextLine: Line = thisLinkAndNextLinkExtLines[i];

        if (nextLine === thisLine) {
          console.log('(WeldExt) Ignoring nextline, ', nextLine);
          continue;
        }

        let distance: number = getDistance(thisLine.endPosition, nextLine.startPosition);
        console.log(nextLine, distance);
        if (distance < closestDistance) {
          closestLine = nextLine;
          closestDistance = distance;
        }
      }
      if (closestLine! === undefined) {
        throw new Error(
          'Could not find a line that does not intersect with thisLink or nextLink in (welded external)'
        );
      }
      console.log('(WeldExt) Selected closest line: ', closestLine);
      return closestLine;
    }

    function findNextExternalLine(thisLine: Line, thisLink: RealLink): Line {
      console.log(
        'Looking inside link: ' + thisLink.id + ' for next external line',
        thisLine,
        thisLink
      );
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
      //Find the closest line that is not thisLine
      let distanceToNextLine: number = Number.MAX_VALUE;
      let nextLineIndex: number = -1;
      for (let i = 0; i < thisLinkExternalLines.length; i++) {
        if (i === thisLineIndex) {
          continue;
        }
        let line: Line = thisLinkExternalLines[i];
        let distance: number = getDistance(thisLine.endPosition, line.startPosition);
        if (distance < distanceToNextLine && distance !== 0) {
          distanceToNextLine = distance;
          nextLineIndex = i;
        }
      }
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

    if (RealLink.isClockwise(this.externalLines[0], this.CoM)) {
      console.error('Clockwise');
    } else {
      console.error('Counter clockwise');
      this.externalLines.forEach((line) => {
        //Swap start and end positions
        const temp = line.startPosition;
        line.startPosition = line.endPosition;
        line.endPosition = temp;
        //Same for joints
        const temp2 = line.startJoint;
        line.startJoint = line.endJoint;
        line.endJoint = temp2;
      });
    }

    d += ' Z ';

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
