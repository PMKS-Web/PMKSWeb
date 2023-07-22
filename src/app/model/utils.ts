import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Coord } from './coord';
import { Shape } from './link';
import { NewGridComponent } from '../component/new-grid/new-grid.component';

export class Utils {}

// radToDeg
export enum LengthUnit {
  INCH = 0,
  CM = 1,
  METER = 2,
  NULL = 3,
}

export enum AngleUnit {
  DEGREE = 10,
  RADIAN = 11,
  NULL = 12,
}

export enum ForceUnit {
  LBF = 20,
  NEWTON = 21,
  NULL = 22,
}

export enum GlobalUnit {
  ENGLISH = 30,
  METRIC = 31,
  SI = 32,
  NULL = 33,
}

// The possible states the program could be in.
export enum gridStates {
  waiting,
  createJointFromGrid,
  createJointFromJoint,
  createJointFromLink,
  createForce,
  dragging,
}

export enum jointStates {
  waiting,
  creating,
  dragging,
}

export enum linkStates {
  waiting,
  dragging,
  creating,
  resizing,
}

export enum forceStates {
  waiting,
  creating,
  draggingStart,
  draggingEnd,
}

export enum shapeEditModes {
  move,
  resize,
}

export enum createModes {
  link,
  force,
}

export enum moveModes {
  joint,
  forceEndpoint,
  threePosition,
  pathPoint,
}

// degToRad

export function roundNumber(num: number, scale: number): number {
  return Math.round(num * Math.pow(10, scale)) / Math.pow(10, scale);
}

// https://jamesmccaffrey.wordpress.com/2020/04/24/matrix-inverse-with-javascript/
export function vecMake(n: number, val: number) {
  let result = [];
  for (let i = 0; i < n; ++i) {
    result[i] = val;
  }
  return result;
}

export function vecInit(s: string) {
  let vals = s.split(',');
  let result = [];
  for (let i = 0; i < vals.length; ++i) {
    result[i] = parseFloat(vals[i]);
  }
  return result;
}

export function matMake(rows: number, cols: number, val: number) {
  let result: Array<Array<number>> = [];
  for (let i = 0; i < rows; ++i) {
    result[i] = [];
    for (let j = 0; j < cols; ++j) {
      result[i][j] = val;
    }
  }
  return result;
}

export function matInit(rows: number, cols: number, s: string) {
  // ex: let m = matInit(2, 3, "1,2,3, 4,5,6");
  let result = matMake(rows, cols, 0.0);
  let vals = s.split(',');
  let k = 0;
  for (let i = 0; i < rows; ++i) {
    for (let j = 0; j < cols; ++j) {
      result[i][j] = parseFloat(vals[k++]);
    }
  }
  return result;
}

export function matProduct(ma: Array<Array<number>>, mb: Array<Array<number>>) {
  let aRows = ma.length;
  let aCols = ma[0].length;
  let bRows = mb.length;
  let bCols = mb[0].length;
  if (aCols != bRows) {
    throw 'Non-conformable matrices';
  }

  let result = matMake(aRows, bCols, 0.0);

  for (let i = 0; i < aRows; ++i) {
    // each row of A
    for (let j = 0; j < bCols; ++j) {
      // each col of B
      for (let k = 0; k < aCols; ++k) {
        // could use bRows
        result[i][j] += ma[i][k] * mb[k][j];
      }
    }
  }

  return result;
}

export function matInverse(m: Array<Array<number>>) {
  // assumes determinant is not 0
  // that is, the matrix does have an inverse
  let n = m.length;
  let result = matMake(n, n, 0.0); // make a copy
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      result[i][j] = m[i][j];
    }
  }

  let lum = matMake(n, n, 0.0); // combined lower & upper
  let perm = vecMake(n, 0.0); // out parameter
  matDecompose(m, lum, perm); // ignore return

  let b = vecMake(n, 0.0);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      if (i == perm[j]) b[j] = 1.0;
      else b[j] = 0.0;
    }

    let x = reduce(lum, b); //
    for (let j = 0; j < n; ++j) result[j][i] = x[j];
  }
  return result;
}

