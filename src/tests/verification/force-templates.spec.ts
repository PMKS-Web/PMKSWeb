// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  jibCraneFixture,
  offsetLoadFourBarFixture,
  punchPressFixture,
  toggleClampFixture,
} from '../../test-utils/verification/force-fixtures';
import { MechanismFixture } from '../../test-utils/verification/fixture';

// The four mechanisms the library ships for looking at forces. What is asserted
// here is the thing that makes them worth shipping: the force analysis has to
// actually produce numbers, on every frame, and those numbers have to react to
// the load rather than merely to the masses. A force demonstration whose force
// panel is empty — or whose panel says the same thing with the load removed —
// is not a demonstration of anything.

const MECHANISMS: [string, () => MechanismFixture][] = [
  ['punch press', punchPressFixture],
  ['derrick crane', jibCraneFixture],
  ['toggle clamp', toggleClampFixture],
  ['offset-load four-bar', offsetLoadFourBarFixture],
];

/** Every reaction magnitude the static analysis reports, across the cycle. */
function reactionMagnitudes(fixture: MechanismFixture): number[] {
  const { mechanism } = buildMechanism(fixture);
  const series = mechanism.getForceAnalysis('static');
  const magnitudes: number[] = [];
  for (const frame of series.frames) {
    if (frame.status !== 'ok') continue;
    for (const reaction of frame.jointReactions.values()) {
      magnitudes.push(Math.hypot(reaction[0], reaction[1]));
    }
  }
  return magnitudes;
}

describe('the force-analysis templates', () => {
  for (const [name, fixture] of MECHANISMS) {
    describe(name, () => {
      const built = buildMechanism(fixture());

      it('is one degree of freedom and runs a full cycle', () => {
        expect((built.mechanism as unknown as { dof: number }).dof).toBe(1);
        expect(built.mechanism.joints.length).toBeGreaterThan(50);
      });

      it('carries the load it was built with', () => {
        // The load is the whole point, so it has to survive into the built
        // mechanism rather than being a field nothing reads.
        expect(built.forces).toHaveLength(1);
        const force = built.forces[0];
        const magnitude = Math.hypot(
          force.endCoord.x - force.startCoord.x,
          force.endCoord.y - force.startCoord.y
        );
        expect(magnitude).toBeGreaterThan(0);
      });

      it('solves its forces on every frame, not just the first', () => {
        const series = built.mechanism.getForceAnalysis('static');
        expect(series.frames[0].status).toBe('ok');
        expect(series.successfulFrames).toBe(series.frames.length);
      });

      it('reports reactions the load actually drives', () => {
        // Same mechanism, same masses, no load. If the reactions do not change,
        // the panel is showing inertia and weight and the load is decorative.
        const loaded = reactionMagnitudes(fixture());
        const bare = reactionMagnitudes({ ...fixture(), load: undefined });
        expect(loaded.length).toBeGreaterThan(0);
        expect(bare.length).toBe(loaded.length);

        const peakLoaded = Math.max(...loaded);
        const peakBare = Math.max(...bare);
        expect(peakLoaded).toBeGreaterThan(peakBare * 1.5);
      });
    });
  }
});
