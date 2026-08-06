import {
  Constraint,
  SimultaneousSystem,
  jacobian,
  residuals,
  solveSimultaneous,
} from '../../app/model/mechanism/simultaneous-solver';
import { circleCircleIntersection } from '../../app/model/utils';

// A numerical solver cannot be verified by the constraints it was given: it
// satisfies those by construction, and a wrong answer that satisfies them is
// exactly the failure mode worth catching. So it is checked here against
// geometry it was never told about.
//
// The elliptical trammel is the instrument. A bar with one end on the x axis
// and the other on the y axis carries every point of itself around an ellipse:
// with the bar of length L and the point d from the end on the x axis,
//
//   Rx = p (L - d) / L,  Ry = q d / L,  p^2 + q^2 = L^2
//   =>  Rx^2 / (L - d)^2  +  Ry^2 / d^2  =  1
//
// Nothing in the constraint set mentions an ellipse. If the solver has found
// the mechanism's actual poses, the traced point satisfies that equation; if it
// has found some other set of points that happens to satisfy the constraints,
// it does not.

const L = 10;
const D = 3;

const trammel = (): SimultaneousSystem => ({
  // P slides on the x axis, Q on the y axis, R rides the bar between them.
  unknownIds: ['P', 'Q', 'R'],
  constraints: [
    { kind: 'onFixedLine', point: 'P', at: [0, 0], dir: [1, 0] },
    { kind: 'onFixedLine', point: 'Q', at: [0, 0], dir: [0, 1] },
    { kind: 'distance', a: 'P', b: 'Q', length: L },
    { kind: 'distance', a: 'R', b: 'P', length: D },
    { kind: 'onLine', point: 'R', from: 'P', to: 'Q' },
    { kind: 'driven', a: 'P', b: 'ORIGIN' },
  ],
});

function seededTrammel(): Map<string, number[]> {
  // Started somewhere legal and unremarkable: p = 6, q = 8.
  const positions = new Map<string, number[]>([['ORIGIN', [0, 0]]]);
  positions.set('P', [6, 0]);
  positions.set('Q', [0, 8]);
  positions.set('R', [6 * (1 - D / L), (8 * D) / L]);
  return positions;
}

describe('the simultaneous solver', () => {
  it('traces the ellipse a trammel traces, which it was never told about', () => {
    const system = trammel();
    const positions = seededTrammel();

    // Walk the bar's end along the axis and check the carried point every step.
    for (let p = 6; p >= 1; p -= 0.25) {
      expect(solveSimultaneous(system, positions, p)).toBe(true);
      const [rx, ry] = positions.get('R')!;
      // To within the solver's own convergence: it stops when every residual is
      // under 1e-6 of a length, and a length of ~10 carries that through as
      // about a part in ten million of the ellipse equation.
      const onEllipse = (rx * rx) / ((L - D) * (L - D)) + (ry * ry) / (D * D);
      expect(Math.abs(onEllipse - 1)).toBeLessThan(1e-6);
    }
    // And the far end really did stay on its own axis the whole way.
    expect(positions.get('Q')![0]).toBeCloseTo(0, 9);
  });

  it('lands on the same point the analytic dyad does', () => {
    // Two lengths from two known joints is the one case both this solver and
    // the ordering walk can do, so the two have to agree exactly.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 5 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [4, 3]],
    ]);

    expect(solveSimultaneous(system, positions, 6)).toBe(true);

    const analytic = circleCircleIntersection(0, 0, 5, 8, 0, 6);
    expect(analytic).toBeTruthy();
    const [bx, by] = positions.get('B')!;
    // Whichever of the two intersections is the one the seed was nearest.
    const nearest = (analytic as number[][]).reduce((best, point) =>
      Math.hypot(point[0] - 4, point[1] - 3) < Math.hypot(best[0] - 4, best[1] - 3) ? point : best
    );
    expect(Math.abs(bx - nearest[0])).toBeLessThan(1e-6);
    expect(Math.abs(by - nearest[1])).toBeLessThan(1e-6);
  });

  it('stays on the branch it started on', () => {
    // The mirror pose satisfies every constraint just as well. Continuity is
    // the only thing that says which one the mechanism is actually in, so a
    // seed below the axis has to stay below it.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 5 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [4, -3]],
    ]);

    for (let target = 6; target <= 9; target += 0.25) {
      expect(solveSimultaneous(system, positions, target)).toBe(true);
      expect(positions.get('B')![1]).toBeLessThan(0);
    }
  });

  it('refuses a command the geometry cannot reach', () => {
    // Two circles that cannot meet. Reporting success here would draw a
    // mechanism pulled apart at the joints.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 2 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [2, 0]],
    ]);

    expect(solveSimultaneous(system, positions, 100)).toBe(false);
  });

  it('derives the same Jacobian the residuals actually have', () => {
    // The analytic rows are the reason this solver converges at all near a
    // toggle, and an error in one of them is invisible until a mechanism that
    // needs it stops solving. Checked against central differences, which are
    // accurate enough to catch a wrong term even where they are not accurate
    // enough to solve with.
    const system = trammel();
    const positions = seededTrammel();
    const ids = system.unknownIds;
    const columnOf = new Map(ids.map((id, index) => [id, index]));
    const drive = 6;

    const analytic = jacobian(system, positions, columnOf);
    const step = 1e-6;
    ids.forEach((id, index) => {
      for (const axis of [0, 1]) {
        const original = [...positions.get(id)!];
        const moved = [...original];
        moved[axis] = original[axis] + step;
        positions.set(id, moved);
        const forward = residuals(system, positions, drive);
        moved[axis] = original[axis] - step;
        positions.set(id, moved);
        const backward = residuals(system, positions, drive);
        positions.set(id, original);

        forward.forEach((_, row) => {
          const numeric = (forward[row] - backward[row]) / (2 * step);
          expect(analytic[row][index * 2 + axis]).toBeCloseTo(numeric, 5);
        });
      }
    });
  });
});