export function matDeterminant(m: Array<Array<number>>) {
  let n = m.length;
  let lum = matMake(n, n, 0.0);
  let perm = vecMake(n, 0.0);
  let result = matDecompose(m, lum, perm); // -1 or +1
  for (let i = 0; i < n; ++i) result *= lum[i][i];
  return result;
}

export function matDecompose(
  m: Array<Array<number>>,
  lum: Array<Array<number>>,
  perm: Array<number>
) {
  // Crout's LU decomposition for matrix determinant and inverse
  // stores combined lower & upper in lum[][]
  // stores row permuations into perm[]
  // returns +1 or -1 according to even or odd perms
  // lower gets dummy 1.0s on diagonal (0.0s above)
  // upper gets lum values on diagonal (0.0s below)

  let toggle = +1; // even (+1) or odd (-1) row permutatuions
  let n = m.length;

  // make a copy of m[][] into result lum[][]
  //lum = matMake(n, n, 0.0);
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      lum[i][j] = m[i][j];
    }
  }

  // make perm[]
  //perm = vecMake(n, 0.0);
  for (let i = 0; i < n; ++i) perm[i] = i;

  for (let j = 0; j < n - 1; ++j) {
    // note n-1
    let max = Math.abs(lum[j][j]);
    let piv = j;

    for (let i = j + 1; i < n; ++i) {
      // pivot index
      let xij = Math.abs(lum[i][j]);
      if (xij > max) {
        max = xij;
        piv = i;
      }
    } // i

    if (piv != j) {
      let tmp = lum[piv]; // swap rows j, piv
      lum[piv] = lum[j];
      lum[j] = tmp;

      let t = perm[piv]; // swap perm elements
      perm[piv] = perm[j];
      perm[j] = t;

      toggle = -toggle;
    }

    let xjj = lum[j][j];
    if (xjj != 0.0) {
      // TODO: fix bad compare here
      for (let i = j + 1; i < n; ++i) {
        let xij = lum[i][j] / xjj;
        lum[i][j] = xij;
        for (let k = j + 1; k < n; ++k) {
          lum[i][k] -= xij * lum[j][k];
        }
      }
    }
  } // j

  return toggle; // for determinant
} // matDecompose

export function reduce(lum: Array<Array<number>>, b: Array<number>) {
  // helper
  let n = lum.length;
  let x = vecMake(n, 0.0);
  for (let i = 0; i < n; ++i) {
    x[i] = b[i];
  }

  for (let i = 1; i < n; ++i) {
    let sum = x[i];
    for (let j = 0; j < i; ++j) {
      sum -= lum[i][j] * x[j];
    }
    x[i] = sum;
  }

  x[n - 1] /= lum[n - 1][n - 1];
  for (let i = n - 2; i >= 0; --i) {
    let sum = x[i];
    for (let j = i + 1; j < n; ++j) {
      sum -= lum[i][j] * x[j];
    }
    x[i] = sum / lum[i][i];
  }

  return x;
} // reduce

export function matLinearSystem(A: Array<Array<number>>, B: Array<Array<number>>) {
  const inv_A = matInverse(A);
  return matProduct(inv_A, B);
}

export function crossProduct(A: Array<number>, B: Array<number>) {
  return [A[1] * B[2] - A[2] * B[1], -1 * (A[0] * B[2] - A[2] * B[0]), A[0] * B[1] - A[1] * B[0]];
}

export function getAngle(j1: Coord, j2: Coord) {
  const dx = j2.x - j1.x;
  const dy = j2.y - j1.y;
  return Math.atan2(dy, dx);
}

// same as getEuclideandistance... :P
export function getDistance(j1: Coord, j2: Coord) {
  const dx = j2.x - j1.x;
  const dy = j2.y - j1.y;
  return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
}

