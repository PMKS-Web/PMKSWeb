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
  insertStringWithinString, isLeft,
  line_intersect,
  pullStringWithinString,
  radToDeg,
  roundNumber,
} from './utils';
import hull from 'hull.js/dist/hull.js';
import { SettingsService } from '../services/settings.service';
import { NewGridComponent } from '../component/new-grid/new-grid.component';
import { BehaviorSubject } from 'rxjs';

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
    subSet?: RealLink[]
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
    this._d = RealLink.getD(this, this.subset);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    this._CoM = CoM !== undefined ? CoM : RealLink.determineCenterOfMass(joints);
    this.updateCoMDs();
    this.updateLengthAndAngle();
  }

  public reComputeDPath() {
    this._d = RealLink.getD(this, this.subset);
  }

  updateLengthAndAngle() {
    this._length = getDistance(this.joints[0], this.joints[1]);
    this._angle = getAngle(this.joints[0], this.joints[1]);
    // console.warn(this._length, this._angle);
  }

  static getD(link: Link, linkSubsets: Link[]) {
    let d = '';
    let d_list: string[] = [];
    const subsetToLinkIndexMap = new Map<string, number>();
    const countToDesiredLinkOrderMap = new Map<number, string>();

    function determineD(l: Link) {
      const allJoints = l.joints;
      // Draw link given the desiredJointIDs
      function determineL(d: string, coord1: Joint, coord2: Joint, coord3?: Joint) {
        function determinePoint(angle: number, c1: Coord, c2: Coord, dir: string) {
          // Maybe it is atan2 that is desired...
          if (dir === 'neg') {
            return [
              new Coord(
                  width * Math.cos(angle + Math.PI) + c1.x, width * Math.sin(angle + Math.PI) + c1.y
              ),
              new Coord(
                  width * Math.cos(angle + Math.PI) + c2.x, width * Math.sin(angle + Math.PI) + c2.y
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

    if (linkSubsets.length === 0) {
      return determineD(link);
    }
    const realLink = link as RealLink;
    const joints: Joint[] = [];
    realLink.joints.forEach(j => {
      if (!(j instanceof RealJoint)) {return}
      joints.push(new RealJoint(j.id, j.x, j.y, j.input, j.ground, j.links, j.connectedJoints));
    });
    const parsedLink = new RealLink(realLink.id, joints, realLink.mass, realLink.massMoI, realLink.CoM, []);
    linkSubsets.forEach(l => {
      l.joints.forEach(j => {
        if (!(j instanceof RealJoint)) {
          return
        }
        if (j.links.length === 1) {
          const index = parsedLink.joints.findIndex(jt => jt.id === j.id);
          parsedLink.joints.splice(index, 1);
          parsedLink.id = parsedLink.id.replace(j.id, '');
        }
      });
    });
    d = determineD(parsedLink);
    linkSubsets.forEach((l, indexNum) => {
      subsetToLinkIndexMap.set(l.id, indexNum);
      d_list.push(determineD(l));
    });
    let count = 0;

    // Now that all link's have drawing, now find how each subset connect and connect the drawings accordingly
    function determineJointOrder(prev_link: Link, cur_link: Link) {
      cur_link.joints.forEach(j => {
        if (!(j instanceof RealJoint)) {
          return;
        }
        if (j.links.length === 1) {
          return
        }
        const next_link = j.links[0].id === cur_link.id ? j.links[1] : j.links[0];
        if (next_link.id !== prev_link.id) {
          // countToDesiredLinkOrderMap.set(count, cur_link.id);
          countToDesiredLinkOrderMap.set(count, next_link.id);
          count = count + 1;
          determineJointOrder(cur_link, next_link);
        }
      });
    }

    determineJointOrder(link, link);
    // find linkPath based on connection based on link joints

    // TODO: In the future, be sure to add the desired fillets
    function updateD(d: string, d_list: string) {
      let [currentPath, indexToLetterMap, indexToIndexMap, numLines] = findDMap(d_list)

      function findDMap(d_list: string) : [string[], Map<number, string>, Map<number, number>, number] {
        const currentPath = d_list.split(' ');
        const indexToLetterMap = new Map<number, string>();
        const indexToIndexMap = new Map<number, number>();
        let numLines = 0;
        for (let i = 0; i < currentPath.length; i++) {
          if (currentPath[i][0] === 'M' || currentPath[i][0] === 'L' || currentPath[i][0] === 'A') {
            indexToLetterMap.set(numLines, currentPath[i][0]);
            indexToIndexMap.set(numLines, i);
            numLines = numLines + 1;
          }
        }
        return [currentPath, indexToLetterMap, indexToIndexMap, numLines];
      }


      // Functions obtained from chatGPT
      interface BezierCurve {
        start: Coord;
        control1: Coord;
        control2: Coord;
        end: Coord;
      }

      interface Line {
        start: Coord;
        end: Coord;
      }

      // TODO: Delete this if using arcs instead of bezier curves
      function bezierCurvePoint(t: number, p0: Coord, p1: Coord, p2: Coord, p3: Coord): Coord {
        const x = (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x;
        const y = (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y;
        return new Coord(x, y);
      }

      function quadraticRoots(coefficients: number[]): number[] {
        const a = coefficients[0];
        const b = coefficients[1];
        const c = coefficients[2];

        const discriminant = b * b - 4 * a * c;

        if (discriminant < 0) {
          return [];
        } else if (discriminant === 0) {
          return [-b / (2 * a)];
        } else {
          const sqrtDiscriminant = Math.sqrt(discriminant);
          return [(-b + sqrtDiscriminant) / (2 * a), (-b - sqrtDiscriminant) / (2 * a)];
        }
      }

      function cubicRoots(coefficients: number[]): number[] {
        const a = coefficients[0];
        const b = coefficients[1];
        const c = coefficients[2];
        const d = coefficients[3];

        if (Math.abs(a) < Number.EPSILON) {
          return quadraticRoots([b, c, d]);
        }

        const delta0 = b ** 2 - 3 * a * c;
        const delta1 = 2 * b ** 3 - 9 * a * b * c + 27 * a ** 2 * d;
        const C = ((delta1 + Math.sqrt(delta1 ** 2 - 4 * delta0 ** 3)) / 2) ** (1 / 3);
        const x1 = (-1 / (3 * a)) * (b + C + delta0 / C);
        const x2 = (-1 / (3 * a)) * (b - (1 + Math.sqrt(-3)) * C + (delta0 / C));
        const x3 = (-1 / (3 * a)) * (b - (1 - Math.sqrt(-3)) * C + (delta0 / C));

        return [x1, x2, x3];
      }

      // TODO: Maybe use the logic within utils after testing...
      function lineCurveIntersection(line: Line, curve: BezierCurve): [boolean, Coord] {
        const p0 = line.start;
        const p1 = line.end;
        const p2 = curve.start;
        const p3 = curve.control1;
        const p4 = curve.control2;
        const p5 = curve.end;

        const epsilon = 0.0001; // Tolerance for floating point errors
        const results: Coord[] = [];

        // Convert the line to the form y = mx + b
        const m = (p1.y - p0.y) / (p1.x - p0.x);
        const b = p0.y - m * p0.x;

        // Solve for the intersection of the line and the Bezier curve
        const a = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
        const b1 = 3 * p0.y - 6 * p1.y + 3 * p2.y;
        const c = -3 * p0.y + 3 * p1.y;
        const d = p0.y - b;
        const cubicCoefficients = [a, b1, c, d];
        const roots = cubicRoots(cubicCoefficients);

        roots.forEach((t: number) => {
          if (t < 0 || t > 1) {
            return;
          }
          const pointOnCurve = bezierCurvePoint(t, p2, p3, p4, p5);
          const x = pointOnCurve.x;
          const y = m * x + b;
          if (y < Math.min(p0.y, p1.y) - epsilon || y > Math.max(p0.y, p1.y) + epsilon) {
            return;
          }
          results.push(new Coord(x, y));
        });
        if (results.length !== 0) {
          return [true, results[0]];
        }
        return [false, new Coord(0,0)];
        // return results;
      }

      // TODO: Maybe use the logic within utils after testing...
      function lineLineIntersection(line1: Line, line2: Line): [boolean, Coord] {
        const x1 = line1.start.x, y1 = line1.start.y;
        const x2 = line1.end.x, y2 = line1.end.y;
        const x3 = line2.start.x, y3 = line2.start.y;
        const x4 = line2.end.x, y4 = line2.end.y;

        const det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

        if (Math.abs(det) < Number.EPSILON) {
          // The lines are parallel or coincident.
          return [false, new Coord(0,0)];
        }

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / det;

        return [true, new Coord(x1 + t * (x2 - x1), y1 + t * (y2 - y1))];
      }

      //
      let cNum = 0;
      let lNum = 0;
      for (let i = 1; i < numLines; i++) {
        let condition: boolean;
        let intersect1: Coord;
        let intersect2: Coord;
        let path1: BezierCurve|Line;
        let path2: BezierCurve|Line;
        let cur_path: BezierCurve|Line;
        const letter = indexToLetterMap.get(i);
        const numIndex = indexToIndexMap.get(i)!;
        switch (letter) {
          case 'L':
            cur_path = {
              start: new Coord(Number(currentPath[numIndex - 2]), Number(currentPath[numIndex - 1])),
              end: new Coord(Number(currentPath[numIndex + 1]), Number(currentPath[numIndex + 2]))
            };
            lNum = lNum + 1;
          function determineLinePathIntersection(line1: Line, d: string): [boolean, Coord, Coord, BezierCurve|Line, BezierCurve|Line] {
            // get a line or curve from d and check if it intersects with the line
            // TODO: Make sure to use path within d_list and not within d
            let [currentPath, indexToLetterMap, indexToIndexMap, numLines] = findDMap(d)
            let storedIntersection: Coord;
            let storedPath2: Line | BezierCurve;
            let storedPath: Line | BezierCurve;
            for (let i = 1; i < numLines; i++) {
              const letter = indexToLetterMap.get(i);
              const numIndex = indexToIndexMap.get(i)!;
              let condition: boolean;
              let intersect1: Coord;
              switch (letter) {
                case 'L':
                  storedPath = {
                    start: new Coord(Number(currentPath[numIndex - 2]), Number(currentPath[numIndex - 1])),
                    end: new Coord(Number(currentPath[numIndex + 1]), Number(currentPath[numIndex + 2]))
                  };
                  [condition, intersect1] = lineLineIntersection(line1, storedPath as Line);
                  break;
                case 'A':
                  storedPath = {
                    start: new Coord(Number(currentPath[numIndex - 2]), Number(currentPath[numIndex - 1])),
                    control1: new Coord(Number(currentPath[numIndex + 1]), Number(currentPath[numIndex + 2])),
                    control2: new Coord(Number(currentPath[numIndex + 3]), Number(currentPath[numIndex + 4])),
                    end: new Coord(Number(currentPath[numIndex + 6]), Number(currentPath[numIndex + 7]))
                  };
                  // TODO: Get different logic determining intersection for arcs
                    [condition, intersect1] = [false, new Coord(0.0, 0.0)];
                  // [condition, intersect1] = lineCurveIntersection(line1, storedPath as BezierCurve);
                  break;
                default:
                  storedPath = {
                    start: new Coord(0, 0),
                    end: new Coord(0, 0)
                  };
                  // TODO: Think just continue, not an arc or line...?
                  [condition, intersect1] = [false, new Coord(0.0, 0.0)];
                  // [condition, intersect1] = [false, new Coord(0,0), new Coord(0,0)];
              }
              if (condition && !isNaN(intersect1.x)) {
                // @ts-ignore
                if (storedIntersection === undefined) {
                  storedIntersection = intersect1;
                  storedPath2 = storedPath;
                } else {
                  // @ts-ignore
                  return [true, storedIntersection, intersect1, storedPath, storedPath2];
                }
              }
            }
            return [false, new Coord(0,0), new Coord(0,0), {
              start: new Coord(0, 0),
              end: new Coord(0, 0)
            },
              {
                start: new Coord(0, 0),
                end: new Coord(0, 0)
              }];
          }
            // TODO: Check to see path1, path2 return correct value
            [condition, intersect1, intersect2, path1, path2] = determineLinePathIntersection(cur_path as Line, d);
            break;
          case 'A':
            // TODO: Ummm..??
            cur_path = {
              start: new Coord(Number(currentPath[numIndex - 2]), Number(currentPath[numIndex - 1])),
              control1: new Coord(Number(currentPath[numIndex + 1]), Number(currentPath[numIndex + 2])),
              control2: new Coord(Number(currentPath[numIndex + 3]), Number(currentPath[numIndex + 4])),
              end: new Coord(Number(currentPath[numIndex + 6]), Number(currentPath[numIndex + 7]))
            };
            cNum = cNum + 1;
            // TODO: Add logic here once line line intersection works properly
          function determineCurvePathIntersection(curve: BezierCurve, d: string): [boolean, Coord, Coord] {
            return [false, new Coord(0, 0), new Coord(0, 0)];
          }
            [condition, intersect1, intersect2] = [false, new Coord(0, 0), new Coord(0, 0)];
            // [condition, intersect1, intersect2] = determineCurvePathIntersection(cur_path as BezierCurve, d);
            break;
          default:
            continue;
        }
        if (!condition) {
          continue;
        }
        // Integrate shape into d

        // @ts-ignore
        if (path1 === undefined || path2 === undefined) {
          continue;
        }
        let entirePath = '';
        if (isLeft(cur_path.start, cur_path.end, path2.start)) {
          // d and d_list not going along the same direction...
          // Have to adjust direction of d_list along with making sure d_outer part is considered, not the inner part
          const let1Index = d_list.split(cur_path.end.x.toString(), 1).join(cur_path.end.x.toString()).length;
          let insertedPath = '';
          let let2Index: number;
          if (d_list.split(cur_path.start.x.toString(), 2).join(cur_path.start.x.toString()).length === d_list.length) {
            let2Index = d_list.split(cur_path.start.x.toString(), 1).join(cur_path.start.x.toString()).length;
            // TODO: Be sure to not put intersect1 but points equidistant from it
            // insertedPath = d_list.slice(let1Index, d_list.length) + ' L ' + d_list.slice(1, let2Index) +
            //     intersect2.x.toString() + ' ' + intersect2.y.toString();
          } else {
            // TODO: Be sure to not put intersect1 but points equidistant from it
            let2Index = d_list.split(cur_path.start.y.toString(), 2).join(cur_path.start.y.toString()).length + cur_path.start.y.toString().length;
            // insertedPath = d_list.slice(let1Index, let2Index) + ' L ' + intersect2.x.toString() + ' ' + intersect2.y.toString();
          }
          // TODO: created inserted path that creates d_list backwards instead of forwards
          const endIndex = let2Index;
          const startIndex = let1Index;
          // while (endIndex < startIndex) {
          //
          // }
          // TODO: Instead of adding intersect2, determine point that is r away from intersection and have that point instead
          entirePath = 'M ' + path1.start.x.toString() + ' ' + path1.start.y.toString() +
              ' L ' + intersect1.x.toString() + ' ' + intersect1.y.toString() + ' L ' + insertedPath;
          const secondIndex = d.split(path2.end.x.toString(), 1).join(path2.end.x.toString()).length;
          let thirdIndex: number;
          if (d.split(path1.end.x.toString(), 2).join(path1.end.x.toString()).length === d.length) {
            thirdIndex = d.split(path1.end.y.toString(), 1).join(path1.end.y.toString()).length + path1.end.y.toString().length;
            // TODO: Check this condition. Not sure how to throw this case
            entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
          } else {
            // TODO: Check this too
            thirdIndex = d.split(path1.end.y.toString(), 2).join(path1.end.y.toString()).length + path1.end.y.toString().length;
            entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
          }
        }
        else {
          // Works, don't touch
          const let1Index = d_list.split(cur_path.end.x.toString(), 1).join(cur_path.end.x.toString()).length;
          let insertedPath = '';
          if (d_list.split(cur_path.start.x.toString(), 2).join(cur_path.start.x.toString()).length === d_list.length) {
            const let2Index = d_list.split(cur_path.start.x.toString(), 1).join(cur_path.start.x.toString()).length;
            // TODO: Be sure to not put intersect1 but points equidistant from it
            insertedPath = d_list.slice(let1Index, d_list.length) + ' L ' + d_list.slice(1, let2Index) +
                intersect2.x.toString() + ' ' + intersect2.y.toString();
          } else {
            // TODO: Be sure to not put intersect1 but points equidistant from it
            const let2Index = d_list.split(cur_path.start.y.toString(), 2).join(cur_path.start.y.toString()).length + cur_path.start.y.toString().length;
            insertedPath = d_list.slice(let1Index, let2Index) + ' L ' + intersect2.x.toString() + ' ' + intersect2.y.toString();
          }
          // TODO: Instead of adding intersect2, determine point that is r away from intersection and have that point instead
          entirePath = 'M ' + path2.start.x.toString() + ' ' + path2.start.y.toString() +
              ' L ' + intersect1.x.toString() + ' ' + intersect1.y.toString() + ' L ' + insertedPath;
          const secondIndex = d.split(path1.end.x.toString(), 1).join(path1.end.x.toString()).length;
          let thirdIndex: number;
          if (d.split(path2.start.x.toString(), 2).join(path2.start.x.toString()).length === d.length) {
            thirdIndex = d.split(path2.start.y.toString(), 1).join(path2.start.y.toString()).length + path2.start.y.toString().length;
            // TODO: Check this condition. Not sure how to throw this case
            entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
          } else {
            // TODO: Check this too
            thirdIndex = d.split(path2.start.y.toString(), 2).join(path2.start.y.toString()).length + path2.start.y.toString().length;
            entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
          }
        }
        d = entirePath;

        // const let1Index = d_list.split(cur_path.end.x.toString(), 1).join(cur_path.end.x.toString()).length;
        // let insertedPath = '';
        // if (d_list.split(cur_path.start.x.toString(), 2).join(cur_path.start.x.toString()).length === d_list.length) {
        //   const let2Index = d_list.split(cur_path.start.x.toString(), 1).join(cur_path.start.x.toString()).length;
        //   // TODO: Be sure to not put intersect1 but points equidistant from it
        //   insertedPath = d_list.slice(let1Index, d_list.length) + ' L ' + d_list.slice(1, let2Index) +
        //       intersect2.x.toString() + ' ' + intersect2.y.toString();
        // } else {
        //   // TODO: Be sure to not put intersect1 but points equidistant from it
        //   const let2Index = d_list.split(cur_path.start.y.toString(), 2).join(cur_path.start.y.toString()).length + cur_path.start.y.toString().length;
        //   insertedPath = d_list.slice(let1Index, let2Index) + ' L ' + intersect2.x.toString() + ' ' + intersect2.y.toString();
        // }
        // // TODO: Instead of adding intersect2, determine point that is r away from intersection and have that point instead
        // const startOrEnd = isLeft(cur_path.start, cur_path.end, path2.start) ? 'End' : 'Start';
        // entirePath = startOrEnd === 'End' ?
        //     'M ' + path2.end.x.toString() + ' ' + path2.end.y.toString() :
        //     'M ' + path2.start.x.toString() + ' ' + path2.start.y.toString();
        // entirePath += ' L ' + intersect1.x.toString() + ' ' + intersect1.y.toString() + ' L ' + insertedPath;
        //
        // const secondIndex = startOrEnd === 'End' ?
        //     d.split(path1.start.x.toString(), 1).join(path1.start.x.toString()).length :
        //     d.split(path1.end.x.toString(), 1).join(path1.end.x.toString()).length;
        // let thirdIndex: number;
        // if (startOrEnd === 'End') {
        //   if (d.split(path2.end.x.toString(), 2).join(path2.end.x.toString()).length === d.length) {
        //     thirdIndex = d.split(path2.end.y.toString(), 1).join(path2.end.y.toString()).length + path2.end.y.toString().length;
        //     // TODO: Check this.... Should be other logic...
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //   } else {
        //     // TODO: Check this too
        //     thirdIndex = d.split(path2.start.y.toString(), 2).join(path2.start.y.toString()).length + path2.start.y.toString().length;
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //     // entirePath += ' L ' + d.slice(secondIndex, d.length) + ' L ' + d.slice(1, thirdIndex);
        //   }
        // } else {
        //   if (d.split(path2.end.x.toString(), 2).join(path2.end.x.toString()).length === d.length) {
        //     thirdIndex = d.split(path2.end.y.toString(), 1).join(path2.end.y.toString()).length + path2.end.y.toString().length;
        //     // TODO: Check this.... Should be other logic...
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //   } else {
        //     // TODO: Check this too
        //     thirdIndex = d.split(path2.end.y.toString(), 2).join(path2.end.y.toString()).length + path2.end.y.toString().length;
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //     // entirePath += ' L ' + d.slice(secondIndex, d.length) + ' L ' + d.slice(1, thirdIndex);
        //   }
        // }
        // d = entirePath;


        // if (d.split(path2.start.x.toString(), 2).join(path2.start.x.toString()).length === d.length) {
        //   thirdIndex = d.split(path2.start.y.toString(), 1).join(path2.start.y.toString()).length + path2.start.y.toString().length;
        //   // TODO: Check this.... Should be other logic...
        //   entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        // } else {
        //   // TODO: Check this too
        //   thirdIndex = d.split(path2.start.y.toString(), 2).join(path2.start.y.toString()).length + path2.start.y.toString().length;
        //   entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //   // entirePath += ' L ' + d.slice(secondIndex, d.length) + ' L ' + d.slice(1, thirdIndex);
        // }

        // DELETE AFTERWARD

        // if (path === 'forward') {
        //   // // TODO: After this logic works properly, see if there is a way to merge this...
        //   // const let1Index = d_list.split(cur_path.end.x.toString(), 1).join(cur_path.end.x.toString()).length;
        //   // let insertedPath = '';
        //   // if (d_list.split(cur_path.start.x.toString(), 2).join(cur_path.start.x.toString()).length === d_list.length) {
        //   //   const let2Index = d_list.split(cur_path.start.x.toString(), 1).join(cur_path.start.x.toString()).length;
        //   //   // TODO: Be sure to not put intersect1 but points equidistant from it
        //   //   insertedPath = d_list.slice(let1Index, d_list.length) + ' L ' + d_list.slice(1, let2Index) +
        //   //       intersect1.x.toString() + ' ' + intersect1.y.toString();
        //   // } else {
        //   //   // TODO: Be sure to not put intersect1 but points equidistant from it
        //   //   const let2Index = d_list.split(cur_path.start.y.toString(), 2).join(cur_path.start.y.toString()).length + cur_path.start.y.toString().length;
        //   //   insertedPath = d_list.slice(let1Index, let2Index) + ' L ' + intersect1.x.toString() + ' ' + intersect1.y.toString();
        //   // }
        //   // // TODO: Instead of adding intersect2, determine point that is r away from intersection and have that point instead
        //   // entirePath = 'M ' + path1.start.x.toString() + ' ' + path1.start.y.toString() +
        //   //     ' L ' + intersect2.x.toString() + ' ' + intersect2.y.toString() + ' L ' + insertedPath;
        //   // const secondIndex = d.split(path2.end.x.toString(), 1).join(path2.end.x.toString()).length;
        //   // let thirdIndex: number;
        //   // if (d.split(path1.start.x.toString(), 2).join(path1.start.x.toString()).length === d.length) {
        //   //   thirdIndex = d.split(path1.start.y.toString(), 1).join(path1.start.y.toString()).length + path1.start.y.toString().length;
        //   //   entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //   // } else {
        //   //   thirdIndex = d.split(path1.start.y.toString(), 2).join(path1.start.y.toString()).length + path1.start.y.toString().length;
        //   //   entirePath += ' L ' + d.slice(secondIndex, d.length) + ' L ' + d.slice(1, thirdIndex);
        //   // }
        //   // d = entirePath;
        // }
        // else {
        //   // TODO: After this logic works properly, see if there is a way to merge this...
        //   const let1Index = d_list.split(cur_path.end.x.toString(), 1).join(cur_path.end.x.toString()).length;
        //   let insertedPath = '';
        //   if (d_list.split(cur_path.start.x.toString(), 2).join(cur_path.start.x.toString()).length === d_list.length) {
        //     const let2Index = d_list.split(cur_path.start.x.toString(), 1).join(cur_path.start.x.toString()).length;
        //     // TODO: Be sure to not put intersect1 but points equidistant from it
        //     insertedPath = d_list.slice(let1Index, d_list.length) + ' L ' + d_list.slice(1, let2Index) +
        //         intersect2.x.toString() + ' ' + intersect2.y.toString();
        //   } else {
        //     // TODO: Be sure to not put intersect1 but points equidistant from it
        //     const let2Index = d_list.split(cur_path.start.y.toString(), 2).join(cur_path.start.y.toString()).length + cur_path.start.y.toString().length;
        //     insertedPath = d_list.slice(let1Index, let2Index) + ' L ' + intersect2.x.toString() + ' ' + intersect2.y.toString();
        //   }
        //   // TODO: Instead of adding intersect2, determine point that is r away from intersection and have that point instead
        //   entirePath = 'M ' + path2.start.x.toString() + ' ' + path2.start.y.toString() +
        //       ' L ' + intersect1.x.toString() + ' ' + intersect1.y.toString() + ' L ' + insertedPath;
        //   const secondIndex = d.split(path1.end.x.toString(), 1).join(path1.end.x.toString()).length;
        //   let thirdIndex: number;
        //   if (d.split(path2.start.x.toString(), 2).join(path2.start.x.toString()).length === d.length) {
        //     thirdIndex = d.split(path2.start.y.toString(), 1).join(path2.start.y.toString()).length + path2.start.y.toString().length;
        //     // TODO: Check this.... Should be other logic...
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //   } else {
        //     // TODO: Check this too
        //     thirdIndex = d.split(path2.start.y.toString(), 2).join(path2.start.y.toString()).length + path2.start.y.toString().length;
        //     entirePath += ' L ' + d.slice(secondIndex, thirdIndex);
        //     // entirePath += ' L ' + d.slice(secondIndex, d.length) + ' L ' + d.slice(1, thirdIndex);
        //   }
        //   d = entirePath;
        // }
        return d;
      }
      return d;
    }
    for (let i = 0; i < subsetToLinkIndexMap.size; i++) {
      const desiredLinkID = countToDesiredLinkOrderMap.get(i);
      const subsetIndex = subsetToLinkIndexMap.get(linkSubsets.find(l => l.id === desiredLinkID)!.id)!
      d = updateD(d, d_list[subsetIndex]);
    }
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
