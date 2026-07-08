// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { teachingLabSliderCrank151Rpm } from '../../test-data/verification/teaching-lab-slider-crank-15-1rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { teachingLabSliderCrankFixture } from '../../test-utils/verification/fixtures';
import {
  registerDynamicsSuite,
  registerKinematicsSuite,
} from '../../test-utils/verification/suites';

// Crank-slider verified against the MATLAB solvers in
// PMKS-Web/PMKS_Verification (TeachingLab_Slider_Crank, 15.1 RPM). The
// MATLAB link BCE includes sensor point E mounted exactly at joint B, so it
// corresponds to PMKS+ link BC; the prismatic joint is D.
describe('TeachingLab slider-crank @ 15.1 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      teachingLabSliderCrank151Rpm,
      () => buildMechanism(teachingLabSliderCrankFixture()),
      {
        linkIdOf: { BCE: 'BC' },
        // The MATLAB PosSolver tracks link AB's center of mass against the
        // PREVIOUS iteration's joint B (circleCircleIntersection with
        // Joint.B(iteration - 1)), so its whole CoM series lags the crank by
        // one degree; the rigid-body position PMKS+ reports was verified by
        // hand. The lag is ~1% of amplitude, which the derived velocity and
        // acceleration series inherit.
        excludeSeries: [
          { quantity: 'linkCoMPos', key: 'AB', reason: 'MATLAB tracks CoM against stale joint B' },
          { quantity: 'linkCoMVel', key: 'AB', reason: 'MATLAB tracks CoM against stale joint B' },
          { quantity: 'linkCoMAcc', key: 'AB', reason: 'MATLAB tracks CoM against stale joint B' },
        ],
        seriesTolerances: [
          // BCE's CoM is tracked against the stale previous-iteration joint C
          // in the same way, but with a short lever arm the lag stays small.
          { quantity: 'linkCoMPos', key: 'BCE', tol: { abs: 0.04, rel: 0 } },
        ],
      }
    );
  });

  describe('dynamic force analysis (gravity on)', () => {
    registerDynamicsSuite(
      'TeachingLab_Slider_Crank Newton/Grav',
      teachingLabSliderCrank151Rpm.dynamics!.grav,
      teachingLabSliderCrank151Rpm,
      () => buildMechanism(teachingLabSliderCrankFixture(true)),
      { normalForceJointId: 'D' }
    );
  });
});