//A helper function to solve the position of the other joint given the position of the first joint, the angle of the first joint, and the distance between the two joints
export function getNewOtherJointPos(j1: Coord, angle: number, distance: number) {
  const x = j1.x + distance * Math.cos(angle);
  const y = j1.y + distance * Math.sin(angle);
  return new Coord(x, y);
}

export function radToDeg(rad: number) {
  return (rad * 180.0) / Math.PI;
}

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180.0;
}

export function getXDistance(r: number, theta: number) {
  return Math.cos(theta) * r;
}

export function getYDistance(r: number, theta: number) {
  return Math.sin(theta) * r;
}

export function determineSlope(x1: number, y1: number, x2: number, y2: number) {
  return (y2 - y1) / (x2 - x1);
}

export function determineYIntersect(x: number, y: number, m: number) {
  return y - m * x;
}

export function determineX(m1: number, b1: number, m2: number, b2: number) {
  return (b2 - b1) / (m1 - m2);
}

export function determineY(x: number, m: number, b: number) {
  return m * x + b;
}

export function stringToFloat(str: string) {
  const res = parseFloat(str);
  if (Number.isNaN(res)) {
    throw new Error('should be a number, file corrupted');
  }
  return res;
}

export function stringToBoolean(str: string) {
  const lowerCaseString = str.toLowerCase();
  switch (lowerCaseString) {
    case 't':
    case 'true':
      return true;
    case 'f':
    case 'false':
      return false;
    default:
      throw new Error('should be a boolean, file corrupted');
  }
}

export function stringToShape(str: string) {
  switch (str) {
    case 'line':
      return Shape.line;
    case 'bar':
      return Shape.bar;
    case 'eTriangle':
      return Shape.eTriangle;
    case 'rTriangle':
      return Shape.rTriangle;
    case 'rectangle':
      return Shape.rectangle;
    case 'square':
      return Shape.square;
    case 'circle':
      return Shape.circle;
    case 'cShape':
      return Shape.cShape;
    case 'tShape':
      return Shape.tShape;
    case 'lShape':
      return Shape.lShape;
    default:
      return Shape.line;
    // case Shape.horizontalLine:
    // case Shape.verticalLine:
    // case Shape.slantedLineForward:
    // case Shape.slantedLineBackward:
    // case Shape.beanShape:
    // case Shape.infinityShape:
    // case Shape.eightShape:
    // case Shape.customShape:
  }
}

