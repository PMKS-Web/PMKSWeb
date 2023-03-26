import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Coord } from './coord';
import { Shape } from './link';
import { Pose } from './pose';
import { ConstrucLines } from './constructionlines_syn';

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
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
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
  var AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
  var BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
  var AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
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
    }

    else if (pose1.angle > 0 && pose1.angle < 90) {

        pose1.coord1.x = pose1.midpoint.x - 0.5 * length * Math.cos(degToRad(pose1.angle + 180));
        pose1.coord1.y = pose1.midpoint.y - 0.5 * length * Math.sin(degToRad(pose1.angle + 180));

        pose1.coord2.x = pose1.midpoint.x + 0.5 * length * Math.cos(degToRad(pose1.angle));
        pose1.coord2.y = pose1.midpoint.y + 0.5 * length * Math.sin(degToRad(pose1.angle));
    }
    else if (pose1.angle < 0 && pose1.angle < -90) {
        pose1.coord1.x = pose1.midpoint.x - 0.5 * length * Math.cos(degToRad(pose1.angle+180));
        pose1.coord1.y = pose1.midpoint.y - 0.5 * length * Math.sin(degToRad(pose1.angle+180));

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
    var midpoint_line1 = new Coord((pose1.coord1.x + pose2.coord1.x) / 2, (pose1.coord1.y + pose2.coord1.y) / 2);
    var midpoint_line2 = new Coord((pose3.coord1.x + pose2.coord1.x) / 2, (pose3.coord1.y + pose2.coord1.y) / 2);

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
    var midpoint_line1 = new Coord((pose1.coord2.x + pose2.coord2.x) / 2, (pose1.coord2.y + pose2.coord2.y) / 2);
    var midpoint_line2 = new Coord((pose3.coord2.x + pose2.coord2.x) / 2, (pose3.coord2.y + pose2.coord2.y) / 2);

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
export function line_intersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
) {
  var ua,
    ub,
    denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom == 0) {
    return [-9999, -9999];
    // return null;
  }
  ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
  // return {
  //   x: x1 + ua * (x2 - x1),
  //   y: y1 + ua * (y2 - y1),
  //   seg1: ua >= 0 && ua <= 1,
  //   seg2: ub >= 0 && ub <= 1
  // };
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

export function is_touch_enabled() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
