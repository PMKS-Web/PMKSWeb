// Regenerates src/test-data/verification/*.ts from the reviewed
// reference-data/v1 contract in PMKS-Web/PMKS_Verification.
//
// Usage: node scripts/generate-verification-data.mjs /path/to/PMKS_Verification
//
// Only v1 MATLAB tables whose trust is established by the pinned PMKS fork
// are consumed. Diagnostic-only CoM data, non-applicable dynamics, legacy
// CSVOutput trees, and stale trust labels are rejected or omitted.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPOSITORY = 'https://github.com/PMKS-Web/PMKS_Verification';
const SOURCE_COMMIT = '932951a5316b16bfa41b937b04592c974143c4bb';
const V1_ROOT = path.join('reference-data', 'v1');
const TRUSTED_KINEMATICS = new Set(['matlab-pmks-fork', 'matlab-pmks-fork-motiongen']);
const TRUSTED_DYNAMICS = 'newton-euler-consistency';
const ALLOWED_TRUST = new Set([
  ...TRUSTED_KINEMATICS,
  TRUSTED_DYNAMICS,
  'diagnostic-only',
  'not-applicable',
]);
// These are PMKSWeb consumer tolerances, not the much tighter MATLAB/PMKS
// promotion tolerances. PMKSWeb rounds solved coordinates to 1e-4 at each
// one-degree step; derivatives inherit that accumulated position noise.
const CONSUMER_TOLERANCES = {
  jointPos: { abs: 5e-3, rel: 1e-3 },
  jointVel: { abs: 1e-4, rel: 5e-3 },
  jointAcc: { abs: 1e-4, rel: 1e-2 },
  linkCoMPos: { abs: 5e-3, rel: 1e-3 },
  linkCoMVel: { abs: 1e-4, rel: 5e-3 },
  linkCoMAcc: { abs: 1e-4, rel: 1e-2 },
  linkAngVel: { abs: 1e-4, rel: 5e-3 },
  linkAngAcc: { abs: 1e-4, rel: 1e-2 },
};
const CASES = [
  {
    caseId: 'teaching_four_bar',
    fileBase: 'teaching-lab-four-bar-10-31rpm',
    constName: 'teachingLabFourBar1031Rpm',
  },
  {
    caseId: 'teaching_slider_crank',
    fileBase: 'teaching-lab-slider-crank-15-1rpm',
    constName: 'teachingLabSliderCrank151Rpm',
  },
  {
    caseId: 'slider_crank_tracer',
    fileBase: 'slider-crank-tracer-10rpm',
    constName: 'sliderCrankTracer10Rpm',
  },
  {
    caseId: 'stephenson_iii_example_2',
    fileBase: 'stephenson-iii-ex2-10rpm',
    constName: 'stephensonIiiEx210Rpm',
  },
  {
    caseId: 'watt_i',
    fileBase: 'watt-i-10rpm',
    constName: 'wattI10Rpm',
  },
];

const repo = process.argv[2];
const contractRoot = repo && path.join(repo, V1_ROOT);
if (!contractRoot || !fs.existsSync(path.join(contractRoot, 'source-metadata.json'))) {
  console.error(
    'Usage: node scripts/generate-verification-data.mjs /path/to/PMKS_Verification\n' +
      'The path must contain the supported reference-data/v1 contract; legacy output is rejected.'
  );
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let commit;
try {
  commit = git('rev-parse', 'HEAD');
} catch {
  console.error(`Unable to read the PMKS_Verification commit at ${repo}`);
  process.exit(1);
}
if (commit !== SOURCE_COMMIT) {
  console.error(`Expected PMKS_Verification @ ${SOURCE_COMMIT}, received ${commit}`);
  process.exit(1);
}
const masterRefs = ['origin/master', 'master'].filter((ref) => {
  try {
    git('rev-parse', '--verify', ref);
    return true;
  } catch {
    return false;
  }
});
if (
  masterRefs.length === 0 ||
  !masterRefs.some((ref) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', SOURCE_COMMIT, ref], {
        cwd: repo,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  })
) {
  console.error(`${SOURCE_COMMIT} is not reachable from PMKS_Verification/master`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, '..', 'src', 'test-data', 'verification');
fs.mkdirSync(outDir, { recursive: true });

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
}

