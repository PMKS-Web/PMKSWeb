import {
  DynamicsData,
  KinematicsQuantity,
  VerificationDataset,
} from '../../test-data/verification/types';
import {
  AlignmentReport,
  alignToDataset,
  compareSeries,
  expectSeriesToMatch,
  Tolerance,
} from './compare';
import { BuiltMechanism } from './fixture';
import { DynamicsTrace, KinematicsTrace, solveDynamics, solveKinematics } from './solve';

export interface KinematicsSuiteOptions {
  inputJointId?: string;
  crankTipId?: string;
  /** Maps dataset point keys to PMKS+ joint ids (e.g. coincident sensor E -> B). */
  jointIdOf?: Record<string, string>;
  /** Maps dataset link keys to PMKS+ link ids when they differ (e.g. BCE -> BC). */
  linkIdOf?: Record<string, string>;
  tolerances?: Partial<Record<KinematicsQuantity, Tolerance>>;
  /** MATLAB rows explicitly omitted because the solvers reverse at different toggle samples. */
  toggleExclusions?: { rows: number[]; actualTimesteps: number[]; reason: string }[];
}

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
  const tolerances = { ...dataset.tolerances, ...options.tolerances };
  const jointIdOf = (key: string) => options.jointIdOf?.[key] ?? key;
  const linkIdOf = (key: string) => options.linkIdOf?.[key] ?? key;

  let trace: KinematicsTrace;
  let alignment: AlignmentReport;
  let fixtureInputSpeed: number;
  beforeAll(() => {
    const built = build();
    fixtureInputSpeed = built.fixture.inputAngVel;
    trace = solveKinematics(built);
    alignment = alignToDataset(
      trace,
      dataset,
      inputJointId,
      crankTipId,
      options.toggleExclusions?.flatMap((exclusion) => exclusion.rows) ?? [],
      options.toggleExclusions?.flatMap((exclusion) => exclusion.actualTimesteps) ?? []
    );
  });

  it('uses the pinned, cross-verified v1 source', () => {
    expect(dataset.source.repository).toBe('https://github.com/PMKS-Web/PMKS_Verification');
    expect(dataset.source.commit).toBe('932951a5316b16bfa41b937b04592c974143c4bb');
    expect(dataset.source.casePath).toBe(`reference-data/v1/cases/${dataset.source.caseId}`);
    expect(dataset.source.comparisonStatus).toBe('pass');
    expect(dataset.source.sourceContentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(dataset.source.pmks).toMatchObject({
      repository: 'https://github.com/PMKS-Web/PMKS',
      commit: '644b26c75b07182ce04dc6466cfec74ee4130c93',
      upstreamRepository: 'https://github.com/DesignEngrLab/PMKS',
      upstreamCommit: '2a0a6fca957dd19844567702af663f607dc15dfe',
    });
    expect(['matlab-pmks-fork', 'matlab-pmks-fork-motiongen']).toContain(dataset.trust.kinematics);
    expect(dataset.trust.kinematics).not.toBe('matlab-pmks');
    expect(dataset.trust.kinematics).not.toBe('matlab-pmks-motiongen');
    expect(dataset.samples.every((sample) => sample.eligibility === 'eligible')).toBe(true);
    expect(fixtureInputSpeed).toBe(dataset.inputSpeedRadS);
    expect(dataset.exclusions).toEqual([]);
    if (Object.keys(dataset.linkCoMPos).length > 0) {
      expect(['matlab-pmks-fork', 'matlab-pmks-fork-motiongen']).toContain(dataset.trust.com);
    } else {
      expect(['diagnostic-only', 'not-applicable']).toContain(dataset.trust.com);
    }
    if (dataset.dynamics) {
      expect(dataset.trust.dynamics).toBe('newton-euler-consistency');
    } else {
      expect(dataset.trust.dynamics).toBe('not-applicable');
    }
  });

  it('matches every eligible MATLAB motion row', () => {
    expect(
      alignment.unmatchedExpectedRows,
      `unmatched MATLAB rows after ignoring toggle boundaries [${alignment.ignoredExpectedRows}]`
    ).toEqual([]);
    expect(alignment.pairs.length).toBe(alignment.eligibleExpectedRows.length);
    expect(alignment.unmatchedActualTimesteps).toEqual([]);
  });

  for (const exclusion of options.toggleExclusions ?? []) {
    it(`documents excluded toggle-boundary rows ${exclusion.rows.join(', ')}`, () => {
      expect(exclusion.reason.trim().length).toBeGreaterThan(0);
      expect(alignment.ignoredExpectedRows).toEqual(expect.arrayContaining(exclusion.rows));
      expect(alignment.ignoredActualTimesteps).toEqual(
        expect.arrayContaining(exclusion.actualTimesteps)
      );
    });
  }

  const jointQuantities: [KinematicsQuantity, string][] = [
    ['jointPos', 'position'],
    ['jointVel', 'velocity'],
    ['jointAcc', 'acceleration'],
  ];
  for (const [quantity, label] of jointQuantities) {
    it(`joint ${label}s match MATLAB`, () => {
      for (const jointId of Object.keys(dataset[quantity])) {
        const pmksId = jointIdOf(jointId);
        const report = compareSeries(
          `${dataset.name} joint ${jointId} ${label}`,
          alignment.pairs,
          (t) => (trace[quantity][t] as Record<string, number[]>)[pmksId],
          (row) => (dataset[quantity][jointId] as number[][])[row],
          tolerances[quantity]
        );
        expectSeriesToMatch(report, alignment.pairs.length);
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
  if (Object.keys(dataset.linkCoMPos).length === 0) {
    it('does not promote diagnostic-only link CoM data', () => {
      expect(dataset.trust.com).toBe('diagnostic-only');
      expect(dataset.linkCoMVel).toEqual({});
      expect(dataset.linkCoMAcc).toEqual({});
    });
  }
  for (const [quantity, label, isXY] of linkQuantities) {
    if (Object.keys(dataset[quantity]).length === 0) {
      continue;
    }
    it(`link ${label.replace('center-of-mass', 'CoM')}s match MATLAB`, () => {
      for (const linkKey of Object.keys(dataset[quantity])) {
        const pmksId = linkIdOf(linkKey);
        const report = compareSeries(
          `${dataset.name} link ${linkKey} ${label}`,
          alignment.pairs,
          isXY
            ? (t) => trace[quantity][t][pmksId] as number[]
            : (t) => {
                const v = trace[quantity][t][pmksId] as number | undefined;
                return v === undefined ? undefined : [v];
              },
          isXY
            ? (row) => dataset[quantity][linkKey][row] as number[]
            : (row) => [dataset[quantity][linkKey][row] as number],
          tolerances[quantity]
        );
        expectSeriesToMatch(report, alignment.pairs.length);
      }
    });
  }
}

export interface DynamicsSuiteOptions {
  inputJointId?: string;
  crankTipId?: string;
  tolerances?: { jointForce?: Tolerance; torque?: Tolerance };
  toggleExclusions?: { rows: number[]; actualTimesteps: number[]; reason: string }[];
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
  let alignment: AlignmentReport;
  beforeAll(() => {
    const built = build();
    kinematics = solveKinematics(built);
    alignment = alignToDataset(
      kinematics,
      jointPosForAlignment,
      inputJointId,
      crankTipId,
      options.toggleExclusions?.flatMap((exclusion) => exclusion.rows) ?? [],
      options.toggleExclusions?.flatMap((exclusion) => exclusion.actualTimesteps) ?? []
    );
    trace = solveDynamics(built);
  });

  it('matches every eligible MATLAB motion row', () => {
    expect(
      alignment.unmatchedExpectedRows,
      `unmatched MATLAB rows after ignoring toggle boundaries [${alignment.ignoredExpectedRows}]`
    ).toEqual([]);
    expect(alignment.pairs.length).toBe(alignment.eligibleExpectedRows.length);
    expect(alignment.unmatchedActualTimesteps).toEqual([]);
  });

  for (const exclusion of options.toggleExclusions ?? []) {
    it(`documents excluded toggle-boundary rows ${exclusion.rows.join(', ')}`, () => {
      expect(exclusion.reason.trim().length).toBeGreaterThan(0);
      expect(alignment.ignoredExpectedRows).toEqual(expect.arrayContaining(exclusion.rows));
      expect(alignment.ignoredActualTimesteps).toEqual(
        expect.arrayContaining(exclusion.actualTimesteps)
      );
    });
  }

  it('joint reaction forces match MATLAB', () => {
    for (const jointId of Object.keys(expected.jointForce)) {
      const report = compareSeries(
        `${name} joint ${jointId} reaction force`,
        alignment.pairs,
        (t) => trace.jointForce[t][jointId],
        (row) => expected.jointForce[jointId][row],
        forceTol
      );
      expectSeriesToMatch(report, alignment.pairs.length);
    }
  });

  it('input torque matches MATLAB', () => {
    const report = compareSeries(
      `${name} input torque`,
      alignment.pairs,
      (t) => [trace.torque[t]],
      (row) => [expected.torque[row]],
      torqueTol
    );
    expectSeriesToMatch(report, alignment.pairs.length);
  });
}
