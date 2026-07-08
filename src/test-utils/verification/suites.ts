import { DynamicsData, VerificationDataset } from '../../test-data/verification/types';
import { alignToDataset, compareSeries, expectSeriesToMatch, Tolerance } from './compare';
import { BuiltMechanism } from './fixture';
import { DynamicsTrace, KinematicsTrace, solveDynamics, solveKinematics } from './solve';

export interface KinematicsSuiteOptions {
  inputJointId?: string;
  crankTipId?: string;
  /** Maps dataset link keys to PMKS+ link ids when they differ (e.g. BCE -> BC). */
  linkIdOf?: Record<string, string>;
  tolerances?: Partial<Record<KinematicsQuantity, Tolerance>>;
  /** Minimum fraction of MATLAB rows that must be matched to a timestep. */
  minCoverage?: number;
  /** MATLAB rows known to be bad for one series (documented per fixture). */
  excludeRows?: { quantity: KinematicsQuantity; key: string; rows: number[] }[];
  /** Whole MATLAB series known to be bad (documented per fixture). */
  excludeSeries?: { quantity: KinematicsQuantity; key: string; reason: string }[];
  /** Looser tolerances for individual series (documented per fixture). */
  seriesTolerances?: { quantity: KinematicsQuantity; key: string; tol: Tolerance }[];
}

export type KinematicsQuantity =
  | 'jointPos'
  | 'jointVel'
  | 'jointAcc'
  | 'linkCoMPos'
  | 'linkCoMVel'
  | 'linkCoMAcc'
  | 'linkAngVel'
  | 'linkAngAcc';

const DEFAULT_TOLERANCES: Record<KinematicsQuantity, Tolerance> = {
  // Positions: the position solver rounds joint coordinates to 1e-4 every
  // 1-degree step, so a few thousandths of drift over a revolution is
  // numerical noise, not a solver disagreement.
  jointPos: { abs: 5e-3, rel: 1e-3 },
  linkCoMPos: { abs: 5e-3, rel: 1e-3 },
  // Velocities/accelerations are algebraic in the (rounded) positions.
  jointVel: { abs: 1e-4, rel: 5e-3 },
  linkCoMVel: { abs: 1e-4, rel: 5e-3 },
  linkAngVel: { abs: 1e-4, rel: 5e-3 },
  jointAcc: { abs: 1e-4, rel: 1e-2 },
  linkCoMAcc: { abs: 1e-4, rel: 1e-2 },
  linkAngAcc: { abs: 1e-4, rel: 1e-2 },
};

/**
 * Registers one `it` per kinematic quantity, comparing every joint/link
 * series in the dataset against the PMKS+ solvers over all aligned timesteps.
 */
