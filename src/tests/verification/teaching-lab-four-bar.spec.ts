// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { teachingLabFourBar1031Rpm } from '../../test-data/verification/teaching-lab-four-bar-10-31rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';
import {
  registerDynamicsSuite,
  registerKinematicsSuite,
} from '../../test-utils/verification/suites';

// Four-bar linkage with tracer points on every link and CAD-measured mass
// properties, verified against the MATLAB solvers in
// PMKS-Web/PMKS_Verification (TeachingLab_Four_Bar, 10.31 RPM).
//
// The MATLAB accelerations for tracer joints E, G and H are excluded: its
// VelAccSolver.m computes them with another link's angular velocity
// (LinAcc.Joint.E uses AngVel.BCFG for a point that rides on CDEI, etc.), so
// those reference series contradict the mechanism's own angular kinematics.
// PMKS+'s values were hand-verified against alpha x r - omega^2 r about the
// links' ground pivots; tracer joints F and I on the same links do match.
describe('TeachingLab four-bar @ 10.31 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      teachingLabFourBar1031Rpm,
      () => buildMechanism(teachingLabFourBarFixture()),
      {
        excludeSeries: [
          { quantity: 'jointAcc', key: 'E', reason: 'MATLAB uses AngVel.BCFG for a CDEI point' },
          { quantity: 'jointAcc', key: 'G', reason: 'MATLAB uses AngVel.CDEI for a BCFG point' },
          { quantity: 'jointAcc', key: 'H', reason: 'MATLAB uses AngVel.BCFG for an ABH point' },
        ],
      }
    );
  });

  describe('dynamic force analysis (gravity on)', () => {
    registerDynamicsSuite(
      'TeachingLab_Four_Bar Newton/Grav',
      teachingLabFourBar1031Rpm.dynamics!.grav,
      teachingLabFourBar1031Rpm,
      () => buildMechanism(teachingLabFourBarFixture(true))
    );
  });
});