// TODO: In future, can replace with this: https://www.gatevidyalay.com/2d-rotation-in-computer-graphics-definition-examples/
// Easier to understand, less variables to account for, and computationally faster
export function determineUnknownJointUsingTriangulation(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  prevJoint_x: number,
  prevJoint_y: number,
  angle: number,
  internal_angle: number
) {
  let x_calc: number;
  let y_calc: number;
  let x_calc1: number;
  let y_calc1: number;
  let x_calc2: number;
  let y_calc2: number;
  if (x1 > x2) {
    // A to the right of B
    if (y1 > y2) {
      // A on top of B (good)
      x_calc1 = x1 + r1 * Math.cos(Math.PI + (internal_angle + (Math.PI + angle)));
      y_calc1 = y1 + r1 * Math.sin(Math.PI + (internal_angle + (Math.PI + angle)));
      x_calc2 = x1 + r1 * Math.cos(Math.PI - (internal_angle - (Math.PI + angle)));
      y_calc2 = y1 + r1 * Math.sin(Math.PI - (internal_angle - (Math.PI + angle)));
    } else {
      // A below B (good)
      x_calc1 = x1 + r1 * Math.cos(Math.PI + (internal_angle - (Math.PI - angle)));
      y_calc1 = y1 + r1 * Math.sin(Math.PI + (internal_angle - (Math.PI - angle)));
      x_calc2 = x1 + r1 * Math.cos(Math.PI - (internal_angle + (Math.PI - angle)));
      y_calc2 = y1 + r1 * Math.sin(Math.PI - (internal_angle + (Math.PI - angle)));
    }
  } else {
    // A to the left of B
    if (y1 > y2) {
      // A on top of B (good)
      x_calc1 = x1 + r1 * Math.cos(2 * Math.PI - (Math.abs(angle) + internal_angle));
      y_calc1 = y1 + r1 * Math.sin(2 * Math.PI - (Math.abs(angle) + internal_angle));
      x_calc2 = x1 + r1 * Math.cos(internal_angle - Math.abs(angle));
      y_calc2 = y1 + r1 * Math.sin(internal_angle - Math.abs(angle));
    } else {
      // A below B (good)
      x_calc1 = x1 + r1 * Math.cos(2 * Math.PI - (angle - internal_angle));
      y_calc1 = y1 + r1 * Math.sin(angle - internal_angle);
      x_calc2 = x1 + r1 * Math.cos(internal_angle + angle);
      y_calc2 = y1 + r1 * Math.sin(internal_angle + angle);
    }
  }
  const dist1 = euclideanDistance(x_calc1, y_calc1, prevJoint_x, prevJoint_y);
  const dist2 = euclideanDistance(x_calc2, y_calc2, prevJoint_x, prevJoint_y);
  if (dist1 < dist2) {
    x_calc = x_calc1;
    y_calc = y_calc1;
  } else {
    x_calc = x_calc2;
    y_calc = y_calc2;
  }
  return [x_calc, y_calc];
}

export function euclideanDistance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

export function findBiggestAngle(joint: RealJoint, allJoints: RealJoint[]) {
  // TODO: check for condition that first condition is not met... (with imagJoints)
  if (allJoints.length === 2) {
    return [allJoints[0], allJoints[1]];
  }
  const curJoint = allJoints.find((j) => joint.id === j.id) as RealJoint;
  let biggestAngle = 0;
  // TODO: Change this where desiredJoint1 and desiredJoint2 are not same
  let desiredJoint1: Joint = curJoint;
  let desiredJoint2: Joint = curJoint;

  const curJointIndex = allJoints.findIndex((j) => j.id === joint.id);
  for (let i = 0; i < allJoints.length; i++) {
    // console.log('Outer loop: ' + i);
    if (i === curJointIndex) {
      // console.log('Skipped');
      continue;
    }
    const joint1 = allJoints[i];
    for (let j = i + 1; j < allJoints.length; j++) {
      // console.log('Inner loop: ' + j);
      if (j === curJointIndex) {
        // console.log('Skipped');
        continue;
      }
      const joint2 = allJoints[j];
      const angle = find_angle(allJoints[curJointIndex], joint1, joint2);
      // console.log(angle);
      if (angle > biggestAngle) {
        // if (biggestAngle === 0 || angle > biggestAngle) {
        biggestAngle = angle;
        desiredJoint1 = joint1;
        desiredJoint2 = joint2;
      }
    }
  }
  return [desiredJoint1, desiredJoint2];
}

// https://stackoverflow.com/questions/17763392/how-to-calculate-in-javascript-angle-between-3-points (wrong)
// http://phrogz.net/angle-between-three-points
export function find_angle(B: Coord, A: Coord, C: Coord) {
  let AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
  let BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
  let AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
  return Math.acos((BC * BC + AB * AB - AC * AC) / (2 * BC * AB));
  // const a = Math.pow(p1.x-p0.x,2) + Math.pow(p1.y-p0.y,2),
  //     b = Math.pow(p1.x-p2.x,2) + Math.pow(p1.y-p2.y,2),
  //     c = Math.pow(p2.x-p0.x,2) + Math.pow(p2.y-p0.y,2);
  // return Math.acos( (a+b-c) / Math.sqrt(4*a*b) ) * 180 / Math.PI;
}

// TODO: Should put this all over the code...
export function find_slope(point1: Coord, point2: Coord) {
  return (point1.y - point2.y) / (point1.x - point2.x);
}

