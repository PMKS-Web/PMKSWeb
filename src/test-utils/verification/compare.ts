import { VerificationDataset } from '../../test-data/verification/types';
import { KinematicsTrace } from './solve';

/**
 * Pairs each PMKS+ timestep with the MATLAB row at the same input-crank
 * rotation, matched on (whole degrees rotated since start, sweep direction).
 * Both sides step the input exactly 1 degree per row from the same starting
 * position, but they detect toggle points of non-full-rotation linkages a
 * step or two apart, so indices cannot be compared directly.
 */
export interface AlignmentReport {
  pairs: [number, number][];
  eligibleExpectedRows: number[];
  ignoredExpectedRows: number[];
  ignoredActualTimesteps: number[];
  unmatchedExpectedRows: number[];
  unmatchedActualTimesteps: number[];
}

export function alignRows(
  actualAngles: number[],
  expectedAngles: number[],
  excludedExpectedRows: number[] = [],
  excludedActualTimesteps: number[] = [],
  expectedDirections?: number[]
): AlignmentReport {
  const signedDeltas = (angles: number[]) =>
    angles.map((angle, i) => {
      let delta = i + 1 < angles.length ? angles[i + 1] - angle : angle - angles[i - 1];
      delta = ((delta + 540) % 360) - 180;
      return delta >= 0 ? 1 : -1;
    });
  const keys = (angles: number[], dirs: number[]) => {
    const wrap = (a: number) => ((a % 360) + 360) % 360;
    return angles.map(
      (angle, i) => `${Math.round(wrap(angle - angles[0])) % 360}|${dirs[i] > 0 ? '+' : '-'}`
    );
  };
  const expectedDirs = expectedDirections ?? signedDeltas(expectedAngles);
  if (expectedDirs.length !== expectedAngles.length) {
    throw new Error('Expected angle and direction series must have the same length');
  }
  const actualDirs = signedDeltas(actualAngles);
  const expectedByKey = new Map<string, number[]>();
  const eligibleExpectedRows: number[] = [];
  const ignoredExpectedRows: number[] = [];
  keys(expectedAngles, expectedDirs).forEach((key, row) => {
    if (excludedExpectedRows.includes(row)) {
      ignoredExpectedRows.push(row);
      return;
    }
    eligibleExpectedRows.push(row);
    const rows = expectedByKey.get(key) ?? [];
    rows.push(row);
    expectedByKey.set(key, rows);
  });
  const pairs: [number, number][] = [];
  const ignoredActualTimesteps: number[] = [];
  const unmatchedActualTimesteps: number[] = [];
  keys(actualAngles, actualDirs).forEach((key, t) => {
    if (excludedActualTimesteps.includes(t)) {
      ignoredActualTimesteps.push(t);
      return;
    }
    const rows = expectedByKey.get(key);
    const row = rows?.shift();
    if (row === undefined) {
      unmatchedActualTimesteps.push(t);
      return;
    }
    pairs.push([t, row]);
  });
  const unmatchedExpectedRows = [...expectedByKey.values()].flat().sort((a, b) => a - b);
  return {
    pairs,
    eligibleExpectedRows,
    ignoredExpectedRows,
    ignoredActualTimesteps,
    unmatchedExpectedRows,
    unmatchedActualTimesteps,
  };
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

export function expectSeriesToMatch(report: SeriesReport, expectedRows: number) {
  expect(
    report.comparedRows,
    `${report.label}: only ${report.comparedRows} rows could be compared`
  ).toBe(expectedRows);
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
  crankTipId: string,
  excludedExpectedRows: number[] = [],
  excludedActualTimesteps: number[] = []
): AlignmentReport {
  const actualAngles = crankAngleSeries(
    trace.jointPos.map((pos) => ({ a: pos[inputJointId], b: pos[crankTipId] }))
  );
  const expectedAngles = dataset.samples.map((sample) => (sample.inputAngleRad * 180) / Math.PI);
  const expectedDirections = dataset.samples.map((sample) => sample.inputDirection);
  return alignRows(
    actualAngles,
    expectedAngles,
    excludedExpectedRows,
    excludedActualTimesteps,
    expectedDirections
  );
}

/**
 * Where a sampled path turns round, ignoring wobble below `noise`.
 *
 * Joint positions are rounded, so a smooth extremum is a run of samples that
 * differ in the last digit and a plain sign-change count reads three reversals
 * in a path that has two. Stepping from the last confirmed point rather than
 * from the previous sample takes the rounding out.
 */
export function turningPoints(values: number[], noise: number): number[] {
  const turns: number[] = [];
  let direction = 0;
  let anchor = 0;
  for (let i = 1; i < values.length; i++) {
    const step = values[i] - values[anchor];
    if (Math.abs(step) < noise) continue;
    const now = Math.sign(step);
    if (direction !== 0 && now !== direction) turns.push(anchor);
    direction = now;
    anchor = i;
  }
  return turns;
}
