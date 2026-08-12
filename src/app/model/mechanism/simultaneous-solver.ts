/**
 * Solving a set of joints that can only be solved together (§2.7a).
 *
 * The ordering walk places one joint at a time from two already-known ones.
 * Most linkages yield to that; some do not. A gripper whose plate reaches two
 * arms through four short links, with each arm riding two fixed rails, has no
 * joint anywhere in it that two known joints locate — the plate's pose and both
 * arms are five unknowns tied by five constraints that hold or fail together.
 * The walk reports every joint unsolvable and the mechanism refuses to run.
 *
 * What replaces the walk here is the constraint set itself, solved by
 * Newton-Raphson from the previous timestep's pose. Seeding from the previous
 * pose is not an optimisation: a constraint set has several roots — the mirror
 * assembly, the far branch of every dyad — and starting a hair from last
 * frame's answer is what picks the one the mechanism actually moved to.
 */

/** Every constraint reads as a *length* that has to come out zero. */
export type Constraint =
  | { kind: 'distance'; a: string; b: string; length: number }
  /** A zero-length block: its two joints are one point (§2.10 item 1). */
  | { kind: 'coincident'; a: string; b: string }
  /**
   * `point` held at fixed coordinates in the frame `from` -> `to` carries.
   *
   * A rigid body's extra joints used to be pinned by a distance to each of two
   * anchors, which is the right count of constraints and the wrong two. Where
   * the three points are collinear both gradients lie along the same line, the
   * two rows collapse to one, and the body is left free to bend sideways. A
   * scissor lift is nothing but collinear bodies — a straight arm pinned at its
   * middle — so its rate system came out rank 19 of 22 and least squares spread
   * the missing three directions over every joint in the machine.
   *
   * Resolving the offset along and across the anchor line instead keeps the
   * same two rows independent at every pose, and picks the side of the line the
   * body is actually on rather than leaving the mirror pose an equal answer.
   */
  | {
      kind: 'rigidOffset';
      point: string;
      from: string;
      to: string;
      /** Offset along the unit vector from `from` to `to`. */
      along: number;
      /** Offset across it, positive to the left of that vector. */
      across: number;
    }
  /** `point` lies on the line through `from` and `to`, wherever those end up. */
  | { kind: 'onLine'; point: string; from: string; to: string }
  /** `point` lies on a line fixed in the world. */
  | { kind: 'onFixedLine'; point: string; at: [number, number]; dir: [number, number] }
  /** Two directions stay parallel — what a weld says about a rider and its slot. */
  | { kind: 'parallel'; a1: string; a2: string; b1: string; b2: string }
  /** A length the drive prescribes, supplied fresh each sample. */
  | { kind: 'driven'; a: string; b: string }
  /**
   * An *angle* the drive prescribes: the angle at `pivot`, from `reference`
   * round to `driven`, supplied fresh each sample (§2.9).
   *
   * This is what driving a floating pin means. It reads as a length like every
   * other row — the driven point's distance from where the commanded angle
   * would put it — so one tolerance covers the whole system.
   */
  | { kind: 'drivenAngle'; pivot: string; reference: string; driven: string };

export interface SimultaneousSystem {
  /** Joints solved together, in the order their coordinates enter the vector. */
  unknownIds: string[];
  constraints: Constraint[];
}

export type PositionMap = Map<string, number[]>;

/** How close to zero every residual has to get, in model units. */
const TOLERANCE = 1e-6;
/** Enough for a damped solve to walk in from a poor pose; a good one takes three. */
const MAX_ITERATIONS = 60;
/**
 * Levenberg–Marquardt damping, and how it is allowed to move.
 *
 * Plain Newton is the wrong tool here and fails on exactly the mechanisms this
 * solver exists for. A toggle clamp works *because* it passes close to a
 * dead-centre — that is where its mechanical advantage comes from — and near
 * one the Jacobian is nearly singular, so an undamped step is enormous and
 * lands somewhere unrelated. Damping turns the step back toward steepest
 * descent exactly as far as it needs to, and no further.
 */
const INITIAL_DAMPING = 1e-6;
const MIN_DAMPING = 1e-12;
const MAX_DAMPING_TRIES = 24;

