// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { Piston, RealLink } from '../../app/model/link';
import { Link } from '../../app/model/link';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
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
  stephensonIiiEx1Fixture,
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import { solveKinematics } from '../../test-utils/verification/solve';

// Structural checks on the verification fixtures: degrees of freedom, loop
// identification, input-speed scaling, and URL-codec round-trips.

const FIXTURES = [
  ['TeachingLab four-bar', teachingLabFourBarFixture()],
  ['TeachingLab slider-crank', teachingLabSliderCrankFixture()],
  ['Slider-crank with tracer', sliderCrankTracerFixture()],
  ['Stephenson III Ex. 1', stephensonIiiEx1Fixture()],
  ['Stephenson III Ex. 2', stephensonIiiEx2Fixture()],
  ['Watt I', wattIFixture()],
] as const;

/** Real-link ids covered by pairs of consecutive loop letters. */
function linkIdsCoveredByLoops(loops: string[], links: Link[]): Set<string> {
  const covered = new Set<string>();
  loops.forEach((loop) => {
    for (let i = 1; i < loop.length - 1; i++) {
      const link = links.find((l) => l.id.includes(loop[i]) && l.id.includes(loop[i - 1]));
      if (link !== undefined) {
        covered.add(link.id);
      }
    }
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

  it('rejects a mechanism whose coupler is grounded (DOF 0)', () => {
    const fixture = teachingLabFourBarFixture();
    fixture.joints.find((j) => j.id === 'C')!.ground = true;
    const { mechanism } = buildMechanism(fixture);
    expect(mechanism.dof).not.toBe(1);
    expect(mechanism.isMechanismValid()).toBe(false);
  });

  it('LoopSolver loops cover every link of the four-bars and Watt I', () => {
    for (const [name, fixture] of FIXTURES) {
      if (name === 'Stephenson III Ex. 1') {
        continue; // documented gap, see the failing test below
      }
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

  // LoopSolver only reports the first four-bar loop (ABCDA) for Stephenson
  // III Example 1, so links EF and FGH get no kinematics from the app's own
  // loop detection (the verification fixture works around it by overriding
  // the loops). This test starts passing -- and must then be inverted --
  // once LoopSolver is fixed.
  it.fails('LoopSolver finds the second loop of Stephenson III Ex. 1 (known gap)', () => {
    const built = buildMechanism(stephensonIiiEx1Fixture());
    const covered = linkIdsCoveredByLoops(built.mechanism.requiredLoops, built.links);
    expect(covered.has('EF')).toBe(true);
    expect(covered.has('FGH')).toBe(true);
  });

  it('velocities scale linearly and accelerations quadratically with input speed', () => {
    const slow = solveKinematics(buildMechanism(wattIFixture()));
    const fast = solveKinematics(buildMechanism({ ...wattIFixture(), inputAngVel: 2 * 1.0472 }));
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

describe('URL transcoder round-trip', () => {
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
      } else if (link instanceof Piston) {
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
        expect(decoded.x, `${name} joint ${joint.id} x`).toBeCloseTo(joint.x, 3);
        expect(decoded.y, `${name} joint ${joint.id} y`).toBeCloseTo(joint.y, 3);
        expect(decoded.isGrounded).toBe((joint as RevJoint).ground);
        expect(decoded.isInput).toBe((joint as RevJoint).input);
        if (joint instanceof PrisJoint) {
          expect(decoded.angleRadians).toBeCloseTo(joint.angle_rad, 3);
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
          // Mass properties ride through the codec's decimal packing, which
          // keeps limited precision; a relative check is what matters for
          // reproducing analysis results from a shared URL.
          expect(
            Math.abs(decoded.mass - link.mass),
            `${name} link ${link.id} mass`
          ).toBeLessThanOrEqual(1e-3 + 1e-4 * Math.abs(link.mass));
          expect(
            Math.abs(decoded.massMoI - link.massMoI),
            `${name} link ${link.id} massMoI`
          ).toBeLessThanOrEqual(1e-3 + 1e-4 * Math.abs(link.massMoI));
          expect(
            Math.abs(decoded.xCoM - link.CoM.x),
            `${name} link ${link.id} CoM x`
          ).toBeLessThanOrEqual(1e-3 + 1e-4 * Math.abs(link.CoM.x));
          expect(
            Math.abs(decoded.yCoM - link.CoM.y),
            `${name} link ${link.id} CoM y`
          ).toBeLessThanOrEqual(1e-3 + 1e-4 * Math.abs(link.CoM.y));
        } else {
          expect(decoded.type).toBe(LINK_TYPE.PISTON);
        }
      });

      const forces = decoder.getForces();
      expect(forces.length).toBe(built.forces.length);
      built.forces.forEach((force, i) => {
        const decoded = forces[i];
        expect(decoded.id).toBe(force.id);
        expect(decoded.linkID).toBe(force.link.id);
        expect(decoded.startX).toBeCloseTo(force.startCoord.x, 3);
        expect(decoded.startY).toBeCloseTo(force.startCoord.y, 3);
        expect(decoded.endX).toBeCloseTo(force.endCoord.x, 3);
        expect(decoded.endY).toBeCloseTo(force.endCoord.y, 3);
        expect(decoded.isLocal).toBe(force.local);
        expect(decoded.isFacingOut).toBe(force.arrowOutward);
        expect(decoded.magnitude).toBeCloseTo(force.mag, 3);
      });
    });
  }
});
