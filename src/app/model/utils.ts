import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Coord } from './coord';
import { Shape } from './link';
import { Pose } from './pose';
import { ConstrucLines } from './constructionlines_syn';
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

export enum AngVelUnit {
  RPM = 15, // revolutions per minute
  DPS = 16, // degrees per second
  RPS = 17, // Radians per second
}

export enum AngAccUnit {
  RPS_square = 18, // rad per second square (rad/s^2)
  DPS_square = 19, // degrees per second square (deg/s^2)
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

//added by Pradeep Mar 25th 2023
//determine the end point of each pose
//we pass coord, length and angle of each pose to this function and store the end point under each pose
export function getCoordofeachPose(pose1: Pose) {
  if (pose1.angle == 0) {
    pose1.coord1.x = pose1.midpoint.x - 0.5 * length * Math.cos(degToRad(pose1.angle));
    pose1.coord1.y = pose1.midpoint.y - 0.5 * length * Math.sin(degToRad(pose1.angle));

    pose1.coord2.x = pose1.midpoint.x + 0.5 * length * Math.cos(degToRad(pose1.angle));
    pose1.coord2.y = pose1.midpoint.y + 0.5 * length * Math.sin(degToRad(pose1.angle));
  } else if (pose1.angle > 0 && pose1.angle < 90) {
    pose1.coord1.x = pose1.midpoint.x - 0.5 * length * Math.cos(degToRad(pose1.angle + 180));
    pose1.coord1.y = pose1.midpoint.y - 0.5 * length * Math.sin(degToRad(pose1.angle + 180));

    pose1.coord2.x = pose1.midpoint.x + 0.5 * length * Math.cos(degToRad(pose1.angle));
    pose1.coord2.y = pose1.midpoint.y + 0.5 * length * Math.sin(degToRad(pose1.angle));
  } else if (pose1.angle < 0 && pose1.angle < -90) {
    pose1.coord1.x = pose1.midpoint.x - 0.5 * length * Math.cos(degToRad(pose1.angle + 180));
    pose1.coord1.y = pose1.midpoint.y - 0.5 * length * Math.sin(degToRad(pose1.angle + 180));

    pose1.coord2.x = pose1.midpoint.x + 0.5 * length * Math.cos(degToRad(pose1.angle));
    pose1.coord2.y = pose1.midpoint.y + 0.5 * length * Math.sin(degToRad(pose1.angle));
  }
}

//added by Pradeep Mar 25th 2023
//obtain end points of lines. This will help draw the construction lines
export function ConstructionLine_1(pose1: Pose, pose2: Pose) {
  return new ConstrucLines(pose1.coord1, pose2.coord1);
}

export function ConstructionLine_2(pose2: Pose, pose3: Pose) {
  return new ConstrucLines(pose2.coord1, pose3.coord1);
}

export function ConstructionLine_3(pose1: Pose, pose2: Pose) {
  return new ConstrucLines(pose1.coord2, pose2.coord2);
}

export function ConstructionLine_4(pose2: Pose, pose3: Pose) {
  return new ConstrucLines(pose2.coord2, pose3.coord2);
}

//added by Pradeep Mar 25th 2023
//obtain the coordinates of intersection point
//return one intersection point
export function intersectionPoint_1(pose1: Pose, pose2: Pose, pose3: Pose) {
  //slope of line 1
  //var slope1 = 1 / ((Pos2_end1(2) - Pos1_end1(2)) / (Pos2_end1(1) - Pos1_end1(1)));
  //slope of line 2
  //slope2 = 1 / ((Pos3_end1(2) - Pos2_end1(2)) / (Pos3_end1(1) - Pos2_end1(1)));
  //midpoints
  //midpoint_line1 = (Pos1_end1 + Pos2_end1) / 2;
  //midpoint_line2 = (Pos2_end1 + Pos3_end1) / 2;
  //intercept
  //c1 = midpoint_line1(2) + slope1 * midpoint_line1(1);
  //c2 = midpoint_line2(2) + slope2 * midpoint_line2(1);
  var slope1 = 1 / ((pose2.coord1.y - pose1.coord1.y) / (pose2.coord1.x - pose1.coord1.x));
  //slope of line 2
  var slope2 = 1 / ((pose3.coord1.y - pose2.coord1.y) / (pose3.coord1.x - pose2.coord1.x));

  //midpoints of the above two lines
  var midpoint_line1 = new Coord(
    (pose1.coord1.x + pose2.coord1.x) / 2,
    (pose1.coord1.y + pose2.coord1.y) / 2
  );
  var midpoint_line2 = new Coord(
    (pose3.coord1.x + pose2.coord1.x) / 2,
    (pose3.coord1.y + pose2.coord1.y) / 2
  );

  //intercept
  var c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
  var c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

  //intersection point
  var x1 = (c1 - c2) / (-slope2 + slope1);
  var y1 = -slope1 * x1 + c1;

  return new Coord(x1, y1);
}

//return second intersection point
export function intersectionPoint_2(pose1: Pose, pose2: Pose, pose3: Pose) {
  //slope of line 3
  //slope3 = 1 / ((Pos2_end2(2) - Pos1_end2(2)) / (Pos2_end2(1) - Pos1_end2(1)));
  //slope of line 4
  //slope4 = 1 / ((Pos3_end2(2) - Pos2_end2(2)) / (Pos3_end2(1) - Pos2_end2(1)));
  //midpoints
  // midpoint_line3 = (Pos1_end2 + Pos2_end2) / 2;
  // midpoint_line4 = (Pos2_end2 + Pos3_end2) / 2;
  //intercept
  //  c3 = midpoint_line3(2) + slope3 * midpoint_line3(1);
  //   c4 = midpoint_line4(2) + slope4 * midpoint_line4(1);

  //intersection point
  //x2 = (c3 - c4) / (-slope4 + slope3);
  //y2 = -slope3 * x2 + c3;

  var slope1 = 1 / ((pose2.coord2.y - pose1.coord2.y) / (pose2.coord2.x - pose1.coord2.x));
  //slope of line 2
  var slope2 = 1 / ((pose3.coord2.y - pose2.coord2.y) / (pose3.coord2.x - pose2.coord2.x));

  //midpoints of the above two lines
  var midpoint_line1 = new Coord(
    (pose1.coord2.x + pose2.coord2.x) / 2,
    (pose1.coord2.y + pose2.coord2.y) / 2
  );
  var midpoint_line2 = new Coord(
    (pose3.coord2.x + pose2.coord2.x) / 2,
    (pose3.coord2.y + pose2.coord2.y) / 2
  );

  //intercept
  var c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
  var c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

  //intersection point
  var x1 = (c1 - c2) / (-slope2 + slope1);
  var y1 = -slope1 * x1 + c1;

  return new Coord(x1, y1);
}

//organize the four coordinates
export function fourCoordinates(pose1: Pose, pose2: Pose, pose3: Pose) {
  var coord_A = intersectionPoint_1(pose1, pose2, pose3);
  var coord_B = pose1.coord1;
  var coord_C = pose1.coord2;
  var coord_D = intersectionPoint_1(pose1, pose2, pose3);

  //we have the four coordinates that make up the
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

// https://www.petercollingridge.co.uk/tutorials/computational-geometry/circle-circle-intersections/
export function circleCircleIntersection(
  x0: number,
  y0: number,
  r0: number,
  x1: number,
  y1: number,
  r1: number
) {
  let dx = x1 - x0;
  let dy = y1 - y0;
  const d = Math.sqrt(dx * dx + dy * dy);
  // Circles too far apart
  if (d > r0 + r1) {
    return false;
  }

  // One circle completely inside the other
  if (d < Math.abs(r0 - r1)) {
    return false;
  }

  // const TOLERANCE = 0.001;
  if (d <= 0.001) {
    return false;
  }
  // if (d === 0) {
  //   return false;
  // }

  dx /= d;
  dy /= d;

  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const px = x0 + a * dx;
  const py = y0 + a * dy;

  const h = Math.sqrt(r0 * r0 - a * a);

  const p1x = px + h * dy;
  const p1y = py - h * dx;
  const p2x = px - h * dy;
  const p2y = py + h * dx;
  return [
    [p1x, p1y],
    [p2x, p2y],
  ];
}

// https://cscheng.info/2016/06/09/calculate-circle-line-intersection-with-javascript-and-p5js.html
export function circleLineIntersection(r: number, h: number, k: number, m: number, n: number) {
  // circle: (x - h)^2 + (y - k)^2 = r^2
  // line: y = m * x + n
  // r: circle radius
  // h: x value of circle centre
  // k: y value of circle centre
  // m: slope
  // n: y-intercept

  // get a, b, c values
  const a = 1 + Math.pow(m, 2);
  const b = -h * 2 + m * (n - k) * 2;
  const c = Math.pow(h, 2) + Math.pow(n - k, 2) - Math.pow(r, 2);

  // get discriminant
  const d = Math.pow(b, 2) - 4 * a * c;
  return [a, b, c, d];
}

// https://dirask.com/posts/JavaScript-calculate-intersection-point-of-two-lines-for-given-4-points-VjvnAj
export function lineLineIntersection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
) {
  const c2x = x3 - x4; // (x3 - x4)
  const c3x = x1 - x2; // (x1 - x2)
  const c2y = y3 - y4; // (y3 - y4)
  const c3y = y1 - y2; // (y1 - y2)

  // down part of intersection point formula
  const d = c3x * c2y - c3y * c2x;

  if (d == 0) {
    throw new Error('Number of intersection points is zero or infinity.');
  }

  // upper part of intersection point formula
  const u1 = x1 * y2 - y1 * x2; // (x1 * y2 - y1 * x2)
  const u4 = x3 * y4 - y3 * x4; // (x3 * y4 - y3 * x4)

  // intersection point formula

  const px = (u1 * c2x - c3x * u4) / d;
  const py = (u1 * c2y - c3y * u4) / d;

  return new Coord(px, py);
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

// Vector projection algorithm
// Given (x, y), find the closest point on the line SEGMENT between (x1, y1) and (x2, y2)
export function point_on_line_segment_closest_to_point(x: number, y: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  let ax = x - x1;
  let ay = y - y1;
  let bx = x2 - x1;
  let by = y2 - y1;

  let scalar = (ax * bx + ay * by) / (bx * bx + by * by);
  
  // scalar is a parametric value between 0 and 1, must bound between 0 and 1
  // to get the closest point on the line SEGMENT, not line
  if (scalar < 0) {
    scalar = 0;
  } else if (scalar > 1) {
    scalar = 1;
  }

  return [x1 + scalar * bx, y1 + scalar * by];
}

// Find distance given (x1, y1), (x2, y2)
export function distance_points(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

//hfz
var bezier3Type = "bezier3";
var lineType = "line";

var mathAbs = Math.abs;
var mathAsin = Math.asin;
var mathCos = Math.cos;
var mathMax = Math.max;
var mathMin = Math.min;
var mathPi = Math.PI;
var mathPow = Math.pow;
var mathSin = Math.sin;
var mathSqrt = Math.sqrt;
var mathTan = Math.tan;

var tolerance = 1e-6;
export function isInside(point: any, polygon: any) {
  var segments;
  if (polygon && Array.isArray(polygon)) {
    segments = polygon;
  } else {
    segments = splitSegments(polygon);
  }

  var minX = 0;
  var minY = 0;
  for (var s = 0; s < segments.length; s++) {
    var coords = segments[s].coords;
    for (var c = 0; c < coords.length; c++) {
      var coord = coords[c];
      minX = Math.min(minX, x(coord));
      minY = Math.min(minY, y(coord));
    }
  }
  var zero = [minX - 10, minY - 10];

  var intersections = [];
  for (var i = 0; i < segments.length; i++) {
    var newIntersections = getIntersections(zero, point, segments[i]);
    for (var j = 0; j < newIntersections.length; j++) {
      var seen = false;
      var intersection = newIntersections[j];

      for (var k = 0; k < intersections.length; k++) {
        if (coordEqual(intersections[k], intersection)) {
          seen = true;
          break;
        }
      }

      if (!seen) {
        intersections.push(intersection);
      }
    }
  }

  return intersections.length % 2 === 1;
}

export function x(p: any) {
  return p[0];
}

export function y(p: any) {
  return p[1];
}

// Unpack an SVG path string into different curves and lines
//
// https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d
export function splitSegments(polygon: any)
{
  if (typeof polygon !== "string") {
    throw new Error("Polygon should be a path string");
  }

  let start: any;
  let position: any;
  let result: any = [];
  let input = polygon;

  function stripWhitespace() {
    polygon = polygon.trim();
  }

  function readCharSeq(n: any) {
    var c = polygon.charCodeAt(n);
    while (c >= 48 && c <= 57) {
      n++;
      c = polygon.charCodeAt(n);
    }
    return n;
  }

  function readNumber()
  {
    stripWhitespace();

    var start = 0;
    var end = 0;
    if (polygon[start] === ",") {
      start++;
      end++;
    }

    if (polygon[start] === "-" || polygon[start] === ".") {
      end++;
    }

    end = readCharSeq(end);
    if (polygon[end] === "." && polygon[start] !== ".") {
      end++;
      end = readCharSeq(end);
    }

    var s = polygon.substring(start, end);
    if (s !== "") {
      var num = toFloat(s);
      polygon = polygon.substring(end);
      if (polygon.length && polygon[0].toLowerCase() === "e") {
        var f = 1;
        var expEnd = 0;
        if (polygon.length > 1 && polygon[1] === "-") {
          f = -1;
          expEnd = readCharSeq(2);
        } else {
          expEnd = readCharSeq(1);
        }
        var exp = toFloat(polygon.substring(1, expEnd));
        if (mathAbs(exp) > 0) {
          num *= mathPow(10, exp);
        }
        polygon = polygon.substring(expEnd);
      }
      return num;
    } else {
      throw new Error("Expected number: " + polygon);
    }
  }

  function readNumbers(n: any, fn: any) {
    stripWhitespace();
    var index = 0;
    var c = polygon.charCodeAt(0);
    while ((c >= 48 && c <= 57) || c === 44 || c === 45 || c === 46) {
      var numbers = [];
      for (var i = 0; i < n; i++) {
        numbers.push(readNumber());
      }
      fn(numbers, index);

      stripWhitespace();
      c = polygon.charCodeAt(0);
      index++;
    }
  }

  function readCoords(n: any, fn: any) {
    readNumbers(n * 2, function (numbers: any, index: any) {
      var coords = [];
      for (var i = 0; i < n; i++) {
        coords.push(numbers.splice(0, 2));
      }
      fn(coords, index);
    });
  }

  function pushType(itemType: any, offset: any) {
    return function (c: any) {
      if (offset) {
        c = c.map(function (c: any) {
          return [x(c) + x(position), y(c) + y(position)];
        });
      }
      c.unshift(position);
      result.push({
        type: itemType,
        coords: c,
      });
      position = c[c.length - 1];
    };
  }

  function calculateCubicControlPoints(coords: any) {
    return [coords[0], [
      x(coords[0]) + 2.0 / 3.0 * (x(coords[1]) - x(coords[0])),
      y(coords[0]) + 2.0 / 3.0 * (y(coords[1]) - y(coords[0])),
    ], [
      x(coords[2]) + 2.0 / 3.0 * (x(coords[1]) - x(coords[2])),
      y(coords[2]) + 2.0 / 3.0 * (y(coords[1]) - y(coords[2])),
    ], coords[2],
    ];
  }

  function calculateBezierControlPoint() {
    var lastBezier = result[result.length - 1];
    var controlPoint = null;
    if (!lastBezier || lastBezier.type !== bezier3Type) {
      controlPoint = position;
    } else {
      // Calculate the mirror point of the last control point
      var lastPoint = lastBezier.coords[2];
      var xOffset = x(position) - x(lastPoint);
      var yOffset = y(position) - y(lastPoint);

      controlPoint = [x(position) + xOffset, y(position) + yOffset];
    }

    return controlPoint;
  }

  function handleArcSegment(relative: any) {
    readNumbers(7, function (numbers: any) {
      var c2 = coordAdd(numbers.slice(5, 7), relative);
      var args = [position].concat(numbers.slice(0, 5)).concat([c2]);
      // @ts-ignore
      var curve = arcToCurve.apply( args);
      for (var i = 0; i < curve.length; i++) {
        pushType(bezier3Type, curve[i]);
      }
    });
  }

  function readSegment() {
    stripWhitespace();
    if (polygon === "") {
      return;
    }

    var operator = polygon[0];
    polygon = polygon.substring(1);

    var pushLine = pushType(lineType, null);
    var origin = [0, 0];

    switch (operator) {
      case "M":
        readCoords(1, function (c: any, i: any) {
          if (i === 0) {
            position = c[0];
            if (!start) {
              start = position;
            }
          } else {
            pushType(lineType, c);
          }
        });
        break;
      case "m":
        readCoords(1, function (c: any, i: any) {
          if (i === 0) {
            if (!position) {
              position = c[0];
            } else {
              position = coordAdd(c[0], position);
            }

            if (!start) {
              start = position;
            }
          } else {
            var c0 = c[0];
            pushType(lineType, [coordAdd(c0, position)]);
          }
        });
        break;
      case "C":
        readCoords(3, pushType(bezier3Type, null));
        break;
      case "c":
        readCoords(3, pushType(bezier3Type, true));
        break;
      case "Q":
        readCoords(2, function (coords: any) {
          coords.unshift(position);
          coords = calculateCubicControlPoints(coords);
          coords.shift();
          pushType(bezier3Type, coords);
        });
        break;
      case "q":
        readCoords(2, function (coords: any) {
          coords = coords.map(function (c: any) { return coordAdd(c, position); });
          coords.unshift(position);
          coords = calculateCubicControlPoints(coords);
          coords.shift();
          pushType(bezier3Type, coords);
        });
        break;
      case "S":
        readCoords(2, function (coords: any) {
          var controlPoint = calculateBezierControlPoint();
          coords.unshift(controlPoint);
          pushType(bezier3Type, coords);
        });
        break;
      case "s":
        readCoords(2, function (coords: any) {
          var controlPoint = calculateBezierControlPoint();
          coords = coords.map(function (c: any) { return coordAdd(c, position); });
          coords.unshift(controlPoint);
          pushType(bezier3Type, coords);
        });
        break;
      case "A":
        handleArcSegment(origin);
        break;
      case "a":
        handleArcSegment(position);
        break;
      case "L":
        readCoords(1, pushType(lineType, null));
        break;
      case "l":
        readCoords(1, function (c: any) {
          pushLine([[x(c[0]) + x(position), y(c[0]) + y(position)]]);
        });
        break;
      case "H":
        pushType(lineType, [[readNumber(), y(position)]]);
        break;
      case "h":
        pushType(lineType, true)([[readNumber(), 0]]);
        break;
      case "V":
        pushType(lineType, [[x(position), readNumber()]]);
        break;
      case "v":
        pushType(lineType, true)([[0, readNumber()]]);
        break;
      case "Z":
      case "z":
        if (!coordEqual(position, start)) {
          pushType(lineType,[start]);
        }
        break;
      default:
        throw new Error("Unknown operator: " + operator + " for polygon '" + input + "'");
    }
  }

  while (polygon.length > 0) {
    readSegment();
  }

  // Remove zero-length lines
  for (var i = 0; i < result.length; i++) {
    var segment = result[i];
    if (segment.type === lineType && coordEqual(segment.coords[0], segment.coords[1])) {
      result.splice(i, 1);
      i--;
    }
  }

  return result;
}

export function getIntersections(zero: any, point: any, shape: any) {
  var coords = shape.coords;
  switch (shape.type) {
    case bezier3Type:
      return intersectBezier3Line(coords[0], coords[1], coords[2], coords[3], zero, point);
    case lineType:
      return intersectLineLine(coords[0], coords[1], zero, point);
    default:
      throw new Error("Unsupported shape type: " + shape.type);
  } // jscs:ignore validateIndentation
  // ^ (jscs bug)
}
export function coordMax(c1: any, c2: any) {
  return [mathMax(x(c1), x(c2)), mathMax(y(c1), y(c2))];
}

export function coordMin(c1: any, c2: any) {
  return [mathMin(x(c1), x(c2)), mathMin(y(c1), y(c2))];
}

export function coordMultiply(c: any, f: any) {
  return [x(c) * f, y(c) * f];
}

function coordDot(c1: any, c2: any) {
  return x(c1) * x(c2) + y(c1) * y(c2);
}

function coordLerp(c1: any, c2: any, t: any) {
  return [x(c1) + (x(c2) - x(c1)) * t, y(c1) + (y(c2) - y(c1)) * t];
}

function linearRoot(p2: any, p1: any) {
  var results = [];

  var a = p2;
  if (a !== 0) {
    results.push(-p1 / p2);
  }

  return results;
}
function quadRoots(p3: any, p2: any, p1: any) {
  var results = [];

  if (mathAbs(p3) <= tolerance) {
    return linearRoot(p2, p1);
  }

  var a = p3;
  var b = p2 / a;
  var c = p1 / a;
  var d = b * b - 4 * c;
  if (d > 0) {
    var e = mathSqrt(d);
    results.push(0.5 * (-b + e));
    results.push(0.5 * (-b - e));
  } else if (d === 0) {
    results.push(0.5 * -b);
  }

  return results;
}

export function cubeRoots(p4: any, p3: any, p2: any, p1: any) {
  if (mathAbs(p4) <= tolerance) {
    return quadRoots(p3, p2, p1);
  }

  var results = [];

  var c3 = p4;
  var c2 = p3 / c3;
  var c1 = p2 / c3;
  var c0 = p1 / c3;

  var a = (3 * c1 - c2 * c2) / 3;
  var b = (2 * c2 * c2 * c2 - 9 * c1 * c2 + 27 * c0) / 27;
  var offset = c2 / 3;
  var discrim = b * b / 4 + a * a * a / 27;
  var halfB = b / 2;

  /* This should be here, but there's a typo in the original code (disrim =
   * 0) which causes it not to be present there. Ironically, adding the
   * following code breaks the algorithm, whereas leaving it out makes it
   * work correctly.
  if (mathAbs(discrim) <= tolerance) {
      discrim = 0;
  }
  */

  var tmp;
  if (discrim > 0) {
    var e = mathSqrt(discrim);
    tmp = -halfB + e;
    var root = tmp >= 0 ? mathPow(tmp, 1 / 3) : -mathPow(-tmp, 1 / 3);
    tmp = -halfB - e;
    if (tmp >= 0) {
      root += mathPow(tmp, 1 / 3);
    } else {
      root -= mathPow(-tmp, 1 / 3);
    }
    results.push(root - offset);
  } else if (discrim < 0) {
    var distance = mathSqrt(-a / 3);
    var angle = Math.atan2(mathSqrt(-discrim), -halfB) / 3;
    var cos = mathCos(angle);
    var sin = mathSin(angle);
    var sqrt3 = mathSqrt(3);
    results.push(2 * distance * cos - offset);
    results.push(-distance * (cos + sqrt3 * sin) - offset);
    results.push(-distance * (cos - sqrt3 * sin) - offset);
  } else {
    if (halfB >= 0) {
      tmp = -mathPow(halfB, 1 / 3);
    } else {
      tmp = mathPow(-halfB, 1 / 3);
    }
    results.push(2 * tmp - offset);
    results.push(-tmp - offset);
  }

  return results;
}
export function intersectBezier3Line(p1: any, p2: any, p3: any, p4: any, a1: any, a2: any) {
  var result = [];

  var min = coordMin(a1, a2); // used to determine if point is on line segment
  var max = coordMax(a1, a2); // used to determine if point is on line segment

  // Start with Bezier using Bernstein polynomials for weighting functions:
  //     (1-t^3)P1 + 3t(1-t)^2P2 + 3t^2(1-t)P3 + t^3P4
  //
  // Expand and collect terms to form linear combinations of original Bezier
  // controls.  This ends up with a vector cubic in t:
  //     (-P1+3P2-3P3+P4)t^3 + (3P1-6P2+3P3)t^2 + (-3P1+3P2)t + P1
  //             /\                  /\                /\       /\
  //             ||                  ||                ||       ||
  //             c3                  c2                c1       c0

  // Calculate the coefficients
  var a = coordMultiply(p1, -1);
  var b = coordMultiply(p2, 3);
  var c = coordMultiply(p3, -3);
  var c3 = coordAdd(a, coordAdd(b, coordAdd(c, p4)));

  a = coordMultiply(p1, 3);
  b = coordMultiply(p2, -6);
  c = coordMultiply(p3, 3);
  var c2 = coordAdd(a, coordAdd(b, c));

  a = coordMultiply(p1, -3);
  b = coordMultiply(p2, 3);
  var c1 = coordAdd(a, b);

  var c0 = p1;

  // Convert line to normal form: ax + by + c = 0
  // Find normal to line: negative inverse of original line's slope
  var n = [y(a1) - y(a2), x(a2) - x(a1)];

  // Determine new c coefficient
  var cl = x(a1) * y(a2) - x(a2) * y(a1);

  // ?Rotate each cubic coefficient using line for new coordinate system?
  // Find roots of rotated cubic
  var roots = cubeRoots(
      coordDot(n, c3),
      coordDot(n, c2),
      coordDot(n, c1),
      coordDot(n, c0) + cl
  );

  // Any roots in closed interval [0,1] are intersections on Bezier, but
  // might not be on the line segment.
  // Find intersections and calculate point coordinates
  for (var i = 0; i < roots.length; i++) {
    var t = roots[i];

    if (t >= 0 && t <= 1) {
      // We're within the Bezier curve
      // Find point on Bezier
      var p5 = coordLerp(p1, p2, t);
      var p6 = coordLerp(p2, p3, t);
      var p7 = coordLerp(p3, p4, t);

      var p8 = coordLerp(p5, p6, t);
      var p9 = coordLerp(p6, p7, t);

      var p10 = coordLerp(p8, p9, t);

      // See if point is on line segment
      // Had to make special cases for vertical and horizontal lines due
      // to slight errors in calculation of p10
      if (x(a1) === x(a2)) {
        if (y(min) <= y(p10) && y(p10) <= y(max)) {
          result.push(p10);
        }
      } else if (y(a1) === y(a2)) {
        if (x(min) <= x(p10) && x(p10) <= x(max)) {
          result.push(p10);
        }
      } else if (x(min) <= x(p10) && x(p10) <= x(max) && y(min) <= y(p10) && y(p10) <= y(max)) {
        result.push(p10);
      }
    }
  }

  return result;
}

export function intersectLineLine(a1: any, a2: any, b1: any, b2: any) {
  var ua_t = (x(b2) - x(b1)) * (y(a1) - y(b1)) - (y(b2) - y(b1)) * (x(a1) - x(b1));
  var ub_t = (x(a2) - x(a1)) * (y(a1) - y(b1)) - (y(a2) - y(a1)) * (x(a1) - x(b1));
  var u_b = (y(b2) - y(b1)) * (x(a2) - x(a1)) - (x(b2) - x(b1)) * (y(a2) - y(a1));

  if (u_b !== 0) {
    var ua = ua_t / u_b;
    var ub = ub_t / u_b;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      return [
        [
          x(a1) + ua * (x(a2) - x(a1)),
          y(a1) + ua * (y(a2) - y(a1)),
        ]
      ];
    }
  }

  return [];
}

export function coordEqual(c1: any, c2: any) {
  return Math.abs(x(c1) - x(c2)) < 1e-10 && Math.abs(y(c1) - y(c2)) < 1e-10;
}

export function coordAdd(c1: any, c2: any) {
  return [x(c1) + x(c2), y(c1) + y(c2)];
}

export function toFloat(v: any) {
  return parseFloat(v);
}

// @ts-ignore
export function arcToCurve(cp1: any, rx: any, ry: any, angle: any, large_arc: any, sweep: any, cp2: any, recurse: any) {
  function rotate(cx: any, cy: any, r: any) {
    var cos = mathCos(r);
    var sin = mathSin(r);
    return [
      cx * cos - cy * sin,
      cx * sin + cy * cos,
    ];
  }

  var x1 = x(cp1);
  var y1 = y(cp1);
  var x2 = x(cp2);
  var y2 = y(cp2);

  var rad = mathPi / 180 * (+angle || 0);
  var f1 = 0;
  var f2 = 0;
  var cx;
  var cy;
  var res = [];

  if (!recurse) {
    var xy = rotate(x1, y1, -rad);
    x1 = x(xy);
    y1 = y(xy);
    xy = rotate(x2, y2, -rad);
    x2 = x(xy);
    y2 = y(xy);

    var px = (x1 - x2) / 2;
    var py = (y1 - y2) / 2;
    var h = (px * px) / (rx * rx) + (py * py) / (ry * ry);
    if (h > 1) {
      h = mathSqrt(h);
      rx = h * rx;
      ry = h * ry;
    }

    var rx2 = rx * rx;
    var ry2 = ry * ry;

    var k = (large_arc === sweep ? -1 : 1)
        * mathSqrt(mathAbs((rx2 * ry2 - rx2 * py * py - ry2 * px * px) / (rx2 * py * py + ry2 * px * px)));

    cx = k * rx * py / ry + (x1 + x2) / 2;
    cy = k * -ry * px / rx + (y1 + y2) / 2;
    f1 = mathAsin(Number(((y1 - cy) / ry).toFixed(9)));
    f2 = mathAsin(Number(((y2 - cy) / ry).toFixed(9)));

    f1 = x1 < cx ? mathPi - f1 : f1;
    f2 = x2 < cx ? mathPi - f2 : f2;

    if (f1 < 0) {
      f1 = mathPi * 2 + f1;
    }
    if (f2 < 0) {
      f2 = mathPi * 2 + f2;
    }
    if (sweep && f1 > f2) {
      f1 = f1 - mathPi * 2;
    }
    if (!sweep && f2 > f1) {
      f2 = f2 - mathPi * 2;
    }
  } else {
    f1 = recurse[0];
    f2 = recurse[1];
    cx = recurse[2];
    cy = recurse[3];
  }

  var df = f2 - f1;
  if (mathAbs(df) > mathPi * 120 / 180) {
    var f2old = f2;
    var x2old = x2;
    var y2old = y2;

    f2 = f1 + mathPi * 120 / 180 * (sweep && f2 > f1 ? 1 : -1);
    x2 = cx + rx * mathCos(f2);
    y2 = cy + ry * mathSin(f2);
    res = arcToCurve([x2, y2], rx, ry, angle, 0, sweep, [x2old, y2old], [f2, f2old, cx, cy]);
  }

  df = f2 - f1;

  var c1 = mathCos(f1);
  var s1 = mathSin(f1);
  var c2 = mathCos(f2);
  var s2 = mathSin(f2);
  var t = mathTan(df / 4);
  var hx = 4 / 3 * rx * t;
  var hy = 4 / 3 * ry * t;
  var m1 = [x1, y1];
  var m2 = [x1 + hx * s1, y1 - hy * c1];
  var m3 = [x2 + hx * s2, y2 - hy * c2];
  var m4 = [x2, y2];
  m2[0] = 2 * m1[0] - m2[0];
  m2[1] = 2 * m1[1] - m2[1];

  function splitArray(n: any) {
    return function (array: any) {
      return array.reduce(function (m: any, v: any, i: any, l: any) {
        if (i % n) {
          return m;
        }

        return m.concat([l.slice(i, i + n)]);
      }, []);
    };
  }

  var splitArray3 = splitArray(3);
  var splitArray2 = splitArray(2);
  function splitCurves(curves: any) {
    return splitArray3(splitArray2(curves));
  }

  if (recurse) {
    return splitCurves([m2, m3, m4].concat(res));
  } else {
    res = [m2, m3, m4].concat(res).join().split(",");
    var newres = [];
    for (var i = 0, ii = res.length; i < ii; i++) {
      newres[i] = i % 2 ? rotate(res[i - 1], res[i], rad)[1] : rotate(res[i], res[i + 1], rad)[0];
    }
    return splitCurves(newres);
  }
}