/**
 * Residuals of the whole system at a pose, each one a length.
 *
 * Cross products are divided by the length they were taken against, so an
 * incidence constraint reports how far off the line the point actually is
 * rather than an area. Mixing areas and lengths in one vector would make the
 * tolerance mean two different things and the Jacobian badly scaled.
 */
export function residuals(
  system: SimultaneousSystem,
  positions: PositionMap,
  command: number
): number[] {
  const at = (id: string): number[] => positions.get(id) ?? [0, 0];
  const out: number[] = [];
  for (const c of system.constraints) {
    switch (c.kind) {
      case 'distance':
      case 'driven': {
        const [ax, ay] = at(c.a);
        const [bx, by] = at(c.b);
        const want = c.kind === 'driven' ? command : c.length;
        out.push(Math.hypot(ax - bx, ay - by) - want);
        break;
      }
      case 'coincident': {
        const [ax, ay] = at(c.a);
        const [bx, by] = at(c.b);
        out.push(ax - bx, ay - by);
        break;
      }
      case 'onLine': {
        const [px, py] = at(c.point);
        const [fx, fy] = at(c.from);
        const [tx, ty] = at(c.to);
        const ex = tx - fx;
        const ey = ty - fy;
        const span = Math.hypot(ex, ey);
        out.push(span < 1e-9 ? 0 : ((px - fx) * ey - (py - fy) * ex) / span);
        break;
      }
      case 'rigidOffset': {
        const [px, py] = at(c.point);
        const [fx, fy] = at(c.from);
        const [tx, ty] = at(c.to);
        const ex = tx - fx;
        const ey = ty - fy;
        const wx = px - fx;
        const wy = py - fy;
        const span = Math.hypot(ex, ey);
        if (span < 1e-9) {
          out.push(0, 0);
          break;
        }
        out.push((wx * ex + wy * ey) / span - c.along, (ex * wy - ey * wx) / span - c.across);
        break;
      }
      case 'onFixedLine': {
        const [px, py] = at(c.point);
        const span = Math.hypot(c.dir[0], c.dir[1]);
        out.push(span < 1e-9 ? 0 : ((px - c.at[0]) * c.dir[1] - (py - c.at[1]) * c.dir[0]) / span);
        break;
      }
      case 'drivenAngle': {
        // r = |w| sin(phi - theta): how far the driven point is from the
        // direction the commanded angle puts it in, as a length.
        const [px, py] = at(c.pivot);
        const [rx, ry] = at(c.reference);
        const [dx, dy] = at(c.driven);
        const ax = rx - px;
        const ay = ry - py;
        const wx = dx - px;
        const wy = dy - py;
        const arm = Math.hypot(ax, ay);
        out.push(
          arm < 1e-9
            ? 0
            : ((ax * wy - ay * wx) * Math.cos(command) - (ax * wx + ay * wy) * Math.sin(command)) /
                arm
        );
        break;
      }
      case 'parallel': {
        const [a1x, a1y] = at(c.a1);
        const [a2x, a2y] = at(c.a2);
        const [b1x, b1y] = at(c.b1);
        const [b2x, b2y] = at(c.b2);
        const ux = a2x - a1x;
        const uy = a2y - a1y;
        const vx = b2x - b1x;
        const vy = b2y - b1y;
        const uLen = Math.hypot(ux, uy);
        const vLen = Math.hypot(vx, vy);
        out.push(uLen < 1e-9 || vLen < 1e-9 ? 0 : (ux * vy - uy * vx) / vLen);
        break;
      }
    }
  }
  return out;
}

/**
 * The Jacobian of `residuals`, derived rather than differenced.
 *
 * Finite differences are not good enough here, and the mechanism that needs
 * this solver is exactly the one that shows it: near a toggle the system's
 * condition number runs to millions, which amplifies the ~1e-6 relative error
 * of a differenced derivative into a step that is wrong in its first digit.
 * The solve then stalls a long way from an answer while reporting that it
 * cannot do better. Every row below is the exact derivative of the matching
 * case in `residuals`, and the two are checked against each other in the spec.
 */
