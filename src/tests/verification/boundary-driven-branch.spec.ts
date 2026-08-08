// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import {
  hasFullColumnRank,
  residuals,
  SimultaneousSystem,
  solveSimultaneous,
} from '../../app/model/mechanism/simultaneous-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { boundaryBranchJumpFixture } from '../../test-utils/verification/slot-fixtures';

type PositionMap = Map<string, number[]>;

// The four admission gates (§2.7a) are sound against hidden mobility: full
// column rank makes the drawn pose locally isolated, so exactly one branch
// leaves it. They say nothing about which *root* a solve converges to, and this
// mechanism is drawn where that matters -- one degree of crank is predicted to
// move its joints by half the length of its longest bar, so the previous pose
// is no longer inside the basin of the root belonging to it. A single
// Levenberg-Marquardt call from there converges, at full rank and to 1e-6, onto
// the other assembly mode, and 361 such samples draw a plausible monotone
// revolution of a linkage nobody built.
describe('a boundary-driven six-bar near two assembly modes', () => {
  const { mechanism } = buildMechanism(boundaryBranchJumpFixture());
  const frames = mechanism.joints;
  const solver = PositionSolver as unknown as {
    inputStepEmitted: boolean;
    simultaneousSystem: SimultaneousSystem;
  };
  const system = solver.simultaneousSystem;
  const initial: PositionMap = new Map(frames[0].map((joint) => [joint.id, [joint.x, joint.y]]));

  const distance = (left: PositionMap, right: PositionMap): number =>
    Math.max(
      ...system.unknownIds.map((id) =>
        Math.hypot(left.get(id)![0] - right.get(id)![0], left.get(id)![1] - right.get(id)![1])
      )
    );

  const pivot = initial.get('A')!;
  const pin = initial.get('B')!;
  const radius = Math.hypot(pin[0] - pivot[0], pin[1] - pivot[1]);
  const startAngle = Math.atan2(pin[1] - pivot[1], pin[0] - pivot[0]);
  /** The crank pin at a commanded angle, which is the mechanism's only input. */
  const crankPin = (degrees: number): number[] => [
    pivot[0] + radius * Math.cos(startAngle + (degrees * Math.PI) / 180),
    pivot[1] + radius * Math.sin(startAngle + (degrees * Math.PI) / 180),
  ];

  /** Walk the crank from the drawn pose in `subdivisions` parts of a degree. */
  const advanceOneDegree = (subdivisions: number): PositionMap => {
    const positions: PositionMap = new Map([...initial].map(([id, point]) => [id, [...point]]));
    for (let part = 1; part <= subdivisions; part++) {
      positions.set('B', crankPin(part / subdivisions));
      expect(solveSimultaneous(system, positions, 0)).toBe(true);
    }
    return positions;
  };

  const drawnFrame = (step: number): PositionMap =>
    new Map(frames[step].map((joint) => [joint.id, [joint.x, joint.y]]));

  it('passes all four boundary-driven admission gates', () => {
    expect(mechanism.dof).toBe(1);
    expect(solver.inputStepEmitted).toBe(true);
    expect(residuals(system, initial, 0).length).toBe(system.unknownIds.length * 2);
    expect(hasFullColumnRank(system, initial)).toBe(true);
    expect(
      system.constraints.some((constraint) => ['onLine', 'parallel'].includes(constraint.kind))
    ).toBe(false);
    expect(PositionSolver.unsolvableJoints).toEqual([]);
  });

  it('animates a full monotone revolution instead of refusing', () => {
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBe(361);

    const angle = (step: number): number => {
      const at = frames[step].find((joint) => joint.id === 'B')!;
      return Math.atan2(at.y - pivot[1], at.x - pivot[0]);
    };
    let swept = 0;
    for (let step = 1; step < frames.length; step++) {
      let increment = angle(step) - angle(step - 1);
      while (increment > Math.PI) increment -= 2 * Math.PI;
      while (increment < -Math.PI) increment += 2 * Math.PI;
      expect(increment).toBeGreaterThan(0.01);
      swept += increment;
    }
    expect(swept).toBeGreaterThan(2 * Math.PI - 0.001);
  });

  it('takes the branch continuation takes on its first one-degree solve', () => {
    // Full rank at t=0 gives one locally unique continuation. Two different
    // small subdivisions agree on it, so this is not a damping accident in the
    // reference path.
    const continued = advanceOneDegree(100);
    const continuedCheck = advanceOneDegree(20);
    expect(distance(continued, continuedCheck)).toBeLessThan(2e-4);

    // What the mechanism actually drew. Positions are kept to four decimals and
    // this pose amplifies, so the bound is thousandths rather than the solver's
    // own 1e-6 -- and three orders below the distance between the two modes.
    expect(distance(continued, drawnFrame(1))).toBeLessThan(2e-3);

    // The trap is still there, and being avoided rather than absent: one solve
    // seeded from the drawn pose alone -- which is what this path did before --
    // converges to the other assembly mode.
    const oneShot = advanceOneDegree(1);
    expect(distance(oneShot, continued)).toBeGreaterThan(0.8);

    // Both are exact roots, so no amount of constraint checking distinguishes
    // them. Only continuity does.
    expect(Math.max(...residuals(system, continued, 0).map(Math.abs))).toBeLessThan(1e-6);
    expect(Math.max(...residuals(system, oneShot, 0).map(Math.abs))).toBeLessThan(1e-6);
    expect(hasFullColumnRank(system, continued)).toBe(true);
    expect(hasFullColumnRank(system, oneShot)).toBe(true);

    // The visible difference: the slider runs one way along its guide on the
    // branch the mechanism is on, and the other way on the branch it is not.
    expect(continued.get('E')![0]).toBeGreaterThan(initial.get('E')![0]);
    expect(drawnFrame(1).get('E')![0]).toBeGreaterThan(initial.get('E')![0]);
    expect(oneShot.get('E')![0]).toBeLessThan(initial.get('E')![0]);
  });

  it('stays on that branch for the whole revolution', () => {
    // Forty sub-steps a degree, carried across the whole turn rather than
    // restarted each sample, so the reference is a continuation in its own
    // right and not a re-derivation from what the mechanism drew.
    const reference: PositionMap = new Map([...initial].map(([id, point]) => [id, [...point]]));
    const SUBDIVISIONS = 40;
    let worst = 0;
    for (let step = 1; step < frames.length; step++) {
      for (let part = 1; part <= SUBDIVISIONS; part++) {
        reference.set('B', crankPin(step - 1 + part / SUBDIVISIONS));
        expect(solveSimultaneous(system, reference, 0), `continuation at step ${step}`).toBe(true);
      }
      worst = Math.max(worst, distance(reference, drawnFrame(step)));
    }
    // The two poses are the same branch to a hundredth of a unit, on a
    // mechanism whose two assembly modes stand nine tenths of a unit apart and
    // whose longest bar is twelve. What is left is four-decimal rounding, taken
    // once a sample and magnified by how sharply this linkage responds near the
    // pose it was drawn in.
    expect(worst).toBeLessThan(0.05);
  });
});