// TODO: Should put this all over the code...
export function find_y_intercept(point1: Coord, slope: number) {
  return point1.y - slope * point1.x;
}

// https://stackoverflow.com/questions/14480345/how-to-get-the-nth-occurrence-in-a-string
export function getPosition(string: string, subString: string, index: number) {
  return string.split(subString, index).join(subString).length;
}

// https://stackoverflow.com/questions/4364881/inserting-string-at-position-x-of-another-string
export function insertStringWithinString(a: string, index: number, b: string) {
  return [a.slice(0, index), b, a.slice(index)].join('');
}

// https://www.tutorialspoint.com/typescript/typescript_string_substr.htm
export function pullStringWithinString(a: string, firstIndex: number, secondIndex: number) {
  return a.substring(firstIndex, secondIndex);
}

// https://stackoverflow.com/questions/13937782/calculating-the-point-of-intersection-of-two-lines
// line intercept math by Paul Bourke http://paulbourke.net/geometry/pointlineplane/
// Determine the intersection point of two line segments
// Return undefiend if the lines don't intersect
export function line_line_intersect(
  line1start: Coord,
  line1end: Coord,
  line2start: Coord,
  line2end: Coord
): Coord | undefined {
  let x1 = line1start.x;
  let y1 = line1start.y;
  let x2 = line1end.x;
  let y2 = line1end.y;
  let x3 = line2start.x;
  let y3 = line2start.y;
  let x4 = line2end.x;
  let y4 = line2end.y;

  // Check if none of the lines are of length 0
  if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) {
    return;
  }

  let denominator = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

  // Lines are parallel
  if (denominator === 0) {
    return;
  }

  let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
  let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

  // is the intersection along the segments
  if (ua <= 0 || ua >= 1 || ub <= 0 || ub >= 1) {
    return;
  }

  // Return an object with the x and y coordinates of the intersection
  let x = x1 + ua * (x2 - x1);
  let y = y1 + ua * (y2 - y1);

  let intersection = new Coord(x, y);

  if (
    intersection.equals(line1start) ||
    intersection.equals(line1end) ||
    intersection.equals(line2start) ||
    intersection.equals(line2end)
  ) {
    return;
  }

  return intersection;
}

function circle_circle_intersect(
  center: Coord | Joint,
  radius: number,
  center2: Coord | Joint,
  radius2: number
): [Coord[] | undefined, boolean] {
  //Return the intersection points between two circles.
  //If the circles do not intersect, return undefined.

  let x1 = center.x;
  let y1 = center.y;
  let x2 = center2.x;
  let y2 = center2.y;

  let dx = x2 - x1;
  let dy = y2 - y1;
  let d = Math.sqrt(dx * dx + dy * dy);

  // Circles are separate
  if (d > radius + radius2) {
    return [undefined, false];
  }

  // One circle is contained within the other
  if (d < Math.abs(radius - radius2)) {
    return [undefined, false];
  }

  // Circles are coincident
  if (d === 0 && radius === radius2) {
    // console.log('Circles are coincident');
    return [undefined, true];
  }

  let a = (radius * radius - radius2 * radius2 + d * d) / (2 * d);
  let h = Math.sqrt(radius * radius - a * a);
  let x3 = x1 + (a * dx) / d;
  let y3 = y1 + (a * dy) / d;
  let x4 = x3 + (h * dy) / d;
  let y4 = y3 - (h * dx) / d;
  let x5 = x3 - (h * dy) / d;
  let y5 = y3 + (h * dx) / d;

  return [[new Coord(x4, y4), new Coord(x5, y5)], false];
}