export function jacobian(
  system: SimultaneousSystem,
  positions: PositionMap,
  columnOf: Map<string, number>,
  commandedAngle: number = 0
): number[][] {
  const width = columnOf.size * 2;
  const at = (id: string): number[] => positions.get(id) ?? [0, 0];
  const rows: number[][] = [];
  const row = () => {
    const created = new Array(width).fill(0);
    rows.push(created);
    return created;
  };
  const add = (into: number[], id: string, dx: number, dy: number) => {
    const column = columnOf.get(id);
    if (column === undefined) return;
    into[column * 2] += dx;
    into[column * 2 + 1] += dy;
  };

  for (const c of system.constraints) {
    switch (c.kind) {
      case 'distance':
      case 'driven': {
        const [ax, ay] = at(c.a);
        const [bx, by] = at(c.b);
        const length = Math.hypot(ax - bx, ay - by) || 1;
        const ux = (ax - bx) / length;
        const uy = (ay - by) / length;
        const current = row();
        add(current, c.a, ux, uy);
        add(current, c.b, -ux, -uy);
        break;
      }
      case 'coincident': {
        const x = row();
        add(x, c.a, 1, 0);
        add(x, c.b, -1, 0);
        const y = row();
        add(y, c.a, 0, 1);
        add(y, c.b, 0, -1);
        break;
      }
      case 'onLine': {
        const [px, py] = at(c.point);
        const [fx, fy] = at(c.from);
        const [tx, ty] = at(c.to);
        const ex = tx - fx;
        const ey = ty - fy;
        const wx = px - fx;
        const wy = py - fy;
        const span = Math.hypot(ex, ey) || 1;
        const cross = wx * ey - wy * ex;
        // r = cross / span, so both the numerator and the length it is
        // measured against move when the slot's own joints do.
        const scaled = cross / (span * span * span);
        const current = row();
        add(current, c.point, ey / span, -ex / span);
        add(current, c.from, (-ey + wy) / span + scaled * ex, (-wx + ex) / span + scaled * ey);
        add(current, c.to, -wy / span - scaled * ex, wx / span - scaled * ey);
        break;
      }
      case 'rigidOffset': {
        // r1 = (w.e)/L, r2 = (e x w)/L, with e = to - from and w = point - from.
        // Both are differentiated through w and through e, and `from` moves
        // both at once because it is subtracted from each.
        const [px, py] = at(c.point);
        const [fx, fy] = at(c.from);
        const [tx, ty] = at(c.to);
        const ex = tx - fx;
        const ey = ty - fy;
        const wx = px - fx;
        const wy = py - fy;
        const span = Math.hypot(ex, ey) || 1;
        const alongNumerator = wx * ex + wy * ey;
        const acrossNumerator = ex * wy - ey * wx;
        const cubed = span * span * span;
        const alongByW = [ex / span, ey / span];
        const alongByE = [
          wx / span - (alongNumerator * ex) / cubed,
          wy / span - (alongNumerator * ey) / cubed,
        ];
        const acrossByW = [-ey / span, ex / span];
        const acrossByE = [
          wy / span - (acrossNumerator * ex) / cubed,
          -wx / span - (acrossNumerator * ey) / cubed,
        ];
        for (const [byW, byE] of [
          [alongByW, alongByE],
          [acrossByW, acrossByE],
        ]) {
          const current = row();
          add(current, c.point, byW[0], byW[1]);
          add(current, c.to, byE[0], byE[1]);
          add(current, c.from, -byW[0] - byE[0], -byW[1] - byE[1]);
        }
        break;
      }
      case 'onFixedLine': {
        const span = Math.hypot(c.dir[0], c.dir[1]) || 1;
        const current = row();
        add(current, c.point, c.dir[1] / span, -c.dir[0] / span);
        break;
      }
      case 'drivenAngle': {
        // r = N / |a|, with N the numerator in `residuals` above. Both the
        // numerator and the arm it is divided by move when the pivot or the
        // reference joint does, which is the whole of why this row is longer
        // than it looks like it should be.
        const [px, py] = at(c.pivot);
        const [rx, ry] = at(c.reference);
        const [dx, dy] = at(c.driven);
        const ax = rx - px;
        const ay = ry - py;
        const wx = dx - px;
        const wy = dy - py;
        const arm = Math.hypot(ax, ay) || 1;
        const cos = Math.cos(commandedAngle);
        const sin = Math.sin(commandedAngle);
        const numerator = (ax * wy - ay * wx) * cos - (ax * wx + ay * wy) * sin;
        // d(numerator) with respect to a = reference - pivot, and w = driven - pivot.
        const dNdax = wy * cos - wx * sin;
        const dNday = -wx * cos - wy * sin;
        const dNdwx = -ay * cos - ax * sin;
        const dNdwy = ax * cos - ay * sin;
        // d(N/|a|) carries the quotient term only through a.
        const dRdax = dNdax / arm - (numerator * ax) / (arm * arm * arm);
        const dRday = dNday / arm - (numerator * ay) / (arm * arm * arm);
        const dRdwx = dNdwx / arm;
        const dRdwy = dNdwy / arm;
        const current = row();
        add(current, c.reference, dRdax, dRday);
        add(current, c.driven, dRdwx, dRdwy);
        // The pivot is subtracted from both, so it moves both ways at once.
        add(current, c.pivot, -dRdax - dRdwx, -dRday - dRdwy);
        break;
      }
      case 'parallel': {
        const [a1x, a1y] = at(c.a1);
        const [a2x, a2y] = at(c.a2);
        const [b1x, b1y] = at(c.b1);
        const [b2x, b2y] = at(c.b2);
        const ux = a2x - a1x;
        const uy = a2y - a1y;
        const vx = b2x - b1x;
        const vy = b2y - b1y;
        const span = Math.hypot(vx, vy) || 1;
        const cross = ux * vy - uy * vx;
        const scaled = cross / (span * span * span);
        const current = row();
        add(current, c.a2, vy / span, -vx / span);
        add(current, c.a1, -vy / span, vx / span);
        add(current, c.b2, -uy / span - scaled * vx, ux / span - scaled * vy);
        add(current, c.b1, uy / span + scaled * vx, -ux / span + scaled * vy);
        break;
      }
    }
  }
  return rows;
}

