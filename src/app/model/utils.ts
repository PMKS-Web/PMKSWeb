import { Joint } from './joint';
import { Coord } from './coord';
import { Shape } from './link';

export class Utils {}

// radToDeg

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

export function splitURLInfo(str: string) {
  const decodedURL = decodeURI(window.location.href);
  let indexVal = decodedURL.indexOf(str);
  if (indexVal === -1) {
    return [];
  } else if (str === 'j=') {
    indexVal += 2;
  } else {
    indexVal += 3;
  }
  let nextIndexVal: number;
  switch (str) {
    case 'j=':
      nextIndexVal = decodedURL.indexOf('&l=');
      break;
    case '&l=':
      nextIndexVal = decodedURL.indexOf('&f=');
      break;
    case '&f=':
      nextIndexVal = decodedURL.indexOf('&s=');
      break;
    case '&s=':
      nextIndexVal = decodedURL.length;
      break;
    default:
      throw new Error('ummm??');
  }
  return decodedURL.substring(indexVal, nextIndexVal);
  // return settingArrayString.split(',');
}

// TODO: In future, can replace with this: https://www.gatevidyalay.com/2d-rotation-in-computer-graphics-definition-examples/
// Easier to understand, less variables to account for, and computationally faster
export function determineUnknownJointUsingTriangulation(x1: number, y1: number, x2: number, y2: number, r1: number,
                                                        prevJoint_x: number, prevJoint_y: number,
                                                        angle: number, internal_angle: number ) {
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
