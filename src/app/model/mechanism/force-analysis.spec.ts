import { Coord } from '../coord';
import { Force } from '../force';
import { PrisJoint, RevJoint } from '../joint';
import { SliderBlock, RealLink } from '../link';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  sliderCrankTracerFixture,
  teachingLabSliderCrankFixture,
} from '../../../test-utils/verification/fixtures';
import { ForceAnalysisFrame, ForceSolver } from './force-solver';
import { Mechanism } from './mechanism';

interface SingleBodyModel {
  joints: RevJoint[];
  links: RealLink[];
  force: Force;
}

function initializeModels(): void {
  if (!ColorService.instance) new ColorService();
  new SettingsService();
}

function singleBody(unit: 'm' | 'cm' | 'in', welded = false): SingleBodyModel {
  initializeModels();
  const factors =
    unit === 'm'
      ? { distance: 1, mass: 1, inertia: 1, force: 1 }
      : unit === 'cm'
        ? { distance: 100, mass: 1000, inertia: 1 / 0.0001, force: 1 }
        : {
            distance: 1 / 0.0254,
            mass: 1 / 0.45359237,
            inertia: 1 / (0.45359237 * 0.0254 * 0.0254),
            force: 1 / 4.4482216152605,
          };
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 2 * factors.distance, 0);
  const subset = welded
    ? [new RealLink('AB-part', [a, b], 2 * factors.mass, 0.5 * factors.inertia)]
    : [];
  const link = new RealLink(
    'AB',
    [a, b],
    2 * factors.mass,
    0.5 * factors.inertia,
    new Coord(factors.distance, 0),
    subset
  );
  a.links = [link];
  b.links = [link];
  a.connectedJoints = [b];
  b.connectedJoints = [a];
  const start = new Coord(2 * factors.distance, 0);
  const force = new Force(
    'F1',
    link,
    start,
    new Coord(start.x, start.y - factors.distance),
    false,
    true,
    10 * factors.force
  );
  link.forces = [force];
  return { joints: [a, b], links: [link], force };
}

function expectOk(frame: ForceAnalysisFrame): void {
  expect(frame.status).toBe('ok');
  expect(frame.rank).toBeGreaterThan(0);
  expect(Number.isFinite(frame.residual)).toBe(true);
  expect(frame.residual).toBeLessThanOrEqual(1e-8);
  expect(Number.isFinite(frame.inputEffort?.valueSI)).toBe(true);
}