/**
 * How small a column may get, once the ones before it have been projected out,
 * before the constraints stop being independent.
 *
 * Compared against columns already scaled to unit length, so it is a ratio
 * rather than a length and means the same thing whatever the mechanism is
 * measured in. Set well above the 1e-16 where float noise lives and well below
 * anything a real linkage produces away from a dead-centre.
 */
const RANK_TOLERANCE = 1e-7;

/**
 * Whether the constraints pin the unknowns down at this pose, rather than
 * leaving a direction they are free to drift along.
 *
 * Counting rows is not enough. A square system whose Jacobian loses a column is
 * a mechanism at a dead-centre, or one whose constraints say the same thing
 * twice — and Levenberg–Marquardt will happily return *an* answer for it, drawn
 * from whichever direction the damping happened to favour. That answer is a
 * picture of a linkage the user did not build, which is the one outcome worth
 * refusing over.
 *
 * Pivoted Gram-Schmidt on the columns, each scaled to unit length first: the
 * smallest pivot it reaches is a scaled singular value, and scaling is what
 * stops a mechanism being called singular merely because one joint's residuals
 * are numerically larger than another's.
 */
export function hasFullColumnRank(
  system: SimultaneousSystem,
  positions: PositionMap,
  command: number = 0
): boolean {
  const ids = system.unknownIds;
  const width = ids.length * 2;
  if (width === 0) return false;
  const columnOf = new Map(ids.map((id, index) => [id, index]));
  const rows = jacobian(system, positions, columnOf, command);
  if (rows.length < width) return false;

  const norm = (vector: number[]) => Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  const remaining: number[][] = [];
  for (let column = 0; column < width; column++) {
    const values = rows.map((row) => row[column]);
    const length = norm(values);
    // A column of zeros is an unknown no constraint mentions at all.
    if (length < RANK_TOLERANCE) return false;
    remaining.push(values.map((value) => value / length));
  }

  const basis: number[][] = [];
  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestLength = 0;
    let best: number[] = [];
    for (let index = 0; index < remaining.length; index++) {
      let residual = remaining[index];
      for (const direction of basis) {
        const projection = residual.reduce((sum, value, i) => sum + value * direction[i], 0);
        residual = residual.map((value, i) => value - projection * direction[i]);
      }
      const length = norm(residual);
      if (length > bestLength) {
        bestIndex = index;
        bestLength = length;
        best = residual;
      }
    }
    // Taking the longest remaining column each time is what makes the smallest
    // pivot meaningful: any other order can make a full-rank matrix look
    // deficient by unlucky elimination.
    if (bestIndex < 0 || bestLength < RANK_TOLERANCE) return false;
    basis.push(best.map((value) => value / bestLength));
    remaining.splice(bestIndex, 1);
  }
  return true;
}

