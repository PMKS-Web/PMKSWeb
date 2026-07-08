// joint.ts first: see the import-cycle note in fixture.ts.
import '../../app/model/joint';
import { Coord } from '../../app/model/coord';
import { RealLink } from '../../app/model/link';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { BuiltMechanism, trackRigidPoint } from './fixture';

type XY = [number, number];

export interface KinematicsTrace {
  steps: number;
  jointPos: Record<string, XY>[];
  jointVel: Record<string, XY>[];
  jointAcc: Record<string, XY>[];
  linkCoMPos: Record<string, XY>[];
  linkCoMVel: Record<string, XY>[];
  linkCoMAcc: Record<string, XY>[];
  linkAngVel: Record<string, number>[];
  linkAngAcc: Record<string, number>[];
}

export interface DynamicsTrace {
  steps: number;
  jointForce: Record<string, XY>[];
  torque: number[];
}

/**
 * The Mechanism constructor rebuilds every timestep's links as bare RealLinks:
 * custom mass, moment of inertia, and center of mass are lost, and the links
 * keep pointing at the timestep-0 force objects instead of the recomputed
 * ones. Restore all of them so the solvers see the fixture's mass properties
 * (the CoM is transported rigidly with the link, which is what the MATLAB
 * reference does with its LinkCoM points).
 */
function restoreLinkProperties(built: BuiltMechanism, t: number) {
  const { mechanism, fixture } = built;
  fixture.links.forEach((spec, i) => {
    const link0 = built.links[i] as RealLink;
    const linkT = mechanism.links[t].find((l) => l.id === spec.joints) as RealLink;
    if (linkT === undefined || !(linkT instanceof RealLink)) {
      throw new Error(`link ${spec.joints} missing at timestep ${t}`);
    }
    linkT.mass = spec.mass ?? 1;
    linkT.massMoI = spec.moi ?? 1;
    const a0 = link0.joints[0];
    const b0 = link0.joints[1];
    const a1 = linkT.joints[0];
    const b1 = linkT.joints[1];
    const com = trackRigidPoint(link0.CoM, { x: a0.x, y: a0.y }, { x: b0.x, y: b0.y }, a1, b1);
    linkT.CoM = new Coord(com.x, com.y);
    if (fixture.load && fixture.load.onLink === spec.joints) {
      linkT.forces = [...mechanism.forces[t]];
    }
  });
}

function snapshotXY(map: Map<string, [number, number]>): Record<string, XY> {
  const out: Record<string, XY> = {};
  for (const [id, val] of map.entries()) {
    out[id] = [val[0], val[1]];
  }
  return out;
}

function snapshotZ(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, val] of map.entries()) {
    out[id] = val;
  }
  return out;
}

export function solveKinematics(built: BuiltMechanism): KinematicsTrace {
  const { mechanism } = built;
  const requiredLoops = built.fixture.requiredLoopsOverride ?? mechanism.requiredLoops;
  const trace: KinematicsTrace = {
    steps: mechanism.joints.length,
    jointPos: [],
    jointVel: [],
    jointAcc: [],
    linkCoMPos: [],
    linkCoMVel: [],
    linkCoMAcc: [],
    linkAngVel: [],
    linkAngAcc: [],
  };
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = requiredLoops;
  for (let t = 0; t < mechanism.joints.length; t++) {
    restoreLinkProperties(built, t);
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    const pos: Record<string, XY> = {};
    mechanism.joints[t].forEach((j) => {
      pos[j.id] = [j.x, j.y];
    });
    trace.jointPos.push(pos);
    trace.jointVel.push(snapshotXY(KinematicsSolver.jointVelMap));
    trace.jointAcc.push(snapshotXY(KinematicsSolver.jointAccMap));
    trace.linkCoMPos.push(snapshotXY(KinematicsSolver.linkCoMMap));
    trace.linkCoMVel.push(snapshotXY(KinematicsSolver.linkVelMap));
    trace.linkCoMAcc.push(snapshotXY(KinematicsSolver.linkAccMap));
    trace.linkAngVel.push(snapshotZ(KinematicsSolver.linkAngVelMap));
    trace.linkAngAcc.push(snapshotZ(KinematicsSolver.linkAngAccMap));
  }
  return trace;
}

/**
 * Runs the dynamic (Newton) force analysis at every timestep. Assumes the
 * mechanism was built with the desired gravity flag.
 */
export function solveDynamics(built: BuiltMechanism): DynamicsTrace {
  const { mechanism } = built;
  const requiredLoops = built.fixture.requiredLoopsOverride ?? mechanism.requiredLoops;
  const trace: DynamicsTrace = { steps: mechanism.joints.length, jointForce: [], torque: [] };
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = requiredLoops;
  ForceSolver.resetVariables();
  ForceSolver.determineDesiredLoopLettersForce(requiredLoops);
  for (let t = 0; t < mechanism.joints.length; t++) {
    restoreLinkProperties(built, t);
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    ForceSolver.determineForceAnalysis(
      mechanism.joints[t],
      mechanism.links[t],
      'dynamics',
      mechanism.gravity,
      mechanism.unit
    );
    trace.jointForce.push(snapshotXY(ForceSolver.unknownVariableForcesMap));
    trace.torque.push(ForceSolver.unknownVariableTorque);
  }
  return trace;
}
