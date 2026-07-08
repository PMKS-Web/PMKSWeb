import { VerificationDataset } from '../../test-data/verification/types';
import { KinematicsTrace } from './solve';

/**
 * Pairs each PMKS+ timestep with the MATLAB row at the same input-crank
 * rotation, matched on (whole degrees rotated since start, sweep direction).
 * Both sides step the input exactly 1 degree per row from the same starting
 * position, but they detect toggle points of non-full-rotation linkages a
 * step or two apart, so indices cannot be compared directly.
 */
export function alignRows(actualAngles: number[], expectedAngles: number[]): [number, number][] {
  const signedDeltas = (angles: number[]) =>
    angles.map((angle, i) => {
      let delta = i + 1 < angles.length ? angles[i + 1] - angle : angle - angles[i - 1];
      delta = ((delta + 540) % 360) - 180;
      return delta >= 0 ? 1 : -1;
    });
  // Rows next to a direction reversal are dropped: the two solvers detect
  // toggle points a step or two apart, so the boundary rows pair up with the
  // opposite sweep direction and their velocities differ by a sign.
  const nearToggle = (dirs: number[]) =>
    dirs
      .map((dir, i) => dirs[i - 1] !== undefined && dirs[i - 1] !== dir)
      .map((flip, i, flips) => flip || flips[i + 1] === true);
  const keys = (angles: number[], dirs: number[]) => {
    const wrap = (a: number) => ((a % 360) + 360) % 360;
    return angles.map(
      (angle, i) => `${Math.round(wrap(angle - angles[0])) % 360}|${dirs[i] > 0 ? '+' : '-'}`
    );
  };
  const expectedDirs = signedDeltas(expectedAngles);
  const actualDirs = signedDeltas(actualAngles);
  const expectedNearToggle = nearToggle(expectedDirs);
  const actualNearToggle = nearToggle(actualDirs);
  const expectedByKey = new Map<string, number>();
  keys(expectedAngles, expectedDirs).forEach((key, row) => {
    if (!expectedByKey.has(key) && !expectedNearToggle[row]) {
      expectedByKey.set(key, row);
    }
  });
  const pairs: [number, number][] = [];
  keys(actualAngles, actualDirs).forEach((key, t) => {
    const row = expectedByKey.get(key);
    if (row !== undefined && !actualNearToggle[t]) {
      pairs.push([t, row]);
    }
  });
  return pairs;
}

/** Input-crank angle (deg) per timestep/row, from two tracked points on the crank. */
export function crankAngleSeries(points: { a: [number, number]; b: [number, number] }[]): number[] {
  return points.map(({ a, b }) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
}

export interface Tolerance {
  /** Absolute floor for the allowed error. */
  abs: number;
  /** Fraction of the expected series' amplitude added to the floor. */
  rel: number;
}

export interface SeriesReport {
  label: string;
  comparedRows: number;
  amplitude: number;
  maxErr: number;
  maxErrAt: string;
  rmse: number;
  tolerance: number;
}

/**
 * Compares an actual per-timestep series against the expected per-row series
 * over the aligned (timestep, row) pairs. `actual` entries may be missing for
 * quantities the solver does not report (the comparison then fails loudly).
 */
export function compareSeries(
  label: string,
  pairs: [number, number][],
  actual: (t: number) => number[] | undefined,
  expected: (row: number) => number[] | undefined,
  tolerance: Tolerance
): SeriesReport {
  let amplitude = 0;
  let maxErr = -1;
  let maxErrAt = '';
  let sumSq = 0;
  let compared = 0;
  for (const [t, row] of pairs) {
    const exp = expected(row);
    if (exp === undefined) {
      continue;
    }
    const act = actual(t);
    amplitude = Math.max(amplitude, ...exp.map(Math.abs));
    let err: number;
    if (act === undefined) {
      err = Number.POSITIVE_INFINITY;
    } else {
      err = Math.hypot(...exp.map((e, i) => e - act[i]));
    }
    if (err > maxErr) {
      maxErr = err;
      maxErrAt = `t=${t}/row=${row} actual=[${act}] expected=[${exp}]`;
    }
    sumSq += err * err;
    compared++;
  }
  return {
    label,
    comparedRows: compared,
    amplitude,
    maxErr,
    maxErrAt,
    rmse: compared > 0 ? Math.sqrt(sumSq / compared) : NaN,
    tolerance: tolerance.abs + tolerance.rel * amplitude,
  };
}

export function expectSeriesToMatch(report: SeriesReport, minRows = 1) {
  expect(
    report.comparedRows,
    `${report.label}: only ${report.comparedRows} rows could be compared`
  ).toBeGreaterThanOrEqual(minRows);
  expect(
    report.maxErr,
    `${report.label}: max error ${report.maxErr.toPrecision(4)} over ${
      report.comparedRows
    } rows exceeds tolerance ${report.tolerance.toPrecision(4)} ` +
      `(amplitude ${report.amplitude.toPrecision(4)}, rmse ${report.rmse.toPrecision(4)}) at ${
        report.maxErrAt
      }`
  ).toBeLessThanOrEqual(report.tolerance);
}

/** Standard aligned-row map for a dataset, keyed off the input crank A->B line. */
export function alignToDataset(
  trace: KinematicsTrace,
  dataset: VerificationDataset,
  inputJointId: string,
  crankTipId: string
): [number, number][] {
  const actualAngles = crankAngleSeries(
    trace.jointPos.map((pos) => ({ a: pos[inputJointId], b: pos[crankTipId] }))
  );
  const expectedAngles = crankAngleSeries(
    dataset.jointPos[inputJointId].map((a, row) => ({
      a: [a[0], a[1]] as [number, number],
      b: [dataset.jointPos[crankTipId][row][0], dataset.jointPos[crankTipId][row][1]] as [
        number,
        number,
      ],
    }))
  );
  return alignRows(actualAngles, expectedAngles);
}