/** Solve `A x = b` by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      // Singular: the mechanism is at a configuration where the constraints
      // stop being independent — a toggle. The caller reads that as a reversal.
      return undefined;
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }
  // Fully reduced above: row i holds one variable, scaled by its own pivot.
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Move the unknown joints until every constraint is satisfied.
 *
 * Returns false when Newton will not converge, which the position solver reads
 * exactly as it reads any other refusal: the mechanism has reached a limit and
 * turns around.
 */
export function solveSimultaneous(
  system: SimultaneousSystem,
  positions: PositionMap,
  command: number
): boolean {
  const ids = system.unknownIds;
  const n = ids.length * 2;
  if (n === 0) return true;

  const read = (): number[] => ids.flatMap((id) => positions.get(id) ?? [0, 0]);
  const write = (x: number[]): void => {
    ids.forEach((id, i) => positions.set(id, [x[i * 2], x[i * 2 + 1]]));
  };
  const evaluate = (x: number[]): number[] => {
    write(x);
    return residuals(system, positions, command);
  };
  const worst = (f: number[]) => Math.max(...f.map(Math.abs));
  // Accepted on the sum of squares, finished on the largest single residual.
  // The two have to be different measures: a damped least-squares step reduces
  // the sum, and judging it by the largest residual instead rejects perfectly
  // good steps that move the worst row around between constraints — which
  // showed up as small commands failing where large ones succeeded.
  const cost = (f: number[]) => f.reduce((sum, value) => sum + value * value, 0);

  let x = read();
  let f = evaluate(x);
  let error = cost(f);
  let damping = INITIAL_DAMPING;

  const columnOf = new Map(ids.map((id, index) => [id, index]));

  for (let iteration = 0; iteration < MAX_ITERATIONS && worst(f) >= TOLERANCE; iteration++) {
    write(x);
    const derivative = jacobian(system, positions, columnOf, command);

    // Damp until the step actually improves matters. Accepting a step that
    // makes the residual worse is how a solve wanders off to a pose on the
    // other side of the mechanism and calls it an answer.
    let improved = false;
    for (let attempt = 0; attempt < MAX_DAMPING_TRIES; attempt++) {
      const step = solveDamped(derivative, f, damping);
      if (step) {
        const candidate = x.map((value, i) => value + step[i]);
        if (candidate.every(Number.isFinite)) {
          const trial = evaluate(candidate);
          if (cost(trial) < error) {
            x = candidate;
            f = trial;
            error = cost(trial);
            damping = Math.max(damping / 3, MIN_DAMPING);
            improved = true;
            break;
          }
        }
      }
      damping *= 5;
    }
    if (!improved) {
      break;
    }
  }

  write(x);
  return worst(f) < TOLERANCE;
}

/**
 * One damped least-squares step: solve `(JᵀJ + λ·diag(JᵀJ)) Δ = −Jᵀf`.
 *
 * Least squares rather than a direct solve even when the system is square,
 * because a mechanism can be redundantly constrained — and scaling the damping
 * by the diagonal rather than by the identity keeps it meaningful when one
 * coordinate's constraints are far stiffer than another's.
 */
function solveDamped(jacobian: number[][], f: number[], damping: number): number[] | undefined {
  const n = jacobian[0]?.length ?? 0;
  const normal: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (let row = 0; row < jacobian.length; row++) {
    for (let i = 0; i < n; i++) {
      rhs[i] -= jacobian[row][i] * f[row];
      for (let j = 0; j < n; j++) {
        normal[i][j] += jacobian[row][i] * jacobian[row][j];
      }
    }
  }
  for (let i = 0; i < n; i++) {
    normal[i][i] += damping * (normal[i][i] || 1);
  }
  return solveLinear(normal, rhs);
}

/**
 * The joints a system's constraints read but do not solve for.
 *
 * For a set driven by a grounded crank these are the moving boundary: the crank
 * pin the actuator placed, and any ground the constraints mention. Listed here
 * rather than at the caller so a new constraint kind cannot quietly acquire a
 * reference that nothing knows to follow.
 */
