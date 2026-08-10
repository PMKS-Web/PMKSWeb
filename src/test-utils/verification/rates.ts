// joint.ts first: see the import-cycle note in fixture.ts.
import '../../app/model/joint';
import { BuiltMechanism } from './fixture';
import { solveKinematics } from './solve';

/**
 * Checking a solved velocity against the motion it is supposed to describe.
 *
 * Position and velocity leave the app by different routes — the ordering walk
 * or the constraint set for one, the loop matrix or the differentiated
 * constraints for the other — so differencing the positions is a genuine
 * cross-check rather than a restatement. It is the check that catches the
 * failure this suite exists to prevent: a joint that visibly travels and graphs
 * as stationary, which no assertion about positions alone can see.
 *
 * `e2e/template-graphs.mjs` does the same thing through the browser, against
 * what the Analyze panel actually plots. This is the same arithmetic one layer
 * down, where the positions have not been rounded for display and every joint
 * is reachable whether or not the UI can select it.
 */

/**
 * How far a solved velocity may sit from the difference quotient of its own
 * position, as a fraction of that joint's peak speed.
 *
 * A difference quotient carries its own truncation error, and the tolerance has
 * to clear that before it can say anything about the app. The five-point
 * stencil used here is O(dt^4); measured across this library it comes to 0.002%
 * of peak on the cylinder-driven machines, 0.06% on Jansen's leg, and 0.4% at
 * the single worst sample of the shaper, whose ram is turned round fast by the
 * quick return. One percent clears the worst of those by a factor of two and a
 * half.
 *
 * That is far tighter than it needs to be for what it discriminates: the
 * failures this pins were 45% to 450% wrong, or produced no velocity at all.
 * Anything up to about 40% would separate those. One percent is chosen because
 * it is roughly the tightest bound the arithmetic itself supports, so a
 * regression has nowhere to hide.
 */
export const RATE_TOLERANCE = 0.01;

/** Worst disagreement found, and where. */
export interface RateAgreement {
  /**
   * The largest gap between a solved velocity component and the difference
   * quotient of the position it derives from, as a fraction of that joint's own
   * peak speed. Scaled that way so a mechanism's size and input speed drop out.
   */
  worst: number;
  worstJoint: string;
  worstAxis: 'x' | 'y';
  worstAt: number;
  /** Joints the solver returned no velocity for at any timestep. */
  unsolved: string[];
  /** Joints that move but whose solved speed never leaves zero. */
  stationary: string[];
  /** How many samples were compared, so an empty check cannot pass by default. */
  compared: number;
}

/**
 * How far apart the two one-sided slopes must be, against the series' own
 * typical slope, before the position is called non-differentiable there.
 */
const KINK_FACTOR = 0.5;
/** How many samples either side of such a corner no stencil can reach across. */
const KINK_REACH = 2;
/** Below this the joint is standing still and a relative error means nothing. */
const STILL = 1e-9;
/**
 * How small a coordinate's own swing may be, against the widest swing in the
 * mechanism, before it is left out of the search for corners.
 *
 * A coordinate that is constant by construction — a scissor lift's platform
 * holds one end on the vertical through its base pin — has no characteristic
 * slope for a corner to be large compared with, so its residual wobble reads as
 * a corner at almost every sample. Judged that way the whole mechanism came out
 * non-differentiable and eighty of its four thousand samples were left to check.
 */
const FLAT_FRACTION = 1e-3;

function quantile(values: number[], fraction: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]
    : 0;
}

/** Samples where a series has a corner: the two one-sided slopes disagree wildly. */
function kinksOf(series: number[], dt: number): number[] {
  const backward = series.map((_, i) => (i > 0 ? (series[i] - series[i - 1]) / dt : NaN));
  const forward = series.map((_, i) =>
    i < series.length - 1 ? (series[i + 1] - series[i]) / dt : NaN
  );
  const central = series.map((_, i) =>
    i > 0 && i < series.length - 1 ? (series[i + 1] - series[i - 1]) / (2 * dt) : NaN
  );
  const typical = Math.max(quantile(central.map(Math.abs), 0.9), STILL);
  const found: number[] = [];
  series.forEach((_, i) => {
    if (!Number.isFinite(backward[i]) || !Number.isFinite(forward[i])) return;
    if (Math.abs(forward[i] - backward[i]) > KINK_FACTOR * typical) found.push(i);
  });
  return found;
}