describe('ForceSolver physical model', () => {
  it('balances one open rigid body under gravity and an applied load', () => {
    const model = singleBody('m');
    const result = ForceSolver.analyzeFrame(model.joints, model.links, 'static', true, 'm');
    expectOk(result);
    expect(result.jointReactions.get('A')![0]).toBeCloseTo(0, 10);
    expect(result.jointReactions.get('A')![1]).toBeCloseTo(29.6133, 4);
    expect(result.inputEffort!.kind).toBe('torque');
    expect(result.inputEffort!.valueSI).toBeCloseTo(39.6133, 4);
  });

  it('produces unit-equivalent SI results for meter, centimeter, and inch models', () => {
    const results = (['m', 'cm', 'in'] as const).map((unit) => {
      const model = singleBody(unit);
      return ForceSolver.analyzeFrame(model.joints, model.links, 'static', true, unit);
    });
    results.forEach(expectOk);
    for (const result of results.slice(1)) {
      expect(result.jointReactions.get('A')![0]).toBeCloseTo(
        results[0].jointReactions.get('A')![0],
        9
      );
      expect(result.jointReactions.get('A')![1]).toBeCloseTo(
        results[0].jointReactions.get('A')![1],
        9
      );
      expect(result.inputEffort!.valueSI).toBeCloseTo(results[0].inputEffort!.valueSI, 9);
    }
  });

  it('matches welded and unsplit representations and applies the root load once', () => {
    const unsplit = singleBody('m');
    const welded = singleBody('m', true);
    const unsplitResult = ForceSolver.analyzeFrame(
      unsplit.joints,
      unsplit.links,
      'static',
      true,
      'm'
    );
    const weldedResult = ForceSolver.analyzeFrame(welded.joints, welded.links, 'static', true, 'm');
    expectOk(unsplitResult);
    expectOk(weldedResult);
    expect(weldedResult.jointReactions.get('A')).toEqual(
      expect.arrayContaining(unsplitResult.jointReactions.get('A')!)
    );
    expect(weldedResult.inputEffort!.valueSI).toBeCloseTo(unsplitResult.inputEffort!.valueSI, 12);
  });

  it('adds centripetal inertia dynamically and scales it with speed squared', () => {
    const makeMechanism = (speed: number) => {
      const model = singleBody('m');
      return new Mechanism(model.joints, model.links, [model.force], [], false, 'm', speed);
    };
    const slow = makeMechanism(1).getForceAnalysis('dynamic').frames[0];
    const fast = makeMechanism(2).getForceAnalysis('dynamic').frames[0];
    expectOk(slow);
    expectOk(fast);
    expect(slow.jointReactions.get('A')![0]).toBeCloseTo(-2, 5);
    expect(fast.jointReactions.get('A')![0]).toBeCloseTo(-8, 5);
    expect(fast.jointReactions.get('A')![0] / slow.jointReactions.get('A')![0]).toBeCloseTo(4, 5);
  });

  it('makes zero-speed dynamic equilibrium identical to static equilibrium', () => {
    const model = singleBody('m');
    const mechanism = new Mechanism(model.joints, model.links, [model.force], [], true, 'm', 0);
    const staticFrame = mechanism.getForceAnalysis('static').frames[0];
    const dynamicFrame = mechanism.getForceAnalysis('dynamic').frames[0];
    expectOk(staticFrame);
    expectOk(dynamicFrame);
    expect(dynamicFrame.jointReactions.get('A')![0]).toBeCloseTo(
      staticFrame.jointReactions.get('A')![0],
      10
    );
    expect(dynamicFrame.jointReactions.get('A')![1]).toBeCloseTo(
      staticFrame.jointReactions.get('A')![1],
      10
    );
    expect(dynamicFrame.inputEffort!.valueSI).toBeCloseTo(staticFrame.inputEffort!.valueSI, 10);
  });

  it('balances binary and three-body pin reactions by root-link side', () => {
    initializeModels();
    const a = new RevJoint('A', -1, 0, false, true);
    const b = new RevJoint('B', 1, -0.5, false, true);
    const c = new RevJoint('C', 0.5, 1, true, false);
    const j = new RevJoint('J', 0, 0);
    const aj = new RealLink('AJ', [a, j], 1, 1);
    const bj = new RealLink('BJ', [b, j], 1, 1);
    const cj = new RealLink('CJ', [c, j], 1, 1);
    a.links = [aj];
    b.links = [bj];
    c.links = [cj];
    j.links = [aj, bj, cj];
    const load = new Force('F1', cj, new Coord(0.5, 1), new Coord(0.5, 0), false, true, 10);
    cj.forces = [load];

    const result = ForceSolver.analyzeFrame([a, b, c, j], [aj, bj, cj], 'static', false, 'm');
    expectOk(result);
    const pin = result.jointReactionsByLink.get('J')!;
    expect([...pin.keys()].sort()).toEqual(['AJ', 'BJ', 'CJ']);
    const resultant = [...pin.values()].reduce(
      (sum, reaction) => [sum[0] + reaction[0], sum[1] + reaction[1]],
      [0, 0]
    );
    expect(resultant[0]).toBeCloseTo(0, 10);
    expect(resultant[1]).toBeCloseTo(0, 10);
  });

  it('solves a frictionless slider with a finite guide reaction and input force', () => {
    initializeModels();
    const a = new RevJoint('A', 0, 0, false, true);
    const b = new RevJoint('B', 1, 1);
    const c = new RevJoint('C', 2, 0);
    const d = new PrisJoint('D', 2, 0, true, true);
    d.angle_rad = 0;
    const ab = new RealLink('AB', [a, b], 1, 1);
    const bc = new RealLink('BC', [b, c], 1, 1);
    const piston = new SliderBlock('CD', [c, d], 1);
    a.links = [ab];
    b.links = [ab, bc];
    c.links = [bc, piston];
    d.links = [piston];
    const kinematics = {
      linkAccelerations: new Map([
        ['AB', [0, 0]],
        ['BC', [0, 0]],
      ]),
      linkAngularAccelerations: new Map([
        ['AB', 0],
        ['BC', 0],
      ]),
      pistonAccelerations: new Map([['CD', [0, 0]]]),
    };
    const result = (ForceSolver.analyzeFrame as any)(
      [a, b, c, d],
      [ab, bc, piston],
      'dynamic',
      true,
      'm',
      0,
      kinematics
    ) as ForceAnalysisFrame;
    expectOk(result);
    expect(result.inputEffort!.kind).toBe('force');
    expect(Number.isFinite(result.inputEffort!.valueSI)).toBe(true);
    expect(result.jointReactionsByLink.get('D')!.get('CD')!.every(Number.isFinite)).toBe(true);
  });

  it('returns explicit diagnostics for invalid, underconstrained, and missing data', () => {
    const invalid = singleBody('m');
    invalid.links[0].mass = -1;
    expect(
      ForceSolver.analyzeFrame(invalid.joints, invalid.links, 'static', false, 'm').status
    ).toBe('invalid-properties');

    const underconstrained = singleBody('m');
    underconstrained.joints[0].ground = false;
    underconstrained.joints[0].input = false;
    expect(
      ForceSolver.analyzeFrame(
        underconstrained.joints,
        underconstrained.links,
        'static',
        false,
        'm'
      ).status
    ).toBe('unsupported-topology');

    const missing = singleBody('m');
    expect(
      ForceSolver.analyzeFrame(missing.joints, missing.links, 'dynamic', false, 'm').status
    ).toBe('missing-kinematics');
  });

  it('keeps slider-crank production frames finite with gravity', () => {
    const { mechanism } = buildMechanism(teachingLabSliderCrankFixture(true));
    const result = mechanism.getForceAnalysis('dynamic');
    expect(result.successfulFrames).toBeGreaterThanOrEqual(2);
    result.frames
      .filter((frame) => frame.status === 'ok')
      .forEach((frame) => {
        expect(frame.residual).toBeLessThanOrEqual(1e-8);
        expect(Number.isFinite(frame.inputEffort!.valueSI)).toBe(true);
      });
  });

  it('propagates complete kinematics to an open-ended extension and includes its inertia', () => {
    const extensionFixture = sliderCrankTracerFixture();
    const extension = buildMechanism(extensionFixture).mechanism;
    const baseFixture = sliderCrankTracerFixture();
    baseFixture.joints = baseFixture.joints.filter((joint) => joint.id !== 'D');
    baseFixture.links[1] = { ...baseFixture.links[1], joints: 'BC' };
    const base = buildMechanism(baseFixture).mechanism;
    const extensionResult = extension.getForceAnalysis('dynamic');
    const baseResult = base.getForceAnalysis('dynamic');

    expect(extensionResult.frames.some((frame) => frame.status === 'missing-kinematics')).toBe(
      false
    );
    expect(extensionResult.successfulFrames).toBeGreaterThanOrEqual(2);
    const comparableIndex = extensionResult.frames.findIndex(
      (frame, index) => frame.status === 'ok' && baseResult.frames[index]?.status === 'ok'
    );
    expect(comparableIndex).toBeGreaterThanOrEqual(0);
    expect(extensionResult.frames[comparableIndex].inputEffort!.valueSI).not.toBeCloseTo(
      baseResult.frames[comparableIndex].inputEffort!.valueSI,
      6
    );
  });
});

