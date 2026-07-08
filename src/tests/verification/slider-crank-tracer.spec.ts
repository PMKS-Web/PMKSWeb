// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { sliderCrankTracer10Rpm } from '../../test-data/verification/slider-crank-tracer-10rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { sliderCrankTracerFixture } from '../../test-utils/verification/fixtures';
import { registerKinematicsSuite } from '../../test-utils/verification/suites';

// Crank-slider with a tracer point D on the coupler, verified against the
// MATLAB solvers in PMKS-Web/PMKS_Verification (Slider_Crank_Tracer_Point,
// 10 RPM). Kinematics only: the MATLAB run never exported force data for
// this mechanism.
//
// The MATLAB slider velocity/acceleration series are excluded: its
// VelAccSolver.m loop-closure equation is v_B + omega x r + V_c == 0, which
// defines V_c as the negative of C's true velocity (PMKS+'s value matches
// v_B + omega x (C - B) by hand at every probed timestep).
describe('Slider-crank with tracer point @ 10 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      sliderCrankTracer10Rpm,
      () => buildMechanism(sliderCrankTracerFixture()),
      {
        excludeSeries: [
          { quantity: 'jointVel', key: 'C', reason: 'MATLAB exports the negated slider velocity' },
          {
            quantity: 'jointAcc',
            key: 'C',
            reason: 'MATLAB exports the negated slider acceleration',
          },
        ],
      }
    );
  });
});