/** Every difference quotient of `series` at `i` that has room to be taken. */
function quotients(series: number[], i: number, dt: number): number[] {
  const out: number[] = [];
  const n = series.length;
  if (i > 0) out.push((series[i] - series[i - 1]) / dt);
  if (i < n - 1) out.push((series[i + 1] - series[i]) / dt);
  if (i > 0 && i < n - 1) out.push((series[i + 1] - series[i - 1]) / (2 * dt));
  if (i >= 2 && i <= n - 3) {
    // Five-point stencil: truncation O(dt^4) instead of the central one's
    // O(dt^2), which is what lets the tolerance be tight enough to mean
    // something on a mechanism with high jerk.
    out.push((-series[i + 2] + 8 * series[i + 1] - 8 * series[i - 1] + series[i - 2]) / (12 * dt));
  }
  return out;
}

/**
 * Compare every joint's solved velocity with a difference quotient of its
 * solved position.
 *
 * A sample counts as agreeing if the solved value matches *any* of the
 * available quotients. On a smooth stretch they all agree and the five-point
 * one is the accurate one, so the alternatives cost nothing; at a corner —
 * a driven cylinder reaching its stop and reversing — they credit the solved
 * value for matching the slope on the side of the corner it belongs to.
 * Samples within two of such a corner are excluded outright, since curvature
 * is unbounded there and no stencil reaching across it means anything.
 */
export function velocityAgreesWithPositions(built: BuiltMechanism): RateAgreement {
  const { mechanism } = built;
  const trace = solveKinematics(built);
  const dt = mechanism.timeNum[1] - mechanism.timeNum[0];
  const ids = mechanism.joints[0].map((joint) => joint.id);
  const steps = trace.steps;

  const axisSeries = (id: string, axis: 0 | 1, from: 'jointPos' | 'jointVel') =>
    Array.from({ length: steps }, (_, t) => trace[from][t][id]?.[axis] ?? NaN);

  // A reversal belongs to the mechanism, not to one joint: everything stops at
  // the same instant, so a corner found anywhere is a corner everywhere.
  const swing = (series: number[]) => Math.max(...series) - Math.min(...series);
  const widest = Math.max(
    ...ids.flatMap((id) =>
      ([0, 1] as const).map((axis) => {
        const series = axisSeries(id, axis, 'jointPos');
        return series.every(Number.isFinite) ? swing(series) : 0;
      })
    ),
    STILL
  );
  const shared = new Set<number>();
  for (const id of ids) {
    for (const axis of [0, 1] as const) {
      const position = axisSeries(id, axis, 'jointPos');
      if (position.every(Number.isFinite) && swing(position) > FLAT_FRACTION * widest) {
        kinksOf(position, dt).forEach((i) => shared.add(i));
      }
    }
  }
  const nearKink = (i: number) => {
    for (let k = i - KINK_REACH; k <= i + KINK_REACH; k++) {
      if (shared.has(k)) return true;
    }
    return false;
  };

  const result: RateAgreement = {
    worst: 0,
    worstJoint: '',
    worstAxis: 'x',
    worstAt: -1,
    unsolved: [],
    stationary: [],
    compared: 0,
  };

  for (const id of ids) {
    const px = axisSeries(id, 0, 'jointPos');
    const py = axisSeries(id, 1, 'jointPos');
    const vx = axisSeries(id, 0, 'jointVel');
    const vy = axisSeries(id, 1, 'jointVel');
    if (!vx.some(Number.isFinite)) {
      result.unsolved.push(id);
      continue;
    }
    const travel = Math.hypot(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py));
    const peak = Math.max(...vx.map(Math.abs), ...vy.map(Math.abs), 0);
    if (travel > STILL && peak <= STILL) {
      result.stationary.push(id);
      continue;
    }
    if (peak <= STILL) {
      continue;
    }
    for (const [axis, position, velocity] of [
      ['x', px, vx],
      ['y', py, vy],
    ] as const) {
      for (let i = 1; i < steps - 1; i++) {
        if (!Number.isFinite(velocity[i]) || nearKink(i)) continue;
        const candidates = quotients(position, i, dt).filter(Number.isFinite);
        if (!candidates.length) continue;
        result.compared++;
        const error = Math.min(...candidates.map((q) => Math.abs(velocity[i] - q))) / peak;
        if (error > result.worst) {
          result.worst = error;
          result.worstJoint = id;
          result.worstAxis = axis;
          result.worstAt = i;
        }
      }
    }
  }
  return result;
}