export function boundaryJoints(system: SimultaneousSystem): string[] {
  const known = new Set(system.unknownIds);
  const found = new Set<string>();
  const note = (...ids: string[]) => {
    for (const id of ids) if (!known.has(id)) found.add(id);
  };
  for (const c of system.constraints) {
    switch (c.kind) {
      case 'distance':
      case 'driven':
      case 'coincident':
        note(c.a, c.b);
        break;
      case 'onLine':
        note(c.point, c.from, c.to);
        break;
      case 'onFixedLine':
        note(c.point);
        break;
      case 'parallel':
        note(c.a1, c.a2, c.b1, c.b2);
        break;
      case 'drivenAngle':
        note(c.pivot, c.reference, c.driven);
        break;
      // Two rows in a body's own frame, and its two anchors can both be joints
      // an earlier step already placed — a body reached at its third joint.
      // No distance row is written between two known anchors, so if this case
      // is missing nothing else names them, and a boundary-driven solve then
      // interpolates a boundary that does not include the joints its own
      // constraints are reading.
      case 'rigidOffset':
        note(c.point, c.from, c.to);
        break;
      default: {
        // Every kind, or the compiler says so. This function exists to stop a
        // new constraint acquiring a reference nothing knows to follow, and it
        // only does that if forgetting one is an error rather than a silence —
        // which is exactly how `rigidOffset` came to be missing from it.
        const unhandled: never = c;
        throw new Error(`boundaryJoints has no case for ${(unhandled as Constraint).kind}`);
      }
    }
  }
  return [...found];
}

/**
 * Where the unknowns are headed when the *boundary* moves, to first order.
 *
 * The same differentiation that gives velocities from a commanded rate, with
 * the boundary joints in the command's place: `F(q, b) = 0` differentiates to
 * `J_q Δq = −J_b Δb`, so the Jacobian that solves the positions also says which
 * way — and how far — the solve is about to go before it is run.
 *
 * That is worth a linear solve because a root finder cannot tell one assembly
 * mode from another, and this can: the answer only belongs to the branch the
 * mechanism is on if it is near the direction the branch was pointing.
 *
 * Returns nothing at a pose where the constraints cannot be differentiated —
 * a dead-centre, where the branch has no direction to predict.
 */
export function boundaryTangent(
  system: SimultaneousSystem,
  positions: PositionMap,
  boundaryStep: PositionMap
): PositionMap | undefined {
  const ids = system.unknownIds;
  const moved = [...boundaryStep.keys()];
  const unknownColumns = new Map(ids.map((id, index) => [id, index]));
  const boundaryColumns = new Map(moved.map((id, index) => [id, index]));
  const byBoundary = jacobian(system, positions, boundaryColumns);
  const step = moved.flatMap((id) => boundaryStep.get(id)!);
  const rhs = byBoundary.map((row) => -row.reduce((sum, value, i) => sum + value * step[i], 0));
  const predicted = leastSquares(jacobian(system, positions, unknownColumns), rhs);
  if (!predicted || !predicted.every(Number.isFinite)) {
    return undefined;
  }
  return new Map(ids.map((id, index) => [id, [predicted[index * 2], predicted[index * 2 + 1]]]));
}

/**
 * How each residual moves when the *command* moves, holding the pose still.
 *
 * Only the driven row has one, and this is the whole of what makes velocities
 * available: differentiating `F(q, c) = 0` gives `J q̇ = −F_c ċ`, so the same
 * Jacobian that solves the positions solves the rates, exactly, with no second
 * formulation to disagree with the first.
 */
export function commandDerivative(
  system: SimultaneousSystem,
  positions: PositionMap,
  command: number
): number[] {
  const at = (id: string): number[] => positions.get(id) ?? [0, 0];
  const out: number[] = [];
  for (const c of system.constraints) {
    switch (c.kind) {
      case 'driven':
        out.push(-1);
        break;
      case 'drivenAngle': {
        const [px, py] = at(c.pivot);
        const [rx, ry] = at(c.reference);
        const [dx, dy] = at(c.driven);
        const ax = rx - px;
        const ay = ry - py;
        const wx = dx - px;
        const wy = dy - py;
        const arm = Math.hypot(ax, ay) || 1;
        const cross = ax * wy - ay * wx;
        const dot = ax * wx + ay * wy;
        out.push((-cross * Math.sin(command) - dot * Math.cos(command)) / arm);
        break;
      }
      // Two-row constraints, neither of which the command appears in. The
      // count is what matters: this vector is indexed by residual row, so a
      // single zero here would shift every row after it against the Jacobian.
      case 'coincident':
      case 'rigidOffset':
        out.push(0, 0);
        break;
      default:
        out.push(0);
        break;
    }
  }
  return out;
}