describe('ForceSolver reaction index', () => {
  it('mirrors joint->link and link->joint views of the same reaction set', () => {
    const { mechanism } = buildMechanism(teachingLabSliderCrankFixture(true));
    const { reactionIndex, frames } = mechanism.getForceAnalysis('static');

    for (const [jointId, linkIds] of reactionIndex.linksByJoint) {
      for (const linkId of linkIds) {
        expect(reactionIndex.jointsByLink.get(linkId)).toContain(jointId);
      }
    }
    for (const [linkId, jointIds] of reactionIndex.jointsByLink) {
      for (const jointId of jointIds) {
        expect(reactionIndex.linksByJoint.get(jointId)).toContain(linkId);
      }
    }

    // Every indexed pair is actually solved for, so a row always has a series.
    const frame = frames.find((candidate) => candidate.status === 'ok')!;
    for (const [jointId, linkIds] of reactionIndex.linksByJoint) {
      for (const linkId of linkIds) {
        expect(frame.jointReactionsByLink.get(jointId)?.has(linkId)).toBe(true);
      }
    }
  });

  it('lists one entry per body at a compound joint shared by three links', () => {
    initializeModels();
    const shared = new RevJoint('B', 2, 0);
    const ends = ['A', 'C', 'D'].map((id, index) => new RevJoint(id, index, index, true, false));
    const links = ends.map((end) => new RealLink(end.id + 'B', [end, shared], 1, 0.1));
    ends.forEach((end, index) => (end.links = [links[index]]));
    shared.links = links;

    const index = ForceSolver.buildReactionIndex([shared, ...ends], links);
    expect(index.linksByJoint.get('B')).toEqual(links.map((link) => link.id));
    for (const link of links) {
      expect(index.jointsByLink.get(link.id)).toContain('B');
    }
  });
});
