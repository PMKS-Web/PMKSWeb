// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { stephensonIiiEx110Rpm } from '../../test-data/verification/stephenson-iii-ex1-10rpm';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { stephensonIiiEx1Fixture } from '../../test-utils/verification/fixtures';
import { registerKinematicsSuite } from '../../test-utils/verification/suites';

// Stephenson III six-bar with tracer point H, verified against the MATLAB
// solvers in PMKS-Web/PMKS_Verification (Stephenson_III/Example_1, 10 RPM).
//
// Kinematics only: the MATLAB ForceSolver.m for this example has a
// copy-paste bug (link BC's moment equation includes a term for joint D,
// which is not on that link), so its force CSVs are not a valid reference.
//
// The fixture overrides the solver loops: PMKS+'s LoopSolver only reports
// the first four-bar loop (ABCDA) for this topology, which would leave links
// EF and FGH with no kinematics at all -- a real LoopSolver gap that the
// structural spec documents separately.
//
// Excluded MATLAB series (bugs in this example's VelAccSolver.m):
// - joint D acceleration: D is a ground pin, but MATLAB computes its
//   acceleration as if D rode on link BC (LinAcc.Joint.D = alpha_BC x (D-B)
//   + a_B), giving nonzero values for a fixed point.
// - joint E acceleration and link CDE CoM acceleration: both add that bogus
//   LinAcc.Joint.D term.
//
// Looser tolerances (documented ill-conditioning, not solver disagreement):
// joints D, C, E of ternary link CDE are nearly collinear, so E's
// circle-circle solve is close to tangency and PMKS+'s per-step 1e-4
// position rounding is amplified ~100x along the tangent direction.
describe('Stephenson III Example 1 @ 10 RPM vs MATLAB', () => {
  describe('kinematics', () => {
    registerKinematicsSuite(
      stephensonIiiEx110Rpm,
      () => buildMechanism(stephensonIiiEx1Fixture()),
      {
        excludeRows: [
          // Row 0 of FGH's CoM: the MATLAB initializer places it at
          // mid(F, H) while the per-iteration solver tracks mid(G, H), so
          // the exported series jumps definitions after the first row (the
          // fixture uses mid(G, H), matching rows 1..360).
          { quantity: 'linkCoMPos', key: 'FGH', rows: [0] },
          { quantity: 'linkCoMVel', key: 'FGH', rows: [0] },
          { quantity: 'linkCoMAcc', key: 'FGH', rows: [0] },
        ],
        excludeSeries: [
          { quantity: 'jointAcc', key: 'D', reason: 'MATLAB computes acc of a ground pin' },
          { quantity: 'jointAcc', key: 'E', reason: 'MATLAB adds the bogus joint D acc' },
          { quantity: 'linkCoMAcc', key: 'CDE', reason: 'MATLAB adds the bogus joint D acc' },
          {
            quantity: 'linkCoMAcc',
            key: 'EF',
            reason: 'MATLAB builds it on joint E acc, which adds the bogus joint D acc',
          },
          {
            quantity: 'jointVel',
            key: 'H',
            reason: 'MATLAB never computes tracer H velocity; the export is all zeros',
          },
          {
            quantity: 'jointAcc',
            key: 'H',
            reason: 'MATLAB never computes tracer H acceleration; the export is all zeros',
          },
        ],
        seriesTolerances: [
          { quantity: 'jointPos', key: 'E', tol: { abs: 0.06, rel: 0 } },
          { quantity: 'jointVel', key: 'E', tol: { abs: 0.08, rel: 0 } },
          { quantity: 'linkCoMPos', key: 'CDE', tol: { abs: 0.03, rel: 0 } },
          { quantity: 'linkCoMVel', key: 'CDE', tol: { abs: 0.04, rel: 0 } },
          // E's position noise propagates down the chain to F and link EF.
          { quantity: 'jointPos', key: 'F', tol: { abs: 0.06, rel: 0 } },
          { quantity: 'jointVel', key: 'F', tol: { abs: 0.09, rel: 0 } },
          { quantity: 'jointAcc', key: 'F', tol: { abs: 0.2, rel: 0 } },
          { quantity: 'linkCoMPos', key: 'EF', tol: { abs: 0.06, rel: 0 } },
          { quantity: 'linkCoMVel', key: 'EF', tol: { abs: 0.08, rel: 0 } },
          // H is solved from F and G, with which it is exactly collinear
          // (tangent circle-circle solve), so it collects the most noise;
          // FGH's CoM is mid(G, H) and inherits half of it.
          { quantity: 'jointPos', key: 'H', tol: { abs: 0.12, rel: 0 } },
          { quantity: 'linkCoMPos', key: 'FGH', tol: { abs: 0.06, rel: 0 } },
          { quantity: 'linkCoMVel', key: 'FGH', tol: { abs: 0.09, rel: 0 } },
          { quantity: 'linkCoMAcc', key: 'FGH', tol: { abs: 0.2, rel: 0 } },
        ],
      }
    );
  });
});