/** Least squares: solve `JᵀJ x = Jᵀ b`, which is the undamped `solveDamped`. */
function leastSquares(matrix: number[][], rhs: number[]): number[] | undefined {
  const negated = rhs.map((value) => -value);
  return solveDamped(matrix, negated, 0);
}

/**
 * Velocities and accelerations of the solved joints, by differentiating the
 * constraints the positions came from.
 *
 * `J q̇ = −F_c ċ` for the rates, and differentiating once more in time gives
 * `J q̈ = −(dJ/dt) q̇ − (dF_c/dt) ċ`, with the two time derivatives taken along
 * the motion the rates just described. Analytic in space, differenced in time:
 * the space part is where the conditioning problems live, and it is exact.
 *
 * Returns nothing when the constraints cannot be differentiated at this pose —
 * a toggle, where the rates are genuinely undefined rather than merely awkward.
 */
export function constraintRates(
  system: SimultaneousSystem,
  positions: PositionMap,
  command: number,
  commandRate: number
):
  | { velocity: Map<string, [number, number]>; acceleration: Map<string, [number, number]> }
  | undefined {
  const ids = system.unknownIds;
  const columnOf = new Map(ids.map((id, index) => [id, index]));
  const derivative = jacobian(system, positions, columnOf, command);
  const byCommand = commandDerivative(system, positions, command);

  // J q̇ = −F_c ċ. The minus is the whole of the sign convention, and a test
  // that only ever compares speeds cannot see it.
  const rates = leastSquares(
    derivative,
    byCommand.map((value) => -value * commandRate)
  );
  if (!rates || !rates.every(Number.isFinite)) {
    return undefined;
  }

  // A step along the motion, small against the mechanism rather than against
  // the clock, so the differenced time derivative is well scaled whatever the
  // input speed happens to be.
  const fastest = Math.max(...rates.map(Math.abs), Math.abs(commandRate), 1e-12);
  const step = 1e-4 / fastest;
  const shifted = (direction: number): PositionMap => {
    const moved: PositionMap = new Map(positions);
    ids.forEach((id, index) => {
      const here = positions.get(id) ?? [0, 0];
      moved.set(id, [
        here[0] + direction * step * rates[index * 2],
        here[1] + direction * step * rates[index * 2 + 1],
      ]);
    });
    return moved;
  };
  const ahead = shifted(1);
  const behind = shifted(-1);
  const commandAhead = command + step * commandRate;
  const commandBehind = command - step * commandRate;

  const jacobianAhead = jacobian(system, ahead, columnOf, commandAhead);
  const jacobianBehind = jacobian(system, behind, columnOf, commandBehind);
  const commandAheadRow = commandDerivative(system, ahead, commandAhead);
  const commandBehindRow = commandDerivative(system, behind, commandBehind);

  const rhs = derivative.map((_, row) => {
    let jacobianRate = 0;
    for (let column = 0; column < rates.length; column++) {
      jacobianRate +=
        ((jacobianAhead[row][column] - jacobianBehind[row][column]) / (2 * step)) * rates[column];
    }
    const commandRateChange = (commandAheadRow[row] - commandBehindRow[row]) / (2 * step);
    // J q̈ = −(dJ/dt) q̇ − (dF_c/dt) ċ, with the input rate held constant.
    return -(jacobianRate + commandRateChange * commandRate);
  });
  const accelerations = leastSquares(derivative, rhs);
  if (!accelerations || !accelerations.every(Number.isFinite)) {
    return undefined;
  }

  const velocity = new Map<string, [number, number]>();
  const acceleration = new Map<string, [number, number]>();
  ids.forEach((id, index) => {
    velocity.set(id, [rates[index * 2], rates[index * 2 + 1]]);
    acceleration.set(id, [accelerations[index * 2], accelerations[index * 2 + 1]]);
  });
  return { velocity, acceleration };
}
