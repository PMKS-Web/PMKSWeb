import { Joint, RealJoint } from './joint';
import { Coord } from './coord';
import { AppConstants } from './app-constants';
import { Force } from './force';
import {
  degToRad,
  determineCenter,
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
  line_line_intersect,
  pullStringWithinString,
  radToDeg,
  roundNumber,
} from './utils';
import hull from 'hull.js/dist/hull.js';
import { SettingsService } from '../services/settings.service';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { Arc, Line } from './line';
import { get, set } from '@angular/fire/database';
import { first, last } from 'rxjs';

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

  public initialExternalLines: Line[] = [];

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

  solveForExternalLines(linkSubset: RealLink[]) {
    linkSubset.forEach((l) => {
      l.reComputeDPath();
    });

    //Populate the parentLink of each external line
    linkSubset.forEach((link) => {
      link.externalLines.forEach((line) => {
        line.parentLink = link;
      });
    });

    //create a list of all the external lines of all links in the subset using reduce()
    let externalLines: Line[] = linkSubset.reduce((acc: Line[], link) => {
      return acc.concat(link.externalLines);
    }, []);

    if (externalLines.length === 0) {
      this.renderError = true;
      return [];
    }

    //For each external line, check for intersections with all other external lines
    for (let i1 = 0; i1 < externalLines.length; i1++) {
      const line = externalLines[i1];
      for (let i = 0; i < externalLines.length; i++) {
        const line2 = externalLines[i];
        if (line === line2) continue;
        //If the lines intersect, split the line into two lines
        let count = 0;
        while (count < 10) {
          const intersection = line.intersectsWith(line2);
          if (!intersection) break;
          const newLine = line.splitAt(intersection);
          const newLine2 = line2.splitAt(intersection);
          if (newLine) {
            line.parentLink?.externalLines.push(newLine);
            externalLines.push(newLine);
          }
          if (newLine2) {
            line2.parentLink?.externalLines.push(newLine2);
            externalLines.push(newLine2);
          }
          count++;
        }
      }
    }

    //We need to find duplicate lines for later
    let duplicateLines: Line[] = [];
    for (const line of externalLines) {
      const duplicateFound = externalLines.find((line2) => {
        return line !== line2 && line2.equals(line);
      });
      const inDuplicateLines = duplicateLines.find((line2) => {
        return line2.equals(line);
      });
      if (duplicateFound && !inDuplicateLines) {
        duplicateLines.push(line);
      }
    }

    // If the line is fully inside another link, then remove it
    externalLines = externalLines.filter((line) => {
      return !linkSubset.some((link) => {
        if (link === line.parentLink) return false;
        return isLineFullyInside(line, link);
      });
    });

    // Duplicate lines are only added if we deteced a gap in the path
    // Check each external line's endpoint, if there is no other line that starts at that point, then we need to add a duplicate line to close the gap
    const newLinesToAdd = [];
    for (let i = 0; i < externalLines.length; i++) {
      const pointToSearch = externalLines[i].endPosition;
      const found = externalLines.find((line2) => {
        return line2.startPosition.equals(pointToSearch);
      });
      if (!found) {
        const lineToAdd = duplicateLines.find((line2) => line2.startPosition.equals(pointToSearch));
        if (lineToAdd) {
          newLinesToAdd.push(lineToAdd);
        }
      }
    }
    externalLines.push(...newLinesToAdd);

    //Remove very short lines
    externalLines = externalLines.filter((line) => {
      return line.startPosition.getDistanceTo(line.endPosition) > 0.09;
    });

    //As a final step, we need to remove one of the duplicate lines from each pair
    let returnExternalLines: Line[] = [];
    externalLines.forEach((line) => {
      if (returnExternalLines.find((line2) => line2.equals(line))) return;
      returnExternalLines.push(line);
    });

    return returnExternalLines;

    function isPointInsideLink(startPosition: Coord, link: RealLink) {
      //Check if the point is inside of the shape created by the lines
      //First, draw a line that is infinitely long and check if it intersects with the shape an odd number of times
      const infiniteLine = new Line(startPosition, new Coord(10000, startPosition.y));

      let intersections = 0;
      link.initialExternalLines.forEach((line) => {
        const intersectionPoint = infiniteLine.intersectsWith(line);
        const otherIntersectionPoint = infiniteLine.clone().reverse().intersectsWith(line);

        //Add two to the intersection count if intersectionPoint and otherIntersectionPoint are not equal
        if (intersectionPoint && otherIntersectionPoint) {
          if (!intersectionPoint.equals(otherIntersectionPoint)) {
            intersections += 2;
          } else {
            intersections += 1;
          }
        } else if (intersectionPoint || otherIntersectionPoint) {
          intersections += 1;
        }
      });

      //If the number of intersections is odd, then the point is inside the shape
      return intersections % 2 === 1;
    }

    function isLineFullyInside(line: Line, link: RealLink): boolean {
      const tempShortenedLine = line.clone().shorten(0.05);

      //First we need to check if both endpoints of the line are inside the link
      if (
        isPointInsideLink(tempShortenedLine.startPosition, link) &&
        isPointInsideLink(tempShortenedLine.endPosition, link)
      ) {
        //If both endpoints are inside the link, then we need to check if the line is fully inside the link
        //To do this, we will check if the line intersects with any of the lines of the link
        return true;
        // return !link.externalLines.some((linkLine) => {
        //   return linkLine.intersectsWith(line);
        // });
      }
      return false;
    }
  }

  getCompoundPathString() {
    this.renderError = false;
    const linkSubset: RealLink[] = this.subset as RealLink[];

    this.externalLines = this.solveForExternalLines(linkSubset);

    //If there are no external lines to draw, then return an empty string
    if (this.externalLines.length === 0) {
      this.renderError = true;
      return '';
    }

    // Shorten all lines (for visual debugging)

    // for (let line of this.externalLines) {
    //   line = line.shorten(0.5);
    // }
    NewGridComponent.debugPoints = [];
    NewGridComponent.debugLines = this.externalLines;

    //Convert external lines to a set so we can keep track of which lines have been used
    const externalLinesSet = new Set(this.externalLines);

    let pathString = '';

    while (externalLinesSet.size > 0) {
      //Pick the first line from the set
      let currentLine: Line = externalLinesSet.values().next().value;
      externalLinesSet.delete(currentLine);

      pathString += 'M ' + currentLine.startPosition.x + ' ' + currentLine.startPosition.y + ' ';
      let veryFirstPoint = currentLine.startPosition.clone();
      while (!currentLine.endPosition.equals(veryFirstPoint)) {
        pathString += currentLine.toPathString();
        //Find the next line that starts at the end of the current line
        const nextLine = [...externalLinesSet].find((line) => {
          return line.startPosition.looselyEquals(currentLine.endPosition);
        });
        if (!nextLine) {
          // this.renderError = true;
          // return '';
          // return pathString;
          break;
        }
        externalLinesSet.delete(nextLine);
        currentLine = nextLine;
      }
      pathString += currentLine.toPathString();
    }
    return pathString;
    //
    // //This should be a line that does not intersect any other lines
    // // let currentLine: Line | undefined = externalLinesToDraw.find((line) => {
    // //   return !externalLinesToDraw.some((otherLine) => {
    // //     if (line === otherLine) return false;
    // //     if (line.next === otherLine) return false;
    // //     if (otherLine.next === line) return false;
    // //     if (line.intersectsWith(otherLine)) {
    // //       console.log('can not use line', line, 'because it intersects with', otherLine);
    // //       return true;
    // //     }
    // //     return false;
    // //   });
    // // });
    //
    // //Convert the external lines to a set of lines so we can keep track of which lines have been used
    // const externalLinesSet = new Set(externalLinesToDraw);
    //
    // function islinesLeft(externalLinesSet: Set<Line>) {
    //   //Check if there are any lines left (not arcs) that have not been used
    //   return Array.from(externalLinesSet).some((line) => {
    //     return !line.isArc;
    //   });
    // }
    //
    // let pathString = '';
    //
    // let counter2 = 0;
    //
    // let currentLine: Line | undefined;
    //
    // while (islinesLeft(externalLinesSet)) {
    //   counter2++;
    //   // if (counter2 > 1) {
    //   //   throw new Error('Outer loop too many interations');
    //   // }
    //   //Set the first line to be a line that does not start in another link
    //   console.log('STARTING WITH THIS SET', externalLinesSet);
    //   currentLine = Array.from(externalLinesSet).find((line) => {
    //     return !linkSubset.some((link) => {
    //       if (link === line.parentLink) return false;
    //       return isPointInsideLink(line.startPosition, link);
    //     });
    //   });
    //
    //   if (currentLine === undefined) {
    //     throw new Error('Could not find a line that does not start in another link');
    //   }
    //
    //   //Remove the current line from the set
    //   externalLinesSet.delete(currentLine);
    //
    //   const veryFirstStartingPoint: Coord = new Coord(
    //     currentLine.startPosition.x,
    //     currentLine.startPosition.y
    //   );
    //
    //   pathString += ` M ${currentLine.startPosition.x} ${currentLine.startPosition.y} `;
    //
    //   let counter = 0;
    //
    //   while (
    //     currentLine.startPosition.getDistanceTo(veryFirstStartingPoint) > 0.00001 ||
    //     counter == 0
    //   ) {
    //     console.log('counter', counter);
    //     console.log('currentLine', currentLine);
    //     //Remove the current line from the set
    //
    //     //If the line intersects with any other lines, then we need to find the intersection point and split the line
    //     //Else we can just move on to the next line
    //     let firstIntersectedLine = findFirstIntersectedLine(currentLine, externalLinesSet);
    //     if (firstIntersectedLine !== undefined) {
    //       console.log('Intersection', firstIntersectedLine);
    //       //Find the intersection point
    //       const intersectionPoint: Coord | undefined =
    //         currentLine.intersectsWith(firstIntersectedLine);
    //
    //       if (intersectionPoint === undefined)
    //         throw new Error(
    //           'Intersection point is undefined despite the fact that the lines intersected'
    //         );
    //
    //       console.log('currentLine', currentLine, 'firstIntersectedLine', firstIntersectedLine);
    //       if (currentLine instanceof Arc && firstIntersectedLine instanceof Arc) {
    //         //Arc to Arc intersection
    //         if (currentLine.center.getDistanceTo(firstIntersectedLine.center) < 0.00001) {
    //           console.log('Skipping drawing the next arc going to line');
    //           pathString += currentLine.toPathString();
    //           //Remove the new arc from the set
    //           externalLinesSet.delete(firstIntersectedLine);
    //           firstIntersectedLine = currentLine.next;
    //         } else {
    //           //Arc to arc by they are not the same joint
    //           //We need to split both arcs into two arcs
    //           const arcToDraw = new Arc(
    //             currentLine.startPosition,
    //             intersectionPoint,
    //             currentLine.center
    //           );
    //           console.log('shortened arc', arcToDraw);
    //           arcToDraw.color = 'brown';
    //           pathString += arcToDraw.toPathString();
    //
    //           currentLine.startPosition = intersectionPoint;
    //
    //           //We also need to split the 2nd arc into two arcs
    //           const arcToSave = new Arc(
    //             firstIntersectedLine.startPosition,
    //             intersectionPoint,
    //             firstIntersectedLine.center
    //           );
    //           console.log('shortened arc', arcToSave);
    //           arcToSave.color = 'brown';
    //           arcToSave.next = firstIntersectedLine.next;
    //
    //           externalLinesSet.add(arcToSave);
    //
    //           firstIntersectedLine.startPosition = intersectionPoint;
    //         }
    //       } else if (currentLine instanceof Line && firstIntersectedLine instanceof Arc) {
    //         //Going from a line to an arc
    //         const lineToDraw = new Line(currentLine.startPosition, intersectionPoint);
    //         pathString += lineToDraw.toPathString();
    //         firstIntersectedLine.startPosition = intersectionPoint;
    //       } else if (currentLine instanceof Arc && firstIntersectedLine instanceof Line) {
    //         const arcToDraw = new Arc(
    //           currentLine.startPosition,
    //           intersectionPoint,
    //           currentLine.center
    //         );
    //         console.log('shortened arc', arcToDraw);
    //         arcToDraw.color = 'brown';
    //         pathString += arcToDraw.toPathString();
    //
    //         //We also need to split the line into two lines
    //         const intersectionPointNudgedToStart = new Coord(
    //           intersectionPoint.x +
    //             (firstIntersectedLine.startPosition.x - intersectionPoint.x) * 0.00001,
    //           intersectionPoint.y +
    //             (firstIntersectedLine.startPosition.y - intersectionPoint.y) * 0.00001
    //         );
    //
    //         const firstLine = new Line(
    //           firstIntersectedLine.startPosition,
    //           intersectionPointNudgedToStart
    //         );
    //         firstLine.color = 'lightblue';
    //         firstLine.parentLink = firstIntersectedLine.parentLink;
    //
    //         firstIntersectedLine.startPosition = intersectionPoint;
    //       } else if (currentLine instanceof Line && firstIntersectedLine instanceof Line) {
    //         //Split the current line into two lines
    //         const firstLine = new Line(currentLine.startPosition, intersectionPoint);
    //
    //         //Make a seccond point that nudeged from the intersection point towards the end point
    //         const nudgedEndPoint = new Coord(
    //           intersectionPoint.x + (currentLine.endPosition.x - intersectionPoint.x) * 0.00001,
    //           intersectionPoint.y + (currentLine.endPosition.y - intersectionPoint.y) * 0.00001
    //         );
    //         const secondLine = new Line(nudgedEndPoint, currentLine.endPosition);
    //
    //         firstLine.parentLink = currentLine.parentLink;
    //         secondLine.parentLink = currentLine.parentLink;
    //
    //         firstLine.next = secondLine;
    //         secondLine.next = currentLine.next;
    //         firstLine.color = 'light' + firstLine.color;
    //         secondLine.color = 'lightblue';
    //
    //         //Add the first line to the path string
    //         pathString += firstLine.toPathString();
    //
    //         //Add the second line to the set as long as it's not fully inside another link (excluding the line's parent)
    //         if (
    //           !linkSubset.some((link) =>
    //             link === secondLine.parentLink ? false : isLineFullyInside(secondLine, link)
    //           )
    //         ) {
    //           externalLinesSet.add(secondLine);
    //         }
    //       }
    //
    //       //Set the next line to the first intersected line
    //       currentLine = firstIntersectedLine;
    //     } else {
    //       console.log('No intersection');
    //       //The line does not intersect with any other lines, so we can just add it to the path string
    //       pathString += currentLine.toPathString();
    //
    //       //Set the next line to be the next line of the line
    //       currentLine = currentLine.next;
    //     }
    //
    //     //If the current line is undefined, then we have reached the end of the path
    //     if (currentLine === undefined) {
    //       console.log('Exisitng inner loop since currentLine is undefined');
    //       break;
    //     }
    //     counter++;
    //     if (counter == 20) {
    //       // For Debugging
    //       console.log(pathString);
    //       return pathString;
    //     }
    //     if (counter > 100) throw new Error('Infinite loop detected');
    //
    //     console.log('removing currentLine', currentLine);
    //     externalLinesSet.delete(currentLine);
    //   }
    //   console.log('REMAINING SET:', externalLinesSet);
    // }
    //
    // //print the last current line
    // // console.log('Drawing Last current line', currentLine);
    // // pathString += currentLine!.toPathString();
    //
    // // pathString += ' Z';
    // console.log('Compound link path complete!: ', pathString);
    // //Return the path string
    // return pathString;

    function findFirstIntersectedLine(
      currentLine: any,
      externalLinesSet: Set<Line>
    ): Line | undefined {
      console.log(
        'Finding first intersected line called with',
        currentLine,
        'and',
        externalLinesSet
      );
      //Note that concentric circles are not considered to intersect

      //Find the first line that intersects with the current line. Find all the intersection points and sort them by distance from the current line's starting point
      let intersectedLines: Map<Line, Coord> = new Map();
      let intersectedArcsWithSameCenter: Line[] = [];
      externalLinesSet.forEach((line) => {
        const intersectionPoint = currentLine.intersectsWith(line);
        if (intersectionPoint) {
          if (line instanceof Arc && currentLine instanceof Arc) {
            if (line.center.getDistanceTo(currentLine.center) < 0.00001) {
              //The two lines are concentric arcs, add to another list
              intersectedArcsWithSameCenter.push(line);
            } else {
              intersectedLines.set(line, intersectionPoint);
            }
          } else if (!(line == currentLine.next || currentLine == line.next)) {
            console.log('line is intersected with current line', line);
            intersectedLines.set(line, intersectionPoint);
          } else {
            console.log('line is adjacent to current line excluding, ', line);
          }
        }
      });

      //if there are any intersections at the startOf this line, then we need to remove them
      intersectedLines.forEach((intersectionPoint, intersectedLine) => {
        if (currentLine.startPosition.getDistanceTo(intersectionPoint) < 0.00001) {
          intersectedLines.delete(intersectedLine);
        }
      });

      console.log('Intersected lines found', intersectedLines, intersectedArcsWithSameCenter);
      //If there are not intersected lines, add the intersected arcs with the same center to the list
      if (intersectedLines.size === 0 && intersectedArcsWithSameCenter.length > 0) {
        console.warn(
          'No intersected lines, there are intersected arcs with the same center',
          intersectedArcsWithSameCenter
        );
        // //We want to sort by the arc that ends closest to the current line's starting point since
        // //this is the most shallow angle that will follow the enternal shape
        intersectedArcsWithSameCenter.sort((a, b) => {
          const aDistance = getDistance(a.endPosition, currentLine.startPosition);
          const bDistance = getDistance(b.endPosition, currentLine.startPosition);
          return aDistance - bDistance;
        });

        //Return the shortest arc
        return intersectedArcsWithSameCenter[0];
      }

      //If there are no intersected lines, then return undefined
      if (intersectedLines.size === 0) return undefined;

      //Sort the intersected lines by distance from the current line's starting point to the intersection point
      const intersectedLinesSorted = Array.from(intersectedLines).sort((a, b) => {
        const aDistance = getDistance(a[1], currentLine.startPosition);
        const bDistance = getDistance(b[1], currentLine.startPosition);
        return aDistance - bDistance;
      });

      //Return the first line in the list
      return intersectedLinesSorted[0][0];
    }
  }

  getPathString(): string {
    const link = this as RealLink;
    // console.error('Get path string called');
    if (link.subset.length == 0) {
      // console.log('Simple path starting for ' + link.id, link);
      return link.getSimplePathString();
    } else {
      // console.log('Compound path starting for ' + link.id, link);
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
    this.renderError = false;

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
        clockWise = coord1.y > point1.y ? '1' : '0';
        if (allJoints.length > 3) {
          clockWise = clockWise == '1' ? '0' : '1';
        }
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