function readCsv(rel, columns) {
  if (rel.includes('CSVOutput') || rel.includes(`${path.sep}legacy${path.sep}`)) {
    throw new Error(`Legacy verification path rejected: ${rel}`);
  }
  const lines = fs.readFileSync(path.join(repo, rel), 'utf8').trim().split(/\r?\n/);
  const header = lines.shift()?.split(',') ?? [];
  if (header.length !== columns.length || header.some((value, index) => value !== columns[index])) {
    throw new Error(`${rel}: expected columns ${columns.join(',')}, received ${header.join(',')}`);
  }
  return lines.map((line, row) => {
    const values = line.split(',');
    if (values.length !== columns.length) {
      throw new Error(
        `${rel}:${row + 2}: expected ${columns.length} values, received ${values.length}`
      );
    }
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

function finiteNumber(value, location) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${location}: expected a finite number, received ${value}`);
  }
  return number;
}

function assertSampleIds(rows, samples, rel) {
  if (rows.length !== samples.length) {
    throw new Error(`${rel}: expected ${samples.length} rows, received ${rows.length}`);
  }
  rows.forEach((row, index) => {
    if (row.sample_id !== samples[index].sampleId) {
      throw new Error(
        `${rel}:${index + 2}: expected sample ${samples[index].sampleId}, received ${row.sample_id}`
      );
    }
  });
}

function readSamples(caseRoot) {
  const rel = path.join(caseRoot, 'matlab', 'samples.csv');
  return readCsv(rel, [
    'sample_id',
    'sweep_id',
    'sweep_index',
    'input_angle_rad',
    'input_direction',
    'time_s',
    'jacobian_condition',
    'eligibility',
  ]).map((row, index) => {
    const direction = finiteNumber(row.input_direction, `${rel}:${index + 2}:input_direction`);
    if (direction !== 1 && direction !== -1) {
      throw new Error(`${rel}:${index + 2}: invalid input direction ${direction}`);
    }
    if (row.eligibility !== 'eligible' && row.eligibility !== 'singular') {
      throw new Error(`${rel}:${index + 2}: invalid eligibility ${row.eligibility}`);
    }
    return {
      sampleId: row.sample_id,
      sweepId: row.sweep_id,
      sweepIndex: finiteNumber(row.sweep_index, `${rel}:${index + 2}:sweep_index`),
      inputAngleRad: finiteNumber(row.input_angle_rad, `${rel}:${index + 2}:input_angle_rad`),
      inputDirection: direction,
      timeS: finiteNumber(row.time_s, `${rel}:${index + 2}:time_s`),
      jacobianCondition: finiteNumber(
        row.jacobian_condition,
        `${rel}:${index + 2}:jacobian_condition`
      ),
      eligibility: row.eligibility,
    };
  });
}

function readPointSeries(caseRoot, directory, ids, samples) {
  const out = { pos: {}, vel: {}, acc: {} };
  for (const id of ids) {
    const rel = path.join(caseRoot, 'matlab', directory, `${id}.csv`);
    const rows = readCsv(rel, ['sample_id', 'x', 'y', 'vx', 'vy', 'ax', 'ay']);
    assertSampleIds(rows, samples, rel);
    out.pos[id] = rows.map((row, index) => [
      finiteNumber(row.x, `${rel}:${index + 2}:x`),
      finiteNumber(row.y, `${rel}:${index + 2}:y`),
    ]);
    out.vel[id] = rows.map((row, index) => [
      finiteNumber(row.vx, `${rel}:${index + 2}:vx`),
      finiteNumber(row.vy, `${rel}:${index + 2}:vy`),
    ]);
    out.acc[id] = rows.map((row, index) => [
      finiteNumber(row.ax, `${rel}:${index + 2}:ax`),
      finiteNumber(row.ay, `${rel}:${index + 2}:ay`),
    ]);
  }
  return out;
}

function readLinkSeries(caseRoot, ids, samples) {
  const angularVelocity = {};
  const angularAcceleration = {};
  for (const id of ids) {
    const rel = path.join(caseRoot, 'matlab', 'links', `${id}.csv`);
    const rows = readCsv(rel, ['sample_id', 'theta_delta_rad', 'omega_rad_s', 'alpha_rad_s2']);
    assertSampleIds(rows, samples, rel);
    angularVelocity[id] = rows.map((row, index) =>
      finiteNumber(row.omega_rad_s, `${rel}:${index + 2}:omega_rad_s`)
    );
    angularAcceleration[id] = rows.map((row, index) =>
      finiteNumber(row.alpha_rad_s2, `${rel}:${index + 2}:alpha_rad_s2`)
    );
  }
  return { angularVelocity, angularAcceleration };
}

function readDynamics(caseRoot, scenario, jointIds, samples) {
  const jointForce = {};
  for (const id of jointIds) {
    const rel = path.join(caseRoot, 'matlab', 'dynamics', scenario, 'joints', `${id}.csv`);
    const rows = readCsv(rel, ['sample_id', 'fx', 'fy']);
    assertSampleIds(rows, samples, rel);
    jointForce[id] = rows.map((row, index) => [
      finiteNumber(row.fx, `${rel}:${index + 2}:fx`),
      finiteNumber(row.fy, `${rel}:${index + 2}:fy`),
    ]);
  }
  const torqueRel = path.join(caseRoot, 'matlab', 'dynamics', scenario, 'input_torque.csv');
  const torqueRows = readCsv(torqueRel, ['sample_id', 'torque_nm']);
  assertSampleIds(torqueRows, samples, torqueRel);
  return {
    jointForce,
    torque: torqueRows.map((row, index) =>
      finiteNumber(row.torque_nm, `${torqueRel}:${index + 2}:torque_nm`)
    ),
  };
}

function assertTrust(trust, caseId) {
  for (const [capability, label] of Object.entries(trust)) {
    if (!ALLOWED_TRUST.has(label)) {
      throw new Error(`${caseId}: unsupported ${capability} trust label ${label}`);
    }
    if (label === 'matlab-pmks' || label === 'matlab-pmks-motiongen') {
      throw new Error(`${caseId}: stale pre-fork trust label ${label}`);
    }
  }
  if (!TRUSTED_KINEMATICS.has(trust.kinematics)) {
    throw new Error(`${caseId}: kinematics are not trusted (${trust.kinematics})`);
  }
}

const rootMetadata = readJson(path.join(V1_ROOT, 'source-metadata.json'));
if (rootMetadata.schema_version !== 1) {
  throw new Error(`Unsupported reference-data schema ${rootMetadata.schema_version}`);
}

function buildDataset(caseId) {
  const caseRoot = path.join(V1_ROOT, 'cases', caseId);
  const manifest = readJson(path.join(caseRoot, 'case.json'));
  const report = readJson(path.join(caseRoot, 'comparison-report.json'));
  const matlabMetadata = readJson(path.join(caseRoot, 'matlab', 'source-metadata.json'));
  if (manifest.schema_version !== 1 || manifest.case_id !== caseId) {
    throw new Error(`${caseId}: invalid v1 case manifest`);
  }
  if (report.schema_version !== 1 || report.case_id !== caseId || report.status !== 'pass') {
    throw new Error(`${caseId}: comparison report is not a passing v1 report`);
  }
  if (
    Object.keys(manifest.trust).some(
      (capability) => report.trust?.[capability] !== manifest.trust[capability]
    )
  ) {
    throw new Error(`${caseId}: manifest and comparison-report trust disagree`);
  }
  assertTrust(manifest.trust, caseId);

  const samples = readSamples(caseRoot);
  if (report.matlab_rows !== samples.length || report.aligned_rows !== samples.length) {
    throw new Error(`${caseId}: comparison report does not account for every MATLAB row`);
  }
  if (report.pmks_unverified_rows !== 0 || report.pmks_speed_symmetry_status !== 'pass') {
    throw new Error(`${caseId}: PMKS coverage or speed symmetry is incomplete`);
  }
  if (report.excluded_alignment_rows !== 0 || report.used_exclusions.length !== 0) {
    throw new Error(`${caseId}: source comparison contains exclusions`);
  }

  const jointIds = manifest.topology.joints.map(({ id }) => id);
  const pointIds = manifest.topology.points.map(({ id }) => id);
  const linkIds = manifest.topology.links.map(({ id }) => id);
  const joints = readPointSeries(caseRoot, 'joints', jointIds, samples);
  const points = readPointSeries(caseRoot, 'points', pointIds, samples);
  const links = readLinkSeries(caseRoot, linkIds, samples);

  let com = { pos: {}, vel: {}, acc: {} };
  if (TRUSTED_KINEMATICS.has(manifest.trust.com)) {
    com = readPointSeries(caseRoot, 'com', linkIds, samples);
  } else if (manifest.trust.com !== 'diagnostic-only' && manifest.trust.com !== 'not-applicable') {
    throw new Error(`${caseId}: unsupported CoM trust ${manifest.trust.com}`);
  }

  let dynamics;
  if (manifest.trust.dynamics === TRUSTED_DYNAMICS) {
    if (!manifest.capabilities.dynamics) {
      throw new Error(`${caseId}: trusted dynamics are not declared as a capability`);
    }
    const dynamicsReport = readJson(path.join(caseRoot, 'dynamics-report.json'));
    if (dynamicsReport.status !== 'pass' || dynamicsReport.trust !== TRUSTED_DYNAMICS) {
      throw new Error(`${caseId}: independent dynamics report is not trusted`);
    }
    const scenarios = new Set(manifest.dynamics?.scenarios ?? []);
    if (!scenarios.has('newton_gravity') || !scenarios.has('newton_no_gravity')) {
      throw new Error(`${caseId}: trusted dynamics must include gravity-on and gravity-off`);
    }
    dynamics = {
      grav: readDynamics(caseRoot, 'newton_gravity', jointIds, samples),
      noGrav: readDynamics(caseRoot, 'newton_no_gravity', jointIds, samples),
    };
  } else if (manifest.trust.dynamics !== 'not-applicable') {
    throw new Error(
      `${caseId}: untrusted dynamics cannot be consumed (${manifest.trust.dynamics})`
    );
  }

  const stableCaseMetadata = rootMetadata.cases[caseId];
  if (!stableCaseMetadata) {
    throw new Error(`${caseId}: missing stable source metadata`);
  }
  if (stableCaseMetadata.matlab_source_content_sha256 !== matlabMetadata.source_content_sha256) {
    throw new Error(`${caseId}: MATLAB source hashes disagree`);
  }

  return {
    source: {
      repository: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      caseId,
      casePath: `${V1_ROOT}/cases/${caseId}`,
      sourceContentSha256: matlabMetadata.source_content_sha256,
      comparisonStatus: report.status,
      pmks: {
        repository: rootMetadata.pmks_repository,
        commit: rootMetadata.pmks_commit,
        upstreamRepository: rootMetadata.pmks_upstream_repository,
        upstreamCommit: rootMetadata.pmks_upstream_commit,
        sourceContentSha256: stableCaseMetadata.pmks_source_content_sha256,
        patchSha256: stableCaseMetadata.pmks_fork_patch_sha256,
      },
    },
    trust: manifest.trust,
    capabilities: manifest.capabilities,
    tolerances: CONSUMER_TOLERANCES,
    exclusions: manifest.exclusions,
    name: `${manifest.title} @ ${manifest.input.rpm} RPM`,
    rpm: manifest.input.rpm,
    inputSpeedRadS: manifest.input.speed_rad_s,
    samples,
    jointPos: { ...joints.pos, ...points.pos },
    jointVel: { ...joints.vel, ...points.vel },
    jointAcc: { ...joints.acc, ...points.acc },
    linkCoMPos: com.pos,
    linkCoMVel: com.vel,
    linkCoMAcc: com.acc,
    linkAngVel: links.angularVelocity,
    linkAngAcc: links.angularAcceleration,
    ...(dynamics ? { dynamics } : {}),
  };
}

function write({ caseId, fileBase, constName }) {
  const file = path.join(outDir, `${fileBase}.ts`);
  const body = JSON.stringify(buildDataset(caseId), null, 2);
  fs.writeFileSync(
    file,
    `// Generated by scripts/generate-verification-data.mjs — do not edit by hand.\n` +
      `// Source: PMKS-Web/PMKS_Verification @ ${commit} (reference-data/v1)\n` +
      `import { VerificationDataset } from './types';\n\n` +
      `export const ${constName}: VerificationDataset = ${body};\n`
  );
  console.log(`wrote ${file}`);
}

for (const definition of CASES) {
  write(definition);
}
