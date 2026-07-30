// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { SliderBlock, RealLink } from '../../app/model/link';
import { Link } from '../../app/model/link';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { Loop } from '../../app/model/mechanism/loop-solver';
import { circleCircleIntersection } from '../../app/model/utils';
import {
  ForceData,
  JointData,
  JOINT_TYPE,
  LinkData,
  LINK_TYPE,
} from '../../app/services/transcoding/transcoder-data';
import { buildMechanism, BuiltMechanism } from '../../test-utils/verification/fixture';
import {
  sliderCrankTracerFixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import { solveKinematics } from '../../test-utils/verification/solve';
import { alignRows } from '../../test-utils/verification/compare';

// Structural checks on the verification fixtures: degrees of freedom, loop
// identification, input-speed scaling, and URL-codec round-trips.

const FIXTURES = [
  ['TeachingLab four-bar', teachingLabFourBarFixture()],
  ['TeachingLab slider-crank', teachingLabSliderCrankFixture()],
  ['Slider-crank with tracer', sliderCrankTracerFixture()],
  ['Stephenson III Ex. 2', stephensonIiiEx2Fixture()],
  ['Watt I', wattIFixture()],
] as const;

/**
 * Link ids the loops traverse.
 *
 * Read straight off the edges. The letter-string format could only infer this
 * by searching for a link whose id contained both of two adjacent characters,
 * which was a guess that happened to be right for single-letter joint ids.
 */
function linkIdsCoveredByLoops(loops: Loop[], links: Link[]): Set<string> {
  const covered = new Set<string>();
  loops.forEach((loop) => {
    loop.edges.forEach((edge) => {
      if (edge.kind === 'link') {
        covered.add(edge.linkId);
      }
    });
  });
  return covered;
}

describe('mechanism structure', () => {
  it('every verification fixture is a valid DOF-1 mechanism', () => {
    for (const [name, fixture] of FIXTURES) {
      const { mechanism } = buildMechanism(fixture);
      expect(mechanism.dof, `${name} degrees of freedom`).toBe(1);
      expect(mechanism.isMechanismValid(), `${name} validity`).toBe(true);
      expect(mechanism.joints.length, `${name} timesteps`).toBeGreaterThan(1);
    }
  });

  it('preserves physical state and same-timestep ownership through the full motion', () => {
    const watt = buildMechanism(wattIFixture()).mechanism;
    for (let t = 0; t < watt.links.length; t++) {
      for (const initial of watt.links[0]) {
        const current = watt.links[t].find((link) => link.id === initial.id)!;
        expect(current.mass, `t=${t} link ${initial.id} mass`).toBe(initial.mass);
        expect(current.name, `t=${t} link ${initial.id} name`).toBe(initial.name);
        for (const joint of current.joints) {
          expect(joint, `t=${t} link ${initial.id} joint ${joint.id}`).toBe(
            watt.joints[t].find((candidate) => candidate.id === joint.id)
          );
        }
        if (initial instanceof RealLink && current instanceof RealLink) {
          expect(current.massMoI, `t=${t} link ${initial.id} MoI`).toBe(initial.massMoI);
          expect(current.fill, `t=${t} link ${initial.id} fill`).toBe(initial.fill);
          const a0 = initial.joints[0];
          const b0 = initial.joints[1];
          const at = current.joints[0];
          const bt = current.joints[1];
          const initialAxis = [b0.x - a0.x, b0.y - a0.y];
          const currentAxis = [bt.x - at.x, bt.y - at.y];
          const initialOffset = [initial.CoM.x - a0.x, initial.CoM.y - a0.y];
          const currentOffset = [current.CoM.x - at.x, current.CoM.y - at.y];
          const initialAlong =
            (initialOffset[0] * initialAxis[0] + initialOffset[1] * initialAxis[1]) /
            Math.hypot(...initialAxis);
          const currentAlong =
            (currentOffset[0] * currentAxis[0] + currentOffset[1] * currentAxis[1]) /
            Math.hypot(...currentAxis);
          const initialNormal =
            (-initialOffset[0] * initialAxis[1] + initialOffset[1] * initialAxis[0]) /
            Math.hypot(...initialAxis);
          const currentNormal =
            (-currentOffset[0] * currentAxis[1] + currentOffset[1] * currentAxis[0]) /
            Math.hypot(...currentAxis);
          expect(currentAlong).toBeCloseTo(initialAlong, 8);
          expect(currentNormal).toBeCloseTo(initialNormal, 8);
        }
      }
      for (const force of watt.forces[t]) {
        const link = watt.links[t].find((candidate) => candidate.id === force.link.id)!;
        expect(force.link).toBe(link);
        expect(link.forces).toContain(force);
        expect(link.forces.every((candidate) => watt.forces[t].includes(candidate))).toBe(true);
      }
    }

    const slider = buildMechanism(teachingLabSliderCrankFixture()).mechanism;
    for (let t = 0; t < slider.joints.length; t++) {
      const pris = slider.joints[t].find((joint) => joint.id === 'D');
      expect(pris, `t=${t} prismatic joint`).toBeInstanceOf(PrisJoint);
      expect((pris as PrisJoint).angle_rad).toBe(0);
      expect(slider.links[t].find((link) => link instanceof SliderBlock)?.mass).toBe(1.31788);
    }
  });

  it('preserves welded subset state and transports its CoM rigidly', () => {
    const fixture = teachingLabFourBarFixture();
    fixture.links[0].subset = [
      {
        joints: 'AB',
        mass: 2.75,
        moi: 0.625,
        com: [0.45, 0.2],
        name: 'welded crank member',
        fill: '#123456',
      },
    ];
    const built = buildMechanism(fixture);
    const mechanism = built.mechanism;
    const source = (built.links.find((link) => link.id === 'ABH') as RealLink)
      .subset[0] as RealLink;
    expect(source.CoM.x).toBeCloseTo(0.45, 12);
    expect(source.CoM.y).toBeCloseTo(0.2, 12);
    const initial = (mechanism.links[0].find((link) => link.id === 'ABH') as RealLink)
      .subset[0] as RealLink;
    expect(initial.CoM.x).toBeCloseTo(0.45, 12);
    expect(initial.CoM.y).toBeCloseTo(0.2, 12);
    for (let t = 0; t < mechanism.links.length; t++) {
      const parent = mechanism.links[t].find((link) => link.id === 'ABH') as RealLink;
      expect(parent.subset.length, `t=${t} subset count`).toBe(1);
      const subset = parent.subset[0] as RealLink;
      expect(subset.id, `t=${t} subset id`).toBe(initial.id);
      expect(subset.mass, `t=${t} subset mass`).toBe(initial.mass);
      expect(subset.massMoI, `t=${t} subset MoI`).toBe(initial.massMoI);
      expect(subset.name, `t=${t} subset name`).toBe(initial.name);
      expect(subset.fill, `t=${t} subset fill`).toBe(initial.fill);
      expect(subset.joints.every((joint) => mechanism.joints[t].includes(joint))).toBe(true);

      const [a0, b0] = initial.joints;
      const [at, bt] = subset.joints;
      const offset0 = [initial.CoM.x - a0.x, initial.CoM.y - a0.y];
      const offsetT = [subset.CoM.x - at.x, subset.CoM.y - at.y];
      const axis0 = [b0.x - a0.x, b0.y - a0.y];
      const axisT = [bt.x - at.x, bt.y - at.y];
      const components = (offset: number[], axis: number[]) => [
        (offset[0] * axis[0] + offset[1] * axis[1]) / Math.hypot(...axis),
        (-offset[0] * axis[1] + offset[1] * axis[0]) / Math.hypot(...axis),
      ];
      const [along0, normal0] = components(offset0, axis0);
      const [alongT, normalT] = components(offsetT, axisT);
      expect(alongT).toBeCloseTo(along0, 8);
      expect(normalT).toBeCloseTo(normal0, 8);
    }
  });

  it('rejects a mechanism whose coupler is grounded (DOF 0)', () => {
    const fixture = teachingLabFourBarFixture();
    fixture.joints.find((j) => j.id === 'C')!.ground = true;
    const { mechanism } = buildMechanism(fixture);
    expect(mechanism.dof).not.toBe(1);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('LoopSolver loops cover every link of the four-bars and Watt I', () => {
    for (const [name, fixture] of FIXTURES) {
      const built = buildMechanism(fixture);
      const covered = linkIdsCoveredByLoops(built.mechanism.requiredLoops, built.links);
      for (const link of built.links) {
        if (link instanceof RealLink) {
          expect(covered.has(link.id), `${name}: link ${link.id} missing from required loops`).toBe(
            true
          );
        }
      }
    }
  });

  it('velocities scale linearly and accelerations quadratically with input speed', () => {
    const slow = solveKinematics(buildMechanism(wattIFixture()));
    const fast = solveKinematics(
      buildMechanism({ ...wattIFixture(), inputAngVel: (2 * 10 * Math.PI) / 30 })
    );
    expect(fast.steps).toBe(slow.steps);
    for (let t = 0; t < slow.steps; t++) {
      for (const linkId of Object.keys(slow.linkAngVel[t])) {
        expect(fast.linkAngVel[t][linkId]).toBeCloseTo(2 * slow.linkAngVel[t][linkId], 8);
        expect(fast.linkAngAcc[t][linkId]).toBeCloseTo(4 * slow.linkAngAcc[t][linkId], 8);
      }
      for (const jointId of Object.keys(slow.jointVel[t])) {
        expect(fast.jointVel[t][jointId][0]).toBeCloseTo(2 * slow.jointVel[t][jointId][0], 8);
        expect(fast.jointVel[t][jointId][1]).toBeCloseTo(2 * slow.jointVel[t][jointId][1], 8);
        expect(fast.jointAcc[t][jointId][0]).toBeCloseTo(4 * slow.jointAcc[t][jointId][0], 8);
        expect(fast.jointAcc[t][jointId][1]).toBeCloseTo(4 * slow.jointAcc[t][jointId][1], 8);
      }
    }
  });
});

describe('focused solver regressions', () => {
  it('accepts rounded tangencies but rejects circles beyond the tolerance bound', () => {
    expect(circleCircleIntersection(0, 0, 1, 2.0005, 0, 1)).not.toBe(false);
    expect(circleCircleIntersection(0, 0, 1, 2.003, 0, 1)).toBe(false);
    expect(circleCircleIntersection(0, 0, 2, 0.9995, 0, 1)).not.toBe(false);
    expect(circleCircleIntersection(0, 0, 2, 0.998, 0, 1)).toBe(false);
    // The fixed decimal-rounding allowance must not grow with mechanism size.
    expect(circleCircleIntersection(0, 0, 50, 100.05, 0, 50)).toBe(false);
    expect(circleCircleIntersection(0, 0, 150, 99.95, 0, 50)).toBe(false);
  });

  it('clears prismatic angle state between mechanisms', () => {
    KinematicsSolver.desiredAngleMap.set('stale', Math.PI / 3);
    KinematicsSolver.resetVariables();
    expect(KinematicsSolver.desiredAngleMap.size).toBe(0);
    const first = buildMechanism(teachingLabSliderCrankFixture()).mechanism.kinematicLoopAnalysis();
    const angledFixture = teachingLabSliderCrankFixture();
    angledFixture.slider!.angleRad = Math.PI / 2;
    const second = buildMechanism(angledFixture).mechanism.kinematicLoopAnalysis();
    expect(first).not.toEqual(second);
  });

  it('orders the slider before its tracer through both toggle positions', () => {
    const { mechanism } = buildMechanism(sliderCrankTracerFixture());
    const solveOrder = [...PositionSolver.jointNumOrderSolverMap.entries()];
    const sliderOrder = solveOrder.find(([, jointIds]) => jointIds.includes('C'))?.[0];
    const tracerOrder = solveOrder.find(([, jointIds]) => jointIds.includes('D'))?.[0];
    expect(sliderOrder).toBeDefined();
    expect(tracerOrder).toBeDefined();
    expect(tracerOrder!).toBeGreaterThan(sliderOrder!);
    expect(mechanism.joints.length).toBeGreaterThanOrEqual(360);
    for (let t = 0; t < mechanism.joints.length; t++) {
      const tracer = mechanism.joints[t].find((joint) => joint.id === 'D')!;
      const coupler = mechanism.links[t].find((link) => link.id === 'BCD')!;
      expect(Number.isFinite(tracer.x) && Number.isFinite(tracer.y), `t=${t}`).toBe(true);
      expect(coupler.joints.find((joint) => joint.id === 'D')).toBe(tracer);
    }
  });

  it('computes force moments about a non-origin center of mass', () => {
    const pivot = new RevJoint('P', 2, 3);
    expect(ForceSolver.determineMoment(pivot, 5, 7, 6, -2)).toEqual([-6, -24, 0]);
  });

  it('consumes duplicate cycle endpoints instead of overwriting one row', () => {
    const report = alignRows([0, 120, 240, 360], [0, 120, 240, 360]);
    expect(report.pairs).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(report.unmatchedExpectedRows).toEqual([]);
  });
});

describe('URL transcoder round-trip', () => {
  const expectCodecDecimal = (actual: number, original: number, label: string) => {
    expect(actual, label).toBe(Math.round(original * 1000) / 1000);
  };
  function encode(built: BuiltMechanism): string {
    const encoder = new StringTranscoder();
    built.joints.forEach((joint) => {
      if (joint instanceof PrisJoint) {
        encoder.addJoint(
          new JointData(
            JOINT_TYPE.PRISMATIC,
            joint.id,
            joint.name,
            joint.x,
            joint.y,
            joint.ground,
            joint.input,
            joint.isWelded,
            joint.angle_rad,
            joint.showCurve
          )
        );
      } else if (joint instanceof RevJoint) {
        encoder.addJoint(
          new JointData(
            JOINT_TYPE.REVOLUTE,
            joint.id,
            joint.name,
            joint.x,
            joint.y,
            joint.ground,
            joint.input,
            joint.isWelded,
            0,
            joint.showCurve
          )
        );
      }
    });
    built.links.forEach((link) => {
      if (link instanceof RealLink) {
        encoder.addLink(
          new LinkData(
            true,
            LINK_TYPE.REAL,
            link.id,
            link.name,
            link.mass,
            link.massMoI,
            link.CoM.x,
            link.CoM.y,
            link.fill,
            link.joints.map((j) => j.id),
            []
          )
        );
      } else if (link instanceof SliderBlock) {
        encoder.addLink(
          new LinkData(
            true,
            LINK_TYPE.PISTON,
            link.id,
            link.name,
            link.mass,
            0,
            0,
            0,
            '',
            link.joints.map((j) => j.id),
            []
          )
        );
      }
    });
    built.forces.forEach((force) => {
      encoder.addForce(
        new ForceData(
          force.id,
          force.link.id,
          force.name,
          force.startCoord.x,
          force.startCoord.y,
          force.endCoord.x,
          force.endCoord.y,
          force.local,
          force.arrowOutward,
          force.mag
        )
      );
    });
    return encoder.encodeURL();
  }

  for (const [name, fixture] of FIXTURES) {
    it(`${name} survives encode/decode`, () => {
      const built = buildMechanism(fixture);
      const url = encode(built);
      const decoder = new StringTranscoder();
      decoder.decodeURL(url);

      const joints = decoder.getJoints();
      expect(joints.length).toBe(built.joints.length);
      built.joints.forEach((joint, i) => {
        const decoded = joints[i];
        expect(decoded.id, `${name} joint ${joint.id} id`).toBe(joint.id);
        expect(decoded.type).toBe(
          joint instanceof PrisJoint ? JOINT_TYPE.PRISMATIC : JOINT_TYPE.REVOLUTE
        );
        expectCodecDecimal(decoded.x, joint.x, `${name} joint ${joint.id} x`);
        expectCodecDecimal(decoded.y, joint.y, `${name} joint ${joint.id} y`);
        expect(decoded.isGrounded).toBe((joint as RevJoint).ground);
        expect(decoded.isInput).toBe((joint as RevJoint).input);
        if (joint instanceof PrisJoint) {
          expectCodecDecimal(
            decoded.angleRadians,
            joint.angle_rad,
            `${name} joint ${joint.id} angle`
          );
        }
      });

      const links = decoder.getLinks();
      expect(links.length).toBe(built.links.length);
      built.links.forEach((link, i) => {
        const decoded = links[i];
        expect(decoded.id, `${name} link ${link.id} id`).toBe(link.id);
        expect(decoded.jointIDs, `${name} link ${link.id} joints`).toEqual(
          link.joints.map((j) => j.id)
        );
        if (link instanceof RealLink) {
          expect(decoded.type).toBe(LINK_TYPE.REAL);
          expectCodecDecimal(decoded.mass, link.mass, `${name} link ${link.id} mass`);
          expectCodecDecimal(decoded.massMoI, link.massMoI, `${name} link ${link.id} massMoI`);
          expectCodecDecimal(decoded.xCoM, link.CoM.x, `${name} link ${link.id} CoM x`);
          expectCodecDecimal(decoded.yCoM, link.CoM.y, `${name} link ${link.id} CoM y`);
        } else {
          expect(decoded.type).toBe(LINK_TYPE.PISTON);
          expectCodecDecimal(decoded.mass, link.mass, `${name} piston ${link.id} mass`);
        }
      });

      const forces = decoder.getForces();
      expect(forces.length).toBe(built.forces.length);
      built.forces.forEach((force, i) => {
        const decoded = forces[i];
        expect(decoded.id).toBe(force.id);
        expect(decoded.linkID).toBe(force.link.id);
        expectCodecDecimal(decoded.startX, force.startCoord.x, `${name} force ${force.id} start x`);
        expectCodecDecimal(decoded.startY, force.startCoord.y, `${name} force ${force.id} start y`);
        expectCodecDecimal(decoded.endX, force.endCoord.x, `${name} force ${force.id} end x`);
        expectCodecDecimal(decoded.endY, force.endCoord.y, `${name} force ${force.id} end y`);
        expect(decoded.isLocal).toBe(force.local);
        expect(decoded.isFacingOut).toBe(force.arrowOutward);
        expectCodecDecimal(decoded.magnitude, force.mag, `${name} force ${force.id} magnitude`);
      });
    });
  }
});
