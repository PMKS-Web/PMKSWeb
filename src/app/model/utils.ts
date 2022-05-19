import {Joint} from "./joint";
import {Coord} from "./coord";

export class Utils {
}

// radToDeg

// degToRad

export function roundNumber(num: number, scale: number): number {
  return Math.round(num * 10000) / 10000;
}

// https://jamesmccaffrey.wordpress.com/2020/04/24/matrix-inverse-with-javascript/
export function vecMake(n: number, val: number)
{
  let result = [];
  for (let i = 0; i < n; ++i) {
  result[i] = val;
}
  return result;
}

export function vecInit(s: string)
{
  let vals = s.split(',');
  let result = [];
  for (let i = 0; i < vals.length; ++i) {
  result[i] = parseFloat(vals[i]);
}
  return result;
}

export function matMake(rows: number, cols: number, val: number)
{
  let result: Array<Array<number>> = [];
  for (let i = 0; i < rows; ++i) {
  result[i] = [];
  for (let j = 0; j < cols; ++j) {
    result[i][j] = val;
  }
}
  return result;
}

export function matInit(rows: number, cols: number, s: string)
{
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

export function matProduct(ma: Array<Array<number>>, mb: Array<Array<number>>)
{
  let aRows = ma.length;
  let aCols = ma[0].length;
  let bRows = mb.length;
  let bCols = mb[0].length;
  if (aCols != bRows) {
    throw "Non-conformable matrices";
  }

  let result = matMake(aRows, bCols, 0.0);

  for (let i = 0; i < aRows; ++i) { // each row of A
  for (let j = 0; j < bCols; ++j) { // each col of B
    for (let k = 0; k < aCols; ++k) { // could use bRows
      result[i][j] += ma[i][k] * mb[k][j];
    }
  }
}

  return result;
}

export function matInverse(m: Array<Array<number>>)
{
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
  let perm = vecMake(n, 0.0);  // out parameter
  matDecompose(m, lum, perm);  // ignore return

  let b = vecMake(n, 0.0);
  for (let i = 0; i < n; ++i) {
  for (let j = 0; j < n; ++j) {
    if (i == perm[j])
      b[j] = 1.0;
    else
      b[j] = 0.0;
  }

  let x = reduce(lum, b); //
  for (let j = 0; j < n; ++j)
  result[j][i] = x[j];
}
  return result;
}

export function matDeterminant(m: Array<Array<number>>)
{
  let n = m.length;
  let lum = matMake(n, n, 0.0);
  let perm = vecMake(n, 0.0);
  let result = matDecompose(m, lum, perm);  // -1 or +1
  for (let i = 0; i < n; ++i)
  result *= lum[i][i];
  return result;
}

export function matDecompose(m: Array<Array<number>>, lum: Array<Array<number>>, perm: Array<number>)
{
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
  for (let i = 0; i < n; ++i)
  perm[i] = i;

  for (let j = 0; j < n - 1; ++j) {  // note n-1
  let max = Math.abs(lum[j][j]);
  let piv = j;

  for (let i = j + 1; i < n; ++i) {  // pivot index
    let xij = Math.abs(lum[i][j]);
    if (xij > max) {
      max = xij;
      piv = i;
    }
  } // i

  if (piv != j) {
    let tmp = lum[piv];  // swap rows j, piv
    lum[piv] = lum[j];
    lum[j] = tmp;

    let t = perm[piv];  // swap perm elements
    perm[piv] = perm[j];
    perm[j] = t;

    toggle = -toggle;
  }

  let xjj = lum[j][j];
  if (xjj != 0.0) {  // TODO: fix bad compare here
    for (let i = j + 1; i < n; ++i) {
      let xij = lum[i][j] / xjj;
      lum[i][j] = xij;
      for (let k = j + 1; k < n; ++k) {
        lum[i][k] -= xij * lum[j][k];
      }
    }
  }

} // j

  return toggle;  // for determinant
} // matDecompose

export function reduce(lum: Array<Array<number>>, b: Array<number>) // helper
{
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
  return [(A[1] * B[2] - A[2] * B[1]), -1 * (A[0] * B[2] - A[2] * B[0]), (A[0] * B[1] - A[1] * B[0])];
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

export function getXDistance(r: number, theta: number) {
  return Math.cos(theta) * r;
}

export function getYDistance(r: number, theta: number) {
  return Math.sin(theta) * r;
}