export function determineCenter(
  startPoint: Coord,
  endPoint: Coord,
  radius: number,
  cw: string
): Coord {
  // Find the center of the circle that the arc revolves around.
  // The center will be 'radius' distance from the startPoint and endPoint.

  // Find the midpoint of the line segment
  let mid = new Coord((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2);
  // Find the vector from startPoint to endPoint
  let vec = new Coord(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
  // Find the length of vec
  let len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
  // Check if len is zero
  if (len === 0) {
    // Return null or throw an error
    throw new Error('len is zero');
  }
  // Find the perpendicular vector to vec
  let perp = new Coord(-vec.y / len, vec.x / len);
  // Check if radius is too small
  if (radius < len / 2) {
    // Return null or throw an error
    throw new Error('radius is too small');
  }
  // Find the parameter t that satisfies the equation (c - mid)^2 = r^2
  let t = Math.sqrt(radius * radius - (len * len) / 4);
  // Check if t is negative
  if (t < 0) {
    // Return null or throw an error
    throw new Error('t is negative');
  }
  // Find the center point c by adding mid and perp * t
  let c = new Coord(mid.x + perp.x * t, mid.y + perp.y * t);
  // Check if c is NaN
  if (isNaN(c.x) || isNaN(c.y)) {
    // Return null or throw an error
    throw new Error('c is NaN');
  }
  // Check if cw is '0' or '1'
  if (cw === '0') {
    // Reverse the direction of perp
    c = new Coord(mid.x - perp.x * t, mid.y - perp.y * t);
  } else if (cw === '1') {
    // Keep the direction of perp
    c = new Coord(mid.x + perp.x * t, mid.y + perp.y * t);
  } else {
    // Return null or throw an error
    throw new Error('cw must be "0" or "1"');
  }

  return c;
}

export function arc_arc_intersect(
  startPosition: Coord,
  endPosition: Coord,
  center: Coord | Joint,
  startPosition2: Coord,
  endPosition2: Coord,
  center2: Coord | Joint,
  radius: number
): Coord | undefined {
  //Return the first intersection point between two arcs. The first is the one closest to the startPosition point.
  //If the arcs are tangent, then return the point of tangency closest to the startPosition point.
  //If the arcs do not intersect, return undefined.

  //First, find the intersection points between the two circles defined by the arcs.
  let [intersections, coicident] = circle_circle_intersect(center, radius, center2, radius);

  if (coicident) {
    //The circles are coicident, so we need to check if the arcs intersect.
    //First, check if the start and end points of the arcs are within the other arc.
    let allImportantIntersections: Coord[] = [];
    if (isPointInArc(startPosition, startPosition2, endPosition2, center2)) {
      allImportantIntersections.push(startPosition);
    }
    if (isPointInArc(endPosition, startPosition2, endPosition2, center2)) {
      allImportantIntersections.push(endPosition);
    }
    if (isPointInArc(startPosition2, startPosition, endPosition, center)) {
      allImportantIntersections.push(startPosition2);
    }
    if (isPointInArc(endPosition2, startPosition, endPosition, center)) {
      allImportantIntersections.push(endPosition2);
    }

    // console.log(
    //   'Circles are coicident, here are all the endpoints that overalp',
    //   allImportantIntersections
    // );

    //If there are no intersections, then the arcs do not intersect.
    if (allImportantIntersections.length === 0) {
      return;
    }

    //Else find the intersection closest to the startPosition.
    let closestIntersection: Coord | undefined;
    for (let intersection of allImportantIntersections) {
      if (!closestIntersection) {
        closestIntersection = intersection;
      } else if (
        intersection.getDistanceTo(startPosition) < closestIntersection.getDistanceTo(startPosition)
      ) {
        closestIntersection = intersection;
      }
    }

    return closestIntersection;
  }

  if (!intersections) {
    return;
  }
  //Then, check if the intersection points are within the arcs.
  let closestIntersection: Coord | undefined;

  for (let intersection of intersections) {
    if (
      isPointInArc(intersection, startPosition, endPosition, center) &&
      isPointInArc(intersection, startPosition2, endPosition2, center2) &&
      !intersection.equals(startPosition) &&
      !intersection.equals(endPosition) &&
      !intersection.equals(startPosition2) &&
      !intersection.equals(endPosition2)
    ) {
      if (!closestIntersection) {
        //First iteration only
        closestIntersection = intersection;
      } else if (
        intersection.getDistanceTo(startPosition) < closestIntersection.getDistanceTo(startPosition)
      ) {
        closestIntersection = intersection;
      }
    }
  }

  return closestIntersection;
}

function isPointOnLine(point: Coord, lineStart: Coord, lineEnd: Coord): boolean {
  //Return true if the point is on the line segment defined by lineStart and lineEnd.
  //Return false otherwise.

  //Check if the point is within a small range of the line segment.
  let range = 0.00001;
  if (
    point.x < Math.min(lineStart.x, lineEnd.x) - range ||
    point.x > Math.max(lineStart.x, lineEnd.x) + range ||
    point.y < Math.min(lineStart.y, lineEnd.y) - range ||
    point.y > Math.max(lineStart.y, lineEnd.y) + range
  ) {
    return false;
  }
  return true;
}

export function line_arc_intersect(
  lineStart: Coord,
  lineEnd: Coord,
  arcStart: Coord,
  arcEnd: Coord,
  arcCenter: Coord,
  arcRadius: number,
  findIntersectionCloseTo: Coord
): Coord | undefined {
  //Return the first intersection point between a line and an arc. The first is the one closest to the lineStart point.
  //If the line is tangent to the arc, then return the point of tangency closest to the lineStart point.
  //If the line does not intersect the arc, return undefined.

  //First, find the intersection points between the line and the circle defined by the arc.
  let intersections = line_circle_intersect(
    lineStart,
    lineEnd,
    arcCenter,
    arcStart.getDistanceTo(arcCenter)
  );

  intersections = intersections?.filter((intersection) => {
    return isPointOnLine(intersection, lineStart, lineEnd);
  });

  if (!intersections || intersections.length === 0) {
    return;
  }

  //Then, check if the intersection points are within the arc.
  let closestIntersection: Coord | undefined;

  for (let intersection of intersections) {
    if (
      isPointInArc(intersection, arcStart, arcEnd, arcCenter) &&
      !intersection.equals(arcStart) &&
      !intersection.equals(arcEnd)
    ) {
      //If it is, then return the closest intersection point.
      if (closestIntersection == undefined) {
        closestIntersection = intersection;
      } else if (
        closestIntersection.getDistanceTo(findIntersectionCloseTo) >
        intersection.getDistanceTo(findIntersectionCloseTo)
      ) {
        closestIntersection = intersection;
      }
    }
  }
  return closestIntersection;
}

function line_circle_intersect(
  lineStart: Coord,
  lineEnd: Coord,
  circleCenter: Coord,
  circleRadius: number
): Coord[] | undefined {
  //Return the intersection points between a line and a circle.
  //If the line is tangent to the circle, then return the point of tangency.
  //If the line does not intersect the circle, return undefined.

  //First, check if the line is vertical or not
  if (lineEnd.x === lineStart.x) {
    //The line is vertical, so its equation is x = c
    let c = lineStart.x; //constant term

    //Next, find the equation of the circle in the form (x - h)^2 + (y - k)^2 = r^2
    let h = circleCenter.x; //x-coordinate of the center
    let k = circleCenter.y; //y-coordinate of the center
    let r = circleRadius; //radius

    //Then, substitute x = c into the circle equation and solve for y
    //This will give a quadratic equation in the form ay^2 + by + c = 0
    let a = 1; //coefficient of y^2
    let b = -2 * k; //coefficient of y
    let d = c - h; //constant term divided by 2
    let e = d * d + k * k - r * r; //constant term

    //Next, find the discriminant of the quadratic equation
    //This will determine how many solutions there are
    let D = b * b - 4 * a * e; //discriminant

    //If D is negative, then there are no real solutions and the line does not intersect the circle
    if (D < 0) {
      return undefined;
    }

    //If D is zero, then there is one real solution and the line is tangent to the circle
    if (D === 0) {
      let y = -b / (2 * a); //solution for y
      return [new Coord(c, y)]; //return the point of tangency as an array of one coordinate object
    }

    //If D is positive, then there are two real solutions and the line intersects the circle at two points
    if (D > 0) {
      let y1 = (-b + Math.sqrt(D)) / (2 * a); //first solution for y
      let y2 = (-b - Math.sqrt(D)) / (2 * a); //second solution for y
      return [new Coord(c, y1), new Coord(c, y2)]; //return the intersection points as an array of two coordinate objects
    }
  } else {
    let intersections: Coord[] = [];
    let slope = find_slope(lineStart, lineEnd);
    let y_intercept = find_y_intercept(lineStart, slope);
    let a = 1 + slope * slope;
    let b = 2 * slope * (y_intercept - circleCenter.y) - 2 * circleCenter.x;
    let c =
      circleCenter.x * circleCenter.x +
      (y_intercept - circleCenter.y) * (y_intercept - circleCenter.y) -
      circleRadius * circleRadius;

    let discriminant = b * b - 4 * a * c;
    const tolerance = 0.00001;
    if (discriminant < -tolerance) {
      // line doesn't touch circle
      // console.log("line doesn't touch circle");
      return;
    } else if (discriminant < tolerance) {
      // console.log('line is tangent to circle');
      // line is tangent to circle
      let x = -b / (2 * a);
      let y = slope * x + y_intercept;
      intersections.push(new Coord(x, y));
      return intersections;
    } else {
      // console.log('line intersects circle in two places');
      // line intersects circle in two places
      let x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
      let y1 = slope * x1 + y_intercept;
      intersections.push(new Coord(x1, y1));
      let x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
      let y2 = slope * x2 + y_intercept;
      intersections.push(new Coord(x2, y2));
      return intersections;
    }
  }
  return;
}

function isPointInArc(
  intersection: Coord,
  arcStart: Coord,
  arcEnd: Coord,
  arcCenter: Coord
): boolean {
  //Return true if the point is within the arc.
  //Return false if the point is outside the circle.
  //Return false if the point is on the circle, but not within the arc.
  //The arc always goes from the start point to the end point in a counter-clockwise direction.
  //Use the cross product to determine if the point is on the left or right side of the line from the start point to the end point.
  //If the point is on the left side, then it is within the arc.
  //If the point is on the right side, then it is outside the arc.

  //Next, check if the point is on the left side of the line from the start point to the end point
  let crossProduct =
    (arcEnd.x - arcStart.x) * (intersection.y - arcStart.y) -
    (intersection.x - arcStart.x) * (arcEnd.y - arcStart.y);
  if (crossProduct < 0) {
    return true;
  } else {
    return false;
  }
}

// returns true if the line from (a,b)->(c,d) intersects with (p,q)->(r,s)
// function intersects(a,b,c,d,p,q,r,s) {
//   var det, gamma, lambda;
//   det = (c - a) * (s - q) - (r - p) * (d - b);
//   if (det === 0) {
//     return false;
//   } else {
//     lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
//     gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
//     return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
//   }
// };

export function wrapAngle(angle: number) {
  //Wrap between -pi and pi
  angle = angle % (2 * Math.PI);
  if (angle > Math.PI) {
    angle -= 2 * Math.PI;
  }
  if (angle < -Math.PI) {
    angle += 2 * Math.PI;
  }
  return angle;
}

export function is_touch_enabled() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function has_mouse_pointer() {
  return matchMedia('(pointer:fine)').matches;
}

// Whether HTML5's local storage is available
export function local_storage_available() {
  return typeof(Storage) !== "undefined";
}


// https://stackoverflow.com/questions/1560492/how-to-tell-whether-a-point-is-to-the-right-or-left-side-of-a-line
export function isLeft(a: Coord, b: Coord, c: Coord) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
}
