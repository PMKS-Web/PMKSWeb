import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  loadedInvertedSliderCrankFixture,
  scotchYokeFixture,
} from '../../test-utils/verification/slot-fixtures';

// Phase 3 does not solve statics for a welded assembly, and says so rather than
// producing a number (docs/phase-3-slide-spec.md §3.8, §9).
//
// The physics of why: a prismatic pair transmits a normal force *and* a couple.
// While the block is a free-turning body with only two equations the couple
// never appears; welded to a rider that has a moment equation, the guide has to
// supply one, and there is no column for it.

describe('force analysis of a welded slide assembly', () => {
  it('refuses, and names the joint responsible', () => {
    const built = buildMechanism(scotchYokeFixture());

    const result = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');

    expect(result.status).toBe('unsupported-topology');
    expect(result.message).toContain('C');
    expect(result.message).toContain('moment');
  });

  it('refuses for a reason, not because the equation count happens to be off', () => {
    // The count guard catches this too -- eight equations against seven
    // unknowns -- but a count that happens to be wrong is not a reason, and it
    // would fall silent the moment anything else made the numbers balance.
    const built = buildMechanism(scotchYokeFixture());

    const result = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');

    expect(result.message).not.toContain('equations');
  });

  it('refuses because of the weld, and nothing else about the mechanism', () => {
    // "Not the Slide message" is too weak a control: an unrelated refusal would
    // satisfy it. This is an A/B on one fixture instead -- Phase 2's loaded
    // inverted slider-crank, which has a working force solution -- with the
    // flag as the only difference between the two calls.
    //
    // The unwelded Scotch yoke cannot serve as the control: without its weld it
    // is a DOF 2 linkage and its statics are underconstrained for reasons that
    // have nothing to do with Phase 3.
    const built = buildMechanism(loadedInvertedSliderCrankFixture());
    const before = ForceSolver.analyzeFrame(built.joints, built.links, 'static', true, 'm');

    (built.joints.find((joint) => joint.id === 'B') as RealJoint).isWelded = true;
    const after = ForceSolver.analyzeFrame(built.joints, built.links, 'static', true, 'm');

    expect(before.status, 'solves as a Slot').toBe('ok');
    expect(before.jointReactions.size).toBeGreaterThan(0);
    expect(after.status, 'refuses as a Slide').toBe('unsupported-topology');
    expect(after.message).toContain('B');
  });
});