export function registerKinematicsSuite(
  dataset: VerificationDataset,
  build: () => BuiltMechanism,
  options: KinematicsSuiteOptions = {}
) {
  const inputJointId = options.inputJointId ?? 'A';
  const crankTipId = options.crankTipId ?? 'B';
  const minCoverage = options.minCoverage ?? 0.8;
  const tolerances = { ...DEFAULT_TOLERANCES, ...options.tolerances };
  const linkIdOf = (key: string) => options.linkIdOf?.[key] ?? key;
  const pairsFor = (quantity: KinematicsQuantity, key: string) => {
    const excluded = options.excludeRows?.find((e) => e.quantity === quantity && e.key === key);
    return excluded ? pairs.filter(([, row]) => !excluded.rows.includes(row)) : pairs;
  };
  const isExcluded = (quantity: KinematicsQuantity, key: string) =>
    options.excludeSeries?.some((e) => e.quantity === quantity && e.key === key) ?? false;
  const toleranceFor = (quantity: KinematicsQuantity, key: string) =>
    options.seriesTolerances?.find((s) => s.quantity === quantity && s.key === key)?.tol ??
    tolerances[quantity];

  let trace: KinematicsTrace;
  let pairs: [number, number][];
  beforeAll(() => {
    trace = solveKinematics(build());
    pairs = alignToDataset(trace, dataset, inputJointId, crankTipId);
  });

  it('reaches the full MATLAB motion range', () => {
    const rows = dataset.jointPos[inputJointId].length;
    expect(
      pairs.length,
      `matched ${pairs.length} of ${trace.steps} timesteps against ${rows} MATLAB rows`
    ).toBeGreaterThanOrEqual(Math.floor(minCoverage * Math.min(trace.steps, rows)));
  });

  const jointQuantities: [KinematicsQuantity, string][] = [
    ['jointPos', 'position'],
    ['jointVel', 'velocity'],
    ['jointAcc', 'acceleration'],
  ];
  for (const [quantity, label] of jointQuantities) {
    it(`joint ${label}s match MATLAB`, () => {
      for (const jointId of Object.keys(dataset[quantity])) {
        if (isExcluded(quantity, jointId)) {
          continue;
        }
        const report = compareSeries(
          `${dataset.name} joint ${jointId} ${label}`,
          pairsFor(quantity, jointId),
          (t) => (trace[quantity][t] as Record<string, number[]>)[jointId],
          (row) => (dataset[quantity][jointId] as number[][])[row],
          toleranceFor(quantity, jointId)
        );
        expectSeriesToMatch(report);
      }
    });
  }

  const linkQuantities: [KinematicsQuantity, string, boolean][] = [
    ['linkCoMPos', 'center-of-mass position', true],
    ['linkCoMVel', 'center-of-mass velocity', true],
    ['linkCoMAcc', 'center-of-mass acceleration', true],
    ['linkAngVel', 'angular velocity', false],
    ['linkAngAcc', 'angular acceleration', false],
  ];
  for (const [quantity, label, isXY] of linkQuantities) {
    it(`link ${label.replace('center-of-mass', 'CoM')}s match MATLAB`, () => {
      for (const linkKey of Object.keys(dataset[quantity])) {
        if (isExcluded(quantity, linkKey)) {
          continue;
        }
        const pmksId = linkIdOf(linkKey);
        const report = compareSeries(
          `${dataset.name} link ${linkKey} ${label}`,
          pairsFor(quantity, linkKey),
          isXY
            ? (t) => trace[quantity][t][pmksId] as number[]
            : (t) => {
                const v = trace[quantity][t][pmksId] as number | undefined;
                return v === undefined ? undefined : [v];
              },
          isXY
            ? (row) => dataset[quantity][linkKey][row] as number[]
            : (row) => [dataset[quantity][linkKey][row] as number],
          toleranceFor(quantity, linkKey)
        );
        expectSeriesToMatch(report);
      }
    });
  }
}

export interface DynamicsSuiteOptions {
  inputJointId?: string;
  crankTipId?: string;
  tolerances?: { jointForce?: Tolerance; torque?: Tolerance };
  /** PMKS+ id of the prismatic joint whose reaction is the slider normal force. */
  normalForceJointId?: string;
}

/**
 * Registers force-analysis tests against a MATLAB Newton (dynamic) scenario.
 * The fixture must be built with the matching gravity flag.
 */
export function registerDynamicsSuite(
  name: string,
  expected: DynamicsData,
  jointPosForAlignment: VerificationDataset,
  build: () => BuiltMechanism,
  options: DynamicsSuiteOptions = {}
) {
  const inputJointId = options.inputJointId ?? 'A';
  const crankTipId = options.crankTipId ?? 'B';
  const forceTol = options.tolerances?.jointForce ?? { abs: 1e-3, rel: 5e-3 };
  const torqueTol = options.tolerances?.torque ?? { abs: 1e-3, rel: 5e-3 };

  let trace: DynamicsTrace;
  let kinematics: KinematicsTrace;
  let pairs: [number, number][];
  beforeAll(() => {
    const built = build();
    kinematics = solveKinematics(built);
    pairs = alignToDataset(kinematics, jointPosForAlignment, inputJointId, crankTipId);
    trace = solveDynamics(built);
  });

  it('joint reaction forces match MATLAB', () => {
    for (const jointId of Object.keys(expected.jointForce)) {
      const report = compareSeries(
        `${name} joint ${jointId} reaction force`,
        pairs,
        (t) => trace.jointForce[t][jointId],
        (row) => expected.jointForce[jointId][row],
        forceTol
      );
      expectSeriesToMatch(report);
    }
  });

  it('input torque matches MATLAB', () => {
    const report = compareSeries(
      `${name} input torque`,
      pairs,
      (t) => [trace.torque[t]],
      (row) => [expected.torque[row]],
      torqueTol
    );
    expectSeriesToMatch(report);
  });

  if (expected.normalForce && options.normalForceJointId) {
    it('slider normal force matches MATLAB', () => {
      const report = compareSeries(
        `${name} slider normal force`,
        pairs,
        (t) => trace.jointForce[t][options.normalForceJointId!],
        (row) => expected.normalForce![row],
        forceTol
      );
      expectSeriesToMatch(report);
    });
  }
}
